/**
 * Grid do piano roll: linhas (uma por nota), colunas (células da divisão),
 * blocos de nota e régua de compassos.
 *
 * Interação:
 * - clique numa célula vazia → nota de 1 célula (toque solto);
 * - clicar e arrastar na horizontal → nota longa (toque contínuo);
 * - clique (ou botão direito) numa nota do instrumento atual → apaga;
 * - clique na régua → posiciona o cursor.
 */
import { BEATS_PER_BAR, INSTRUMENTS, ROW_HEIGHT } from '../config.js';
import { cellAtX, dragToSpan, rowAtY } from '../core/layout.js';
import { isBlackKey, midiToName, pitchClass } from '../core/music.js';
import { formatBarBeat } from '../core/timing.js';
import { createElement } from './dom.js';

const COLOR_BY_INSTRUMENT = Object.fromEntries(INSTRUMENTS.map((i) => [i.id, i.color]));

export class PianoRollGrid {
  /**
   * @param {object} options
   * @param {object} options.elements { grid, rows, lines, notes, ghost, ruler }
   * @param {number[]} options.range notas MIDI, da mais aguda para a mais grave
   * @param {import('../core/sequence.js').Sequence} options.sequence
   * @param {() => object} options.getState estado atual da store
   * @param {(span:{midi:number,start:number,duration:number}) => void} options.onAdd
   * @param {(id:number) => void} options.onRemove
   * @param {(tick:number) => void} options.onSeek
   */
  constructor({ elements, range, sequence, getState, onAdd, onRemove, onSeek }) {
    this.el = elements;
    this.range = range;
    this.sequence = sequence;
    this.getState = getState;
    this.onAdd = onAdd;
    this.onRemove = onRemove;
    this.onSeek = onSeek;
    this.layout = null;
    this.drag = null;

    this._renderRows();
    this._bindGridEvents();
    this._bindRulerEvents();
  }

  _renderRows() {
    const fragment = document.createDocumentFragment();
    for (const midi of this.range) {
      const classes = ['grid-row'];
      if (isBlackKey(midi)) classes.push('is-black');
      if (pitchClass(midi) === 0) classes.push('is-c');
      fragment.appendChild(createElement('div', classes.join(' '), { 'data-midi': String(midi) }));
    }
    this.el.rows.replaceChildren(fragment);
    this.el.grid.style.height = `${this.range.length * ROW_HEIGHT}px`;
  }

  /** Recalcula as dimensões (BPM, divisão ou compassos mudaram). */
  applyLayout(layout) {
    // Um arraste em andamento usa a geometria antiga: cancela para não criar nota no lugar errado.
    if (this.drag) this._cancelDrag();
    this.layout = layout;
    const { width, cellWidth, beatWidth, barWidth } = layout;
    this.el.grid.style.width = `${width}px`;
    this.el.ruler.style.width = `${width}px`;

    // Linhas verticais em três níveis: célula, batida e compasso.
    this.el.lines.style.backgroundImage = [
      'linear-gradient(to right, var(--line-bar) 2px, transparent 2px)',
      'linear-gradient(to right, var(--line-beat) 1px, transparent 1px)',
      'linear-gradient(to right, var(--line-cell) 1px, transparent 1px)',
    ].join(',');
    this.el.lines.style.backgroundSize = `${barWidth}px 100%, ${beatWidth}px 100%, ${cellWidth}px 100%`;

    this._renderRuler();
    this.renderNotes();
  }

  _renderRuler() {
    const { bars, barWidth, beatWidth } = this.layout;
    const marker = this.el.ruler.querySelector('#ruler-marker');
    const fragment = document.createDocumentFragment();
    for (let bar = 0; bar < bars; bar += 1) {
      fragment.appendChild(createElement('div', 'ruler-label', { style: `left:${bar * barWidth}px`, text: String(bar + 1) }));
      for (let beat = 0; beat < BEATS_PER_BAR; beat += 1) {
        const height = beat === 0 ? 24 : 6;
        fragment.appendChild(createElement('div', 'ruler-tick', {
          style: `left:${bar * barWidth + beat * beatWidth}px;height:${height}px`,
        }));
      }
    }
    this.el.ruler.replaceChildren(fragment);
    if (marker) this.el.ruler.appendChild(marker);
  }

