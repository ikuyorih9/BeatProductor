/**
 * Motor de áudio: AudioContext, cadeia master e controle das vozes ativas.
 *
 * Cadeia: voz → kill-gain (cortes suaves; na bateria, calibração da peça)
 *         → canal do instrumento (calibração × volume do mixer)
 *         → master → compressor leve → limitador suave (teto em −0,2 dBFS) → saída.
 *
 * Ganho na cadeia (medido): o master deixa folga para o mixer reforçar até 200% sem que o
 * compressor "devolva" o reforço; o limitador suave só atua nos picos e garante que a saída
 * nunca passe de 0 dBFS (sem distorção digital), mesmo com tudo no máximo.
 */
import { INSTRUMENT_TRIM, VOLUME } from '../config.js';
import { drumPieceForMidi } from '../core/music.js';
import { volumeToGain } from '../core/volume.js';
import { INSTRUMENT_FACTORIES } from './instruments.js';

const MAX_VOICES = 96;
const FADE_SECONDS = 0.02;
export const MASTER_GAIN = 0.45;

/**
 * Curva do limitador suave: linear até 0,9; acima, satura suavemente até 0,98 (≈ −0,2 dBFS).
 * O joelho fica acima do limiar do compressor (−2 dBFS ≈ 0,79): quem segura os picos primeiro é o
 * compressor (sem distorção); a saturação é só a última proteção contra estouro.
 */
function softClipCurve(points = 4097) {
  const curve = new Float32Array(points);
  for (let i = 0; i < points; i += 1) {
    const x = (i / (points - 1)) * 2 - 1;
    const a = Math.abs(x);
    curve[i] = Math.sign(x) * (a <= 0.9 ? a : 0.9 + 0.08 * Math.tanh((a - 0.9) / 0.08));
  }
  return curve;
}

/**
 * Cadeia de saída (master → compressor → limitador suave → destino). Exportada para os
 * testes renderizarem exatamente a mesma cadeia num OfflineAudioContext.
 * @returns {{ master: GainNode, compressor: DynamicsCompressorNode, clipper: WaveShaperNode }}
 */
export function createOutputChain(ctx) {
  const master = ctx.createGain();
  master.gain.value = MASTER_GAIN;
  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -2;
  compressor.knee.value = 2;
  compressor.ratio.value = 4;
  compressor.attack.value = 0.003;
  compressor.release.value = 0.1;
  const clipper = ctx.createWaveShaper();
  clipper.curve = softClipCurve();
  clipper.oversample = 'none'; // com oversample, o filtro cria sobressinal acima do teto
  master.connect(compressor).connect(clipper).connect(ctx.destination);
  return { master, compressor, clipper };
}

/** Ruído branco compartilhado pelas vozes da bateria (2 s: cobre a cauda do prato de ataque). */
export function createNoiseBuffer(ctx, seconds = 2) {
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
  return buffer;
}

export class AudioEngine {
  constructor() {
    const AudioContextClass = window.AudioContext ?? window.webkitAudioContext;
    if (!AudioContextClass) throw new Error('Este navegador não suporta a Web Audio API.');
    this.context = new AudioContextClass({ latencyHint: 'interactive' });

    this.master = createOutputChain(this.context).master;

    // Um canal por instrumento: o volume muda ao vivo, inclusive em notas já soando.
    this.buses = {};
    for (const instrument of Object.keys(INSTRUMENT_FACTORIES)) {
      const bus = this.context.createGain();
      bus.gain.value = (INSTRUMENT_TRIM[instrument] ?? 1) * volumeToGain(VOLUME.DEFAULT);
      bus.connect(this.master);
      this.buses[instrument] = bus;
    }

    this.noiseBuffer = createNoiseBuffer(this.context);
    this.voices = new Set();
    this.stats = { scheduled: 0, previews: 0 };
  }

