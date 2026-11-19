/**
 * Projeto salvo (configurações + notas): serialização e saneamento.
 * Tudo que vem do armazenamento é tratado como não confiável.
 *
 * Versões:
 *   1 — divisões nomeadas por "células por batida" ('1/2', '1/4', '1/6'), sem compasso nem volumes;
 *   2 — divisões nomeadas pela figura ('1/8', '1/16', '1/16T'…), fórmula de compasso e volumes.
 * Projetos v1 são migrados ao carregar (a mesma célula, com o nome novo).
 */
import {
  BARS, BPM, DEFAULT_DIVISION, DEFAULT_INSTRUMENT, DEFAULT_METER, DIVISIONS, INSTRUMENT_IDS,
  LEGACY_DIVISIONS, LOOPS, METERS, VOLUME,
} from '../config.js';
import { divisionFitsMeter, toBoundedInt } from './timing.js';

export const PROJECT_VERSION = 2;

export function defaultVolumes() {
  return Object.fromEntries(INSTRUMENT_IDS.map((id) => [id, VOLUME.DEFAULT]));
}

export function defaultSettings() {
  return {
    instrument: DEFAULT_INSTRUMENT,
    division: DEFAULT_DIVISION,
    meter: DEFAULT_METER,
    bpm: BPM.DEFAULT,
    bars: BARS.DEFAULT,
    loop: false,
    loops: LOOPS.DEFAULT,
    volumes: defaultVolumes(),
  };
}

export function sanitizeVolumes(raw) {
  const base = defaultVolumes();
  if (!raw || typeof raw !== 'object') return base;
  return Object.fromEntries(
    INSTRUMENT_IDS.map((id) => [id, toBoundedInt(raw[id], VOLUME.MIN, VOLUME.MAX, base[id])]),
  );
}

/** Corrige/descarta campos inválidos, caindo nos padrões. */
export function sanitizeSettings(raw) {
  const base = defaultSettings();
  if (!raw || typeof raw !== 'object') return base;
  const meter = Object.hasOwn(METERS, raw.meter) ? raw.meter : base.meter;
  const division = Object.hasOwn(DIVISIONS, raw.division) && divisionFitsMeter(raw.division, meter)
    ? raw.division : base.division; // a padrão (1/16) cabe em todos os compassos
  return {
    instrument: INSTRUMENT_IDS.includes(raw.instrument) ? raw.instrument : base.instrument,
    division,
    meter,
    bpm: toBoundedInt(raw.bpm, BPM.MIN, BPM.MAX, base.bpm),
    bars: toBoundedInt(raw.bars, BARS.MIN, BARS.MAX, base.bars),
    loop: raw.loop === true,
    loops: toBoundedInt(raw.loops, LOOPS.MIN, LOOPS.MAX, base.loops),
    volumes: sanitizeVolumes(raw.volumes),
  };
}

/** Só as chaves do projeto (descarta estado de interface, como a ferramenta ativa). */
function projectSettings(settings) {
  const keys = Object.keys(defaultSettings());
  return Object.fromEntries(keys.map((key) => [key, settings[key]]));
}

export function serializeProject(settings, sequence) {
  return JSON.stringify({ version: PROJECT_VERSION, settings: projectSettings(settings), notes: sequence.toJSON() });
}

/** @returns {{ settings: object, notes: Array } | null} null se o texto não for um projeto válido. */
export function parseProject(text) {
  if (typeof text !== 'string' || text === '') return null;
  try {
    const data = JSON.parse(text);
    if (!data || (data.version !== 1 && data.version !== PROJECT_VERSION)) return null;
    const raw = data.settings && typeof data.settings === 'object' ? { ...data.settings } : {};
    if (data.version === 1) raw.division = LEGACY_DIVISIONS[raw.division];
    return { settings: sanitizeSettings(raw), notes: Array.isArray(data.notes) ? data.notes : [] };
  } catch {
    return null;
  }
}
