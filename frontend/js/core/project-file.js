/**
 * Arquivo de projeto em TEXTO (exportar/importar) — fácil de ler e escrever à mão.
 *
 *   [projeto]            cabeçalho: os mesmos campos do cabeçalho do app
 *   bpm = 120
 *   compasso = 4/4
 *   ...
 *   [volume]             mixer (0–150 %)
 *   piano = 100
 *   [piano]              uma seção por instrumento; uma nota por linha:
 *   1.1      C4   1          posição (compasso.tempo[+fração])  nota  duração (em tempos)  [pausa]
 *   1.2+1/2  E4   1/2
 *   2.1      C4   2   pausa
 *
 * Posições e durações são frações EXATAS do tempo da fórmula de compasso, então exportar e
 * importar devolve o projeto idêntico (mesmos ticks). Módulo puro — testado no Node.
 */
import {
  BARS, BPM, DIVISIONS, HIGHEST_MIDI, INSTRUMENT_IDS, LOOPS, LOWEST_MIDI, METERS, VOLUME,
} from '../config.js';
import { drumPieceForMidi, midiToName, NOTE_NAMES } from './music.js';
import { defaultSettings } from './project.js';
import { lengthInTicks, meterInfo } from './timing.js';

export const FILE_FORMAT_VERSION = 1;

/** Nome da seção de cada instrumento no arquivo (em português, como no app). */
const SECTION_OF = Object.freeze({ piano: 'piano', drums: 'bateria', lofi: 'lofi', lead: 'lead' });
const INSTRUMENT_OF_SECTION = Object.freeze({
  piano: 'piano', bateria: 'drums', drums: 'drums', lofi: 'lofi', lead: 'lead',
});
/** Peças da bateria aceitas no lugar do nome da nota (a nota correspondente na oitava 3). */
const DRUM_ALIASES = Object.freeze({
  bumbo: 48, kick: 48, caixa: 49, snare: 49,
  chimbal: 50, hihat: 50, 'chimbal-fechado': 50, 'hihat-fechado': 50,
  'chimbal-aberto': 51, 'hihat-aberto': 51,
});
const DEFAULT_REST_MIDI = 60;
const MAX_ERRORS = 8;

// ---------------------------------------------------------------- frações exatas
function gcd(a, b) {
  return b === 0 ? a : gcd(b, a % b);
}

/** ticks → "2", "1/2", "1+1/2" (em tempos de `beatTicks`). */
export function formatBeats(ticks, beatTicks) {
  const whole = Math.floor(ticks / beatTicks);
  const rest = ticks % beatTicks;
  if (rest === 0) return String(whole);
  const divisor = gcd(rest, beatTicks);
  const fraction = `${rest / divisor}/${beatTicks / divisor}`;
  return whole > 0 ? `${whole}+${fraction}` : fraction;
}

/**
 * "2", "1/2", "1+1/2", "1.5", "1,5" → ticks inteiros. Lança erro se não for exato.
 */
export function parseBeats(text, beatTicks) {
  const value = String(text).trim().replace(',', '.');
  let beats;
  let match;
  if ((match = /^(\d+)\+(\d+)\/(\d+)$/.exec(value))) {
    beats = Number(match[1]) + Number(match[2]) / Number(match[3]);
  } else if ((match = /^(\d+)\/(\d+)$/.exec(value))) {
    beats = Number(match[1]) / Number(match[2]);
  } else if (/^\d+(\.\d+)?$/.test(value)) {
    beats = Number(value);
  } else {
    throw new Error(`"${text}" não é uma quantidade de tempos (use 1, 1/2, 1+1/2 ou 1.5)`);
  }
  if (!Number.isFinite(beats)) throw new Error(`"${text}" é inválido`);
  const ticks = beats * beatTicks;
  const rounded = Math.round(ticks);
  if (Math.abs(ticks - rounded) > 1e-9) {
    throw new Error(`"${text}" não cabe no grid (a menor fração é 1/${beatTicks} de tempo)`);
  }
  return rounded;
}