  /** Volume do instrumento em % (0–200, curva perceptiva). Rampa curta para não estalar. */
  setVolume(instrument, percent) {
    const bus = this.buses[instrument];
    if (!bus) return;
    const target = (INSTRUMENT_TRIM[instrument] ?? 1) * volumeToGain(percent);
    const now = this.context.currentTime;
    bus.gain.cancelScheduledValues(now);
    bus.gain.setValueAtTime(bus.gain.value, now);
    bus.gain.linearRampToValueAtTime(target, now + 0.03);
  }

  /** Relógio do áudio em segundos — base de tempo única do app. */
  now() {
    return this.context.currentTime;
  }

  /** Latência estimada até o som sair do alto-falante (para alinhar o cursor visual). */
  get outputLatency() {
    const latency = (this.context.outputLatency || 0) + (this.context.baseLatency || 0);
    return Number.isFinite(latency) ? Math.min(latency, 0.5) : 0;
  }

  /** Navegadores exigem um gesto do usuário para liberar o áudio. */
  async resume() {
    if (this.context.state !== 'running') await this.context.resume();
  }

  /**
   * Agenda uma nota.
   * @param {{instrument:string, midi:number, when:number, duration:number}} note
   * @returns {object|null} a voz criada
   */
  playNote({ instrument, midi, when, duration }) {
    const factory = INSTRUMENT_FACTORIES[instrument];
    if (!factory) return null;
    // Na bateria só as teclas do kit soam (as outras ficam desativadas na interface).
    const piece = instrument === 'drums' ? drumPieceForMidi(midi) : null;
    if (instrument === 'drums' && !piece) return null;
    const start = Math.max(when, this.context.currentTime);
    const voice = factory(this.context, { midi, when: start, duration: Math.max(0.02, duration) }, { noiseBuffer: this.noiseBuffer });

    const kill = this.context.createGain();
    // Na bateria, cada peça tem a sua calibração (o fade de corte parte deste valor).
    if (piece) kill.gain.value = piece.trim;
    voice.output.connect(kill).connect(this.buses[instrument]);
    voice.kill = kill;
    voice.startTime = start;

    for (const source of voice.sources) {
      source.start(start);
      source.stop(voice.endTime);
    }
    // Uma única fonte basta para saber quando a voz terminou.
    voice.sources[0].onended = () => this._release(voice);

    this.voices.add(voice);
    this.stats.scheduled += 1;
    if (this.voices.size > MAX_VOICES) this._stopVoice(this.voices.values().next().value, this.context.currentTime);
    return voice;
  }

  /** Toca uma nota imediatamente (pré-escuta ao clicar em tecla/criar nota). */
  async preview(instrument, midi, duration = 0.35) {
    await this.resume();
    this.stats.previews += 1;
    return this.playNote({ instrument, midi, when: this.context.currentTime + 0.005, duration });
  }

  /** Cancela as vozes que ainda não começaram (ex.: após um seek durante o play). */
  cancelPending() {
    const now = this.context.currentTime;
    for (const voice of [...this.voices]) {
      if (voice.startTime > now) this._stopVoice(voice, now);
    }
  }

  /** Silencia tudo com um fade curto (pause/fim), sem estalos. */
  stopAll() {
    const now = this.context.currentTime;
    for (const voice of [...this.voices]) this._stopVoice(voice, now);
  }

  _stopVoice(voice, at) {
    if (!this.voices.has(voice)) return;
    const gain = voice.kill.gain;
    gain.cancelScheduledValues(at);
    gain.setValueAtTime(gain.value, at);
    gain.linearRampToValueAtTime(0, at + FADE_SECONDS);
    for (const source of voice.sources) {
      try {
        source.stop(at + FADE_SECONDS + 0.005);
      } catch {
        // fonte já parada — nada a fazer
      }
    }
    this._release(voice);
  }

  _release(voice) {
    if (!this.voices.delete(voice)) return;
    // Desconecta depois que o fade terminar.
    const delayMs = Math.max(0, (voice.endTime - this.context.currentTime) * 1000) + 100;
    window.setTimeout(() => {
      try {
        voice.kill.disconnect();
      } catch {
        // já desconectado
      }
    }, Math.min(delayMs, 5000));
  }
}
