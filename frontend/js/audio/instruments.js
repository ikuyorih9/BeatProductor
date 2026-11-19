/**
 * Instrumentos sintetizados com a Web Audio API.
 *
 * Cada função cria os nós de UMA nota e devolve uma "voz":
 *   { output: AudioNode, sources: AudioScheduledSourceNode[], endTime: number }
 * `output` deve ser conectado pelo motor (engine.js); `endTime` é quando a voz silencia.
 *
 * Os timbres espelham a síntese do backend (backend/app/audio/instruments.py)
 * para que a pré-escuta e o arquivo exportado soem parecidos.
 */
import { drumPieceForMidi, midiToFrequency } from '../core/music.js';

const MIN_GAIN = 0.0001;

/** Envelope ADSR num GainNode. Retorna o instante em que o release termina. */
function applyAdsr(param, { start, end, attack, decay, sustain, release, peak }) {
  const attackEnd = start + attack;
  param.setValueAtTime(0, start);
  param.linearRampToValueAtTime(peak, attackEnd);
  param.setTargetAtTime(peak * sustain, attackEnd, decay / 3);
  const releaseStart = Math.max(end, attackEnd);
  param.setTargetAtTime(0, releaseStart, release / 4);
  return releaseStart + release * 1.5;
}

function oscillator(ctx, type, frequency, detuneCents = 0) {
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.value = frequency;
  osc.detune.value = detuneCents;
  return osc;
}

// ------------------------------------------------------------------ Piano
/** Piano acústico simulado: parciais senoidais com decaimento natural (mais rápido nos agudos). */
export function piano(ctx, { midi, when, duration }) {
  const frequency = midiToFrequency(midi);
  const output = ctx.createGain();
  const tone = ctx.createBiquadFilter();
  tone.type = 'lowpass';
  tone.frequency.value = Math.min(9000, frequency * 10);
  tone.connect(output);

  const partials = [[1, 1], [2, 0.42], [3, 0.2], [4, 0.1], [5, 0.05]];
  const sources = [];
  for (const [ratio, gain] of partials) {
    const partialFrequency = frequency * ratio * (1 + 0.0004 * ratio * ratio); // leve inarmonicidade
    if (partialFrequency >= ctx.sampleRate / 2) continue;
    const osc = oscillator(ctx, 'sine', partialFrequency);
    const partialGain = ctx.createGain();
    partialGain.gain.value = gain;
    osc.connect(partialGain).connect(tone);
    sources.push(osc);
  }

  const decay = Math.min(2.4, Math.max(0.35, 1.4 * Math.sqrt(261.63 / frequency)));
  const end = when + duration;
  const g = output.gain;
  g.setValueAtTime(0, when);
  g.linearRampToValueAtTime(0.42, when + 0.004);
  g.setTargetAtTime(MIN_GAIN, when + 0.004, decay / 2.5);
  g.setTargetAtTime(0, end, 0.05);
  const endTime = end + 0.35;
  return { output, sources, endTime };
}

// ------------------------------------------------------------------ Bateria
function noiseSource(ctx, noiseBuffer) {
  const source = ctx.createBufferSource();
  source.buffer = noiseBuffer;
  return source;
}

function kick(ctx, when) {
  const output = ctx.createGain();
  const osc = oscillator(ctx, 'sine', 150);
  osc.frequency.setValueAtTime(150, when);
  osc.frequency.exponentialRampToValueAtTime(45, when + 0.12);
  osc.connect(output);
  output.gain.setValueAtTime(0, when);
  output.gain.linearRampToValueAtTime(0.95, when + 0.003);
  output.gain.exponentialRampToValueAtTime(0.001, when + 0.45);
  return { output, sources: [osc], endTime: when + 0.47 };
}