/** tick → "compasso.tempo" ou "compasso.tempo+fração" (base 1). */
export function formatPosition(tick, meter) {
  const { beatTicks, barTicks } = meterInfo(meter);
  const bar = Math.floor(tick / barTicks) + 1;
  const inBar = tick % barTicks;
  const beat = Math.floor(inBar / beatTicks) + 1;
  const rest = inBar % beatTicks;
  return rest === 0 ? `${bar}.${beat}` : `${bar}.${beat}+${formatBeats(rest, beatTicks)}`;
}

export function parsePosition(text, meter) {
  const { beats, beatTicks, barTicks } = meterInfo(meter);
  const match = /^(\d+)\.(\d+)(?:\+(.+))?$/.exec(String(text).trim());
  if (!match) throw new Error(`posição "${text}" inválida (use compasso.tempo, ex.: 1.1, 2.3 ou 1.2+1/2)`);
  const bar = Number(match[1]);
  const beat = Number(match[2]);
  if (bar < 1) throw new Error(`compasso ${bar} inválido (começa em 1)`);
  if (beat < 1 || beat > beats) throw new Error(`tempo ${beat} inválido (o compasso ${meter} tem ${beats} tempos)`);
  const offset = match[3] === undefined ? 0 : parseBeats(match[3], beatTicks);
  if (offset >= beatTicks) throw new Error(`fração "${match[3]}" deve ser menor que 1 tempo`);
  return (bar - 1) * barTicks + (beat - 1) * beatTicks + offset;
}

