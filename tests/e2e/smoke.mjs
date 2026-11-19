/**
 * Teste de fumaça E2E do Beat Productor num navegador real (headless).
 *
 * Uso:  node tests/e2e/smoke.mjs <url-do-app> [--screenshot caminho.png] [--export]
 *  --export  também testa a exportação MP3 (requer o backend rodando).
 *
 * Falha (código 1) se qualquer verificação falhar OU se a página registrar
 * qualquer erro de JavaScript / console.error.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { launchBrowser } from './cdp.mjs';

const args = process.argv.slice(2);
const url = args.find((a) => !a.startsWith('--')) ?? 'http://127.0.0.1:8000/';
const screenshotIndex = args.indexOf('--screenshot');
const screenshotPath = screenshotIndex >= 0 ? args[screenshotIndex + 1] : null;
const testExport = args.includes('--export');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const downloadDir = mkdtempSync(join(tmpdir(), 'beat-productor-dl-'));
const browser = await launchBrowser({ downloadDir });
const { page } = browser;

// ------------------------------------------------------------ coleta de erros
const pageErrors = [];
const IGNORED_WARNINGS = [/cdn\.tailwindcss\.com should not be used in production/];
browser.onEvent((event) => {
  if (event.sessionId !== browser.sessionId) return;
  if (event.method === 'Runtime.exceptionThrown') {
    const details = event.params.exceptionDetails;
    pageErrors.push(`exceção: ${details.exception?.description ?? details.text}`);
  } else if (event.method === 'Runtime.consoleAPICalled' && event.params.type === 'error') {
    pageErrors.push(`console.error: ${event.params.args.map((a) => a.value ?? a.description).join(' ')}`);
  } else if (event.method === 'Log.entryAdded' && event.params.entry.level === 'error') {
    const text = event.params.entry.text;
    if (!IGNORED_WARNINGS.some((re) => re.test(text))) pageErrors.push(`log: ${text} ${event.params.entry.url ?? ''}`);
  }
});

async function evaluate(expression) {
  const result = await page('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) {
    throw new Error(`Falha ao avaliar: ${expression}\n${result.exceptionDetails.exception?.description ?? result.exceptionDetails.text}`);
  }
  return result.result.value;
}

async function waitFor(expression, timeoutMs = 5000, label = expression) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await evaluate(expression)) return;
    await sleep(50);
  }
  throw new Error(`Timeout esperando: ${label}`);
}

async function mouse(type, x, y, buttons = 0) {
  await page('Input.dispatchMouseEvent', {
    type, x, y, button: type === 'mouseMoved' && buttons === 0 ? 'none' : 'left', buttons, clickCount: 1, pointerType: 'mouse',
  });
}

async function click(x, y) {
  await mouse('mouseMoved', x, y);
  await mouse('mousePressed', x, y, 1);
  await mouse('mouseReleased', x, y, 0);
}

async function drag(x1, y1, x2, y2, steps = 6) {
  await mouse('mouseMoved', x1, y1);
  await mouse('mousePressed', x1, y1, 1);
  for (let i = 1; i <= steps; i += 1) {
    await mouse('mouseMoved', x1 + ((x2 - x1) * i) / steps, y1 + ((y2 - y1) * i) / steps, 1);
  }
  await mouse('mouseReleased', x2, y2, 0);
}

async function clickElement(selector) {
  const point = await evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return null;
    el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  })()`);
  assert.ok(point, `elemento não encontrado: ${selector}`);
  await click(point.x, point.y);
}

/** Centro (coordenadas de viewport) de uma célula do grid. */
async function cellPoint(row, cell) {
  return evaluate(`(() => {
    const app = window.__beatProductor;
    const scroller = document.getElementById('roll-scroll');
    scroller.scrollLeft = 0;
    scroller.scrollTop = Math.max(0, 22 * ${row} - 160);
    const r = document.getElementById('grid').getBoundingClientRect();
    const w = app.getLayout().cellWidth;
    return { x: r.left + w * ${cell} + w / 2, y: r.top + 22 * ${row} + 11 };
  })()`);
}

