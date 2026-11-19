import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildExportPayload } from '../js/core/export.js';
import { defaultSettings } from '../js/core/project.js';
import { clampMove, copyItems, countSplittable, pasteItems } from '../js/core/selection.js';
import { Sequence } from '../js/core/sequence.js';

const note = (midi, start, duration, extra = {}) => ({ instrument: 'piano', midi, start, duration, ...extra });
const spans = (seq) => seq.notes
  .map((n) => [n.midi, n.kind, n.start, n.duration])
  .sort((a, b) => a[0] - b[0] || a[2] - b[2]);

// ------------------------------------------------------------------ SEPARAR
test('SEPARAR corta a nota longa nas células do grid', () => {
  const seq = new Sequence(192);
  const long = seq.addNote(note(60, 0, 12));
  const { split, ids } = seq.splitItems([long.id], 3);
  assert.equal(split, 1);
  assert.equal(ids.length, 4);
  assert.deepEqual(spans(seq), [[60, 'note', 0, 3], [60, 'note', 3, 3], [60, 'note', 6, 3], [60, 'note', 9, 3]]);
});

test('SEPARAR alinha nas divisas do grid, mesmo com nota fora do grid', () => {
  const seq = new Sequence(192);
  const odd = seq.addNote(note(60, 2, 9)); // 2–11, células de 6 → corta no 6
  seq.splitItems([odd.id], 6);
  assert.deepEqual(spans(seq), [[60, 'note', 2, 4], [60, 'note', 6, 5]]);
});

test('SEPARAR é o inverso de UNIR e preserva pausas', () => {
  const seq = new Sequence(192);
  const ids = [0, 3, 6].map((start) => seq.addRest(note(62, start, 3)).id);
  const merged = seq.mergeItems(ids);
  const back = seq.splitItems(merged.ids, 3);
  assert.equal(back.split, 1);
  assert.deepEqual(spans(seq), [[62, 'rest', 0, 3], [62, 'rest', 3, 3], [62, 'rest', 6, 3]]);
});

test('SEPARAR não mexe em itens de 1 célula; contagem do botão bate', () => {
  const seq = new Sequence(192);
  const a = seq.addNote(note(60, 0, 3));
  const b = seq.addNote(note(62, 0, 6));
  assert.equal(countSplittable(seq.notes, [a.id, b.id], 3), 1);
  assert.equal(countSplittable(seq.notes, [a.id, b.id], 6), 0);
  assert.equal(seq.splitItems([a.id], 3).split, 0);
  assert.throws(() => seq.splitItems([a.id], 0));
});

// ------------------------------------------------------------------ mover
test('mover a seleção mantém ids e posições relativas', () => {
  const seq = new Sequence(192);
  const a = seq.addNote(note(60, 0, 3));
  const b = seq.addNote(note(64, 6, 6));
  assert.equal(seq.moveItems([a.id, b.id], 2, 12), 2);
  assert.deepEqual(spans(seq), [[62, 'note', 12, 3], [66, 'note', 18, 6]]);
  assert.ok(seq.getNote(a.id) && seq.getNote(b.id), 'ids preservados');
});

test('mover substitui o que estiver embaixo no destino', () => {
  const seq = new Sequence(192);
  const a = seq.addNote(note(60, 0, 3));
  seq.addNote(note(61, 0, 6));
  seq.moveItems([a.id], 1, 0);
  assert.deepEqual(spans(seq), [[61, 'note', 0, 3]]);
});

test('mover para fora da faixa é recusado', () => {
  const seq = new Sequence(192);
  const a = seq.addNote(note(83, 0, 3));
  assert.equal(seq.moveItems([a.id], 1, 0, { minMidi: 48, maxMidi: 83 }), 0);
  assert.equal(seq.moveItems([a.id], 0, -1), 0);
  assert.equal(seq.moveItems([a.id], 0, 0), 0);
  assert.deepEqual(spans(seq), [[83, 'note', 0, 3]]);
});

test('arraste é limitado às bordas do grid', () => {
  const rowIndex = new Map([[62, 0], [61, 1], [60, 2]]);
  const items = [note(61, 6, 3), note(60, 12, 3)];
  const bounds = { rowIndex, rowCount: 3, lengthTicks: 48 };
  assert.deepEqual(clampMove(items, -5, -100, bounds), { dRows: -1, dTicks: -6 });
  assert.deepEqual(clampMove(items, 5, 100, bounds), { dRows: 0, dTicks: 35 });
  assert.deepEqual(clampMove([], 3, 3, bounds), { dRows: 0, dTicks: 0 });
});

// ------------------------------------------------------------------ copiar / colar
test('copiar guarda posições relativas ao tempo; colar posiciona no cursor e no instrumento atual', () => {
  const items = [
    { id: 1, ...note(60, 15, 3) },
    { id: 2, ...note(64, 18, 6, { kind: 'rest' }) },
    { id: 3, ...note(67, 40, 3) },
  ];
  const clip = copyItems(items, [1, 2], 12);
  // começa no tempo 12 (15 arredondado para baixo); termina em 24 → 1 tempo
  assert.equal(clip.span, 12);
  assert.deepEqual(clip.items, [
    { midi: 60, offset: 3, duration: 3, kind: undefined },
    { midi: 64, offset: 6, duration: 6, kind: 'rest' },
  ]);
  assert.deepEqual(pasteItems(clip, { instrument: 'lead', start: 48 }), [
    { instrument: 'lead', midi: 60, start: 51, duration: 3, kind: undefined },
    { instrument: 'lead', midi: 64, start: 54, duration: 6, kind: 'rest' },
  ]);
  assert.equal(copyItems(items, [], 12), null);
});

test('colar várias vezes repete o trecho em sequência', () => {
  const seq = new Sequence(192);
  const ids = [seq.addNote(note(60, 0, 6)).id, seq.addNote(note(62, 6, 6)).id];
  const clip = copyItems(seq.activeItems(), ids, 12);
  assert.equal(clip.span, 12);
  seq.insertItems(pasteItems(clip, { instrument: 'piano', start: 12 }));
  seq.insertItems(pasteItems(clip, { instrument: 'piano', start: 24 }));
  assert.deepEqual(seq.activeNotes().map((n) => [n.midi, n.start]), [[60, 0], [62, 6], [60, 12], [62, 18], [60, 24], [62, 30]]);
});

// ------------------------------------------------------------------ volume na exportação
test('o volume de cada instrumento vai como gain dos eventos', () => {
  const seq = new Sequence(192);
  seq.addNote(note(60, 0, 12));
  seq.addNote({ instrument: 'lead', midi: 72, start: 0, duration: 12 });
  const settings = { ...defaultSettings(), volumes: { piano: 50, drums: 100, lofi: 100, lead: 0 } };
  const { payload } = buildExportPayload(seq, settings);
  const gainOf = Object.fromEntries(payload.events.map((e) => [e.instrument, e.gain]));
  assert.deepEqual(gainOf, { piano: 0.5, lead: 0 });
});
