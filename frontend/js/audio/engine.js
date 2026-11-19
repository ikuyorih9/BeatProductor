/**
 * Motor de áudio: AudioContext, cadeia master e controle das vozes ativas.
 *
 * Cadeia: voz → kill-gain (para cortes suaves) → master → compressor (limitador) → saída.
 */
import { INSTRUMENT_FACTORIES } from './instruments.js';

const MAX_VOICES = 96;
const FADE_SECONDS = 0.02;

function createNoiseBuffer(ctx, seconds = 1) {
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

    this.master = this.context.createGain();
    this.master.gain.value = 0.7;
    this.limiter = this.context.createDynamicsCompressor();
    this.limiter.threshold.value = -8;
    this.limiter.knee.value = 4;
    this.limiter.ratio.value = 12;
    this.limiter.attack.value = 0.003;
    this.limiter.release.value = 0.2;
    this.master.connect(this.limiter).connect(this.context.destination);

    this.noiseBuffer = createNoiseBuffer(this.context);
    this.voices = new Set();
    this.stats = { scheduled: 0, previews: 0 };
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
    const start = Math.max(when, this.context.currentTime);
    const voice = factory(this.context, { midi, when: start, duration: Math.max(0.02, duration) }, { noiseBuffer: this.noiseBuffer });

    const kill = this.context.createGain();
    voice.output.connect(kill).connect(this.master);
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
