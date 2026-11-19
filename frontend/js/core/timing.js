/**
 * Conversões de tempo: ticks ↔ segundos, divisões do grid e largura das células.
 * Módulo puro (sem DOM).
 */
import {
  CELL_WIDTH, DEFAULT_METER, DIVISIONS, METERS, TICKS_PER_BEAT, TICKS_PER_WHOLE,
} from '../config.js';

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

/** Células por semínima na divisão (ex.: '1/16' → 4). */
export function cellsPerBeat(division) {
  const entry = DIVISIONS[division];
  if (!entry) throw new Error(`Divisão desconhecida: ${division}`);
  return entry.cells;
}

export function ticksPerCell(division) {
  return TICKS_PER_BEAT / cellsPerBeat(division);
}

/**
 * Fórmula de compasso → { beats, unit, beatTicks, barTicks }.
 * beatTicks = duração de UM tempo (♩ = 12 em x/4, ♪ = 6 em x/8).
 */
export function meterInfo(meter = DEFAULT_METER) {
  const entry = METERS[meter];
  if (!entry) throw new Error(`Fórmula de compasso desconhecida: ${meter}`);
  const beatTicks = TICKS_PER_WHOLE / entry.unit;
  return { beats: entry.beats, unit: entry.unit, beatTicks, barTicks: beatTicks * entry.beats };
}

export function ticksPerBar(meter = DEFAULT_METER) {
  return meterInfo(meter).barTicks;
}

/** A célula cabe um número inteiro de vezes no compasso? (ex.: semínima não cabe em 3/8) */
export function divisionFitsMeter(division, meter) {
  return ticksPerBar(meter) % ticksPerCell(division) === 0;
}

export function lengthInTicks(bars, meter = DEFAULT_METER) {
  return bars * ticksPerBar(meter);
}

/**
 * Largura de uma célula em pixels. Proporcional à duração real da célula
 * (depende do BPM e da divisão), limitada para manter o grid utilizável.
 */
export function cellWidthPx(bpm, division) {
  const cellSeconds = ticksToSeconds(ticksPerCell(division), bpm);
  return Math.round(clamp(cellSeconds * CELL_WIDTH.PX_PER_SECOND, CELL_WIDTH.MIN, CELL_WIDTH.MAX));
}

/** Formata ticks como "compasso.tempo" (base 1) na fórmula de compasso, ex.: 0 → "1.1". */
export function formatBarBeat(tick, meter = DEFAULT_METER) {
  const { beats, beatTicks } = meterInfo(meter);
  const beat = Math.floor(tick / beatTicks);
  return `${Math.floor(beat / beats) + 1}.${(beat % beats) + 1}`;
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
