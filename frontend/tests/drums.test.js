import assert from 'node:assert/strict';
import { test } from 'node:test';

import { DRUM_PIECES, HIGHEST_MIDI, LOWEST_MIDI } from '../js/config.js';
import {
  drumPieceForMidi, isPlayable, migrateBottomKitMidi, migrateLegacyDrumItems, migrateLegacyDrumMidi, playableRange,
} from '../js/core/music.js';
import { defaultSettings, parseProject, serializeProject } from '../js/core/project.js';
import { parseNoteName, parseProjectFile, serializeProjectFile } from '../js/core/project-file.js';
import { clampMove } from '../js/core/selection.js';
import { Sequence } from '../js/core/sequence.js';

const byMidi = (items) => [...items].sort((a, b) => a.midi - b.midi || a.start - b.start);
const KIT = [62, 63, 64, 65, 66, 67, 68, 69]; // as 8 peças originais: D4 … A4 (não mudaram de tecla)
const FULL_KIT = Array.from({ length: 17 }, (_, i) => 57 + i); // A3 … C#5

test('kit de bateria: 17 peças em teclas fixas e consecutivas, de A3 a C#5', () => {
  assert.deepEqual(DRUM_PIECES.map((p) => p.label), [
    'Pandeirola', 'Jam block', 'Cowbell', 'Rototons', 'Octobans',
    'Bumbo', 'Caixa', 'Chimbal', 'Surdo', 'Tom 2', 'Tom 1', 'Ride', 'Prato de ataque',
    'Splash', 'China', 'Stack', 'Bell',
  ]);
  DRUM_PIECES.forEach((piece, i) => {
    assert.equal(piece.midi, FULL_KIT[i]);
    assert.equal(drumPieceForMidi(FULL_KIT[i]), piece);
    assert.ok(piece.trim > 0);
  });
  assert.deepEqual(KIT.map((m) => drumPieceForMidi(m).id), ['kick', 'snare', 'hihat', 'floor_tom', 'tom2', 'tom1', 'ride', 'crash']);
  assert.equal(drumPieceForMidi(56), null);
  assert.equal(drumPieceForMidi(74), null);
  assert.equal(drumPieceForMidi(48), null); // antes, o kit ficava embaixo (C3–G3)
});

test('o kit fica no centro do grid: 9 teclas desativadas abaixo e 10 acima', () => {
  assert.equal(FULL_KIT[0] - LOWEST_MIDI, 9);
  assert.equal(HIGHEST_MIDI - FULL_KIT.at(-1), 10);
});

test('todas as 17 peças têm som (o sintetizador não falha em nenhuma tecla do kit)', async () => {
  const { drums, CYMBALS, PINGS, TOMS } = await import('../js/audio/instruments.js');
  for (const piece of DRUM_PIECES) {
    const known = ['kick', 'snare', 'hihat'].includes(piece.id) || TOMS[piece.id] || CYMBALS[piece.id] || PINGS[piece.id];
    assert.ok(known, `peça sem síntese: ${piece.id}`);
  }
  assert.equal(typeof drums, 'function');
});

test('faixa por instrumento: a bateria aceita só o kit; os outros, o grid inteiro', () => {
  assert.deepEqual(playableRange('drums'), { minMidi: 57, maxMidi: 73 });
  assert.deepEqual(playableRange('piano'), { minMidi: LOWEST_MIDI, maxMidi: HIGHEST_MIDI });
  assert.ok(isPlayable('drums', 73));
  assert.ok(isPlayable('drums', 57));
  assert.ok(!isPlayable('drums', 74));
  assert.ok(!isPlayable('drums', 56));
  assert.ok(isPlayable('lead', 83));
  assert.ok(!isPlayable('drums', 63.5));
});

test('migração da bateria de 4 peças (repetidas por classe de altura)', () => {
  // C bumbo, C# caixa, D chimbal fechado, D# chimbal aberto, E bumbo… em qualquer oitava.
  assert.deepEqual([60, 61, 62, 63, 64, 77, 83].map(migrateLegacyDrumMidi), [62, 63, 64, 64, 62, 63, 64]);
});

test('migração do kit de baixo (C3–G3) para o kit centralizado', () => {
  assert.deepEqual([48, 49, 50, 51, 52, 53, 54, 55].map(migrateBottomKitMidi), KIT);
  assert.equal(migrateBottomKitMidi(70), 70); // fora daquele kit: intacta (e descartada ao carregar)
});

