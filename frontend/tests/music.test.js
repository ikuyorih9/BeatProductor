import assert from 'node:assert/strict';
import { test } from 'node:test';

import { HIGHEST_MIDI, LOWEST_MIDI, OCTAVES } from '../js/config.js';
import {
  buildRange, drumPieceForMidi, isBlackKey, midiToFrequency, midiToName, nameToMidi, pitchClass,
} from '../js/core/music.js';

test('midiToName / nameToMidi são inversas na faixa MIDI', () => {
  assert.equal(midiToName(60), 'C4');
  assert.equal(midiToName(69), 'A4');
  assert.equal(midiToName(48), 'C3');
  assert.equal(midiToName(83), 'B5');
  assert.equal(midiToName(61), 'C#4');
  for (let midi = 0; midi <= 127; midi += 1) assert.equal(nameToMidi(midiToName(midi)), midi);
});

test('nameToMidi rejeita nomes inválidos', () => {
  for (const bad of ['H4', 'C', 'Cb4', 'C##4', '', 'E#4x']) assert.throws(() => nameToMidi(bad));
  assert.throws(() => midiToName(1.5), TypeError);
});

test('frequências seguem o temperamento igual (A4 = 440 Hz)', () => {
  assert.equal(midiToFrequency(69), 440);
  assert.ok(Math.abs(midiToFrequency(60) - 261.6256) < 1e-3);
  assert.ok(Math.abs(midiToFrequency(81) - 880) < 1e-9);
});

test('teclas pretas', () => {
  assert.deepEqual([60, 61, 62, 63, 64, 65, 66].map(isBlackKey), [false, true, false, true, false, false, true]);
  assert.equal(pitchClass(-1), 11);
});

test('faixa de 3 oitavas, da mais aguda para a mais grave', () => {
  const range = buildRange(LOWEST_MIDI, OCTAVES);
  assert.equal(range.length, 36);
  assert.equal(range[0], HIGHEST_MIDI);
  assert.equal(range.at(-1), LOWEST_MIDI);
  assert.equal(midiToName(range[0]), 'B5');
  assert.equal(midiToName(range.at(-1)), 'C3');
});

test('mapeamento da bateria por classe de altura % 4', () => {
  assert.equal(drumPieceForMidi(60).id, 'kick'); // C
  assert.equal(drumPieceForMidi(61).id, 'snare'); // C#
  assert.equal(drumPieceForMidi(62).id, 'hihat_closed'); // D
  assert.equal(drumPieceForMidi(63).id, 'hihat_open'); // D#
  assert.equal(drumPieceForMidi(64).id, 'kick'); // E
  assert.equal(drumPieceForMidi(48).id, drumPieceForMidi(72).id);
});
