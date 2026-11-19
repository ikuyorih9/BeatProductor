/**
 * Grid do piano roll: linhas (uma por nota), colunas (células da divisão),
 * blocos de nota/pausa, régua de compassos e marcador de FIM.
 *
 * Interação (instrumento atual):
 * - Ferramenta DESENHAR:
 *     clique numa célula vazia → nota de 1 célula; clicar e arrastar → nota longa;
 *     clique numa nota/pausa → apaga.
 * - Ferramenta SELECIONAR (ou Shift+arrastar em qualquer ferramenta):
 *     arrastar no vazio → retângulo de seleção; clique num bloco → seleciona só ele;
 *     arrastar um bloco → MOVE a seleção (para cima/baixo = altura, para os lados = tempo);
 *     Shift+clique → adiciona/remove da seleção; clique no vazio → limpa a seleção.
 * - Botão direito: célula vazia → PAUSA de 1 célula; sobre nota/pausa → apaga.
 * - Clique na régua → posiciona o cursor.
 * Linhas fora da faixa do instrumento atual (na bateria: fora do kit) ficam desativadas:
 * não recebem notas/pausas e a seleção não pode ser arrastada para elas.
 */
import { INSTRUMENTS, ROW_HEIGHT } from '../config.js';
import { cellAtX, dragToSpan, rowAtY } from '../core/layout.js';
import { isBlackKey, isPlayable, midiToName, pitchClass, playableRange } from '../core/music.js';
import { clampMove, itemsInRect } from '../core/selection.js';
import { formatBarBeat } from '../core/timing.js';
import { createElement } from './dom.js';

const COLOR_BY_INSTRUMENT = Object.fromEntries(INSTRUMENTS.map((i) => [i.id, i.color]));
const CLICK_TOLERANCE_PX = 4;

export class PianoRollGrid {
  /**
   * @param {object} options
   * @param {object} options.elements { grid, rows, lines, notes, ghost, ruler, selectionBox, endMarker, endFlag }
   * @param {number[]} options.range notas MIDI, da mais aguda para a mais grave
   * @param {import('../core/sequence.js').Sequence} options.sequence
   * @param {() => object} options.getState estado atual da store (instrument, tool)
   * @param {(span:{midi:number,start:number,duration:number}) => void} options.onAdd
   * @param {(span:{midi:number,start:number,duration:number}) => void} options.onAddRest
   * @param {(id:number) => void} options.onRemove
   * @param {(tick:number) => void} options.onSeek
   * @param {(ids:number[]) => void} options.onSelectionChange
   * @param {(ids:number[], dMidi:number, dTicks:number) => void} options.onMove
   */
  constructor({ elements, range, sequence, getState, onAdd, onAddRest, onRemove, onSeek, onSelectionChange, onMove }) {
    this.el = elements;
    this.range = range;
    this.rowIndex = new Map(range.map((midi, index) => [midi, index]));
    this.sequence = sequence;
    this.getState = getState;
    this.onAdd = onAdd;
    this.onAddRest = onAddRest;
    this.onRemove = onRemove;
    this.onSeek = onSeek;
    this.onSelectionChange = onSelectionChange;
    this.onMove = onMove;
    this.layout = null;
    this.drag = null;
    this.marquee = null;
    this.move = null;
    this.selection = new Set();

    this._renderRows();
    this._bindGridEvents();
    this._bindRulerEvents();
  }

  /** Redesenha as linhas (chamar quando o instrumento muda: a faixa ativa depende dele). */
  refreshRows() {
    this._renderRows();
  }

  /** Linhas (índices) que o instrumento atual aceita: { minRow, maxRow }. */
  playableRows() {
    const { minMidi, maxMidi } = playableRange(this.getState().instrument);
    return { minRow: this.rowIndex.get(maxMidi) ?? 0, maxRow: this.rowIndex.get(minMidi) ?? this.range.length - 1 };
  }

  _rowEnabled(row) {
    return isPlayable(this.getState().instrument, this.range[row]);
  }