test('migração não deixa sobreposições na mesma tecla nem mexe nos outros instrumentos', () => {
  const items = migrateLegacyDrumItems([
    { instrument: 'drums', midi: 50, start: 0, duration: 12, kind: 'note' }, // chimbal fechado longo
    { instrument: 'drums', midi: 51, start: 6, duration: 3, kind: 'note' }, // chimbal aberto no meio dele
    { instrument: 'drums', midi: 48, start: 0, duration: 3, kind: 'note' }, // bumbo em C3…
    { instrument: 'drums', midi: 64, start: 0, duration: 3, kind: 'note' }, // …e em E3, no mesmo instante
    { instrument: 'drums', midi: 72, start: 0, duration: 3, kind: 'rest' }, // pausa no bumbo, mesmo instante
    { instrument: 'piano', midi: 63, start: 0, duration: 3, kind: 'note' },
  ]);
  assert.deepEqual(byMidi(items.filter((i) => i.instrument === 'drums')), [
    { instrument: 'drums', midi: 62, start: 0, duration: 3, kind: 'note' },
    { instrument: 'drums', midi: 64, start: 0, duration: 6, kind: 'note' },
    { instrument: 'drums', midi: 64, start: 6, duration: 3, kind: 'note' },
  ]);
  assert.equal(items.find((i) => i.instrument === 'piano').midi, 63);
});

const savedProject = (version, notes) => JSON.stringify({
  version, settings: { ...defaultSettings(), instrument: 'drums' }, notes,
});

test('projeto salvo no navegador v2 (4 peças) é migrado ao abrir; o novo salva como v4', () => {
  const loaded = parseProject(savedProject(2, [
    { instrument: 'drums', midi: 61, start: 12, duration: 3, kind: 'note' },
    { instrument: 'drums', midi: 63, start: 0, duration: 3, kind: 'note' },
    { instrument: 'piano', midi: 70, start: 0, duration: 3, kind: 'note' },
  ]));
  assert.deepEqual(byMidi(loaded.notes).map((n) => [n.instrument, n.midi]), [['drums', 63], ['drums', 64], ['piano', 70]]);
  const seq = new Sequence(192);
  seq.loadJSON(loaded.notes);
  const saved = serializeProject(loaded.settings, seq);
  assert.equal(JSON.parse(saved).version, 5);
  assert.deepEqual(byMidi(parseProject(saved).notes), byMidi(seq.toJSON())); // a versão atual não é migrada de novo
});

test('projeto salvo no navegador v3 (kit embaixo) sobe para o kit centralizado', () => {
  const loaded = parseProject(savedProject(3, [
    { instrument: 'drums', midi: 48, start: 0, duration: 3, kind: 'note' },
    { instrument: 'drums', midi: 55, start: 0, duration: 3, kind: 'note' },
    { instrument: 'drums', midi: 50, start: 6, duration: 3, kind: 'rest' },
    { instrument: 'piano', midi: 48, start: 0, duration: 3, kind: 'note' },
  ]));
  assert.deepEqual(byMidi(loaded.notes).map((n) => [n.instrument, n.midi, n.kind]), [
    ['piano', 48, 'note'], ['drums', 62, 'note'], ['drums', 64, 'rest'], ['drums', 69, 'note'],
  ]);
});

test('ao carregar, nota de bateria fora do kit é descartada (dado corrompido)', () => {
  const seq = new Sequence(192);
  seq.loadJSON([
    { instrument: 'drums', midi: 48, start: 0, duration: 3 },
    { instrument: 'drums', midi: 69, start: 0, duration: 3 },
    { instrument: 'piano', midi: 48, start: 0, duration: 3 },
  ]);
  assert.deepEqual(seq.toJSON().map((n) => [n.instrument, n.midi]), [['drums', 69], ['piano', 48]]);
});

