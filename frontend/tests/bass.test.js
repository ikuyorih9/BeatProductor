import assert from 'node:assert/strict';
import { test } from 'node:test';

import { BASS_TRANSPOSE, renderBass } from '../js/audio/instruments.js';
import { isPlayable, migrateBassOctave, playableRange } from '../js/core/music.js';

// Valores de referência — os MESMOS em frontend/tests/bass.test.js e backend/tests/test_instruments.py:
// navegador e servidor fazem a mesma conta (síntese modal medida de um baixo real), então as amostras têm de bater.
const BASS_REFERENCE = [
  { midi: 59, duration: 0.5, length: 28665, samples: [[100, 0.263136], [1000, -0.09178], [5000, 0.058106], [20000, 0.107314]] },
  { midi: 52, duration: 0.25, length: 17640, samples: [[37, 0.098067], [777, -0.113711], [4444, 0.268328], [12000, 0.088562]] },
];

test('baixo: a corda do navegador é idêntica à do servidor, amostra por amostra', () => {
  for (const { midi, duration, length, samples } of BASS_REFERENCE) {
    const voice = renderBass(midi, duration, 44100);
    assert.equal(voice.length, length);
    for (const [index, value] of samples) {
      assert.ok(Math.abs(voice[index] - value) < 2e-6, `midi ${midi}, amostra ${index}: ${voice[index]} ≠ ${value}`);
    }
  }
});

test('baixo: termina em silêncio e respeita a duração da nota', () => {
  const short = renderBass(52, 0.1, 44100);
  const long = renderBass(52, 1.5, 44100);
  assert.ok(long.length > short.length);
  assert.equal(short[short.length - 1], 0);
  assert.ok(Math.max(...short.map(Math.abs)) > 0.1);
});

test('baixo: soa duas oitavas abaixo da tecla e começa no E3 (= E1, a corda Mi solta)', () => {
  assert.equal(BASS_TRANSPOSE, -24);
  assert.deepEqual(playableRange('bass'), { minMidi: 52, maxMidi: 83 });
  assert.equal(isPlayable('bass', 51), false);
  assert.equal(isPlayable('bass', 52), true);
  assert.equal(isPlayable('piano', 48), true);
});

test('baixo: projeto antigo sobe uma oitava (mesmo som); o que passaria do topo sai', () => {
  const { items, dropped } = migrateBassOctave([
    { instrument: 'bass', midi: 48, start: 0, duration: 6 },
    { instrument: 'bass', midi: 75, start: 6, duration: 6 },
    { instrument: 'piano', midi: 48, start: 0, duration: 6 },
  ]);
  assert.deepEqual(items.map((n) => [n.instrument, n.midi]), [['bass', 60], ['piano', 48]]);
  assert.equal(dropped, 1);
});
