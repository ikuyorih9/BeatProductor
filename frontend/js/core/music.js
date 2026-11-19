/**
 * Teoria musical básica: nomes de notas, MIDI, frequências e mapeamento da bateria.
 * Módulo puro (sem DOM) — testado em frontend/tests/music.test.js.
 */
import { DRUM_PIECES } from '../config.js';

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

/** Peça de bateria associada a uma nota: classe de altura % 4. */
export function drumPieceForMidi(midi) {
  return DRUM_PIECES[pitchClass(midi) % DRUM_PIECES.length];
}
