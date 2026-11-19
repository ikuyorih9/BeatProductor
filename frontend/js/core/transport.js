/**
 * Transporte (relógio musical): play, pause, seek, loop e BPM em tempo real.
 *
 * O relógio é injetado (`now()` em segundos) — no app é o `AudioContext.currentTime`,
 * o que mantém cursor visual e áudio na MESMA base de tempo (RNF01).
 *
 * Modelo: posição = âncora + (agora − tempoDaÂncora) / segundosPorTick.
 * - "absoluteTick" cresce sem parar enquanto toca (útil para o agendador em loop);
 * - "tick" é a posição dentro do padrão (0 … lengthTicks).
 *
 * Dois limites:
 * - lengthTicks = FIM DA MÚSICA: onde o play para (ou recomeça, em loop);
 * - gridTicks   = fim do grid: até onde o cursor pode ser posicionado PARADO
 *   (ex.: para colar notas depois da última). Dar play além do fim recomeça do início.
 *
 * Eventos emitidos: 'play', 'pause', 'seek', 'end', 'tempo', 'reanchor'.
 */
import { clamp, secondsPerTick } from './timing.js';

export class Transport {
  constructor({ now, bpm, lengthTicks, gridTicks = lengthTicks, loop = false }) {
    if (typeof now !== 'function') throw new TypeError('Transport requer um relógio now()');
    this._now = now;
    this.bpm = bpm;
    this.lengthTicks = lengthTicks;
    this.gridTicks = gridTicks;
    this.loop = loop;
    this.playing = false;
    this._anchorTime = now();
    this._anchorTick = 0;
    this._listeners = new Set();
  }

  on(listener) {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  _emit(type) {
    for (const listener of this._listeners) listener(type, this);
  }

  _reanchor(tick) {
    this._anchorTick = tick;
    this._anchorTime = this._now();
    this._emit('reanchor');
  }

  get absoluteTick() {
    if (!this.playing) return this._anchorTick;
    const elapsed = Math.max(0, this._now() - this._anchorTime);
    return this._anchorTick + elapsed / secondsPerTick(this.bpm);
  }

  /** Até onde o cursor pode ir parado: o maior entre o fim da música e o fim do grid. */
  get seekLimit() {
    return Math.max(this.lengthTicks, this.gridTicks);
  }

  /**
   * Posição dentro do padrão. Parado, vai de 0 ao fim do grid (inclusive o FIM da música);
   * tocando em loop, volta a 0 a cada volta.
   */
  get tick() {
    const abs = this.absoluteTick;
    if (!this.playing) return Math.min(abs, this.seekLimit);
    if (this.lengthTicks <= 0) return 0;
    if (this.playing && this.loop) return abs % this.lengthTicks;
    return Math.min(abs, this.lengthTicks);
  }

  /**
   * Posição no padrão num instante `time` do relógio (nunca antes da âncora).
   * Usado para compensar a latência de saída do áudio no cursor visual.
   */
  tickAt(time) {
    if (!this.playing) return this.tick;
    const elapsed = Math.max(0, time - this._anchorTime);
    const abs = this._anchorTick + elapsed / secondsPerTick(this.bpm);
    if (this.lengthTicks <= 0) return 0;
    if (this.loop) return abs % this.lengthTicks;
    return Math.min(abs, this.lengthTicks);
  }

  /** Instante do relógio (s) em que um tick absoluto acontece, dada a âncora atual. */
  timeAtAbsoluteTick(absTick) {
    return this._anchorTime + (absTick - this._anchorTick) * secondsPerTick(this.bpm);
  }

  play() {
    if (this.playing) return;
    let start = this.tick;
    if (start >= this.lengthTicks) start = 0;
    this.playing = true;
    this._reanchor(start);
    this._emit('play');
  }

  pause() {
    if (!this.playing) return;
    const position = this.tick;
    this.playing = false;
    this._reanchor(position);
    this._emit('pause');
  }

  toggle() {
    if (this.playing) this.pause();
    else this.play();
  }

  seek(tick) {
    const target = clamp(tick, 0, this.seekLimit);
    this._reanchor(target);
    this._emit('seek');
  }

  /** Muda o BPM preservando a posição atual (continuidade do tempo absoluto). */
  setBpm(bpm) {
    if (bpm === this.bpm) return;
    const abs = this.absoluteTick;
    this._anchorTick = abs;
    this._anchorTime = this._now();
    this.bpm = bpm;
    this._emit('tempo');
  }

  setLength(lengthTicks) {
    if (lengthTicks === this.lengthTicks) return;
    const position = this.tick;
    this.lengthTicks = lengthTicks;
    // Parado, o cursor pode ficar depois do fim da música (até o fim do grid).
    let target = Math.min(position, this.playing ? lengthTicks : this.seekLimit);
    // Tocando, não faz sentido ficar parado no fim: recomeça (loop) ou termina em update().
    if (this.playing && this.loop && target >= lengthTicks) target = 0;
    this._reanchor(target);
  }

  /** Tamanho do grid (compassos × compasso): limite do cursor parado. */
  setGridLength(gridTicks) {
    if (gridTicks === this.gridTicks) return;
    this.gridTicks = gridTicks;
    if (!this.playing && this._anchorTick > this.seekLimit) this._reanchor(this.seekLimit);
  }

  setLoop(loop) {
    if (loop === this.loop) return;
    const position = this.tick;
    this.loop = loop;
    this._reanchor(position);
  }

  /** Deve ser chamado periodicamente (ex.: a cada frame). Para no fim quando não há loop. */
  update() {
    if (this.playing && !this.loop && this.absoluteTick >= this.lengthTicks) {
      this.playing = false;
      this._reanchor(this.lengthTicks);
      this._emit('end');
    }
  }
}
