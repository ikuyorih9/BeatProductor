/**
 * Constantes globais do Beat Productor (frontend).
 *
 * Unidade interna de tempo: TICK. Uma semínima (♩) tem 12 ticks, o que representa
 * exatamente todas as figuras do grid (semínima 12, colcheia 6, tercina de colcheia 4,
 * semicolcheia 3, sextina 2) sem erros de ponto flutuante.
 *
 * O BPM sempre conta SEMÍNIMAS por minuto (♩ = BPM), como na maioria das partituras e DAWs.
 */

/**
 * Versão do frontend. O index.html espera exatamente este número: se o navegador rodar módulos
 * antigos do cache, o número não bate e a página busca os arquivos de novo (ver index.html).
 * Aumente junto com APP_BUILD do index.html quando os módulos mudarem (um teste confere).
 */
export const APP_BUILD = 9;

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
/**
 * Compassos do grid. Sem limite prático: quando uma nota ou pausa chega ao último compasso, o grid
 * ganha mais um sozinho (sempre sobra um compasso vazio no fim para continuar compondo).
 */
export const BARS = Object.freeze({ MIN: 1, MAX: 999, DEFAULT: 4 });
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

/**
 * Tecla mais grave do baixo: E3 no grid soa E1, a corda Mi solta de um baixo de 4 cordas (o baixo soa
 * duas oitavas abaixo da tecla). As teclas abaixo ficam desativadas no baixo. = backend music.py.
 */
export const BASS_LOWEST_MIDI = 52;

/** Geometria do grid (px). */
export const ROW_HEIGHT = 22;
export const CELL_WIDTH = Object.freeze({ MIN: 16, MAX: 112, PX_PER_SECOND: 224 });

/** Instrumentos disponíveis. As cores são usadas nos blocos de nota. */
export const INSTRUMENTS = Object.freeze([
  { id: 'piano', label: 'Piano Acústico', color: '#38bdf8' },
  { id: 'drums', label: 'Bateria', color: '#f97316' },
  { id: 'bass', label: 'Baixo', color: '#f472b6' },
  { id: 'lofi', label: 'Lofi Synth', color: '#a78bfa' },
  { id: 'lead', label: 'Lead Synth', color: '#4ade80' },
]);
export const INSTRUMENT_IDS = Object.freeze(INSTRUMENTS.map((i) => i.id));
export const DEFAULT_INSTRUMENT = 'piano';

/**
 * Calibração de volume por instrumento no navegador (ganho linear), medida para que
 * todos soem com intensidade parecida no volume 100%. O backend tem a sua própria
 * (backend/app/core/config.py), porque os sintetizadores são implementações diferentes.
 * Bateria: o bumbo no 100% chega a ~0,6 de pico na saída e nenhuma peça passa de ~0,72 — abaixo do
 * joelho do limitador (0,9), então ela soa limpa (sem saturar) mesmo com golpes simultâneos.
 */
export const INSTRUMENT_TRIM = Object.freeze({ piano: 0.85, drums: 1.5, bass: 1.06, lofi: 1.0, lead: 2.1 });

/**
 * Kit de bateria: 17 peças, cada uma numa tecla fixa (A3 a C#5, de baixo para cima), no CENTRO do
 * grid: 10 teclas desativadas acima e 9 abaixo. Só essas teclas valem na bateria.
 * As 8 peças originais continuam nas mesmas teclas (D4 a A4); as novas ficam em volta delas:
 * percussão embaixo (pandeirola … octobans) e pratos em cima (splash … bell).
 * `trim` = calibração da peça no navegador (ganho linear sobre INSTRUMENT_TRIM.drums), pela
 * intensidade de curto prazo (maior RMS em 50 ms, que é como se ouve um golpe curto) em relação
 * ao bumbo, com o pico de cada peça limitado a 1,2× o do bumbo (ver tests/e2e/smoke.mjs).
 * Mantenha em sincronia com backend/app/core/music.py (mesmas teclas) e config.py (trims do servidor).
 */
export const DRUM_PIECES = Object.freeze([
  { id: 'tambourine', label: 'Pandeirola', midi: 57, trim: 0.96 },
  { id: 'jam_block', label: 'Jam block', midi: 58, trim: 0.84 },
  { id: 'cowbell', label: 'Cowbell', midi: 59, trim: 0.53 },
  { id: 'rototoms', label: 'Rototons', midi: 60, trim: 0.87 },
  { id: 'octobans', label: 'Octobans', midi: 61, trim: 0.95 },
  { id: 'kick', label: 'Bumbo', midi: 62, trim: 1.0 },
  { id: 'snare', label: 'Caixa', midi: 63, trim: 1.36 },
  { id: 'hihat', label: 'Chimbal', midi: 64, trim: 1.6 },
  { id: 'floor_tom', label: 'Surdo', midi: 65, trim: 0.79 },
  { id: 'tom2', label: 'Tom 2', midi: 66, trim: 0.85 },
  { id: 'tom1', label: 'Tom 1', midi: 67, trim: 0.9 },
  { id: 'ride', label: 'Ride', midi: 68, trim: 2.8 },
  { id: 'crash', label: 'Prato de ataque', midi: 69, trim: 1.43 },
  { id: 'splash', label: 'Splash', midi: 70, trim: 1.67 },
  { id: 'china', label: 'China', midi: 71, trim: 1.92 },
  { id: 'stack', label: 'Stack', midi: 72, trim: 1.45 },
  { id: 'bell', label: 'Bell', midi: 73, trim: 0.4 },
].map((piece) => Object.freeze(piece)));
export const DRUM_LOWEST_MIDI = DRUM_PIECES[0].midi;
export const DRUM_HIGHEST_MIDI = DRUM_PIECES[DRUM_PIECES.length - 1].midi;

export const STORAGE_KEY = 'beat-productor:projeto:v1';
