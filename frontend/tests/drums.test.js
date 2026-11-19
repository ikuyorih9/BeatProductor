import assert from 'node:assert/strict';
import { test } from 'node:test';

import { DRUM_PIECES, HIGHEST_MIDI, LOWEST_MIDI } from '../js/config.js';
import {
  drumPieceForMidi, isPlayable, migrateLegacyDrumItems, migrateLegacyDrumMidi, playableRange,
} from '../js/core/music.js';
import { defaultSettings, parseProject, serializeProject } from '../js/core/project.js';
import { parseNoteName, parseProjectFile, serializeProjectFile } from '../js/core/project-file.js';
import { clampMove } from '../js/core/selection.js';
import { Sequence } from '../js/core/sequence.js';

const byMidi = (items) => [...items].sort((a, b) => a.midi - b.midi || a.start - b.start);

test('kit de bateria: 8 peças em teclas fixas e consecutivas, de C3 a G3', () => {
  assert.deepEqual(DRUM_PIECES.map((p) => p.label), [
    'Bumbo', 'Caixa', 'Chimbal', 'Surdo', 'Tom 2', 'Tom 1', 'Ride', 'Prato de ataque',
  ]);
  DRUM_PIECES.forEach((piece, i) => {
    assert.equal(piece.midi, 48 + i);
    assert.equal(drumPieceForMidi(48 + i), piece);
    assert.ok(piece.trim > 0);
  });
  assert.equal(drumPieceForMidi(47), null);
  assert.equal(drumPieceForMidi(56), null);
  assert.equal(drumPieceForMidi(60), null); // antes, C4 repetia o bumbo
});

test('faixa por instrumento: a bateria aceita só o kit; os outros, o grid inteiro', () => {
  assert.deepEqual(playableRange('drums'), { minMidi: 48, maxMidi: 55 });
  assert.deepEqual(playableRange('piano'), { minMidi: LOWEST_MIDI, maxMidi: HIGHEST_MIDI });
  assert.ok(isPlayable('drums', 55));
  assert.ok(!isPlayable('drums', 56));
  assert.ok(isPlayable('lead', 83));
  assert.ok(!isPlayable('drums', 50.5));
});

test('migração da bateria antiga (4 peças repetidas por classe de altura)', () => {
  // C bumbo, C# caixa, D chimbal fechado, D# chimbal aberto, E bumbo… em qualquer oitava.
  assert.deepEqual([60, 61, 62, 63, 64, 77, 83].map(migrateLegacyDrumMidi), [48, 49, 50, 50, 48, 49, 50]);
  // Idempotente nas teclas que já eram do kit antigo (C3, C#3, D3).
  assert.deepEqual([48, 49, 50].map(migrateLegacyDrumMidi), [48, 49, 50]);
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
    { instrument: 'drums', midi: 48, start: 0, duration: 3, kind: 'note' },
    { instrument: 'drums', midi: 50, start: 0, duration: 6, kind: 'note' },
    { instrument: 'drums', midi: 50, start: 6, duration: 3, kind: 'note' },
  ]);
  assert.equal(items.find((i) => i.instrument === 'piano').midi, 63);
});

test('projeto salvo no navegador (v2) é migrado ao abrir; o novo salva como v3', () => {
  const old = JSON.stringify({
    version: 2,
    settings: { ...defaultSettings(), instrument: 'drums' },
    notes: [
      { instrument: 'drums', midi: 61, start: 12, duration: 3, kind: 'note' },
      { instrument: 'drums', midi: 63, start: 0, duration: 3, kind: 'note' },
      { instrument: 'piano', midi: 70, start: 0, duration: 3, kind: 'note' },
    ],
  });
  const loaded = parseProject(old);
  assert.deepEqual(byMidi(loaded.notes).map((n) => [n.instrument, n.midi]), [['drums', 49], ['drums', 50], ['piano', 70]]);
  const seq = new Sequence(192);
  seq.loadJSON(loaded.notes);
  const saved = serializeProject(loaded.settings, seq);
  assert.equal(JSON.parse(saved).version, 3);
  assert.deepEqual(byMidi(parseProject(saved).notes), byMidi(seq.toJSON())); // v3 não é migrado de novo
});

