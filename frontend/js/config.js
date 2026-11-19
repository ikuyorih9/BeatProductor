/**
 * Constantes globais do Beat Productor (frontend).
 *
 * Unidade interna de tempo: TICK. Uma semínima (1 batida) tem 12 ticks,
 * o que permite representar exatamente as três divisões suportadas
 * (1/2 → 6 ticks, 1/4 → 3 ticks, 1/6 → 2 ticks) sem erros de ponto flutuante.
 */

export const TICKS_PER_BEAT = 12;
export const BEATS_PER_BAR = 4;

/** Divisão de tempo → quantidade de células por batida. */
export const DIVISIONS = Object.freeze({
  '1/2': 2,
  '1/4': 4,
  '1/6': 6,
});
export const DEFAULT_DIVISION = '1/4';

export const BPM = Object.freeze({ MIN: 40, MAX: 240, DEFAULT: 120 });
export const BARS = Object.freeze({ MIN: 1, MAX: 16, DEFAULT: 4 });
export const LOOPS = Object.freeze({ MIN: 1, MAX: 32, DEFAULT: 4 });

/** Faixa de notas: 3 oitavas, de C3 (MIDI 48) até B5 (MIDI 83). */
export const LOWEST_MIDI = 48;
export const OCTAVES = 3;
export const HIGHEST_MIDI = LOWEST_MIDI + OCTAVES * 12 - 1;

/** Geometria do grid (px). */
export const ROW_HEIGHT = 22;
export const CELL_WIDTH = Object.freeze({ MIN: 16, MAX: 112, PX_PER_SECOND: 224 });

/** Instrumentos disponíveis. As cores são usadas nos blocos de nota. */
export const INSTRUMENTS = Object.freeze([
  { id: 'piano', label: 'Piano Acústico', color: '#38bdf8' },
  { id: 'drums', label: 'Bateria', color: '#f97316' },
  { id: 'lofi', label: 'Lofi Synth', color: '#a78bfa' },
  { id: 'lead', label: 'Lead Synth', color: '#4ade80' },
]);
export const INSTRUMENT_IDS = Object.freeze(INSTRUMENTS.map((i) => i.id));
export const DEFAULT_INSTRUMENT = 'piano';

/** Peças da bateria, atribuídas pela classe de altura da nota (pitch class % 4). */
export const DRUM_PIECES = Object.freeze([
  { id: 'kick', label: 'Bumbo' },
  { id: 'snare', label: 'Caixa' },
  { id: 'hihat_closed', label: 'Hi-Hat fechado' },
  { id: 'hihat_open', label: 'Hi-Hat aberto' },
]);

export const STORAGE_KEY = 'beat-productor:projeto:v1';
