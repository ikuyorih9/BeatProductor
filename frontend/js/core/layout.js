/**
 * Geometria do piano roll (pura, sem DOM): tamanhos de célula, batida,
 * compasso e conversões coordenada ↔ célula/linha.
 */
import { BEATS_PER_BAR, ROW_HEIGHT } from '../config.js';
import { cellsPerBeat, cellWidthPx, clamp, lengthInTicks, ticksPerCell } from './timing.js';

export function computeLayout({ bpm, division, bars }) {
  const cellWidth = cellWidthPx(bpm, division);
  const perCell = ticksPerCell(division);
  const perBeat = cellsPerBeat(division);
  const lengthTicks = lengthInTicks(bars);
  const totalCells = lengthTicks / perCell;
  const beatWidth = cellWidth * perBeat;
  return {
    bars,
    cellWidth,
    ticksPerCell: perCell,
    cellsPerBeat: perBeat,
    pxPerTick: cellWidth / perCell,
    lengthTicks,
    totalCells,
    beatWidth,
    barWidth: beatWidth * BEATS_PER_BAR,
    width: totalCells * cellWidth,
  };
}

/** Índice da célula sob a coordenada x (px, relativa ao grid), limitado ao grid. */
export function cellAtX(layout, x) {
  return clamp(Math.floor(x / layout.cellWidth), 0, layout.totalCells - 1);
}

/** Índice da linha sob a coordenada y (px, relativa ao grid), limitado às linhas existentes. */
export function rowAtY(y, rowCount) {
  return clamp(Math.floor(y / ROW_HEIGHT), 0, rowCount - 1);
}

/** Converte um arraste entre duas células em { start, duration } (ticks), em qualquer direção. */
export function dragToSpan(layout, cellA, cellB) {
  const first = Math.min(cellA, cellB);
  const last = Math.max(cellA, cellB);
  return { start: first * layout.ticksPerCell, duration: (last - first + 1) * layout.ticksPerCell };
}