  _renderRows() {
    const fragment = document.createDocumentFragment();
    const { instrument } = this.getState();
    for (const midi of this.range) {
      const classes = ['grid-row'];
      if (isBlackKey(midi)) classes.push('is-black');
      if (pitchClass(midi) === 0) classes.push('is-c');
      if (!isPlayable(instrument, midi)) classes.push('is-disabled');
      fragment.appendChild(createElement('div', classes.join(' '), { 'data-midi': String(midi) }));
    }
    this.el.rows.replaceChildren(fragment);
    this.el.grid.style.height = `${this.range.length * ROW_HEIGHT}px`;
  }

  /** Recalcula as dimensões (BPM, divisão ou compassos mudaram). */
  applyLayout(layout) {
    // Arrastes em andamento usam a geometria antiga: cancela para não agir no lugar errado.
    if (this.drag) this._cancelDrag();
    if (this.marquee) this._cancelMarquee();
    if (this.move) this._cancelMove();
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
    const { bars, barWidth, beatWidth, beatsPerBar } = this.layout;
    const fragment = document.createDocumentFragment();
    for (let bar = 0; bar < bars; bar += 1) {
      fragment.appendChild(createElement('div', 'ruler-label', { style: `left:${bar * barWidth}px`, text: String(bar + 1) }));
      for (let beat = 0; beat < beatsPerBar; beat += 1) {
        const height = beat === 0 ? 24 : 6;
        fragment.appendChild(createElement('div', 'ruler-tick', {
          style: `left:${bar * barWidth + beat * beatWidth}px;height:${height}px`,
        }));
      }
    }
    // Os marcadores fixos (cursor e FIM) sobrevivem ao redesenho da régua.
    const keep = [...this.el.ruler.querySelectorAll('#ruler-marker, #end-flag')];
    this.el.ruler.replaceChildren(fragment, ...keep);
  }

  /** Redesenha todos os blocos. Os do instrumento atual são editáveis e selecionáveis. */
  renderNotes() {
    if (!this.layout) return;
    const { instrument } = this.getState();
    const { pxPerTick } = this.layout;
    const fragment = document.createDocumentFragment();
    const ownIds = new Set();

    // Itens de outros instrumentos primeiro (ficam por baixo, esmaecidos).
    const items = this.sequence.activeItems().sort((a, b) => (a.instrument === instrument) - (b.instrument === instrument));
    for (const item of items) {
      const row = this.rowIndex.get(item.midi);
      if (row === undefined) continue;
      const own = item.instrument === instrument;
      const rest = item.kind === 'rest';
      if (own) ownIds.add(item.id);

      const classes = ['note', own ? 'note-own' : 'note-other'];
      if (rest) classes.push('note-rest');
      if (own && this.selection.has(item.id)) classes.push('is-selected');
      const label = rest ? 'Pausa' : midiToName(item.midi);
      const element = createElement('div', classes.join(' '), {
        'data-id': String(item.id),
        title: own ? `${label} · ${formatBarBeat(item.start, this.layout.meter)}` : '',
      });
      element.style.left = `${item.start * pxPerTick}px`;
      element.style.width = `${Math.max(4, item.duration * pxPerTick - 1)}px`;
      element.style.top = `${row * ROW_HEIGHT + 2}px`;
      element.style.height = `${ROW_HEIGHT - 4}px`;
      if (!rest) element.style.backgroundColor = COLOR_BY_INSTRUMENT[item.instrument];
      fragment.appendChild(element);
    }
    this.el.notes.replaceChildren(fragment);
    this._renderEndMarker();

    // Descarta da seleção o que não existe mais (apagado, outro instrumento, fora do grid).
    const before = this.selection.size;
    for (const id of [...this.selection]) if (!ownIds.has(id)) this.selection.delete(id);
    if (this.selection.size !== before) this.onSelectionChange(this.getSelection());
  }

