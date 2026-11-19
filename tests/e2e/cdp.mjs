/**
 * Cliente mínimo do Chrome DevTools Protocol (sem dependências).
 * Abre um Chrome/Edge headless, conecta via WebSocket e expõe `send()`.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CANDIDATES = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);

export function findBrowser() {
  const path = CANDIDATES.find((candidate) => existsSync(candidate));
  if (!path) throw new Error('Chrome/Edge não encontrado. Defina a variável CHROME_PATH.');
  return path;
}

export async function launchBrowser({ downloadDir } = {}) {
  const profile = mkdtempSync(join(tmpdir(), 'beat-productor-e2e-'));
  const child = spawn(findBrowser(), [
    '--headless=new',
    '--remote-debugging-port=0',
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--autoplay-policy=no-user-gesture-required',
    '--window-size=1400,900',
    'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });

  const wsUrl = await new Promise((resolvePromise, reject) => {
    let buffer = '';
    const timer = setTimeout(() => reject(new Error('Timeout ao iniciar o navegador')), 20000);
    child.stderr.on('data', (chunk) => {
      buffer += chunk.toString();
      const match = /DevTools listening on (ws:\/\/\S+)/.exec(buffer);
      if (match) {
        clearTimeout(timer);
        resolvePromise(match[1]);
      }
    });
    child.on('exit', (code) => reject(new Error(`Navegador encerrou (código ${code})`)));
  });

  const socket = new WebSocket(wsUrl);
  await new Promise((resolvePromise, reject) => {
    socket.addEventListener('open', resolvePromise, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });

  let nextId = 1;
  const pending = new Map();
  const listeners = new Set();
  socket.addEventListener('message', (message) => {
    const data = JSON.parse(message.data);
    if (data.id && pending.has(data.id)) {
      const { resolvePromise, reject } = pending.get(data.id);
      pending.delete(data.id);
      if (data.error) reject(new Error(`${data.error.message} ${data.error.data ?? ''}`));
      else resolvePromise(data.result);
    } else if (data.method) {
      for (const listener of listeners) listener(data);
    }
  });

  function send(method, params = {}, sessionId = undefined) {
    const id = nextId++;
    socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    return new Promise((resolvePromise, reject) => pending.set(id, { resolvePromise, reject }));
  }

  if (downloadDir) {
    await send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloadDir, eventsEnabled: true });
  }

  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const page = (method, params) => send(method, params, sessionId);

  return {
    page,
    send,
    sessionId,
    onEvent(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async close() {
      try {
        await send('Browser.close');
      } catch {
        child.kill();
      }
      await new Promise((r) => setTimeout(r, 300));
      try {
        rmSync(profile, { recursive: true, force: true });
      } catch {
        // o Windows pode manter arquivos presos por alguns instantes; inofensivo
      }
    },
  };
}
