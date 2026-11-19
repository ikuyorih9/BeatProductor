import assert from 'node:assert/strict';
import { test } from 'node:test';

import { Transport } from '../js/core/transport.js';

/** Relógio manual para testes determinísticos. */
function fakeClock(start = 0) {
  let now = start;
  return { now: () => now, advance: (seconds) => { now += seconds; } };
}

// A 120 BPM: 1 batida = 0,5 s = 12 ticks → 24 ticks/s.
const make = (options = {}) => {
  const clock = fakeClock(10);
  const transport = new Transport({ now: clock.now, bpm: 120, lengthTicks: 192, ...options });
  return { clock, transport };
};

test('play avança o tempo e pause congela', () => {
  const { clock, transport } = make();
  assert.equal(transport.tick, 0);
  transport.play();
  clock.advance(1);
  assert.equal(transport.tick, 24);
  transport.pause();
  clock.advance(5);
  assert.equal(transport.tick, 24);
  transport.play();
  clock.advance(0.5);
  assert.equal(transport.tick, 36);
});

test('relógio exige função', () => {
  assert.throws(() => new Transport({ bpm: 120, lengthTicks: 10 }), TypeError);
});

test('sem loop: para no fim e emite "end"', () => {
  const { clock, transport } = make();
  const events = [];
  transport.on((type) => events.push(type));
  transport.play();
  clock.advance(100);
  transport.update();
  assert.equal(transport.playing, false);
  assert.equal(transport.tick, 192);
  assert.ok(events.includes('end'));
  // Play no fim recomeça do zero.
  transport.play();
  assert.equal(transport.tick, 0);
});

test('com loop: posição volta ao início indefinidamente', () => {
  const { clock, transport } = make({ loop: true });
  transport.play();
  clock.advance(8 + 0.5); // 192 ticks = 8 s → 1 volta + 12 ticks
  transport.update();
  assert.equal(transport.playing, true);
  assert.equal(transport.tick, 12);
  assert.equal(transport.absoluteTick, 204);
});

test('mudança de BPM em tempo real preserva a posição', () => {
  const { clock, transport } = make();
  transport.play();
  clock.advance(1); // 24 ticks
  transport.setBpm(60); // 12 ticks/s
  assert.equal(transport.tick, 24);
  clock.advance(1);
  assert.equal(transport.tick, 36);
});

test('seek limita à faixa e FIM fica exatamente no fim', () => {
  const { transport } = make({ loop: true });
  transport.seek(-5);
  assert.equal(transport.tick, 0);
  transport.seek(9999);
  assert.equal(transport.tick, 192);
  transport.play(); // estava no fim → recomeça
  assert.equal(transport.tick, 0);
});

test('reduzir o tamanho puxa o cursor para dentro', () => {
  const { transport } = make();
  transport.seek(150);
  transport.setLength(96);
  assert.equal(transport.tick, 96);
});

test('desligar o loop no meio da volta mantém a posição relativa', () => {
  const { clock, transport } = make({ loop: true });
  transport.play();
  clock.advance(9); // 216 ticks → posição 24
  transport.setLoop(false);
  assert.equal(transport.tick, 24);
  clock.advance(1);
  assert.equal(transport.tick, 48);
});

test('timeAtAbsoluteTick é coerente com a âncora', () => {
  const { clock, transport } = make();
  transport.play();
  const t0 = clock.now();
  assert.equal(transport.timeAtAbsoluteTick(24), t0 + 1);
});
