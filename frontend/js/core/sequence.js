/**
 * Modelo da sequência musical (os blocos do grid).
 *
 * Cada item: { id, instrument, midi, start, duration, kind } — start/duration em ticks.
 *   kind = 'note' → nota que soa;
 *   kind = 'rest' → pausa (silêncio explícito). Não soa, mas conta para o FIM da música:
 *                   serve para estender a sequência (ex.: pausa até o fim do compasso antes do loop).
 *
 * O tamanho do grid (lengthTicks) é aplicado de forma NÃO destrutiva:
 * itens além do fim continuam guardados, mas são ignorados por `activeItems()`.
 * Assim, reduzir e depois aumentar a quantidade de compassos não perde trabalho.
 */
import { INSTRUMENT_IDS } from '../config.js';
import { midiToName } from './music.js';
import { ticksToSeconds } from './timing.js';

export const KINDS = Object.freeze(['note', 'rest']);

function assertItemShape({ instrument, midi, start, duration, kind }) {
  if (!INSTRUMENT_IDS.includes(instrument)) throw new Error(`Instrumento inválido: ${instrument}`);
  if (!Number.isInteger(midi)) throw new Error(`MIDI inválido: ${midi}`);
  if (!Number.isInteger(start) || start < 0) throw new Error(`Início inválido: ${start}`);
  if (!Number.isInteger(duration) || duration <= 0) throw new Error(`Duração inválida: ${duration}`);
  if (!KINDS.includes(kind)) throw new Error(`Tipo inválido: ${kind}`);
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
   * Adiciona uma nota ou pausa. Itens do mesmo instrumento e mesma linha que se
   * sobreponham ao novo intervalo são removidos (o novo prevalece).
   */
  addNote({ instrument, midi, start, duration, kind = 'note' }) {
    assertItemShape({ instrument, midi, start, duration, kind });
    const end = start + duration;
    this.notes = this.notes.filter(
      (n) => !(n.instrument === instrument && n.midi === midi && n.start < end && start < n.start + n.duration),
    );
    const note = { id: this._nextId++, instrument, midi, start, duration, kind };
    this.notes.push(note);
    return note;
  }

  addRest({ instrument, midi, start, duration }) {
    return this.addNote({ instrument, midi, start, duration, kind: 'rest' });
  }

  removeNote(id) {
    const before = this.notes.length;
    this.notes = this.notes.filter((n) => n.id !== id);
    return this.notes.length !== before;
  }

  /** Remove vários itens. Retorna quantos saíram. */
  removeNotes(ids) {
    const doomed = new Set(ids);
    const before = this.notes.length;
    this.notes = this.notes.filter((n) => !doomed.has(n.id));
    return before - this.notes.length;
  }

  getNote(id) {
    return this.notes.find((n) => n.id === id) ?? null;
  }

  /** Remove todos os itens (ou só os de um instrumento). Retorna quantos saíram. */
  clear(instrument = null) {
    const before = this.notes.length;
    this.notes = instrument ? this.notes.filter((n) => n.instrument !== instrument) : [];
    return before - this.notes.length;
  }

  /**
   * UNIR: para cada linha (mesmo instrumento, mesma altura e mesmo tipo) com 2+ itens
   * selecionados, cria um único item do início do primeiro ao fim do último — como uma
   * ligadura na partitura. Linhas diferentes nunca se misturam.
   * @returns {{ merged: number, ids: number[] }} grupos unidos e ids resultantes (para manter a seleção)
   */
  mergeItems(ids) {
    const wanted = new Set(ids);
    const groups = new Map();
    for (const item of this.notes) {
      if (!wanted.has(item.id)) continue;
      const key = `${item.instrument}|${item.midi}|${item.kind}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(item);
    }

    let merged = 0;
    const resultIds = [];
    for (const group of groups.values()) {
      if (group.length < 2) {
        resultIds.push(group[0].id);
        continue;
      }
      const start = Math.min(...group.map((n) => n.start));
      const end = Math.max(...group.map((n) => n.start + n.duration));
      const { instrument, midi, kind } = group[0];
      this.removeNotes(group.map((n) => n.id));
      resultIds.push(this.addNote({ instrument, midi, start, duration: end - start, kind }).id);
      merged += 1;
    }
    return { merged, ids: resultIds };
  }

  /** Itens (notas e pausas) que começam dentro do grid, cortados no fim do grid. */
  activeItems() {
    return this.notes
      .filter((n) => n.start < this.lengthTicks)
      .map((n) => ({ ...n, duration: Math.min(n.duration, this.lengthTicks - n.start) }))
      .sort((a, b) => a.start - b.start || a.midi - b.midi);
  }

  /** Somente as notas que soam (sem pausas). */
  activeNotes() {
    return this.activeItems().filter((n) => n.kind === 'note');
  }

  get isEmpty() {
    return this.activeNotes().length === 0;
  }

  get hasItems() {
    return this.notes.some((n) => n.start < this.lengthTicks);
  }

  /**
   * FIM da música: fim do último item (nota OU pausa). É aqui que o play para
   * (ou recomeça, em loop) e onde termina cada repetição exportada.
   * Sem nenhum item, vale o tamanho do grid.
   */
  endTick() {
    const items = this.activeItems();
    if (items.length === 0) return this.lengthTicks;
    return Math.max(...items.map((n) => n.start + n.duration));
  }

  /**
   * Converte para a lista de eventos consumida pelo backend:
   * [{ time, note, duration, instrument }] com tempos em segundos (pausas não viram eventos).
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
    return this.notes.map(({ instrument, midi, start, duration, kind }) => ({ instrument, midi, start, duration, kind }));
  }

  /** Recarrega itens serializados, descartando entradas inválidas. Retorna quantos foram carregados. */
  loadJSON(data) {
    this.notes = [];
    this._nextId = 1;
    if (!Array.isArray(data)) return 0;
    for (const raw of data) {
      try {
        // Projetos salvos antes das pausas não têm "kind": são notas.
        this.addNote({ kind: 'note', ...(raw ?? {}) });
      } catch {
        // entrada corrompida: ignorada
      }
    }
    return this.notes.length;
  }
}
