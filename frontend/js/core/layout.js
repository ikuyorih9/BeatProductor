/**
 * Geometria do piano roll (pura, sem DOM): tamanhos de célula, batida,
 * compasso e conversões coordenada ↔ célula/linha.
 */
import { DEFAULT_METER, ROW_HEIGHT } from '../config.js';
import { cellWidthPx, clamp, lengthInTicks, meterInfo, ticksPerCell } from './timing.js';

/**
 * @param {{bpm:number, division:string, bars:number, meter?:string}} settings
 * beatWidth/barWidth seguem a fórmula de compasso (o "tempo" de 6/8 é a colcheia).
 */
export function computeLayout({ bpm, division, bars, meter = DEFAULT_METER }) {
  const cellWidth = cellWidthPx(bpm, division);
  const perCell = ticksPerCell(division);
  const pxPerTick = cellWidth / perCell;
  const { beats, beatTicks, barTicks } = meterInfo(meter);
  const lengthTicks = lengthInTicks(bars, meter);
  const totalCells = lengthTicks / perCell;
  return {
    bars,
    meter,
    beatsPerBar: beats,
    beatTicks,
    barTicks,
    cellWidth,
    ticksPerCell: perCell,
    pxPerTick,
    lengthTicks,
    totalCells,
    beatWidth: beatTicks * pxPerTick,
    barWidth: barTicks * pxPerTick,
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
