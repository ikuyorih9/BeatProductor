import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ROW_HEIGHT } from '../js/config.js';
import { countMergeableGroups, itemsInRect } from '../js/core/selection.js';
import { Sequence } from '../js/core/sequence.js';

const note = (midi, start, duration, instrument = 'piano') => ({ instrument, midi, start, duration });
const spans = (seq) => seq.notes.map((n) => [n.midi, n.kind, n.start, n.duration]).sort((a, b) => a[0] - b[0] || a[2] - b[2]);

// ------------------------------------------------------------------ pausas
test('pausa é um item silencioso: não vira evento nem nota ativa', () => {
  const seq = new Sequence(192);
  seq.addNote(note(60, 0, 3));
  const rest = seq.addRest(note(62, 3, 3));
  assert.equal(rest.kind, 'rest');
  assert.equal(seq.activeItems().length, 2);
  assert.equal(seq.activeNotes().length, 1);
  assert.equal(seq.toEvents(120).length, 1);
});

test('tipo inválido é rejeitado; projetos antigos (sem kind) viram notas', () => {
  const seq = new Sequence(192);
  assert.throws(() => seq.addNote({ ...note(60, 0, 3), kind: 'silencio' }));
  seq.loadJSON([note(60, 0, 3), { ...note(61, 0, 3), kind: 'rest' }]);
  assert.deepEqual(seq.notes.map((n) => n.kind), ['note', 'rest']);
});

test('pausa e nota na mesma linha se substituem ao sobrepor', () => {
  const seq = new Sequence(192);
  seq.addNote(note(60, 0, 6));
  seq.addRest(note(60, 3, 3));
  assert.deepEqual(spans(seq), [[60, 'rest', 3, 3]]);
});

// ------------------------------------------------------------------ fim da música
test('fim da música = fim da última nota ou pausa', () => {
  const seq = new Sequence(192);
  assert.equal(seq.endTick(), 192); // vazio: tamanho do grid
  seq.addNote(note(60, 0, 12));
  assert.equal(seq.endTick(), 12);
  seq.addRest(note(60, 24, 24)); // pausa até o fim do compasso 1
  assert.equal(seq.endTick(), 48);
  seq.addNote(note(64, 30, 3));
  assert.equal(seq.endTick(), 48);
});

test('fim respeita o tamanho do grid (itens cortados)', () => {
  const seq = new Sequence(48);
  seq.addNote(note(60, 40, 30));
  assert.equal(seq.endTick(), 48);
  seq.addNote(note(62, 60, 3)); // fora do grid: ignorado
  assert.equal(seq.endTick(), 48);
});

// ------------------------------------------------------------------ unir
test('UNIR junta células vizinhas da mesma linha numa nota longa', () => {
  const seq = new Sequence(192);
  const ids = [0, 3, 6, 9].map((start) => seq.addNote(note(60, start, 3)).id);
  const result = seq.mergeItems(ids);
  assert.equal(result.merged, 1);
  assert.deepEqual(spans(seq), [[60, 'note', 0, 12]]);
  assert.deepEqual(result.ids, [seq.notes[0].id]);
});

test('UNIR com lacuna cobre do início da primeira ao fim da última (ligadura)', () => {
  const seq = new Sequence(192);
  const a = seq.addNote(note(60, 0, 3));
  const b = seq.addNote(note(60, 12, 6));
  seq.mergeItems([a.id, b.id]);
  assert.deepEqual(spans(seq), [[60, 'note', 0, 18]]);
});

test('UNIR trata cada linha separadamente e não mistura instrumentos nem tipos', () => {
  const seq = new Sequence(192);
  const ids = [
    seq.addNote(note(60, 0, 3)).id, seq.addNote(note(60, 3, 3)).id, // linha C4 → une
    seq.addNote(note(64, 0, 3)).id, seq.addNote(note(64, 6, 3)).id, // linha E4 → une
    seq.addNote(note(67, 0, 3)).id, // sozinha → fica
    seq.addRest(note(62, 0, 3)).id, seq.addRest(note(62, 3, 3)).id, // pausas → unem entre si
    seq.addNote(note(65, 0, 3, 'lead')).id, seq.addNote(note(65, 3, 3)).id, // instrumentos diferentes → não unem
  ];
  const result = seq.mergeItems(ids);
  assert.equal(result.merged, 3);
  assert.deepEqual(spans(seq), [
    [60, 'note', 0, 6],
    [62, 'rest', 0, 6],
    [64, 'note', 0, 9],
    [65, 'note', 0, 3],
    [65, 'note', 3, 3],
    [67, 'note', 0, 3],
  ]);
  assert.equal(result.ids.length, 6); // 3 unidos + 3 que ficaram como estavam (seleção preservada)
});

test('UNIR com menos de 2 itens na mesma linha não faz nada', () => {
  const seq = new Sequence(192);
  const a = seq.addNote(note(60, 0, 3));
  const b = seq.addNote(note(62, 0, 3));
  const before = spans(seq);
  assert.equal(seq.mergeItems([a.id, b.id]).merged, 0);
  assert.equal(seq.mergeItems([]).merged, 0);
  assert.deepEqual(spans(seq), before);
});

test('removeNotes apaga vários de uma vez', () => {
  const seq = new Sequence(192);
  const ids = [0, 3, 6].map((start) => seq.addNote(note(60, start, 3)).id);
  assert.equal(seq.removeNotes(ids.slice(0, 2)), 2);
  assert.equal(seq.notes.length, 1);
});

// ------------------------------------------------------------------ seleção por retângulo
test('retângulo seleciona o que ele toca, em qualquer direção de arraste', () => {
  const rowIndex = new Map([[62, 0], [61, 1], [60, 2]]);
  const items = [
    { id: 1, midi: 62, start: 0, duration: 3 },
    { id: 2, midi: 61, start: 6, duration: 3 },
    { id: 3, midi: 60, start: 12, duration: 3 },
  ];
  const geometry = { pxPerTick: 10, rowIndex };
  // Cobre linhas 0–1 e ticks 0–7 → itens 1 e 2
  assert.deepEqual(itemsInRect(items, { x1: 0, y1: 0, x2: 70, y2: ROW_HEIGHT * 2 - 1 }, geometry), [1, 2]);
  // Mesmo retângulo arrastado ao contrário
  assert.deepEqual(itemsInRect(items, { x1: 70, y1: ROW_HEIGHT * 2 - 1, x2: 0, y2: 0 }, geometry), [1, 2]);
  // Encostar exatamente na borda final não seleciona (fim exclusivo)
  assert.deepEqual(itemsInRect(items, { x1: 30, y1: 0, x2: 50, y2: 5 }, geometry), []);
  // Retângulo sem largura não seleciona nada
  assert.deepEqual(itemsInRect(items, { x1: 5, y1: 0, x2: 5, y2: 100 }, geometry), []);
});

test('contagem de grupos que UNIR juntaria', () => {
  const items = [
    { id: 1, instrument: 'piano', midi: 60, kind: 'note' },
    { id: 2, instrument: 'piano', midi: 60, kind: 'note' },
    { id: 3, instrument: 'piano', midi: 62, kind: 'note' },
    { id: 4, instrument: 'piano', midi: 62, kind: 'rest' },
  ];
  assert.equal(countMergeableGroups(items, [1, 2, 3, 4]), 1);
  assert.equal(countMergeableGroups(items, [3, 4]), 0);
  assert.equal(countMergeableGroups(items, []), 0);
});