  /** Linha tracejada no FIM da música (fim da última nota ou pausa). */
  _renderEndMarker() {
    const { endMarker, endFlag } = this.el;
    const visible = this.sequence.hasItems;
    endMarker.classList.toggle('hidden', !visible);
    endFlag.classList.toggle('hidden', !visible);
    if (!visible) return;
    const x = this.sequence.endTick() * this.layout.pxPerTick;
    endMarker.style.transform = `translateX(${x}px)`;
    endFlag.style.transform = `translateX(${x}px)`;
  }

  // ---------------------------------------------------------------- seleção
  getSelection() {
    return [...this.selection];
  }

  setSelection(ids) {
    this.selection = new Set(ids);
    this.renderNotes();
    this.onSelectionChange(this.getSelection());
  }

  clearSelection() {
    if (this.selection.size === 0) return;
    this.setSelection([]);
  }

  _ownItems() {
    const { instrument } = this.getState();
    return this.sequence.activeItems().filter((item) => item.instrument === instrument);
  }

  // ---------------------------------------------------------------- geometria do ponteiro
  _localPoint(event) {
    const rect = this.el.grid.getBoundingClientRect();
    return {
      x: Math.min(Math.max(event.clientX - rect.left, 0), rect.width),
      y: Math.min(Math.max(event.clientY - rect.top, 0), rect.height),
    };
  }

  _pointToCell(event) {
    const rect = this.el.grid.getBoundingClientRect();
    return {
      row: rowAtY(event.clientY - rect.top, this.range.length),
      cell: cellAtX(this.layout, event.clientX - rect.left),
    };
  }

  _capture(pointerId) {
    try {
      this.el.grid.setPointerCapture(pointerId);
    } catch {
      // alguns navegadores recusam captura em ponteiros sintéticos; o arraste segue funcionando
    }
  }

  // ---------------------------------------------------------------- desenho de nota
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

  // ---------------------------------------------------------------- retângulo de seleção
  _showMarquee() {
    const { x0, y0, x1, y1 } = this.marquee;
    const box = this.el.selectionBox;
    box.style.left = `${Math.min(x0, x1)}px`;
    box.style.top = `${Math.min(y0, y1)}px`;
    box.style.width = `${Math.abs(x1 - x0)}px`;
    box.style.height = `${Math.abs(y1 - y0)}px`;
    box.classList.remove('hidden');
  }

  _cancelMarquee() {
    this.marquee = null;
    this.el.selectionBox.classList.add('hidden');
  }

  _finishMarquee() {
    const { x0, y0, x1, y1, additive } = this.marquee;
    this._cancelMarquee();
    const isClick = Math.abs(x1 - x0) < CLICK_TOLERANCE_PX && Math.abs(y1 - y0) < CLICK_TOLERANCE_PX;
    if (isClick) {
      if (!additive) this.clearSelection();
      return;
    }
    const hits = itemsInRect(this._ownItems(), { x1: x0, y1: y0, x2: x1, y2: y1 }, {
      pxPerTick: this.layout.pxPerTick,
      rowIndex: this.rowIndex,
    });
    this.setSelection(additive ? [...this.selection, ...hits] : hits);
  }

  // ---------------------------------------------------------------- mover a seleção arrastando
  _startMove(event) {
    this.move = { pointerId: event.pointerId, x0: event.clientX, y0: event.clientY, dRows: 0, dTicks: 0 };
    this._capture(event.pointerId);
  }

  _updateMove(event) {
    const { cellWidth, ticksPerCell, pxPerTick, lengthTicks } = this.layout;
    const wantedRows = Math.round((event.clientY - this.move.y0) / ROW_HEIGHT);
    const wantedTicks = Math.round((event.clientX - this.move.x0) / cellWidth) * ticksPerCell;
    const selected = this._ownItems().filter((item) => this.selection.has(item.id));
    const { dRows, dTicks } = clampMove(selected, wantedRows, wantedTicks, {
      rowIndex: this.rowIndex, rowCount: this.range.length, lengthTicks, ...this.playableRows(),
    });
    if (dRows === this.move.dRows && dTicks === this.move.dTicks) return;
    this.move.dRows = dRows;
    this.move.dTicks = dTicks;
    this.el.grid.classList.add('is-moving');
    const transform = dRows === 0 && dTicks === 0 ? '' : `translate(${dTicks * pxPerTick}px, ${dRows * ROW_HEIGHT}px)`;
    for (const element of this.el.notes.querySelectorAll('.note.is-selected')) element.style.transform = transform;
  }

