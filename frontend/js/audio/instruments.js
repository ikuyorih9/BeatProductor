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

/**
 * Bumbo: seno grave com queda de afinação + "knock" médio. Só o grave (50 Hz) some em
 * alto-falantes pequenos (notebook, celular); o knock (330→110 Hz) faz o bumbo ser ouvido em
 * qualquer caixa de som. Sem ruído: um estalo de ruído soava como chiado.
 */
function kick(ctx, when) {
  const output = ctx.createGain();
  const osc = oscillator(ctx, 'sine', 160);
  osc.frequency.setValueAtTime(160, when);
  osc.frequency.exponentialRampToValueAtTime(50, when + 0.12);
  const bodyGain = ctx.createGain();
  osc.connect(bodyGain).connect(output);
  bodyGain.gain.setValueAtTime(0, when);
  bodyGain.gain.linearRampToValueAtTime(0.8, when + 0.003);
  bodyGain.gain.exponentialRampToValueAtTime(0.001, when + 0.45);

  const knock = oscillator(ctx, 'sine', 330);
  knock.frequency.setValueAtTime(330, when);
  knock.frequency.exponentialRampToValueAtTime(110, when + 0.04);
  const knockGain = ctx.createGain();
  knock.connect(knockGain).connect(output);
  knockGain.gain.setValueAtTime(0.3, when);
  knockGain.gain.exponentialRampToValueAtTime(0.001, when + 0.12);

  return { output, sources: [osc, knock], endTime: when + 0.47 };
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

/**
 * Tons (surdo, tom 2, tom 1, rototons, octobans): seno com queda de afinação de `from` para `to` Hz e um estalo
 * curto de baqueta (ruído agudo) no ataque.
 */
export const TOMS = Object.freeze({
  floor_tom: { from: 120, to: 82, glide: 0.2, decay: 0.7 },
  tom2: { from: 165, to: 118, glide: 0.18, decay: 0.55 },
  tom1: { from: 220, to: 160, glide: 0.16, decay: 0.45 },
  // Rototons: tons sem casco, afinação mais aguda e queda de afinação bem audível.
  rototoms: { from: 290, to: 175, glide: 0.25, decay: 0.4 },
  // Octobans: tubos estreitos e agudos, curtos.
  octobans: { from: 340, to: 290, glide: 0.08, decay: 0.3 },
});

function tom(ctx, when, noiseBuffer, { from, to, glide, decay }) {
  const output = ctx.createGain();
  const osc = oscillator(ctx, 'sine', from);
  osc.frequency.setValueAtTime(from, when);
  osc.frequency.exponentialRampToValueAtTime(to, when + glide);
  const bodyGain = ctx.createGain();
  osc.connect(bodyGain).connect(output);
  bodyGain.gain.setValueAtTime(0, when);
  bodyGain.gain.linearRampToValueAtTime(0.8, when + 0.002);
  bodyGain.gain.exponentialRampToValueAtTime(0.001, when + decay);

  const stick = noiseSource(ctx, noiseBuffer);
  const highpass = ctx.createBiquadFilter();
  highpass.type = 'highpass';
  highpass.frequency.value = 2000;
  const stickGain = ctx.createGain();
  stick.connect(highpass).connect(stickGain).connect(output);
  stickGain.gain.setValueAtTime(0.12, when);
  stickGain.gain.exponentialRampToValueAtTime(0.001, when + 0.05);
  return { output, sources: [osc, stick], endTime: when + decay + 0.02 };
}

/** Frequências (Hz) das 6 ondas quadradas do timbre metálico dos pratos (estilo TR-808). */
export const METAL_FREQUENCIES = Object.freeze([205.3, 304.4, 369.6, 522.7, 540, 800]);

/**
 * Pratos: ondas quadradas desafinadas entre si (metal) + ruído, filtrados no agudo.
 * `scale` multiplica as frequências do metal (prato menor = mais agudo); `noiseCutoff` é o corte do ruído.
 */
export const CYMBALS = Object.freeze({
  ride: { metal: 0.3, metalCutoff: 5000, noise: 0.08, decay: 1.6 },
  crash: { metal: 0.2, metalCutoff: 6000, noise: 0.35, decay: 1.8 },
  // Splash: prato pequeno, agudo e curto.
  splash: { metal: 0.2, metalCutoff: 7000, noise: 0.3, decay: 0.7, scale: 1.4 },
  // China: metal mais grave e "sujo", com ruído mais encorpado.
  china: { metal: 0.35, metalCutoff: 2500, noise: 0.25, noiseCutoff: 3000, decay: 1.3, scale: 0.82 },
  // Stack: pratos empilhados — seco, áspero e bem curto.
  stack: { metal: 0.3, metalCutoff: 3500, noise: 0.4, noiseCutoff: 3500, decay: 0.35, scale: 1.27 },
});

function cymbal(ctx, when, noiseBuffer, { metal, metalCutoff, noise, decay, scale = 1, noiseCutoff = 5000 }) {
  const output = ctx.createGain();
  const metalHighpass = ctx.createBiquadFilter();
  metalHighpass.type = 'highpass';
  metalHighpass.frequency.value = metalCutoff;
  const metalGain = ctx.createGain();
  metalGain.gain.value = metal / METAL_FREQUENCIES.length;
  metalHighpass.connect(metalGain).connect(output);
  const sources = METAL_FREQUENCIES.map((frequency) => {
    const osc = oscillator(ctx, 'square', frequency * scale);
    osc.connect(metalHighpass);
    return osc;
  });

  const hiss = noiseSource(ctx, noiseBuffer);
  const noiseHighpass = ctx.createBiquadFilter();
  noiseHighpass.type = 'highpass';
  noiseHighpass.frequency.value = noiseCutoff;
  const noiseGain = ctx.createGain();
  noiseGain.gain.value = noise;
  hiss.connect(noiseHighpass).connect(noiseGain).connect(output);
  sources.push(hiss);

  output.gain.setValueAtTime(0, when);
  output.gain.linearRampToValueAtTime(1, when + 0.002);
  output.gain.exponentialRampToValueAtTime(0.001, when + decay);
  return { output, sources, endTime: when + decay + 0.02 };
}

/**
 * Percussão "afinada": soma de senos (`partials` = [Hz, nível]) com um único envelope de golpe,
 * mais ruído agudo opcional (`noise`, cortado em `noiseCutoff` Hz).
 */
export const PINGS = Object.freeze({
  // Bell: o sino (cúpula) do prato — ataque metálico e sustentação longa.
  bell: { partials: [[740, 0.45], [1716, 0.3], [2886, 0.18], [4100, 0.1]], decay: 1.3 },
  // Cowbell: as duas frequências clássicas (540 e 800 Hz) com seus 3º harmônicos.
  cowbell: { partials: [[540, 0.5], [800, 0.5], [1620, 0.17], [2400, 0.17]], decay: 0.35 },
  // Jam block: bloco de plástico — estalo seco e agudo.
  jam_block: { partials: [[880, 0.6], [2030, 0.25], [3200, 0.08]], decay: 0.12 },
  // Pandeirola: platinelas (senos bem agudos) + chiado de metal.
  tambourine: {
    partials: [[5400, 0.06], [6800, 0.06], [8100, 0.05], [9600, 0.05]], decay: 0.3, noise: 0.4, noiseCutoff: 6000,
  },
});

function ping(ctx, when, noiseBuffer, { partials, decay, noise = 0, noiseCutoff = 6000 }) {
  const output = ctx.createGain();
  const sources = partials.map(([frequency, level]) => {
    const osc = oscillator(ctx, 'sine', frequency);
    const gain = ctx.createGain();
    gain.gain.value = level;
    osc.connect(gain).connect(output);
    return osc;
  });
  if (noise > 0) {
    const hiss = noiseSource(ctx, noiseBuffer);
    const highpass = ctx.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.value = noiseCutoff;
    const gain = ctx.createGain();
    gain.gain.value = noise;
    hiss.connect(highpass).connect(gain).connect(output);
    sources.push(hiss);
  }
  output.gain.setValueAtTime(0, when);
  output.gain.linearRampToValueAtTime(1, when + 0.001);
  output.gain.exponentialRampToValueAtTime(0.001, when + decay);
  return { output, sources, endTime: when + decay + 0.02 };
}

/** Bateria: cada tecla do kit é uma peça (ver DRUM_PIECES). Sons one-shot. */
export function drums(ctx, { midi, when }, { noiseBuffer }) {
  const piece = drumPieceForMidi(midi);
  switch (piece?.id) {
    case 'kick': return kick(ctx, when);
    case 'snare': return snare(ctx, when, noiseBuffer);
    case 'hihat': return hihat(ctx, when, noiseBuffer, 0.08);
    default:
      if (TOMS[piece?.id]) return tom(ctx, when, noiseBuffer, TOMS[piece.id]);
      if (CYMBALS[piece?.id]) return cymbal(ctx, when, noiseBuffer, CYMBALS[piece.id]);
      if (PINGS[piece?.id]) return ping(ctx, when, noiseBuffer, PINGS[piece.id]);
      throw new Error(`a tecla ${midi} não faz parte da bateria`);
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
