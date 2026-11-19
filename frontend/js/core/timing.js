/**
 * Conversões de tempo: ticks ↔ segundos, divisões do grid e largura das células.
 * Módulo puro (sem DOM).
 */
import { BEATS_PER_BAR, CELL_WIDTH, DIVISIONS, TICKS_PER_BEAT } from '../config.js';

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/** Converte um valor qualquer em inteiro dentro de [min, max]; usa `fallback` se não for número. */
export function toBoundedInt(value, min, max, fallback) {
  const number = Number.parseInt(value, 10);
  if (!Number.isFinite(number)) return fallback;
  return clamp(number, min, max);
}

export function secondsPerTick(bpm) {
  return 60 / (bpm * TICKS_PER_BEAT);
}

export function ticksToSeconds(ticks, bpm) {
  return ticks * secondsPerTick(bpm);
}

export function cellsPerBeat(division) {
  const cells = DIVISIONS[division];
  if (!cells) throw new Error(`Divisão desconhecida: ${division}`);
  return cells;
}

export function ticksPerCell(division) {
  return TICKS_PER_BEAT / cellsPerBeat(division);
}

export function ticksPerBar() {
  return TICKS_PER_BEAT * BEATS_PER_BAR;
}

export function lengthInTicks(bars) {
  return bars * ticksPerBar();
}

/**
 * Largura de uma célula em pixels. Proporcional à duração real da célula
 * (depende do BPM e da divisão), limitada para manter o grid utilizável.
 */
export function cellWidthPx(bpm, division) {
  const cellSeconds = ticksToSeconds(ticksPerCell(division), bpm);
  return Math.round(clamp(cellSeconds * CELL_WIDTH.PX_PER_SECOND, CELL_WIDTH.MIN, CELL_WIDTH.MAX));
}

/** Formata ticks como "compasso.batida" (base 1), ex.: 0 → "1.1". */
export function formatBarBeat(tick) {
  const beat = Math.floor(tick / TICKS_PER_BEAT);
  return `${Math.floor(beat / BEATS_PER_BAR) + 1}.${(beat % BEATS_PER_BAR) + 1}`;
}

/** Formata segundos como "m:ss.d". */
export function formatClock(seconds) {
  const safe = Math.max(0, seconds);
  const minutes = Math.floor(safe / 60);
  const rest = safe - minutes * 60;
  const whole = Math.floor(rest);
  const tenths = Math.floor((rest - whole) * 10);
  return `${minutes}:${String(whole).padStart(2, '0')}.${tenths}`;
}
