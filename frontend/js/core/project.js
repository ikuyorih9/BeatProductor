/**
 * Projeto salvo (configurações + notas): serialização e saneamento.
 * Tudo que vem do armazenamento é tratado como não confiável.
 */
import {
  BARS, BPM, DEFAULT_DIVISION, DEFAULT_INSTRUMENT, DIVISIONS, INSTRUMENT_IDS, LOOPS,
} from '../config.js';
import { toBoundedInt } from './timing.js';

export const PROJECT_VERSION = 1;

export function defaultSettings() {
  return {
    instrument: DEFAULT_INSTRUMENT,
    division: DEFAULT_DIVISION,
    bpm: BPM.DEFAULT,
    bars: BARS.DEFAULT,
    loop: false,
    loops: LOOPS.DEFAULT,
  };
}

/** Corrige/descarta campos inválidos, caindo nos padrões. */
export function sanitizeSettings(raw) {
  const base = defaultSettings();
  if (!raw || typeof raw !== 'object') return base;
  return {
    instrument: INSTRUMENT_IDS.includes(raw.instrument) ? raw.instrument : base.instrument,
    division: Object.hasOwn(DIVISIONS, raw.division) ? raw.division : base.division,
    bpm: toBoundedInt(raw.bpm, BPM.MIN, BPM.MAX, base.bpm),
    bars: toBoundedInt(raw.bars, BARS.MIN, BARS.MAX, base.bars),
    loop: raw.loop === true,
    loops: toBoundedInt(raw.loops, LOOPS.MIN, LOOPS.MAX, base.loops),
  };
}

export function serializeProject(settings, sequence) {
  return JSON.stringify({ version: PROJECT_VERSION, settings, notes: sequence.toJSON() });
}

/** @returns {{ settings: object, notes: Array } | null} null se o texto não for um projeto válido. */
export function parseProject(text) {
  if (typeof text !== 'string' || text === '') return null;
  try {
    const data = JSON.parse(text);
    if (!data || data.version !== PROJECT_VERSION) return null;
    return { settings: sanitizeSettings(data.settings), notes: Array.isArray(data.notes) ? data.notes : [] };
  } catch {
    return null;
  }
}
