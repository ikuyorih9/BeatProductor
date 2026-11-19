import assert from 'node:assert/strict';
import { test } from 'node:test';

import { Sequence } from '../js/core/sequence.js';
import { createStore } from '../js/core/store.js';

const piano = (midi, start, duration) => ({ instrument: 'piano', midi, start, duration });

test('adiciona e remove notas', () => {
  const seq = new Sequence(192);
  const note = seq.addNote(piano(60, 0, 3));
  assert.equal(seq.notes.length, 1);
  assert.equal(seq.getNote(note.id).midi, 60);
  assert.equal(seq.removeNote(note.id), true);
  assert.equal(seq.removeNote(note.id), false);
  assert.equal(seq.isEmpty, true);
});

test('valida o formato das notas', () => {
  const seq = new Sequence(192);
  assert.throws(() => seq.addNote({ instrument: 'tuba', midi: 60, start: 0, duration: 3 }));
  assert.throws(() => seq.addNote(piano(60, -1, 3)));
  assert.throws(() => seq.addNote(piano(60, 0, 0)));
  assert.throws(() => seq.addNote(piano(60.5, 0, 3)));
});

test('nova nota substitui sobreposições do mesmo instrumento e altura', () => {
  const seq = new Sequence(192);
  seq.addNote(piano(60, 0, 6));
  seq.addNote(piano(60, 12, 3));
  seq.addNote({ instrument: 'lead', midi: 60, start: 0, duration: 6 }); // outro instrumento: mantém
  seq.addNote(piano(62, 0, 6)); // outra altura: mantém
  seq.addNote(piano(60, 3, 12)); // cobre as duas primeiras
  const pianoC = seq.notes.filter((n) => n.instrument === 'piano' && n.midi === 60);
  assert.equal(pianoC.length, 1);
  assert.deepEqual([pianoC[0].start, pianoC[0].duration], [3, 12]);
  assert.equal(seq.notes.length, 3);
});

test('notas encostadas (sem sobreposição) convivem', () => {
  const seq = new Sequence(192);
  seq.addNote(piano(60, 0, 3));
  seq.addNote(piano(60, 3, 3));
  assert.equal(seq.notes.length, 2);
});

test('tamanho do padrão é não destrutivo', () => {
  const seq = new Sequence(96);
  seq.addNote(piano(60, 90, 12)); // passa do fim
  seq.addNote(piano(60, 150, 3)); // começa depois do fim
  assert.deepEqual(seq.activeNotes().map((n) => [n.start, n.duration]), [[90, 6]]);
  seq.setLength(192);
  assert.deepEqual(seq.activeNotes().map((n) => [n.start, n.duration]), [[90, 12], [150, 3]]);
});

test('clear por instrumento e geral', () => {
  const seq = new Sequence(192);
  seq.addNote(piano(60, 0, 3));
  seq.addNote({ instrument: 'drums', midi: 48, start: 0, duration: 3 });
  assert.equal(seq.clear('piano'), 1);
  assert.equal(seq.notes.length, 1);
  assert.equal(seq.clear(), 1);
  assert.equal(seq.notes.length, 0);
});

test('toEvents gera o formato do backend em segundos', () => {
  const seq = new Sequence(192);
  seq.addNote(piano(60, 12, 6));
  seq.addNote({ instrument: 'drums', midi: 48, start: 0, duration: 3 });
  assert.deepEqual(seq.toEvents(120), [
    { time: 0, note: 'C3', duration: 0.125, instrument: 'drums' },
    { time: 0.5, note: 'C4', duration: 0.25, instrument: 'piano' },
  ]);
});

test('serialização ida e volta, ignorando entradas corrompidas', () => {
  const seq = new Sequence(192);
  seq.addNote(piano(60, 0, 3));
  seq.addNote({ instrument: 'lofi', midi: 64, start: 6, duration: 9 });
  const copy = new Sequence(192);
  assert.equal(copy.loadJSON([...seq.toJSON(), null, { instrument: 'x' }, 42]), 2);
  assert.deepEqual(copy.toJSON(), seq.toJSON());
  assert.equal(copy.loadJSON('lixo'), 0);
});

test('store notifica somente mudanças reais', () => {
  const store = createStore({ a: 1, b: 2 });
  const calls = [];
  const unsubscribe = store.subscribe((state, previous, changed) => calls.push({ state, previous, changed }));
  assert.deepEqual(store.set({ a: 1 }), []);
  assert.deepEqual(store.set({ a: 5, b: 2 }), ['a']);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].previous.a, 1);
  assert.equal(store.get().a, 5);
  unsubscribe();
  store.set({ a: 9 });
  assert.equal(calls.length, 1);
});
