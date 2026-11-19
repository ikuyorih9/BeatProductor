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

async function rightClick(x, y) {
  await mouse('mouseMoved', x, y);
  await page('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'right', buttons: 2, clickCount: 1 });
  await page('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'right', buttons: 0, clickCount: 1 });
}

/** modifiers: 2 = Ctrl, 8 = Shift. */
async function pressKey(code, key, keyCode, modifiers = 0) {
  await page('Input.dispatchKeyEvent', { type: 'keyDown', code, key, windowsVirtualKeyCode: keyCode, modifiers });
  await page('Input.dispatchKeyEvent', { type: 'keyUp', code, key, windowsVirtualKeyCode: keyCode, modifiers });
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
    // Só rola se a linha estiver fora da área visível: pontos pedidos em seguida
    // (início e fim de um arraste) ficam na mesma rolagem.
    const top = 22 * ${row};
    const visible = scroller.clientHeight - 24 - 30; // régua e folga
    if (top < scroller.scrollTop + 4 || top + 22 > scroller.scrollTop + visible) {
      scroller.scrollTop = Math.max(0, top - 160);
    }
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
  assert.equal(await evaluate('document.getElementById("division-select").value'), '1/16');
  assert.equal(await evaluate('document.getElementById("meter-select").value'), '4/4');
  assert.equal(await evaluate('document.querySelectorAll("#mixer input[type=range]").length'), 4);
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

await check('célula = figura da partitura (1/4 semínima … 1/16T) sem perder notas', async () => {
  const before = await evaluate('document.getElementById("grid").style.width');
  await setControl('division-select', '1/16T');
  assert.equal(await evaluate('window.__beatProductor.getLayout().ticksPerCell'), 2);
  await setControl('division-select', '1/8');
  assert.equal(await evaluate('window.__beatProductor.getLayout().ticksPerCell'), 6);
  await setControl('division-select', '1/4');
  assert.equal(await evaluate('window.__beatProductor.getLayout().ticksPerCell'), 12); // 1 célula = 1 batida do BPM
  const label = await evaluate('document.getElementById("division-select").selectedOptions[0].textContent');
  assert.match(label, /semínima/);
  await setControl('division-select', '1/16');
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

const END = 'window.__beatProductor.sequence.endTick()';

await check('INÍCIO e FIM posicionam o cursor (FIM = fim da última nota)', async () => {
  await clickElement('#end-button');
  const end = await evaluate(END);
  assert.equal(end, 24, 'a última nota termina no tick 24');
  assert.equal(await evaluate('window.__beatProductor.transport.tick'), end);
  assert.equal(await evaluate('document.getElementById("end-marker").classList.contains("hidden")'), false);
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

await check('sem loop, o play para no fim da ÚLTIMA NOTA (não no fim do grid)', async () => {
  await setControl('bpm-input', 240); // 24 ticks = 0,5 s
  await clickElement('#start-button');
  const started = Date.now();
  await clickElement('#play-button');
  await waitFor('!window.__beatProductor.transport.playing', 4000, 'fim da reprodução');
  assert.ok(Date.now() - started < 1500, 'deveria parar em ~0,5 s, não em 4 s (fim do grid)');
  assert.equal(await evaluate('window.__beatProductor.transport.tick'), 24);
  await setControl('bpm-input', 120);
});

await check('com loop, recomeça no fim da última nota', async () => {
  await setControl('bpm-input', 240);
  await setControl('loop-checkbox', true);
  await clickElement('#start-button');
  await clickElement('#play-button');
  let maxTick = 0;
  for (let i = 0; i < 15; i += 1) {
    maxTick = Math.max(maxTick, await evaluate('window.__beatProductor.transport.tick'));
    await sleep(100);
  }
  assert.equal(await evaluate('window.__beatProductor.transport.playing'), true);
  assert.ok(await evaluate('window.__beatProductor.transport.absoluteTick') > 48, 'deveria ter dado 2+ voltas');
  assert.ok(maxTick < 24, `o cursor nunca passa do fim da última nota (máx ${maxTick})`);
  await clickElement('#play-button');
  await setControl('loop-checkbox', false);
  await setControl('bpm-input', 120);
});

await check('botão direito numa célula vazia cria PAUSA (bloco branco) que estende o fim', async () => {
  const p = await cellPoint(20, 15); // tick 45–48: pausa até o fim do 1º compasso
  await rightClick(p.x, p.y);
  await waitFor(`${notesOf('drums')}.some(n => n.kind === 'rest')`, 2000, 'pausa criada');
  const rest = await evaluate(`${notesOf('drums')}.find(n => n.kind === 'rest')`);
  assert.deepEqual([rest.start, rest.duration], [45, 3]);
  assert.equal(await evaluate('document.querySelectorAll(".note-own.note-rest").length'), 1);
  const bg = await evaluate('getComputedStyle(document.querySelector(".note-rest")).backgroundColor');
  assert.equal(bg, 'rgb(241, 245, 249)');
  assert.equal(await evaluate(END), 48);
  await clickElement('#end-button');
  assert.equal(await evaluate('window.__beatProductor.transport.tick'), 48);
  assert.equal(await evaluate('window.__beatProductor.transport.lengthTicks'), 48);
});

await check('a pausa faz o loop durar até ela (silêncio antes de recomeçar)', async () => {
  await setControl('bpm-input', 240); // 48 ticks = 1 s
  await setControl('loop-checkbox', true);
  await clickElement('#start-button');
  await clickElement('#play-button');
  await sleep(750);
  const tick = await evaluate('window.__beatProductor.transport.tick');
  assert.ok(tick > 24 && tick < 48, `deveria estar no trecho de pausa (tick ${tick})`);
  await clickElement('#play-button');
  await setControl('loop-checkbox', false);
  await setControl('bpm-input', 120);
});

await check('botão direito na pausa apaga', async () => {
  const p = await cellPoint(20, 15);
  await rightClick(p.x, p.y);
  await waitFor(`!${notesOf('drums')}.some(n => n.kind === 'rest')`, 2000, 'pausa apagada');
  assert.equal(await evaluate(END), 24);
});

await check('Selecionar (retângulo) + UNIR juntam células numa nota longa', async () => {
  for (const cell of [0, 1, 2, 3]) {
    const p = await cellPoint(16, cell);
    await click(p.x, p.y);
  }
  const row = `${notesOf('drums')}.filter(n => n.midi === window.__beatProductor.range[16])`;
  await waitFor(`${row}.length === 4`, 2000, '4 notas');
  assert.equal(await evaluate('document.getElementById("merge-button").disabled'), true);

  await clickElement('#tool-select');
  assert.equal(await evaluate('window.__beatProductor.store.get().tool'), 'select');
  assert.ok(await evaluate('document.getElementById("tool-select").classList.contains("is-active")'));
  const a = await cellPoint(15, 0);
  const b = await cellPoint(17, 3);
  await drag(a.x - 8, a.y, b.x, b.y); // retângulo cobrindo as 4 notas (linhas 15–17)
  await waitFor('document.querySelectorAll(".note.is-selected").length === 4', 2000, '4 selecionadas');
  assert.equal(await evaluate('document.getElementById("merge-button").disabled'), false);
  assert.equal(await evaluate('document.getElementById("merge-button").textContent'), 'UNIR (4)');

  await clickElement('#merge-button');
  await waitFor(`${row}.length === 1`, 2000, 'notas unidas');
  const merged = await evaluate(`${row}[0]`);
  assert.deepEqual([merged.start, merged.duration], [0, 12]);
  assert.equal(await evaluate('document.querySelectorAll(".note.is-selected").length'), 1);
});

await check('no modo Selecionar, clicar numa nota NÃO apaga; Esc limpa a seleção', async () => {
  const p = await cellPoint(16, 1);
  await click(p.x, p.y);
  const row = `${notesOf('drums')}.filter(n => n.midi === window.__beatProductor.range[16])`;
  assert.equal(await evaluate(`${row}.length`), 1);
  await waitFor('document.querySelectorAll(".note.is-selected").length === 1', 2000, 'selecionada');
  await pressKey('Escape', 'Escape', 27);
  await waitFor('document.querySelectorAll(".note.is-selected").length === 0', 2000, 'seleção limpa');
});

await check('Delete apaga a seleção', async () => {
  const p = await cellPoint(16, 1);
  await click(p.x, p.y);
  await waitFor('document.querySelectorAll(".note.is-selected").length === 1', 2000, 'selecionada');
  await pressKey('Delete', 'Delete', 46);
  const row = `${notesOf('drums')}.filter(n => n.midi === window.__beatProductor.range[16])`;
  await waitFor(`${row}.length === 0`, 2000, 'nota apagada');
  await clickElement('#tool-draw');
  assert.equal(await evaluate('window.__beatProductor.store.get().tool'), 'draw');
});

const SELECTED = 'document.querySelectorAll(".note.is-selected").length';
const rowNotes = (row) => `${notesOf('drums')}.filter(n => n.midi === window.__beatProductor.range[${row}])`;
const CTRL = 2;

await check('lixeira só fica ativa com seleção e apaga as notas selecionadas', async () => {
  for (const cell of [0, 1]) {
    const p = await cellPoint(16, cell);
    await click(p.x, p.y);
  }
  await waitFor(`${rowNotes(16)}.length === 2`, 2000, '2 notas');
  assert.equal(await evaluate('document.getElementById("delete-button").disabled'), true);
  await clickElement('#tool-select');
  const a = await cellPoint(15, 0);
  const b = await cellPoint(17, 1);
  await drag(a.x - 8, a.y, b.x, b.y);
  await waitFor(`${SELECTED} === 2`, 2000, '2 selecionadas');
  assert.equal(await evaluate('document.getElementById("delete-button").disabled'), false);
  await clickElement('#delete-button');
  await waitFor(`${rowNotes(16)}.length === 0`, 2000, 'apagadas pela lixeira');
  assert.equal(await evaluate('document.getElementById("delete-button").disabled'), true);
});

await check('arrastar a seleção para baixo/cima e para os lados move as notas', async () => {
  await clickElement('#tool-draw');
  const p = await cellPoint(16, 2);
  await click(p.x, p.y);
  await waitFor(`${rowNotes(16)}.length === 1`, 2000, 'nota criada');
  const id = await evaluate(`${rowNotes(16)}[0].id`);
  await clickElement('#tool-select');
  const q = await cellPoint(16, 2);
  await drag(q.x, q.y, q.x, q.y + 44); // 2 linhas para baixo
  await waitFor(`${rowNotes(18)}.length === 1`, 2000, 'desceu 2 linhas');
  assert.equal(await evaluate(`window.__beatProductor.sequence.getNote(${id}).start`), 6, 'o tempo não muda');
  const r = await cellPoint(18, 2);
  const w = await evaluate('window.__beatProductor.getLayout().cellWidth');
  await drag(r.x, r.y, r.x + w, r.y - 22); // 1 célula à direita e 1 linha para cima
  await waitFor(`window.__beatProductor.sequence.getNote(${id}).start === 9`, 2000, 'andou 1 célula');
  assert.equal(await evaluate(`window.__beatProductor.sequence.getNote(${id}).midi`), await evaluate('window.__beatProductor.range[17]'));
  assert.equal(await evaluate(SELECTED), 1, 'continua selecionada');
});

await check('setas movem a seleção (↑ = semitom acima, ← = 1 célula)', async () => {
  const id = await evaluate('window.__beatProductor.grid.getSelection()[0]');
  await pressKey('ArrowUp', 'ArrowUp', 38);
  await waitFor(`window.__beatProductor.sequence.getNote(${id}).midi === window.__beatProductor.range[16]`, 2000, 'subiu');
  await pressKey('ArrowLeft', 'ArrowLeft', 37);
  await waitFor(`window.__beatProductor.sequence.getNote(${id}).start === 6`, 2000, 'voltou 1 célula');
});

await check('Ctrl+C / Ctrl+V colam no cursor, encadeiam e funcionam entre instrumentos', async () => {
  await pressKey('KeyC', 'c', 67, CTRL);
  await evaluate('window.__beatProductor.transport.seek(48)');
  await pressKey('KeyV', 'v', 86, CTRL);
  await waitFor(`${rowNotes(16)}.length === 2`, 2000, '1ª colagem');
  // a cópia começa no tempo 0 (nota no tick 6): colada em 48 + 6
  assert.ok(await evaluate(`${rowNotes(16)}.some(n => n.start === 54)`));
  assert.equal(await evaluate('window.__beatProductor.transport.tick'), 60, 'cursor avança 1 tempo');
  await pressKey('KeyV', 'v', 86, CTRL);
  await waitFor(`${rowNotes(16)}.some(n => n.start === 66)`, 2000, '2ª colagem em seguida');
  assert.equal(await evaluate(SELECTED), 1, 'o que foi colado fica selecionado');

  await setControl('instrument-select', 'lead');
  await pressKey('KeyV', 'v', 86, CTRL);
  await waitFor(`${notesOf('lead')}.some(n => n.start === 78)`, 2000, 'colado no lead');
  await setControl('instrument-select', 'drums');
});

await check('SEPARAR divide uma nota unida em células', async () => {
  await clickElement('#tool-draw');
  const a = await cellPoint(20, 0);
  const b = await cellPoint(20, 3);
  await drag(a.x, a.y, b.x, b.y);
  await waitFor(`${rowNotes(20)}.length === 1 && ${rowNotes(20)}[0].duration === 12`, 2000, 'nota longa');
  assert.equal(await evaluate('document.getElementById("split-button").disabled'), true);
  await clickElement('#tool-select');
  const p = await cellPoint(20, 1);
  await click(p.x, p.y);
  await waitFor(`${SELECTED} === 1`, 2000, 'selecionada');
  assert.equal(await evaluate('document.getElementById("split-button").disabled'), false);
  assert.equal(await evaluate('document.getElementById("split-button").textContent'), 'SEPARAR (1)');
  await clickElement('#split-button');
  await waitFor(`${rowNotes(20)}.length === 4`, 2000, 'separada em 4');
  assert.equal(await evaluate(SELECTED), 4);
  assert.equal(await evaluate('document.getElementById("split-button").disabled'), true);
  await pressKey('Escape', 'Escape', 27);
  await clickElement('#tool-draw');
});

await check('compasso 3/4: régua com 3 tempos, compasso de 36 ticks e posição 2.1', async () => {
  await setControl('meter-select', '3/4');
  const layout = await evaluate('window.__beatProductor.getLayout()');
  assert.equal(layout.barTicks, 36);
  assert.equal(layout.lengthTicks, 4 * 36);
  assert.equal(await evaluate('document.querySelectorAll("#ruler .ruler-tick").length'), 4 * 3);
  await evaluate('window.__beatProductor.transport.seek(36)');
  await waitFor('document.getElementById("position-display").textContent === "2.1"', 2000, 'posição 2.1');
  await setControl('meter-select', '4/4');
  assert.equal(await evaluate('window.__beatProductor.getLayout().barTicks'), 48);
});

await check('compasso 3/8: a semínima não cabe, a célula vira colcheia e a opção fica desabilitada', async () => {
  await setControl('division-select', '1/4');
  await setControl('meter-select', '3/8');
  assert.equal(await evaluate('window.__beatProductor.store.get().division'), '1/8');
  assert.equal(await evaluate('document.getElementById("division-select").value'), '1/8');
  assert.equal(await evaluate('[...document.getElementById("division-select").options].find(o => o.value === "1/4").disabled'), true);
  assert.equal(await evaluate('window.__beatProductor.getLayout().barTicks'), 18);
  await waitFor('[...document.querySelectorAll(".toast")].some(t => t.textContent.includes("não cabe no compasso 3/8"))', 2000, 'aviso');
  await setControl('meter-select', '4/4');
  assert.equal(await evaluate('[...document.getElementById("division-select").options].find(o => o.value === "1/4").disabled'), false);
  await setControl('division-select', '1/16');
});

await check('mixer: o slider muda o volume do instrumento', async () => {
  await setControl('volume-lead', 50);
  assert.equal(await evaluate('window.__beatProductor.store.get().volumes.lead'), 50);
  assert.equal(await evaluate('document.querySelector("#volume-lead + .mixer-value").textContent'), '50%');
  if (await evaluate('!!window.__beatProductor.audio')) {
    await sleep(150); // rampa de 30 ms
    const gain = await evaluate('window.__beatProductor.audio.buses.lead.gain.value');
    assert.ok(Math.abs(gain - 2.1 * 0.25) < 0.01, `ganho do canal ${gain}`); // 50% = (0,5)² na curva perceptiva
  }
  await setControl('volume-lead', 100);
});

if (await evaluate('typeof window.__beatProductor.audio === "object"')) {
  await check('áudio: AudioContext ativo e vozes agendadas durante o play', async () => {
    await clickElement('#start-button');
    await clickElement('#play-button');
    await waitFor('window.__beatProductor.audio.context.state === "running"', 3000, 'AudioContext running');
    await waitFor('window.__beatProductor.audio.stats.scheduled > 0', 3000, 'vozes agendadas');
    await clickElement('#play-button');
  });

  await check('áudio: cada instrumento produz som audível e sem clipping (OfflineAudioContext)', async () => {
    const peaks = await evaluate(`(async () => {
      const { INSTRUMENT_FACTORIES } = await import('./js/audio/instruments.js');
      const out = {};
      for (const [name, factory] of Object.entries(INSTRUMENT_FACTORIES)) {
        for (const midi of [48, 61, 62, 63, 83]) {
          const ctx = new OfflineAudioContext(1, 44100 * 2, 44100);
          const noise = ctx.createBuffer(1, 44100, 44100);
          noise.getChannelData(0).forEach((_, i, a) => { a[i] = Math.random() * 2 - 1; });
          const voice = factory(ctx, { midi, when: 0.01, duration: 0.5 }, { noiseBuffer: noise });
          voice.output.connect(ctx.destination);
          voice.sources.forEach((s) => { s.start(0.01); s.stop(voice.endTime); });
          const data = (await ctx.startRendering()).getChannelData(0);
          let peak = 0;
          for (const v of data) { if (Number.isNaN(v)) return { error: name + ' NaN' }; peak = Math.max(peak, Math.abs(v)); }
          out[name + midi] = peak;
        }
      }
      return out;
    })()`);
    assert.equal(peaks.error, undefined, peaks.error);
    for (const [name, peak] of Object.entries(peaks)) {
      assert.ok(peak > 0.02 && peak <= 1.0, `${name}: pico ${peak}`);
    }
  });

  await check('áudio: cadeia de saída real — bateria equilibrada, reforço audível e nunca acima de 0 dBFS', async () => {
    const result = await evaluate(`(async () => {
      const { INSTRUMENT_FACTORIES } = await import('./js/audio/instruments.js');
      const { createOutputChain } = await import('./js/audio/engine.js');
      const { INSTRUMENT_TRIM, DRUM_PIECE_TRIM } = await import('./js/config.js');
      const { drumPieceForMidi } = await import('./js/core/music.js');
      const { volumeToGain } = await import('./js/core/volume.js');
      const sr = 44100;
      async function render(notes, volumes, seconds) {
        const ctx = new OfflineAudioContext(1, sr * seconds, sr);
        const noise = ctx.createBuffer(1, sr, sr);
        noise.getChannelData(0).forEach((_, i, a) => { a[i] = Math.random() * 2 - 1; });
        const { master } = createOutputChain(ctx);
        const buses = {};
        for (const n of notes) {
          if (!buses[n.i]) {
            buses[n.i] = ctx.createGain();
            buses[n.i].gain.value = INSTRUMENT_TRIM[n.i] * volumeToGain(volumes[n.i] ?? 100);
            buses[n.i].connect(master);
          }
          const voice = INSTRUMENT_FACTORIES[n.i](ctx, { midi: n.m, when: n.t, duration: n.d }, { noiseBuffer: noise });
          const trim = ctx.createGain();
          if (n.i === 'drums') trim.gain.value = DRUM_PIECE_TRIM[drumPieceForMidi(n.m).id];
          voice.output.connect(trim).connect(buses[n.i]);
          voice.sources.forEach((s) => { s.start(n.t); s.stop(voice.endTime); });
        }
        return (await ctx.startRendering()).getChannelData(0);
      }
      const db = (x) => 20 * Math.log10(x);
      const rms = (d, n) => { let e = 0; for (let i = 0; i < n; i += 1) e += d[i] * d[i]; return Math.sqrt(e / n); };
      const peak = (d) => d.reduce((p, v) => Math.max(p, Math.abs(v)), 0);
      const pieces = {};
      for (const m of [48, 49, 50, 51]) pieces[m] = db(rms(await render([{ i: 'drums', m, t: 0, d: 0.1 }], {}, 0.5), 6615));
      const beat = [];
      for (let s = 0; s < 32; s += 1) {
        const t = s * 0.125;
        beat.push({ i: 'drums', m: s % 4 === 2 ? 51 : 50, t, d: 0.1 });
        if (s % 8 === 0) beat.push({ i: 'drums', m: 48, t, d: 0.1 });
        if (s % 8 === 4) beat.push({ i: 'drums', m: 49, t, d: 0.1 });
      }
      const drumsOnly = [...beat];
      for (const m of [60, 64, 67]) beat.push({ i: 'piano', m, t: 0, d: 2 });
      for (const m of [48, 55]) beat.push({ i: 'lofi', m, t: 0, d: 4 });
      for (let k = 0; k < 8; k += 1) beat.push({ i: 'lead', m: 72 + (k % 3) * 2, t: k * 0.5, d: 0.4 });
      const all200 = { piano: 200, drums: 200, lofi: 200, lead: 200 };
      return {
        pieces,
        peakAll200: peak(await render(beat, all200, 4.5)),
        peak100: peak(await render(beat, {}, 4.5)),
        drums50: db(rms(await render(drumsOnly, { drums: 50 }, 4.5), sr * 4)),
        drums100: db(rms(await render(drumsOnly, { drums: 100 }, 4.5), sr * 4)),
        drums200: db(rms(await render(drumsOnly, { drums: 200 }, 4.5), sr * 4)),
      };
    })()`);
    const { pieces } = result;
    const info = JSON.stringify(result);
    assert.ok(pieces[48] - pieces[49] < 3, `caixa muito baixa: ${info}`);
    assert.ok(pieces[48] - pieces[50] < 10 && pieces[48] - pieces[51] < 10, `hi-hats muito baixos: ${info}`);
    assert.ok(result.peakAll200 < 1 && result.peak100 < 1, `pico acima de 0 dBFS: ${info}`);
    assert.ok(result.drums200 - result.drums100 > 6, `200% deveria reforçar bem: ${info}`);
    assert.ok(result.drums100 - result.drums50 > 9, `50% deveria atenuar bem: ${info}`);
  });

  await check('áudio: clicar numa tecla toca a pré-escuta', async () => {
    const before = await evaluate('window.__beatProductor.audio.stats.previews');
    await clickElement('#piano-keys .key:nth-child(18)');
    await waitFor(`window.__beatProductor.audio.stats.previews > ${before}`, 2000, 'pré-escuta');
  });
}

await check('projeto é salvo e restaurado após recarregar a página', async () => {
  await setControl('bpm-input', 100);
  await setControl('instrument-select', 'lofi');
  const before = await evaluate('JSON.stringify(window.__beatProductor.sequence.toJSON())');
  assert.ok(JSON.parse(before).length > 0, 'deveria haver notas antes de recarregar');
  await sleep(700); // salvamento automático agrupa mudanças (400 ms)
  await page('Page.reload');
  await waitFor('document.readyState === "complete" && !!window.__beatProductor', 15000, 'app recarregado');
  assert.equal(await evaluate('JSON.stringify(window.__beatProductor.sequence.toJSON())'), before);
  assert.equal(await evaluate('document.getElementById("bpm-input").value'), '100');
  assert.equal(await evaluate('document.getElementById("instrument-select").value'), 'lofi');
  assert.ok(await evaluate('document.querySelectorAll(".note").length') > 0, 'notas não desenhadas');
  await setControl('bpm-input', 120);
});

let projectFile = null;
let projectBefore = null;
const SNAPSHOT = `JSON.stringify({
  notes: window.__beatProductor.sequence.toJSON().map(({instrument, midi, start, duration, kind}) => [instrument, midi, start, duration, kind]).sort(),
  settings: (({ tool, ...rest }) => rest)(window.__beatProductor.store.get()),
})`;

await check('Exportar projeto baixa um arquivo de texto legível', async () => {
  await setControl('volume-lead', 40);
  await setControl('meter-select', '3/4');
  await clickElement('#export-project-button');
  const deadline = Date.now() + 10000;
  let file = null;
  while (Date.now() < deadline && !file) {
    file = readdirSync(downloadDir).find((name) => name.endsWith('.txt'));
    await sleep(100);
  }
  assert.ok(file, 'nenhum .txt baixado');
  projectFile = join(downloadDir, file);
  await sleep(200);
  const text = readFileSync(projectFile, 'utf8');
  assert.match(text, /\[projeto\]/);
  assert.match(text, /compasso\s+= 3\/4/);
  assert.match(text, /lead\s+= 40/);
  assert.match(text, /\[bateria\]/);
  projectBefore = await evaluate(SNAPSHOT);
});

await check('Limpar tudo apaga as notas de todos os instrumentos (após confirmar)', async () => {
  assert.ok(await evaluate('new Set(window.__beatProductor.sequence.notes.map(n => n.instrument)).size') >= 2);
  await evaluate('window.confirm = () => true');
  await clickElement('#clear-all-button');
  await waitFor('window.__beatProductor.sequence.notes.length === 0', 2000, 'tudo apagado');
});

await check('Importar o arquivo restaura EXATAMENTE o projeto', async () => {
  await setControl('bpm-input', 150);
  await setControl('meter-select', '6/8');
  await setControl('volume-lead', 100);
  const { root } = await page('DOM.getDocument');
  const { nodeId } = await page('DOM.querySelector', { nodeId: root.nodeId, selector: '#import-file' });
  await page('DOM.setFileInputFiles', { nodeId, files: [projectFile] });
  await waitFor('window.__beatProductor.sequence.notes.length > 0', 3000, 'projeto importado');
  assert.equal(await evaluate(SNAPSHOT), projectBefore);
  assert.equal(await evaluate('document.getElementById("meter-select").value'), '3/4');
  assert.equal(await evaluate('document.getElementById("volume-lead").value'), '40');
  await setControl('meter-select', '4/4');
  await setControl('volume-lead', 100);
});

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
    await waitFor('!!document.querySelector(".toast-success")', 3000, 'mensagem de sucesso');
    await waitFor('!document.getElementById("export-button").disabled', 3000, 'botão reabilitado');
    await setControl('loop-checkbox', false);
  });

  await check('exportar sem notas mostra erro amigável (sem chamar o servidor)', async () => {
    await evaluate('window.__beatProductor.sequence.clear()');
    await clickElement('#export-button');
    await waitFor('[...document.querySelectorAll(".toast-error")].some(t => t.textContent.includes("pelo menos uma nota"))', 3000, 'erro de validação');
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
