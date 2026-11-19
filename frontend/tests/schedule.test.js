import assert from 'node:assert/strict';
import { test } from 'node:test';

import { notesInWindow } from '../js/core/schedule.js';
import { Transport } from '../js/core/transport.js';

const notes = [
  { id: 1, start: 0, duration: 3 },
  { id: 2, start: 12, duration: 6 },
  { id: 3, start: 47, duration: 1 },
];
const L = 48;

const ids = (items) => items.map(({ note, absStart }) => [note.id, absStart]);

test('janela simples sem loop (início inclusivo, fim exclusivo)', () => {
  assert.deepEqual(ids(notesInWindow(notes, 0, 12, L, false)), [[1, 0]]);
  assert.deepEqual(ids(notesInWindow(notes, 0, 13, L, false)), [[1, 0], [2, 12]]);
  assert.deepEqual(ids(notesInWindow(notes, 0.5, 47, L, false)), [[2, 12]]);
});

test('sem loop nada é repetido após o fim', () => {
  assert.deepEqual(ids(notesInWindow(notes, 40, 100, L, false)), [[3, 47]]);
});

test('com loop a janela atravessa a fronteira do padrão', () => {
  assert.deepEqual(ids(notesInWindow(notes, 46, 50, L, true)), [[3, 47], [1, 48]]);
  assert.deepEqual(ids(notesInWindow(notes, 96, 108, L, true)), [[1, 96]]);
});

test('janela que cobre várias voltas', () => {
  const result = ids(notesInWindow(notes, 0, 2 * L, L, true));
  assert.deepEqual(result, [[1, 0], [2, 12], [3, 47], [1, 48], [2, 60], [3, 95]]);
});

test('janelas consecutivas não duplicam nem perdem notas', () => {
  const seen = [];
  let from = 0;
  for (const step of [0.7, 5.3, 11, 0.01, 30, 2.99, 47, 1]) {
    const to = from + step;
    seen.push(...ids(notesInWindow(notes, from, to, L, true)));
    from = to;
  }
  const expected = ids(notesInWindow(notes, 0, from, L, true));
  assert.deepEqual(seen, expected);
});

test('janela vazia ou inválida', () => {
  assert.deepEqual(notesInWindow(notes, 10, 10, L, true), []);
  assert.deepEqual(notesInWindow(notes, 10, 5, L, true), []);
  assert.deepEqual(notesInWindow(notes, 0, 10, 0, true), []);
});

test('notas além do padrão são ignoradas', () => {
  assert.deepEqual(notesInWindow([{ id: 9, start: 50, duration: 2 }], 0, 200, L, true), []);
});

test('tickAt compensa latência sem voltar antes da âncora', () => {
  let now = 5;
  const transport = new Transport({ now: () => now, bpm: 120, lengthTicks: 192 });
  transport.play();
  now += 1; // 24 ticks
  assert.equal(transport.tickAt(now - 0.5), 12);
  assert.equal(transport.tickAt(now - 10), 0);
  transport.pause();
  assert.equal(transport.tickAt(0), 24);
});
