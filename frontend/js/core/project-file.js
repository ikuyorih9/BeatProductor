/**
 * Arquivo de projeto em TEXTO (exportar/importar) — fácil de ler e escrever à mão.
 *
 *   [projeto]            cabeçalho: os mesmos campos do cabeçalho do app
 *   bpm = 120
 *   compasso = 4/4
 *   ...
 *   [volume]             mixer (0–200 %)
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
import {
  DRUM_HIGHEST_MIDI, DRUM_LOWEST_MIDI, DRUM_PIECES,
} from '../config.js';
import {
  drumPieceForMidi, isPlayable, migrateBottomKitMidi, migrateDrumItems, migrateLegacyDrumMidi, midiToName,
  NOTE_NAMES,
} from './music.js';
import { defaultSettings } from './project.js';
import { divisionFitsMeter, lengthInTicks, meterInfo } from './timing.js';

/**
 * Versões do arquivo:
 *   1 — bateria com 4 peças repetidas em todas as teclas (C bumbo, C# caixa, D/D# chimbal…);
 *   2 — bateria com 8 peças em teclas fixas embaixo do grid, C3 a G3;
 *   3 — o kit de 8 peças no centro do grid, D4 a A4 (ver DRUM_PIECES).
 * Arquivos antigos são migrados. Arquivo sem "versao" é lido como a versão atual. Nomes de peça
 * (bumbo, caixa…) valem em qualquer versão e nunca são convertidos.
 */
export const FILE_FORMAT_VERSION = 3;

/** Conversão das notas de bateria escritas como nota (C3, D#4…) em arquivos de versões antigas. */
const DRUM_MIGRATION = Object.freeze({ 1: migrateLegacyDrumMidi, 2: migrateBottomKitMidi });

/** Nome da seção de cada instrumento no arquivo (em português, como no app). */
const SECTION_OF = Object.freeze({ piano: 'piano', drums: 'bateria', bass: 'baixo', lofi: 'lofi', lead: 'lead' });
const INSTRUMENT_OF_SECTION = Object.freeze({
  piano: 'piano', bateria: 'drums', drums: 'drums', baixo: 'bass', bass: 'bass', lofi: 'lofi', lead: 'lead',
});
/** Nomes das peças aceitos no lugar da nota, na bateria (viram a tecla da peça no kit). */
const ALIASES_BY_PIECE = Object.freeze({
  kick: ['bumbo', 'kick'],
  snare: ['caixa', 'snare'],
  hihat: ['chimbal', 'hihat', 'chimbal-fechado', 'hihat-fechado', 'chimbal-aberto', 'hihat-aberto'],
  floor_tom: ['surdo', 'floor-tom'],
  tom2: ['tom-2', 'tom2'],
  tom1: ['tom-1', 'tom1'],
  ride: ['ride', 'conducao'],
  crash: ['ataque', 'prato-de-ataque', 'prato', 'crash'],
  tambourine: ['pandeirola', 'tamborim', 'tambourine'],
  jam_block: ['jam-block', 'jamblock', 'bloco'],
  cowbell: ['cowbell', 'campana'],
  rototoms: ['rototons', 'rototom', 'rototoms'],
  octobans: ['octobans', 'octoban'],
  splash: ['splash'],
  china: ['china'],
  stack: ['stack'],
  bell: ['bell', 'sino'],
});
const DRUM_ALIASES = Object.freeze(Object.fromEntries(
  DRUM_PIECES.flatMap((piece) => ALIASES_BY_PIECE[piece.id].map((alias) => [alias, piece.midi])),
));
const DRUM_ALIAS_HINT = 'bumbo, caixa, chimbal, surdo, tom-2, tom-1, ride, ataque, splash, china, stack, bell, octobans, rototons, cowbell, jam-block, pandeirola';
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
/** "C4", "c#3", "Bb4", e na bateria também "bumbo", "surdo"… → MIDI. */
export function parseNoteName(text, instrument) {
  const token = String(text).trim();
  const alias = normalizeKey(token);
  if (instrument === 'drums' && Object.hasOwn(DRUM_ALIASES, alias)) return DRUM_ALIASES[alias];
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

/** Chave interna (não vai para as configurações) com a versão lida do arquivo. */
const VERSION_KEY = Symbol('versao');

const HEADER_FIELDS = {
  versao: (value) => {
    const version = Number(value);
    if (!Number.isInteger(version) || version < 1) throw new Error(`versao "${value}" inválida`);
    if (version > FILE_FORMAT_VERSION) throw new Error(`arquivo da versão ${value}; este app lê até a ${FILE_FORMAT_VERSION}`);
    return { [VERSION_KEY]: version };
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
    if (!id) throw new Error(`instrumento "${value}" desconhecido (piano, bateria, baixo, lofi, lead)`);
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
    `#   nota    = C4, F#3, Bb4… (faixa ${midiToName(LOWEST_MIDI)} a ${midiToName(HIGHEST_MIDI)})`,
    `#   bateria = só as teclas ${midiToName(DRUM_LOWEST_MIDI)} a ${midiToName(DRUM_HIGHEST_MIDI)}, ou o nome da peça: ${DRUM_ALIAS_HINT}`,
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
      else if (instrument === 'drums') line = `${pad(line, 28)}# ${drumPieceForMidi(item.midi)?.label.toLowerCase() ?? 'fora do kit'}`;
      lines.push(line.trimEnd());
    }
  }
  return `${lines.join('\n')}\n`;
}

