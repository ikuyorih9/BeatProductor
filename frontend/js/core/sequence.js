/**
 * Modelo da sequência musical (as notas do grid).
 *
 * Cada nota: { id, instrument, midi, start, duration } — start/duration em ticks.
 * O tamanho do padrão (lengthTicks) é aplicado de forma NÃO destrutiva:
 * notas além do fim continuam guardadas, mas são ignoradas por `activeNotes()`.
 * Assim, reduzir e depois aumentar a quantidade de compassos não perde trabalho.
 */
import { INSTRUMENT_IDS } from '../config.js';
import { midiToName } from './music.js';
import { ticksToSeconds } from './timing.js';

function assertNoteShape({ instrument, midi, start, duration }) {
  if (!INSTRUMENT_IDS.includes(instrument)) throw new Error(`Instrumento inválido: ${instrument}`);
  if (!Number.isInteger(midi)) throw new Error(`MIDI inválido: ${midi}`);
  if (!Number.isInteger(start) || start < 0) throw new Error(`Início inválido: ${start}`);
  if (!Number.isInteger(duration) || duration <= 0) throw new Error(`Duração inválida: ${duration}`);
}

export class Sequence {
  constructor(lengthTicks) {
    this.lengthTicks = lengthTicks;
    this.notes = [];
    this._nextId = 1;
  }

  setLength(lengthTicks) {
    this.lengthTicks = lengthTicks;
  }

  /**
   * Adiciona uma nota. Notas do mesmo instrumento e mesma altura que se
   * sobreponham ao novo intervalo são removidas (a nova nota prevalece).
   */
  addNote({ instrument, midi, start, duration }) {
    assertNoteShape({ instrument, midi, start, duration });
    const end = start + duration;
    this.notes = this.notes.filter(
      (n) => !(n.instrument === instrument && n.midi === midi && n.start < end && start < n.start + n.duration),
    );
    const note = { id: this._nextId++, instrument, midi, start, duration };
    this.notes.push(note);
    return note;
  }

  removeNote(id) {
    const before = this.notes.length;
    this.notes = this.notes.filter((n) => n.id !== id);
    return this.notes.length !== before;
  }

  getNote(id) {
    return this.notes.find((n) => n.id === id) ?? null;
  }

  /** Remove todas as notas (ou só as de um instrumento). Retorna quantas saíram. */
  clear(instrument = null) {
    const before = this.notes.length;
    this.notes = instrument ? this.notes.filter((n) => n.instrument !== instrument) : [];
    return before - this.notes.length;
  }

  /** Notas que começam dentro do padrão, com a duração cortada no fim do padrão. */
  activeNotes() {
    return this.notes
      .filter((n) => n.start < this.lengthTicks)
      .map((n) => ({ ...n, duration: Math.min(n.duration, this.lengthTicks - n.start) }))
      .sort((a, b) => a.start - b.start || a.midi - b.midi);
  }

  get isEmpty() {
    return this.activeNotes().length === 0;
  }

  /**
   * Converte para a lista de eventos consumida pelo backend:
   * [{ time, note, duration, instrument }] com tempos em segundos.
   */
  toEvents(bpm) {
    return this.activeNotes().map((n) => ({
      time: ticksToSeconds(n.start, bpm),
      note: midiToName(n.midi),
      duration: ticksToSeconds(n.duration, bpm),
      instrument: n.instrument,
    }));
  }

  toJSON() {
    return this.notes.map(({ instrument, midi, start, duration }) => ({ instrument, midi, start, duration }));
  }

  /** Recarrega notas serializadas, descartando entradas inválidas. Retorna quantas foram carregadas. */
  loadJSON(data) {
    this.notes = [];
    this._nextId = 1;
    if (!Array.isArray(data)) return 0;
    for (const raw of data) {
      try {
        this.addNote(raw ?? {});
      } catch {
        // entrada corrompida: ignorada
      }
    }
    return this.notes.length;
  }
}
