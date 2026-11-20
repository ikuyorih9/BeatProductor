import assert from 'node:assert/strict';
import { test } from 'node:test';

import { UndoHistory } from '../js/core/history.js';

test('desfazer e refazer voltam e avançam pelas edições, na ordem', () => {
  const h = new UndoHistory({ notes: 'A' });
  assert.equal(h.canUndo, false);
  assert.equal(h.undo(), null);
  h.record({ notes: 'B' });
  h.record({ notes: 'C' });
  assert.equal(h.undo().notes, 'B');
  assert.equal(h.undo().notes, 'A');
  assert.equal(h.undo(), null);
  assert.equal(h.redo().notes, 'B');
  assert.equal(h.redo().notes, 'C');
  assert.equal(h.redo(), null);
});

test('estado igual não vira passo; edição nova apaga o refazer', () => {
  const h = new UndoHistory({ notes: 'A' });
  assert.equal(h.record({ notes: 'A' }), false);
  h.record({ notes: 'B' });
  h.undo();
  assert.equal(h.canRedo, true);
  h.record({ notes: 'X' });
  assert.equal(h.canRedo, false);
  assert.equal(h.undo().notes, 'A');
});

test('passo que mudou configurações (importar) desfaz e refaz as configurações também', () => {
  const h = new UndoHistory({ notes: 'A' });
  h.record({ notes: 'IMPORTADO' }, { bpm: 90 });
  const back = h.undo({ bpm: 140 });
  assert.deepEqual(back, { notes: 'A', settings: { bpm: 90 } });
  const again = h.redo({ bpm: 90 });
  assert.deepEqual(again, { notes: 'IMPORTADO', settings: { bpm: 140 } });
});

test('o histórico guarda no máximo `limit` passos (os mais antigos saem)', () => {
  const h = new UndoHistory({ notes: '0' }, 3);
  for (let i = 1; i <= 5; i += 1) h.record({ notes: String(i) });
  assert.equal(h.undo().notes, '4');
  assert.equal(h.undo().notes, '3');
  assert.equal(h.undo().notes, '2');
  assert.equal(h.undo(), null);
});