test('arquivo de texto: nomes de todas as peças e erro claro fora do kit', () => {
  const names = ['bumbo', 'caixa', 'chimbal', 'surdo', 'tom-2', 'tom-1', 'ride', 'ataque'];
  assert.deepEqual(names.map((n) => parseNoteName(n, 'drums')), KIT);
  const newNames = ['pandeirola', 'jam-block', 'cowbell', 'rototons', 'octobans', 'splash', 'china', 'stack', 'bell'];
  assert.deepEqual(newNames.map((n) => parseNoteName(n, 'drums')), [57, 58, 59, 60, 61, 70, 71, 72, 73]);
  assert.equal(parseNoteName('Prato-de-Ataque', 'drums'), 69);
  assert.equal(parseNoteName('Condução', 'drums'), 68);
  assert.equal(parseNoteName('chimbal-aberto', 'drums'), 64); // nome antigo continua valendo

  const bad = parseProjectFile('[projeto]\nversao = 3\n[bateria]\n1.1  C3  1\n');
  assert.equal(bad.ok, false);
  assert.match(bad.errors[0], /linha 4: a nota C3 não é uma peça da bateria \(use A3 a C#5 ou .*pandeirola\)/);
});

test('arquivo de texto v1 (4 peças) é convertido para o kit atual, com aviso informativo', () => {
  const text = [
    '[projeto]', 'versao = 1',
    '[bateria]',
    '1.1  C4  1/4', // bumbo
    '1.1  E3  1/4', // bumbo no mesmo instante → vira um só
    '1.2  C#4  1/4', // caixa
    '1.3  D#5  1/4', // chimbal aberto → chimbal
    '1.4  chimbal-aberto  1/4', // nome de peça: não é convertido de novo
    '2.1  pausa  1', // forma curta da pausa: na tecla do bumbo
  ].join('\n');
  const result = parseProjectFile(text);
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.deepEqual(byMidi(result.items).map((n) => [n.midi, n.start, n.kind]), [
    [62, 0, 'note'], [62, 48, 'rest'], [63, 12, 'note'], [64, 24, 'note'], [64, 36, 'note'],
  ]);
  assert.deepEqual(result.warnings, []);
  assert.match(result.notices.join(' '), /kit novo/);
});

test('arquivo de texto v2 (kit embaixo, C3–G3) sobe para D4–A4; nomes de peça não mudam', () => {
  const text = ['[projeto]', 'versao = 2', '[bateria]', '1.1  C3  1/4', '1.2  G3  1/4', '1.3  surdo  1/4'].join('\n');
  const result = parseProjectFile(text);
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.deepEqual(byMidi(result.items).map((n) => n.midi), [62, 65, 69]);
  assert.match(result.notices.join(' '), /teclas atuais do kit/);
});

test('arquivo exportado com as 17 peças volta idêntico, sem avisos', () => {
  const seq = new Sequence(192);
  DRUM_PIECES.forEach((piece, i) => seq.addNote({ instrument: 'drums', midi: piece.midi, start: i * 3, duration: 3 }));
  const text = serializeProjectFile(defaultSettings(), seq.toJSON());
  assert.match(text, /versao\s+= 4/);
  assert.match(text, /# prato de ataque/);
  assert.match(text, /# surdo/);
  assert.match(text, /# pandeirola/);
  assert.match(text, /# bell/);
  const result = parseProjectFile(text);
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.deepEqual(result.warnings, []);
  assert.deepEqual(result.notices, []);
  assert.deepEqual(byMidi(result.items), byMidi(seq.toJSON()));
});

test('arrastar a seleção fica preso às linhas permitidas (kit da bateria)', () => {
  // Linhas de cima para baixo: 83 … 48; o kit (73 … 57) ocupa as linhas 10 a 26.
  const rowIndex = new Map(Array.from({ length: 36 }, (_, i) => [83 - i, i]));
  const bounds = { rowIndex, rowCount: 36, lengthTicks: 192, minRow: 10, maxRow: 26 };
  const items = [{ midi: 64, start: 0, duration: 3 }, { midi: 66, start: 0, duration: 3 }]; // linhas 19 e 17
  assert.deepEqual(clampMove(items, -10, 0, bounds), { dRows: -7, dTicks: 0 }); // 66 → 73 (bell)
  assert.deepEqual(clampMove(items, 10, 0, bounds), { dRows: 7, dTicks: 0 }); // 64 → 57 (pandeirola)
});

test('index.html espera a mesma versão do frontend que o config.js declara', async () => {
  const { readFile } = await import('node:fs/promises');
  const { APP_BUILD } = await import('../js/config.js');
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const match = /var APP_BUILD = (\d+);/.exec(html);
  assert.ok(match, 'index.html sem APP_BUILD');
  assert.equal(Number(match[1]), APP_BUILD);
});