function snare(ctx, when, noiseBuffer) {
  const output = ctx.createGain();
  const noise = noiseSource(ctx, noiseBuffer);
  const highpass = ctx.createBiquadFilter();
  highpass.type = 'highpass';
  highpass.frequency.value = 1200;
  const noiseGain = ctx.createGain();
  noise.connect(highpass).connect(noiseGain).connect(output);
  // Decaimentos mais longos que um "estalo": a caixa tem corpo sem precisar de pico maior.
  noiseGain.gain.setValueAtTime(0.42, when);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, when + 0.3);

  const body = oscillator(ctx, 'triangle', 185);
  const bodyGain = ctx.createGain();
  body.connect(bodyGain).connect(output);
  bodyGain.gain.setValueAtTime(0.38, when);
  bodyGain.gain.exponentialRampToValueAtTime(0.001, when + 0.15);
  return { output, sources: [noise, body], endTime: when + 0.32 };
}

function hihat(ctx, when, noiseBuffer, decay) {
  const output = ctx.createGain();
  const noise = noiseSource(ctx, noiseBuffer);
  const highpass = ctx.createBiquadFilter();
  highpass.type = 'highpass';
  highpass.frequency.value = 7000;
  noise.connect(highpass).connect(output);
  output.gain.setValueAtTime(0.32, when);
  output.gain.exponentialRampToValueAtTime(0.001, when + decay);
  return { output, sources: [noise], endTime: when + decay + 0.02 };
}

/** Bateria: a peça vem da nota (classe de altura % 4). Sons one-shot. */
export function drums(ctx, { midi, when }, { noiseBuffer }) {
  switch (drumPieceForMidi(midi).id) {
    case 'kick': return kick(ctx, when);
    case 'snare': return snare(ctx, when, noiseBuffer);
    case 'hihat_closed': return hihat(ctx, when, noiseBuffer, 0.08);
    default: return hihat(ctx, when, noiseBuffer, 0.35);
  }
}

// ------------------------------------------------------------------ Lofi Synth
/** Lofi: triângulo + seno levemente desafinados, vibrato lento e passa-baixa abafado. */
export function lofi(ctx, { midi, when, duration }) {
  const frequency = midiToFrequency(midi);
  const output = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 900;
  filter.Q.value = 0.7;
  filter.connect(output);

  const a = oscillator(ctx, 'triangle', frequency, -8);
  const b = oscillator(ctx, 'sine', frequency, 8);
  const mixA = ctx.createGain();
  const mixB = ctx.createGain();
  mixA.gain.value = 0.7;
  mixB.gain.value = 0.5;
  a.connect(mixA).connect(filter);
  b.connect(mixB).connect(filter);

  const lfo = oscillator(ctx, 'sine', 4.5);
  const depth = ctx.createGain();
  depth.gain.value = 6; // cents
  lfo.connect(depth);
  depth.connect(a.detune);
  depth.connect(b.detune);

  const endTime = applyAdsr(output.gain, {
    start: when, end: when + duration, attack: 0.03, decay: 0.3, sustain: 0.7, release: 0.35, peak: 0.45,
  });
  return { output, sources: [a, b, lfo], endTime };
}

// ------------------------------------------------------------------ Lead Synth
/** Lead: duas dentes-de-serra desafinadas, brilhantes. */
export function lead(ctx, { midi, when, duration }) {
  const frequency = midiToFrequency(midi);
  const output = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 4500;
  filter.Q.value = 1;
  filter.connect(output);

  const a = oscillator(ctx, 'sawtooth', frequency, -6);
  const b = oscillator(ctx, 'sawtooth', frequency, 6);
  a.connect(filter);
  b.connect(filter);

  const endTime = applyAdsr(output.gain, {
    start: when, end: when + duration, attack: 0.01, decay: 0.15, sustain: 0.6, release: 0.15, peak: 0.2,
  });
  return { output, sources: [a, b], endTime };
}

export const INSTRUMENT_FACTORIES = Object.freeze({ piano, drums, lofi, lead });