// ---------------------------------------------------------------- notas
/** "C4", "c#3", "Bb4", "bumbo"… → MIDI. */
export function parseNoteName(text, instrument) {
  const token = String(text).trim();
  if (instrument === 'drums' && Object.hasOwn(DRUM_ALIASES, token.toLowerCase())) {
    return DRUM_ALIASES[token.toLowerCase()];
  }
  const match = /^([A-Ga-g])([#b]?)(-?\d)$/.exec(token);
  if (!match) throw new Error(`nota "${text}" inválida (use C4, F#3, Bb2…)`);
  const base = NOTE_NAMES.indexOf(match[1].toUpperCase());
  const shift = match[2] === '#' ? 1 : match[2] === 'b' ? -1 : 0;
  return (Number(match[3]) + 1) * 12 + base + shift;
}

// ---------------------------------------------------------------- texto → valores do cabeçalho
function normalizeKey(text) {
  return String(text).normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
}

function parseInteger(value, { MIN, MAX }, what) {
  if (!/^\d+$/.test(value)) throw new Error(`${what} "${value}" deve ser um número inteiro`);
  const number = Number(value);
  if (number < MIN || number > MAX) throw new Error(`${what} ${number} fora da faixa (${MIN} a ${MAX})`);
  return number;
}

function parseBoolean(value, what) {
  const key = normalizeKey(value);
  if (['sim', 's', 'true', 'on', 'yes'].includes(key)) return true;
  if (['nao', 'n', 'false', 'off', 'no'].includes(key)) return false;
  throw new Error(`${what} "${value}" deve ser sim ou nao`);
}

const HEADER_FIELDS = {
  versao: (value) => {
    if (Number(value) > FILE_FORMAT_VERSION) throw new Error(`arquivo da versão ${value}; este app lê até a ${FILE_FORMAT_VERSION}`);
    return {};
  },
  bpm: (value) => ({ bpm: parseInteger(value, BPM, 'bpm') }),
  compasso: (value) => {
    if (!Object.hasOwn(METERS, value)) throw new Error(`compasso "${value}" não suportado (${Object.keys(METERS).join(', ')})`);
    return { meter: value };
  },
  compassos: (value) => ({ bars: parseInteger(value, BARS, 'compassos') }),
  divisao: (value) => {
    const key = Object.keys(DIVISIONS).find((d) => d.toLowerCase() === value.toLowerCase());
    if (!key) throw new Error(`divisão "${value}" não suportada (${Object.keys(DIVISIONS).join(', ')})`);
    return { division: key };
  },
  loop: (value) => ({ loop: parseBoolean(value, 'loop') }),
  repeticoes: (value) => ({ loops: parseInteger(value, LOOPS, 'repeticoes') }),
  instrumento: (value) => {
    const id = INSTRUMENT_OF_SECTION[normalizeKey(value)];
    if (!id) throw new Error(`instrumento "${value}" desconhecido (piano, bateria, lofi, lead)`);
    return { instrument: id };
  },
};

// ---------------------------------------------------------------- exportar
function pad(text, width) {
  return text.length >= width ? `${text} ` : text.padEnd(width);
}

/**
 * Gera o arquivo de texto do projeto.
 * @param {object} settings configurações (store)
 * @param {Array<{instrument:string, midi:number, start:number, duration:number, kind:string}>} items todos os itens
 */
export function serializeProjectFile(settings, items) {
  const { meter } = settings;
  const { beatTicks, unit } = meterInfo(meter);
  const beatName = unit === 8 ? 'colcheia ♪' : 'semínima ♩';
  const lines = [
    '# Beat Productor — projeto. Edite em qualquer editor de texto e importe no app.',
    '# Linhas que começam com # são comentários.',
    '#',
    '# Cada nota, uma por linha:   posição   nota   duração   [pausa]',
    '#   posição = compasso.tempo, com fração opcional:  1.1   2.3   1.2+1/2',
    `#   duração = em tempos (aqui 1 tempo = ${beatName}):  1   2   1/2   1+1/2`,
    `#   nota    = C4, F#3, Bb4… (faixa ${midiToName(LOWEST_MIDI)} a ${midiToName(HIGHEST_MIDI)}); na bateria também bumbo, caixa, chimbal, chimbal-aberto`,
    '#   "pausa" no fim da linha = pausa (bloco branco, silêncio que conta para o fim da música)',
    '',
    '[projeto]',
    `versao      = ${FILE_FORMAT_VERSION}`,
    `bpm         = ${settings.bpm}    # semínimas (♩) por minuto`,
    `compasso    = ${meter}`,
    `compassos   = ${settings.bars}`,
    `divisao     = ${settings.division}    # figura de cada célula do grid`,
    `loop        = ${settings.loop ? 'sim' : 'nao'}`,
    `repeticoes  = ${settings.loops}    # repetições do MP3 quando loop = sim`,
    `instrumento = ${SECTION_OF[settings.instrument]}`,
    '',
    '[volume]    # mixer, em % (100 = equilibrado)',
    ...INSTRUMENT_IDS.map((id) => `${pad(SECTION_OF[id], 8)}= ${settings.volumes[id]}`),
  ];

  for (const instrument of INSTRUMENT_IDS) {
    const own = items
      .filter((item) => item.instrument === instrument)
      .sort((a, b) => a.start - b.start || b.midi - a.midi);
    if (own.length === 0) continue;
    lines.push('', `[${SECTION_OF[instrument]}]`, '# posição  nota  duração');
    for (const item of own) {
      let line = pad(formatPosition(item.start, meter), 11) + pad(midiToName(item.midi), 6) + formatBeats(item.duration, beatTicks);
      if (item.kind === 'rest') line = `${pad(line, 28)}pausa`;
      else if (instrument === 'drums') line = `${pad(line, 28)}# ${drumPieceForMidi(item.midi).label.toLowerCase()}`;
      lines.push(line.trimEnd());
    }
  }
  return `${lines.join('\n')}\n`;
}

// ---------------------------------------------------------------- importar
/**
 * Lê o arquivo de texto.
 * @returns {{ ok: true, settings: object, items: Array, warnings: string[] } | { ok: false, errors: string[] }}
 */
export function parseProjectFile(text) {
  const errors = [];
  const fail = (lineNumber, message) => {
    if (errors.length < MAX_ERRORS) errors.push(`linha ${lineNumber}: ${message}`);
  };
  if (typeof text !== 'string' || text.trim() === '') return { ok: false, errors: ['arquivo vazio'] };

  // 1ª passada: separa as linhas por seção (o cabeçalho define o compasso usado nas posições).
  const sections = [];
  let current = null;
  text.replace(/^﻿/, '').split(/\r?\n/).forEach((rawLine, index) => {
    // Comentário: "#" no início ou depois de um espaço (o "#" de C#4 faz parte da nota).
    const line = rawLine.replace(/(^|\s)#.*$/, '').trim();
    if (line === '') return;
    const header = /^\[(.+)\]$/.exec(line);
    if (header) {
      current = { name: normalizeKey(header[1]), lineNumber: index + 1, lines: [] };
      sections.push(current);
    } else if (!current) {
      fail(index + 1, 'conteúdo antes da primeira seção (comece com [projeto])');
    } else {
      current.lines.push({ text: line, lineNumber: index + 1 });
    }
  });

  const settings = { ...defaultSettings(), volumes: { ...defaultSettings().volumes } };
  for (const section of sections) {
    if (section.name !== 'projeto' && section.name !== 'volume') continue;
    for (const { text: line, lineNumber } of section.lines) {
      const match = /^([^=]+)=(.*)$/.exec(line);
      if (!match) {
        fail(lineNumber, `esperado "chave = valor", encontrado "${line}"`);
        continue;
      }
      const key = normalizeKey(match[1]);
      const value = match[2].trim();
      try {
        if (section.name === 'volume') {
          const id = INSTRUMENT_OF_SECTION[key];
          if (!id) throw new Error(`instrumento "${match[1].trim()}" desconhecido no [volume]`);
          settings.volumes[id] = parseInteger(value, VOLUME, `volume de ${key}`);
        } else {
          if (!Object.hasOwn(HEADER_FIELDS, key)) throw new Error(`campo "${match[1].trim()}" desconhecido`);
          Object.assign(settings, HEADER_FIELDS[key](value));
        }
      } catch (error) {
        fail(lineNumber, error.message);
      }
    }
  }

  // 2ª passada: as notas, com o compasso já conhecido.
  const { beatTicks } = meterInfo(settings.meter);
  const items = [];
  for (const section of sections) {
    if (section.name === 'projeto' || section.name === 'volume') continue;
    const instrument = INSTRUMENT_OF_SECTION[section.name];
    if (!instrument) {
      fail(section.lineNumber, `seção [${section.name}] desconhecida (projeto, volume, piano, bateria, lofi, lead)`);
      continue;
    }
    for (const { text: line, lineNumber } of section.lines) {
      const parts = line.split(/\s+/);
      try {
        let kind = 'note';
        if (parts.length === 4 && normalizeKey(parts[3]) === 'pausa') {
          kind = 'rest';
          parts.pop();
        }
        if (parts.length === 3 && normalizeKey(parts[1]) === 'pausa') {
          // forma curta: "2.1  pausa  2"
          kind = 'rest';
          parts[1] = midiToName(instrument === 'drums' ? LOWEST_MIDI : DEFAULT_REST_MIDI);
        }
        if (parts.length !== 3) throw new Error('esperado "posição nota duração [pausa]"');
        const start = parsePosition(parts[0], settings.meter);
        const midi = parseNoteName(parts[1], instrument);
        if (midi < LOWEST_MIDI || midi > HIGHEST_MIDI) {
          throw new Error(`nota ${parts[1]} fora da faixa do grid (${midiToName(LOWEST_MIDI)} a ${midiToName(HIGHEST_MIDI)})`);
        }
        const duration = parseBeats(parts[2], beatTicks);
        if (duration <= 0) throw new Error('duração deve ser maior que zero');
        items.push({ instrument, midi, start, duration, kind });
      } catch (error) {
        fail(lineNumber, error.message);
      }
    }
  }

  if (errors.length > 0) return { ok: false, errors };

  const warnings = [];
  const gridEnd = lengthInTicks(settings.bars, settings.meter);
  const outside = items.filter((item) => item.start >= gridEnd).length;
  const sorted = [...items].sort((a, b) => a.instrument.localeCompare(b.instrument) || a.midi - b.midi || a.start - b.start);
  const overlaps = sorted.filter((item, i) => {
    const prev = sorted[i - 1];
    return prev && prev.instrument === item.instrument && prev.midi === item.midi && item.start < prev.start + prev.duration;
  }).length;
  if (overlaps > 0) warnings.push(`${overlaps} nota(s) sobrepostas na mesma linha: a de baixo no arquivo prevaleceu`);
  if (outside > 0) warnings.push(`${outside} nota(s) depois do fim do grid (ficam guardadas; aumente os compassos para vê-las)`);
  return { ok: true, settings, items, warnings };
}