  /** Redesenha todos os blocos de nota. As do instrumento atual são editáveis. */
  renderNotes() {
    if (!this.layout) return;
    const { instrument } = this.getState();
    const { pxPerTick } = this.layout;
    const rowIndex = new Map(this.range.map((midi, index) => [midi, index]));
    const fragment = document.createDocumentFragment();

    // Notas de outros instrumentos primeiro (ficam por baixo, esmaecidas).
    const notes = this.sequence.activeNotes().sort((a, b) => (a.instrument === instrument) - (b.instrument === instrument));
    for (const note of notes) {
      const row = rowIndex.get(note.midi);
      if (row === undefined) continue;
      const own = note.instrument === instrument;
      const element = createElement('div', `note ${own ? 'note-own' : 'note-other'}`, {
        'data-id': String(note.id),
        title: own ? `${midiToName(note.midi)} · ${formatBarBeat(note.start)} — clique para apagar` : '',
      });
      element.style.left = `${note.start * pxPerTick}px`;
      element.style.width = `${Math.max(4, note.duration * pxPerTick - 1)}px`;
      element.style.top = `${row * ROW_HEIGHT + 2}px`;
      element.style.height = `${ROW_HEIGHT - 4}px`;
      element.style.backgroundColor = COLOR_BY_INSTRUMENT[note.instrument];
      fragment.appendChild(element);
    }
    this.el.notes.replaceChildren(fragment);
  }

  _pointToCell(event) {
    const rect = this.el.grid.getBoundingClientRect();
    return {
      row: rowAtY(event.clientY - rect.top, this.range.length),
      cell: cellAtX(this.layout, event.clientX - rect.left),
    };
  }

  _showGhost() {
    const { row, startCell, endCell } = this.drag;
    const { start, duration } = dragToSpan(this.layout, startCell, endCell);
    const ghost = this.el.ghost;
    ghost.style.left = `${start * this.layout.pxPerTick}px`;
    ghost.style.width = `${duration * this.layout.pxPerTick - 1}px`;
    ghost.style.top = `${row * ROW_HEIGHT + 2}px`;
    ghost.style.height = `${ROW_HEIGHT - 4}px`;
    ghost.classList.remove('hidden');
  }

  _cancelDrag() {
    this.drag = null;
    this.el.ghost.classList.add('hidden');
  }

  _bindGridEvents() {
    const grid = this.el.grid;

    grid.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || !this.layout) return;
      event.preventDefault();
      const noteElement = event.target.closest('.note-own');
      if (noteElement) {
        this.onRemove(Number(noteElement.dataset.id));
        return;
      }
      const { row, cell } = this._pointToCell(event);
      this.drag = { pointerId: event.pointerId, row, startCell: cell, endCell: cell };
      try {
        grid.setPointerCapture(event.pointerId);
      } catch {
        // alguns navegadores recusam captura em ponteiros sintéticos; o arraste segue funcionando
      }
      this._showGhost();
    });

    grid.addEventListener('pointermove', (event) => {
      if (!this.drag || event.pointerId !== this.drag.pointerId) return;
      const { cell } = this._pointToCell(event);
      if (cell !== this.drag.endCell) {
        this.drag.endCell = cell;
        this._showGhost();
      }
    });

    grid.addEventListener('pointerup', (event) => {
      if (!this.drag || event.pointerId !== this.drag.pointerId) return;
      const { row, startCell, endCell } = this.drag;
      this._cancelDrag();
      const span = dragToSpan(this.layout, startCell, endCell);
      this.onAdd({ midi: this.range[row], ...span });
    });

    grid.addEventListener('pointercancel', () => this._cancelDrag());

    grid.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      const noteElement = event.target.closest('.note-own');
      if (noteElement) this.onRemove(Number(noteElement.dataset.id));
    });
  }

  _bindRulerEvents() {
    this.el.ruler.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || !this.layout) return;
      const rect = this.el.ruler.getBoundingClientRect();
      const cell = cellAtX(this.layout, event.clientX - rect.left);
      this.onSeek(cell * this.layout.ticksPerCell);
    });
  }
}
