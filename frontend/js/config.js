/**
 * Constantes globais do Beat Productor (frontend).
 *
 * Unidade interna de tempo: TICK. Uma semínima (♩) tem 12 ticks, o que representa
 * exatamente todas as figuras do grid (semínima 12, colcheia 6, tercina de colcheia 4,
 * semicolcheia 3, sextina 2) sem erros de ponto flutuante.
 *
 * O BPM sempre conta SEMÍNIMAS por minuto (♩ = BPM), como na maioria das partituras e DAWs.
 */

export const TICKS_PER_BEAT = 12; // ticks por semínima
/** Ticks de uma semibreve (4 semínimas) — base para converter figuras: 1/8 de semibreve = 6 ticks. */
export const TICKS_PER_WHOLE = TICKS_PER_BEAT * 4;

/**
 * Divisão do grid = figura de cada célula (nome como na partitura).
 * `cells` = células por semínima.
 */
export const DIVISIONS = Object.freeze({
  '1/4': { cells: 1, label: '♩ 1/4 — semínima' },
  '1/8': { cells: 2, label: '♪ 1/8 — colcheia' },
  '1/8T': { cells: 3, label: '1/8 tercina' },
  '1/16': { cells: 4, label: '1/16 — semicolcheia' },
  '1/16T': { cells: 6, label: '1/16 tercina (sextina)' },
});
export const DEFAULT_DIVISION = '1/16';
/** Nomes antigos (projetos salvos antes da v2), que contavam CÉLULAS POR BATIDA. */
export const LEGACY_DIVISIONS = Object.freeze({ '1/2': '1/8', '1/4': '1/16', '1/6': '1/16T' });

/**
 * Fórmulas de compasso. `beats` = tempos por compasso; `unit` = figura do tempo (4 = ♩, 8 = ♪).
 * Compassos ímpares em x/8 (3/8, 5/8, 7/8, 9/8) não têm número inteiro de semínimas:
 * neles só valem as células que encaixam no compasso (ver `divisionFitsMeter`).
 */
export const METERS = Object.freeze({
  '2/4': { beats: 2, unit: 4 },
  '3/4': { beats: 3, unit: 4 },
  '4/4': { beats: 4, unit: 4 },
  '5/4': { beats: 5, unit: 4 },
  '3/8': { beats: 3, unit: 8 },
  '5/8': { beats: 5, unit: 8 },
  '6/8': { beats: 6, unit: 8 },
  '7/8': { beats: 7, unit: 8 },
  '9/8': { beats: 9, unit: 8 },
  '12/8': { beats: 12, unit: 8 },
});
/** Célula usada quando a atual não cabe no compasso escolhido (a colcheia cabe em todos). */
export const FALLBACK_DIVISION = '1/8';
export const DEFAULT_METER = '4/4';

export const BPM = Object.freeze({ MIN: 40, MAX: 240, DEFAULT: 120 });
export const BARS = Object.freeze({ MIN: 1, MAX: 16, DEFAULT: 4 });
export const LOOPS = Object.freeze({ MIN: 1, MAX: 32, DEFAULT: 4 });
/**
 * Volume de cada instrumento no mixer, em % (100 = calibrado; até 200 para reforçar).
 * Curva perceptiva: ganho = (% / 100)² → 50% ≈ −12 dB, 150% ≈ +7 dB, 200% ≈ +12 dB.
 */
export const VOLUME = Object.freeze({ MIN: 0, MAX: 200, DEFAULT: 100 });

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

/**
 * Calibração de volume por instrumento no navegador (ganho linear), medida para que
 * todos soem com intensidade parecida no volume 100%. O backend tem a sua própria
 * (backend/app/core/config.py), porque os sintetizadores são implementações diferentes.
 * A bateria leva +6 dB a mais que a calibração por RMS: golpes curtos soam mais baixos que notas
 * sustentadas com o mesmo RMS, e no 100% ela ficava abaixo do piano (o limitador segura os picos).
 */
export const INSTRUMENT_TRIM = Object.freeze({ piano: 0.85, drums: 2.0, lofi: 1.0, lead: 2.1 });

/**
 * Kit de bateria: 8 peças, cada uma numa tecla fixa (C3 a G3, de baixo para cima no grid).
 * Só essas teclas valem na bateria; as outras ficam desativadas.
 * `trim` = calibração da peça no navegador (ganho linear sobre INSTRUMENT_TRIM.drums), medida na
 * cadeia de saída real para que nenhuma peça fique enterrada (ver tests/e2e/smoke.mjs).
 * Mantenha em sincronia com backend/app/core/music.py (mesmas teclas) e config.py (trims do servidor).
 */
export const DRUM_PIECES = Object.freeze([
  { id: 'kick', label: 'Bumbo', midi: 48, trim: 1.18 },
  { id: 'snare', label: 'Caixa', midi: 49, trim: 2.8 },
  { id: 'hihat', label: 'Chimbal', midi: 50, trim: 7.0 },
  { id: 'floor_tom', label: 'Surdo', midi: 51, trim: 0.77 },
  { id: 'tom2', label: 'Tom 2', midi: 52, trim: 0.9 },
  { id: 'tom1', label: 'Tom 1', midi: 53, trim: 1.06 },
  { id: 'ride', label: 'Ride', midi: 54, trim: 2.3 },
  { id: 'crash', label: 'Prato de ataque', midi: 55, trim: 0.9 },
].map((piece) => Object.freeze(piece)));
export const DRUM_LOWEST_MIDI = DRUM_PIECES[0].midi;
export const DRUM_HIGHEST_MIDI = DRUM_PIECES[DRUM_PIECES.length - 1].midi;

export const STORAGE_KEY = 'beat-productor:projeto:v1';