async function setControl(id, value) {
  await evaluate(`(() => {
    const el = document.getElementById(${JSON.stringify(id)});
    if (el.type === 'checkbox') el.checked = ${JSON.stringify(value)};
    else el.value = ${JSON.stringify(String(value))};
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
}

const notesOf = (instrument) => `window.__beatProductor.sequence.notes.filter(n => n.instrument === '${instrument}')`;

// ------------------------------------------------------------ verificações
const results = [];
async function check(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`  ✔ ${name}`);
  } catch (error) {
    results.push({ name, ok: false, error });
    console.log(`  ✖ ${name}\n      ${error.message.split('\n').join('\n      ')}`);
  }
}

await page('Runtime.enable');
await page('Log.enable');
await page('Page.enable');
await page('Page.navigate', { url });
await waitFor('document.readyState === "complete" && !!window.__beatProductor', 15000, 'app carregado');
console.log(`Beat Productor E2E — ${url}`);

await check('renderiza 36 linhas e 36 teclas (3 oitavas)', async () => {
  assert.equal(await evaluate('document.querySelectorAll(".grid-row").length'), 36);
  assert.equal(await evaluate('document.querySelectorAll("#piano-keys .key").length'), 36);
  assert.equal(await evaluate('document.querySelector("#piano-keys .key").title'), 'B5');
});

await check('Tailwind carregou (cabeçalho estilizado)', async () => {
  const display = await evaluate('getComputedStyle(document.querySelector("header")).display');
  assert.equal(display, 'flex');
});

await check('cabeçalho tem valores padrão', async () => {
  assert.equal(await evaluate('document.getElementById("bpm-input").value'), '120');
  assert.equal(await evaluate('document.getElementById("division-select").value'), '1/4');
  assert.equal(await evaluate('document.getElementById("instrument-select").options.length'), 4);
  assert.equal(await evaluate('document.getElementById("loops-input").disabled'), true);
});

await check('clique cria nota curta (1 célula)', async () => {
  const p = await cellPoint(10, 0);
  await click(p.x, p.y);
  await waitFor(`${notesOf('piano')}.length === 1`, 2000, 'nota criada');
  const note = await evaluate(`${notesOf('piano')}[0]`);
  assert.deepEqual([note.start, note.duration], [0, 3]);
  assert.equal(await evaluate('document.querySelectorAll(".note-own").length'), 1);
});

await check('clicar e arrastar cria nota longa (4 células)', async () => {
  const a = await cellPoint(12, 4);
  const b = await cellPoint(12, 7);
  await drag(a.x, a.y, b.x, b.y);
  await waitFor(`${notesOf('piano')}.length === 2`, 2000, 'nota longa criada');
  const note = await evaluate(`${notesOf('piano')}.find(n => n.start === 12)`);
  assert.ok(note, 'nota longa não encontrada');
  assert.equal(note.duration, 12);
  assert.equal(await evaluate('document.getElementById("ghost-note").classList.contains("hidden")'), true);
});

await check('arrastar para a esquerda também funciona', async () => {
  const a = await cellPoint(14, 10);
  const b = await cellPoint(14, 8);
  await drag(a.x, a.y, b.x, b.y);
  const note = await evaluate(`${notesOf('piano')}.find(n => n.midi === window.__beatProductor.range[14])`);
  assert.deepEqual([note.start, note.duration], [24, 9]);
});

await check('clicar numa nota apaga', async () => {
  const p = await cellPoint(14, 9);
  await click(p.x, p.y);
  await waitFor(`${notesOf('piano')}.length === 2`, 2000, 'nota apagada');
});

await check('troca de instrumento: bateria mostra peças e notas do piano ficam esmaecidas', async () => {
  await setControl('instrument-select', 'drums');
  assert.equal(await evaluate('document.querySelectorAll(".note-other").length'), 2);
  assert.equal(await evaluate('document.querySelectorAll(".note-own").length'), 0);
  const labels = await evaluate('[...document.querySelectorAll("#piano-keys .key")].slice(-4).map(k => k.textContent)');
  assert.deepEqual(labels, ['Hi-Hat aberto', 'Hi-Hat fechado', 'Caixa', 'Bumbo']);
  const p = await cellPoint(35, 0);
  await click(p.x, p.y);
  await waitFor(`${notesOf('drums')}.length === 1`, 2000, 'nota de bateria');
});

await check('divisão 1/6 e 1/2 alteram o grid sem perder notas', async () => {
  const before = await evaluate('document.getElementById("grid").style.width');
  await setControl('division-select', '1/6');
  assert.equal(await evaluate('window.__beatProductor.getLayout().ticksPerCell'), 2);
  await setControl('division-select', '1/2');
  assert.equal(await evaluate('window.__beatProductor.getLayout().ticksPerCell'), 6);
  await setControl('division-select', '1/4');
  assert.equal(await evaluate('document.getElementById("grid").style.width'), before);
  assert.equal(await evaluate('window.__beatProductor.sequence.notes.length'), 3);
});

await check('BPM muda a largura das células; valor inválido é corrigido', async () => {
  const w120 = await evaluate('window.__beatProductor.getLayout().cellWidth');
  await setControl('bpm-input', 60);
  const w60 = await evaluate('window.__beatProductor.getLayout().cellWidth');
  assert.ok(w60 > w120, `${w60} > ${w120}`);
  await setControl('bpm-input', 999);
  assert.equal(await evaluate('document.getElementById("bpm-input").value'), '240');
  await setControl('bpm-input', 120);
});

await check('loop habilita o campo de quantidade', async () => {
  await setControl('loop-checkbox', true);
  assert.equal(await evaluate('document.getElementById("loops-input").disabled'), false);
  await setControl('loop-checkbox', false);
});

await check('PLAY move o cursor, PAUSE congela', async () => {
  await clickElement('#play-button');
  await waitFor('window.__beatProductor.transport.playing', 3000, 'tocando');
  await sleep(700);
  const t1 = await evaluate('window.__beatProductor.transport.tick');
  assert.ok(t1 > 0, `tick ${t1}`);
  assert.match(await evaluate('document.getElementById("play-button").textContent'), /PAUSE/);
  const transform = await evaluate('document.getElementById("playhead").style.transform');
  assert.match(transform, /translateX\((?!0px)/);
  await clickElement('#play-button');
  const t2 = await evaluate('window.__beatProductor.transport.tick');
  await sleep(300);
  assert.equal(await evaluate('window.__beatProductor.transport.tick'), t2);
});

await check('INÍCIO e FIM posicionam o cursor', async () => {
  await clickElement('#end-button');
  assert.equal(await evaluate('window.__beatProductor.transport.tick'), await evaluate('window.__beatProductor.sequence.lengthTicks'));
  await clickElement('#start-button');
  assert.equal(await evaluate('window.__beatProductor.transport.tick'), 0);
  await waitFor('document.getElementById("position-display").textContent === "1.1"', 2000, 'mostrador 1.1');
});

await check('atalho Espaço alterna play/pause', async () => {
  await page('Input.dispatchKeyEvent', { type: 'keyDown', code: 'Space', key: ' ', windowsVirtualKeyCode: 32 });
  await page('Input.dispatchKeyEvent', { type: 'keyUp', code: 'Space', key: ' ', windowsVirtualKeyCode: 32 });
  await waitFor('window.__beatProductor.transport.playing', 3000, 'tocando via espaço');
  await page('Input.dispatchKeyEvent', { type: 'keyDown', code: 'Space', key: ' ', windowsVirtualKeyCode: 32 });
  await page('Input.dispatchKeyEvent', { type: 'keyUp', code: 'Space', key: ' ', windowsVirtualKeyCode: 32 });
  await waitFor('!window.__beatProductor.transport.playing', 3000, 'pausado via espaço');
});

await check('sem loop, a reprodução termina sozinha no fim', async () => {
  await setControl('bars-input', 1);
  await setControl('bpm-input', 240); // 1 compasso = 1 s
  await clickElement('#start-button');
  await clickElement('#play-button');
  await waitFor('!window.__beatProductor.transport.playing', 4000, 'fim da reprodução');
  assert.equal(await evaluate('window.__beatProductor.transport.tick'), 48);
  await setControl('bpm-input', 120);
  await setControl('bars-input', 4);
});

await check('com loop, a reprodução continua após o fim', async () => {
  await setControl('bars-input', 1);
  await setControl('bpm-input', 240);
  await setControl('loop-checkbox', true);
  await clickElement('#start-button');
  await clickElement('#play-button');
  await sleep(1500);
  assert.equal(await evaluate('window.__beatProductor.transport.playing'), true);
  assert.ok(await evaluate('window.__beatProductor.transport.absoluteTick') > 48);
  await clickElement('#play-button');
  await setControl('loop-checkbox', false);
  await setControl('bpm-input', 120);
  await setControl('bars-input', 4);
});

if (await evaluate('typeof window.__beatProductor.audio === "object"')) {
  await check('áudio: AudioContext ativo e vozes agendadas durante o play', async () => {
    await clickElement('#start-button');
    await clickElement('#play-button');
    await waitFor('window.__beatProductor.audio.context.state === "running"', 3000, 'AudioContext running');
    await waitFor('window.__beatProductor.audio.stats.scheduled > 0', 3000, 'vozes agendadas');
    await clickElement('#play-button');
  });

  await check('áudio: clicar numa tecla toca a pré-escuta', async () => {
    const before = await evaluate('window.__beatProductor.audio.stats.previews');
    await clickElement('#piano-keys .key');
    await waitFor(`window.__beatProductor.audio.stats.previews > ${before}`, 2000, 'pré-escuta');
  });
}

if (testExport) {
  await check('exportação gera e baixa um MP3 válido', async () => {
    await setControl('loop-checkbox', true);
    await setControl('loops-input', 2);
    await clickElement('#export-button');
    const deadline = Date.now() + 30000;
    let file = null;
    while (Date.now() < deadline && !file) {
      file = readdirSync(downloadDir).find((name) => name.endsWith('.mp3'));
      await sleep(200);
    }
    assert.ok(file, 'nenhum .mp3 baixado');
    const path = join(downloadDir, file);
    await sleep(300);
    assert.ok(statSync(path).size > 1000, 'arquivo muito pequeno');
    const head = readFileSync(path).subarray(0, 3);
    const isId3 = head.toString('latin1') === 'ID3';
    const isFrameSync = head[0] === 0xff && (head[1] & 0xe0) === 0xe0;
    assert.ok(isId3 || isFrameSync, 'cabeçalho MP3 inválido');
    await setControl('loop-checkbox', false);
  });
}

if (screenshotPath) {
  const shot = await page('Page.captureScreenshot', { format: 'png' });
  writeFileSync(screenshotPath, Buffer.from(shot.data, 'base64'));
  console.log(`  📷 screenshot: ${screenshotPath}`);
}

await check('nenhum erro de JavaScript/console durante o teste', async () => {
  assert.deepEqual(pageErrors, []);
});

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} verificações OK`);
process.exit(failed.length ? 1 : 0);
