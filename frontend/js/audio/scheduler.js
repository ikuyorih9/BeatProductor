/**
 * Agendador com "lookahead" (técnica clássica da Web Audio API):
 * um timer de baixa precisão (setInterval) agenda, com antecedência,
 * as notas que caem nos próximos ~120 ms usando o relógio PRECISO do áudio.
 * Assim o som não atrasa mesmo se a thread principal travar um pouco.
 */
import { notesInWindow } from '../core/schedule.js';
import { secondsPerTick, ticksToSeconds } from '../core/timing.js';

export class AudioScheduler {
  /**
   * @param {object} options
   * @param {import('./engine.js').AudioEngine} options.engine
   * @param {import('../core/transport.js').Transport} options.transport
   * @param {() => Array} options.getNotes notas ativas da sequência
   * @param {(note:object, when:number) => void} [options.onNoteScheduled]
   */
  constructor({ engine, transport, getNotes, onNoteScheduled = () => {}, lookahead = 0.12, intervalMs = 25 }) {
    this.engine = engine;
    this.transport = transport;
    this.getNotes = getNotes;
    this.onNoteScheduled = onNoteScheduled;
    this.lookahead = lookahead;
    this.intervalMs = intervalMs;
    this.cursor = 0;
    this.timer = null;
  }

  start() {
    this.reset();
    if (this.timer === null) this.timer = window.setInterval(() => this.tick(), this.intervalMs);
    this.tick();
  }

  stop() {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
  }

  /** Recomeça a partir da posição atual do transporte (após play/seek/loop/tamanho). */
  reset() {
    this.cursor = this.transport.absoluteTick;
  }

  tick() {
    const { transport } = this;
    if (!transport.playing) return;

    const ticksPerSecond = 1 / secondsPerTick(transport.bpm);
    const now = transport.absoluteTick;
    // Se o timer atrasou muito (aba em segundo plano), pula o trecho perdido
    // em vez de disparar várias notas atrasadas de uma vez.
    const from = this.cursor < now - 0.05 * ticksPerSecond ? now : this.cursor;
    let to = now + this.lookahead * ticksPerSecond;
    if (!transport.loop) to = Math.min(to, transport.lengthTicks);
    if (to <= from) return;

    for (const { note, absStart } of notesInWindow(this.getNotes(), from, to, transport.lengthTicks, transport.loop)) {
      const when = transport.timeAtAbsoluteTick(absStart);
      this.engine.playNote({
        instrument: note.instrument,
        midi: note.midi,
        when,
        duration: ticksToSeconds(note.duration, transport.bpm),
      });
      this.onNoteScheduled(note, when);
    }
    this.cursor = to;
  }
}
