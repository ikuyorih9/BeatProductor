/**
 * Teoria musical básica: nomes de notas, MIDI, frequências e mapeamento da bateria.
 * Módulo puro (sem DOM) — testado em frontend/tests/music.test.js.
 */
import {
  DRUM_HIGHEST_MIDI, DRUM_LOWEST_MIDI, DRUM_PIECES, HIGHEST_MIDI, LOWEST_MIDI,
} from '../config.js';

export const NOTE_NAMES = Object.freeze(['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']);
const BLACK_PITCH_CLASSES = new Set([1, 3, 6, 8, 10]);

/** Classe de altura (0 = C … 11 = B). Funciona também para MIDI negativo. */
export function pitchClass(midi) {
  return ((midi % 12) + 12) % 12;
}

/** MIDI → nome científico. 60 → "C4", 69 → "A4". */
export function midiToName(midi) {
  if (!Number.isInteger(midi)) throw new TypeError(`MIDI inválido: ${midi}`);
  const octave = Math.floor(midi / 12) - 1;
  return `${NOTE_NAMES[pitchClass(midi)]}${octave}`;
}

/** Nome científico → MIDI. "C4" → 60. Aceita sustenidos (#). */
export function nameToMidi(name) {
  const match = /^([A-G])(#?)(-?\d)$/.exec(String(name));
  if (!match) throw new Error(`Nome de nota inválido: ${name}`);
  const index = NOTE_NAMES.indexOf(match[1] + match[2]);
  if (index < 0) throw new Error(`Nome de nota inválido: ${name}`);
  return (Number(match[3]) + 1) * 12 + index;
}

/** Frequência em Hz pelo temperamento igual (A4 = 440 Hz). */
export function midiToFrequency(midi) {
  return 440 * 2 ** ((midi - 69) / 12);
}

export function isBlackKey(midi) {
  return BLACK_PITCH_CLASSES.has(pitchClass(midi));
}

/** Lista de notas MIDI da mais aguda para a mais grave (ordem das linhas do grid). */
export function buildRange(lowestMidi, octaves) {
  const notes = [];
  for (let midi = lowestMidi + octaves * 12 - 1; midi >= lowestMidi; midi -= 1) notes.push(midi);
  return notes;
}

const DRUM_BY_MIDI = new Map(DRUM_PIECES.map((piece) => [piece.midi, piece]));
const DRUM_BY_ID = new Map(DRUM_PIECES.map((piece) => [piece.id, piece]));

/** Peça de bateria tocada por uma nota, ou null se a tecla não faz parte do kit. */
export function drumPieceForMidi(midi) {
  return DRUM_BY_MIDI.get(midi) ?? null;
}

/** Faixa de teclas que o instrumento aceita (a bateria usa só as teclas do kit). */
export function playableRange(instrument) {
  return instrument === 'drums'
    ? { minMidi: DRUM_LOWEST_MIDI, maxMidi: DRUM_HIGHEST_MIDI }
    : { minMidi: LOWEST_MIDI, maxMidi: HIGHEST_MIDI };
}

export function isPlayable(instrument, midi) {
  const { minMidi, maxMidi } = playableRange(instrument);
  return Number.isInteger(midi) && midi >= minMidi && midi <= maxMidi;
}

/**
 * Bateria antiga (até a v2 do projeto salvo / v1 do arquivo de texto): 4 peças repetidas em
 * todas as teclas pela classe de altura % 4 (C bumbo, C# caixa, D chimbal fechado, D# chimbal
 * aberto, E bumbo…). Devolve a tecla da mesma peça no kit atual.
 */
const LEGACY_DRUM_ORDER = Object.freeze(['kick', 'snare', 'hihat', 'hihat']);
export function migrateLegacyDrumMidi(midi) {
  return DRUM_BY_ID.get(LEGACY_DRUM_ORDER[pitchClass(midi) % 4]).midi;
}

/**
 * Migra os itens de bateria de um projeto antigo para o kit atual. Peças que caem na mesma
 * tecla (ex.: bumbo em C3 e em E3 no mesmo tempo) não se sobrepõem: a anterior é encurtada
 * até o início da seguinte, e itens no mesmo instante viram um só (nota vence pausa).
 * Itens de outros instrumentos passam intactos.
 */
export function migrateLegacyDrumItems(items) {
  const others = [];
  const drums = [];
  for (const item of items) {
    if (item && item.instrument === 'drums' && Number.isInteger(item.midi)) {
      drums.push({ ...item, midi: migrateLegacyDrumMidi(item.midi) });
    } else {
      others.push(item);
    }
  }
  drums.sort((a, b) => a.midi - b.midi || a.start - b.start || (a.kind === 'rest') - (b.kind === 'rest'));
  const kept = [];
  for (const item of drums) {
    const prev = kept[kept.length - 1];
    if (prev && prev.midi === item.midi && item.start < prev.start + prev.duration) {
      if (item.start === prev.start) continue; // mesmo instante: fica o primeiro (nota antes de pausa)
      prev.duration = item.start - prev.start;
    }
    kept.push(item);
  }
  return [...others, ...kept];
}
