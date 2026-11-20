import assert from 'node:assert/strict';
import { test } from 'node:test';

import { renderBassString } from '../js/audio/instruments.js';

// Valores de referência — os MESMOS em frontend/tests/bass.test.js e backend/tests/test_instruments.py:
// navegador e servidor fazem a mesma conta (modelagem física da corda), então as amostras têm de bater.
const BASS_REFERENCE = [
  { midi: 60, duration: 0.5, length: 28665, samples: [[100, 0.298473], [1000, -0.261425], [5000, -0.205505], [20000, 0.118609]] },
  { midi: 48, duration: 0.25, length: 17640, samples: [[37, -0.079284], [777, 0.252988], [4444, -0.047199], [12000, -0.060329]] },
];

test('baixo: a corda do navegador é idêntica à do servidor, amostra por amostra', () => {
  for (const { midi, duration, length, samples } of BASS_REFERENCE) {
    const voice = renderBassString(midi, duration, 44100);
    assert.equal(voice.length, length);
    for (const [index, value] of samples) {
      assert.ok(Math.abs(voice[index] - value) < 2e-6, `midi ${midi}, amostra ${index}: ${voice[index]} ≠ ${value}`);
    }
  }
});

test('baixo: termina em silêncio e respeita a duração da nota', () => {
  const short = renderBassString(48, 0.1, 44100);
  const long = renderBassString(48, 1.5, 44100);
  assert.ok(long.length > short.length);
  assert.equal(short[short.length - 1], 0);
  assert.ok(Math.max(...short.map(Math.abs)) > 0.1);
});