  _cancelMove() {
    this.move = null;
    this.el.grid.classList.remove('is-moving');
    for (const element of this.el.notes.querySelectorAll('.note.is-selected')) element.style.transform = '';
  }

  _finishMove() {
    const { dRows, dTicks } = this.move;
    this._cancelMove();
    // Linhas de cima são as notas mais agudas: descer uma linha = -1 semitom.
    if (dRows !== 0 || dTicks !== 0) this.onMove(this.getSelection(), -dRows, dTicks);
  }

  // ---------------------------------------------------------------- eventos
  _bindGridEvents() {
    const grid = this.el.grid;

    grid.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || !this.layout) return;
      event.preventDefault();
      const selecting = this.getState().tool === 'select' || event.shiftKey;
      const itemElement = event.target.closest('.note-own');

      if (itemElement) {
        const id = Number(itemElement.dataset.id);
        if (!selecting) {
          this.onRemove(id);
        } else if (event.shiftKey) {
          const next = new Set(this.selection);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          this.setSelection([...next]);
        } else {
          // Clicar num bloco já selecionado mantém o grupo (para arrastá-lo junto).
          if (!this.selection.has(id)) this.setSelection([id]);
          this._startMove(event);
        }
        return;
      }

      if (selecting) {
        const { x, y } = this._localPoint(event);
        this.marquee = { pointerId: event.pointerId, x0: x, y0: y, x1: x, y1: y, additive: event.shiftKey };
        this._capture(event.pointerId);
        return;
      }

      const { row, cell } = this._pointToCell(event);
      if (!this._rowEnabled(row)) return; // tecla desativada para este instrumento
      this.drag = { pointerId: event.pointerId, row, startCell: cell, endCell: cell };
      this._capture(event.pointerId);
      this._showGhost();
    });

    grid.addEventListener('pointermove', (event) => {
      if (this.move && event.pointerId === this.move.pointerId) {
        this._updateMove(event);
        return;
      }
      if (this.marquee && event.pointerId === this.marquee.pointerId) {
        const { x, y } = this._localPoint(event);
        this.marquee.x1 = x;
        this.marquee.y1 = y;
        this._showMarquee();
        return;
      }
      if (!this.drag || event.pointerId !== this.drag.pointerId) return;
      const { cell } = this._pointToCell(event);
      if (cell !== this.drag.endCell) {
        this.drag.endCell = cell;
        this._showGhost();
      }
    });

    grid.addEventListener('pointerup', (event) => {
      if (this.move && event.pointerId === this.move.pointerId) {
        this._finishMove();
        return;
      }
      if (this.marquee && event.pointerId === this.marquee.pointerId) {
        this._finishMarquee();
        return;
      }
      if (!this.drag || event.pointerId !== this.drag.pointerId) return;
      const { row, startCell, endCell } = this.drag;
      this._cancelDrag();
      const span = dragToSpan(this.layout, startCell, endCell);
      this.onAdd({ midi: this.range[row], ...span });
    });

    grid.addEventListener('pointercancel', () => {
      if (this.move) this._cancelMove();
      this._cancelDrag();
      this._cancelMarquee();
    });

    // Botão direito: sobre um bloco apaga; numa célula vazia cria uma PAUSA.
    grid.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      if (!this.layout) return;
      const itemElement = event.target.closest('.note-own');
      if (itemElement) {
        this.onRemove(Number(itemElement.dataset.id));
        return;
      }
      const { row, cell } = this._pointToCell(event);
      if (!this._rowEnabled(row)) return;
      this.onAddRest({ midi: this.range[row], start: cell * this.layout.ticksPerCell, duration: this.layout.ticksPerCell });
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