test('ao carregar, nota de bateria fora do kit é descartada (dado corrompido)', () => {
  const seq = new Sequence(192);
  seq.loadJSON([
    { instrument: 'drums', midi: 70, start: 0, duration: 3 },
    { instrument: 'drums', midi: 55, start: 0, duration: 3 },
    { instrument: 'piano', midi: 70, start: 0, duration: 3 },
  ]);
  assert.deepEqual(seq.toJSON().map((n) => [n.instrument, n.midi]), [['drums', 55], ['piano', 70]]);
});

test('arquivo de texto: nomes de todas as peças e erro claro fora do kit', () => {
  const names = ['bumbo', 'caixa', 'chimbal', 'surdo', 'tom-2', 'tom-1', 'ride', 'ataque'];
  assert.deepEqual(names.map((n) => parseNoteName(n, 'drums')), [48, 49, 50, 51, 52, 53, 54, 55]);
  assert.equal(parseNoteName('Prato-de-Ataque', 'drums'), 55);
  assert.equal(parseNoteName('Condução', 'drums'), 54);
  assert.equal(parseNoteName('chimbal-aberto', 'drums'), 50); // nome antigo continua valendo

  const bad = parseProjectFile('[projeto]\nversao = 2\n[bateria]\n1.1  C4  1\n');
  assert.equal(bad.ok, false);
  assert.match(bad.errors[0], /linha 4: a nota C4 não é uma peça da bateria \(use C3 a G3/);
});

test('arquivo de texto v1 (bateria antiga) é convertido para o kit novo, com aviso', () => {
  const text = [
    '[projeto]', 'versao = 1',
    '[bateria]',
    '1.1  C4  1/4', // bumbo
    '1.1  E3  1/4', // bumbo no mesmo instante → vira um só
    '1.2  C#4  1/4', // caixa
    '1.3  D#5  1/4', // chimbal aberto → chimbal
    '1.4  chimbal-aberto  1/4',
  ].join('\n');
  const result = parseProjectFile(text);
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.deepEqual(byMidi(result.items).map((n) => [n.midi, n.start]), [[48, 0], [49, 12], [50, 24], [50, 36]]);
  assert.match(result.warnings.join(' '), /kit novo/);
});

test('arquivo exportado com as 8 peças volta idêntico', () => {
  const seq = new Sequence(192);
  DRUM_PIECES.forEach((piece, i) => seq.addNote({ instrument: 'drums', midi: piece.midi, start: i * 3, duration: 3 }));
  const text = serializeProjectFile(defaultSettings(), seq.toJSON());
  assert.match(text, /# prato de ataque/);
  assert.match(text, /# surdo/);
  const result = parseProjectFile(text);
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.deepEqual(result.warnings, []);
  assert.deepEqual(byMidi(result.items), byMidi(seq.toJSON()));
});

test('arrastar a seleção fica preso às linhas permitidas (kit da bateria)', () => {
  // Linhas de cima para baixo: 83 … 48; o kit (55 … 48) ocupa as linhas 28 a 35.
  const rowIndex = new Map(Array.from({ length: 36 }, (_, i) => [83 - i, i]));
  const bounds = { rowIndex, rowCount: 36, lengthTicks: 192, minRow: 28, maxRow: 35 };
  const items = [{ midi: 50, start: 0, duration: 3 }, { midi: 52, start: 0, duration: 3 }]; // linhas 33 e 31
  assert.deepEqual(clampMove(items, -10, 0, bounds), { dRows: -3, dTicks: 0 }); // 52 → 55 (prato)
  assert.deepEqual(clampMove(items, 10, 0, bounds), { dRows: 2, dTicks: 0 }); // 50 → 48 (bumbo)
});