// ---------------------------------------------------------------- importar
/**
 * Lê o arquivo de texto.
 * @returns {{ ok: true, settings: object, items: Array, warnings: string[], notices: string[] } | { ok: false, errors: string[] }}
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

  if (errors.length === 0 && !divisionFitsMeter(settings.division, settings.meter)) {
    errors.push(`divisão ${settings.division} não cabe no compasso ${settings.meter} (use 1/8, 1/16 ou 1/16T)`);
  }

  // Versão do arquivo (sem "versao" = atual). Até a v2 a bateria ficava em outras teclas.
  const version = settings[VERSION_KEY] ?? FILE_FORMAT_VERSION;
  delete settings[VERSION_KEY];
  const migrateDrum = DRUM_MIGRATION[version] ?? null;

  // 2ª passada: as notas, com o compasso já conhecido.
  const { beatTicks } = meterInfo(settings.meter);
  const items = [];
  for (const section of sections) {
    if (section.name === 'projeto' || section.name === 'volume') continue;
    const instrument = INSTRUMENT_OF_SECTION[section.name];
    if (!instrument) {
      fail(section.lineNumber, `seção [${section.name}] desconhecida (projeto, volume, piano, bateria, baixo, lofi, lead)`);
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
          parts[1] = instrument === 'drums' ? 'bumbo' : midiToName(DEFAULT_REST_MIDI);
        }
        if (parts.length !== 3) throw new Error('esperado "posição nota duração [pausa]"');
        const start = parsePosition(parts[0], settings.meter);
        let midi = parseNoteName(parts[1], instrument);
        const isAlias = instrument === 'drums' && Object.hasOwn(DRUM_ALIASES, normalizeKey(parts[1]));
        if (instrument === 'drums' && migrateDrum && !isAlias) midi = migrateDrum(midi);
        if (midi < LOWEST_MIDI || midi > HIGHEST_MIDI) {
          throw new Error(`nota ${parts[1]} fora da faixa do grid (${midiToName(LOWEST_MIDI)} a ${midiToName(HIGHEST_MIDI)})`);
        }
        if (!isPlayable(instrument, midi)) {
          throw new Error(`a nota ${parts[1]} não é uma peça da bateria (use ${midiToName(DRUM_LOWEST_MIDI)} a ${midiToName(DRUM_HIGHEST_MIDI)} ou ${DRUM_ALIAS_HINT})`);
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
  // Peças antigas que caíram na mesma tecla não podem se sobrepor (a anterior é encurtada).
  if (migrateDrum) items.splice(0, items.length, ...migrateDrumItems(items, (midi) => midi));

  const warnings = [];
  /** Avisos informativos (não são problemas): conversões feitas na importação. */
  const notices = [];
  if (migrateDrum && items.some((item) => item.instrument === 'drums')) {
    notices.push(version === 1
      ? 'bateria de um arquivo antigo convertida para o kit novo (chimbal aberto virou chimbal)'
      : `bateria de um arquivo antigo movida para as teclas atuais do kit (${midiToName(DRUM_LOWEST_MIDI)} a ${midiToName(DRUM_HIGHEST_MIDI)})`);
  }
  const gridEnd = lengthInTicks(settings.bars, settings.meter);
  const outside = items.filter((item) => item.start >= gridEnd).length;
  const sorted = [...items].sort((a, b) => a.instrument.localeCompare(b.instrument) || a.midi - b.midi || a.start - b.start);
  const overlaps = sorted.filter((item, i) => {
    const prev = sorted[i - 1];
    return prev && prev.instrument === item.instrument && prev.midi === item.midi && item.start < prev.start + prev.duration;
  }).length;
  if (overlaps > 0) warnings.push(`${overlaps} nota(s) sobrepostas na mesma linha: a de baixo no arquivo prevaleceu`);
  if (outside > 0) warnings.push(`${outside} nota(s) depois do fim do grid (ficam guardadas; aumente os compassos para vê-las)`);
  return { ok: true, settings, items, warnings, notices };
}
