import assert from 'node:assert/strict';
import { test } from 'node:test';

import { DIVISIONS, METERS } from '../js/config.js';
import { defaultSettings, sanitizeSettings } from '../js/core/project.js';
import { divisionFitsMeter } from '../js/core/timing.js';
import {
  formatBeats, formatPosition, parseBeats, parseNoteName, parsePosition, parseProjectFile, serializeProjectFile,
} from '../js/core/project-file.js';
import { Sequence } from '../js/core/sequence.js';

const sortItems = (items) => [...items].sort((a, b) => a.instrument.localeCompare(b.instrument)
  || a.start - b.start || a.midi - b.midi);

// ------------------------------------------------------------------ frações e posições
test('durações em tempos, como frações exatas', () => {
  assert.equal(formatBeats(12, 12), '1');
  assert.equal(formatBeats(6, 12), '1/2');
  assert.equal(formatBeats(18, 12), '1+1/2');
  assert.equal(formatBeats(4, 12), '1/3');
  assert.equal(formatBeats(2, 12), '1/6');
  assert.equal(formatBeats(3, 6), '1/2'); // em 6/8 o tempo é a colcheia
  for (const text of ['1', '1/2', '1+1/2', '1.5', '1,5', '3/4', '2+1/3']) {
    assert.equal(formatBeats(parseBeats(text, 12), 12), formatBeats(parseBeats(text, 12), 12));
  }
  assert.equal(parseBeats('1.5', 12), 18);
  assert.equal(parseBeats('1,5', 12), 18);
  assert.throws(() => parseBeats('1/5', 12), /não cabe no grid/);
  assert.throws(() => parseBeats('meio', 12), /não é uma quantidade/);
});

test('posições compasso.tempo(+fração) nos dois sentidos', () => {
  assert.equal(formatPosition(0, '4/4'), '1.1');
  assert.equal(formatPosition(18, '4/4'), '1.2+1/2');
  assert.equal(formatPosition(48, '4/4'), '2.1');
  assert.equal(formatPosition(36, '3/4'), '2.1');
  assert.equal(formatPosition(33, '6/8'), '1.6+1/2');
  for (const meter of Object.keys(METERS)) {
    for (let tick = 0; tick < 200; tick += 1) {
      assert.equal(parsePosition(formatPosition(tick, meter), meter), tick, `${meter} @ ${tick}`);
    }
  }
  assert.throws(() => parsePosition('1.5', '4/4'), /4 tempos/);
  assert.throws(() => parsePosition('0.1', '4/4'), /começa em 1/);
  assert.throws(() => parsePosition('1.1+1', '4/4'), /menor que 1 tempo/);
  assert.throws(() => parsePosition('abc', '4/4'), /posição/);
});

test('nomes de nota com sustenido, bemol, minúscula e peças da bateria', () => {
  assert.equal(parseNoteName('C4', 'piano'), 60);
  assert.equal(parseNoteName('c#4', 'piano'), 61);
  assert.equal(parseNoteName('Db4', 'piano'), 61);
  assert.equal(parseNoteName('Bb3', 'piano'), 58);
  assert.equal(parseNoteName('bumbo', 'drums'), 48);
  assert.equal(parseNoteName('caixa', 'drums'), 49);
  assert.throws(() => parseNoteName('bumbo', 'piano'), /inválida/);
  assert.throws(() => parseNoteName('H2', 'piano'), /inválida/);
});

// ------------------------------------------------------------------ ida e volta
test('exportar e importar devolve EXATAMENTE o mesmo projeto, em qualquer compasso e divisão', () => {
  const meters = Object.keys(METERS);
  const divisions = Object.keys(DIVISIONS);
  meters.forEach((meter, i) => {
    const settings = {
      ...defaultSettings(),
      instrument: ['piano', 'drums', 'lofi', 'lead'][i % 4],
      division: [...divisions.slice(i % divisions.length), ...divisions].find((d) => divisionFitsMeter(d, meter)),
      meter,
      bpm: 73 + i,
      bars: 3 + i,
      loop: i % 2 === 0,
      loops: 2 + i,
      volumes: { piano: 35, drums: 150, lofi: 0, lead: 95 },
    };
    const seq = new Sequence(10_000);
    seq.addNote({ instrument: 'piano', midi: 60, start: 0, duration: 12 });
    seq.addNote({ instrument: 'piano', midi: 61, start: 7, duration: 5 });
    seq.addRest({ instrument: 'piano', midi: 72, start: 40, duration: 2 });
    seq.addNote({ instrument: 'drums', midi: 48, start: 0, duration: 3 });
    seq.addNote({ instrument: 'drums', midi: 51, start: 33, duration: 3 });
    seq.addNote({ instrument: 'lofi', midi: 83, start: 100, duration: 70 });
    seq.addNote({ instrument: 'lead', midi: 48, start: 999, duration: 1 }); // além do grid: preservada
    const text = serializeProjectFile(settings, seq.toJSON());
    const result = parseProjectFile(text);
    assert.equal(result.ok, true, JSON.stringify(result.errors));
    assert.deepEqual(result.settings, settings, meter);
    assert.deepEqual(sortItems(result.items), sortItems(seq.toJSON()), meter);
  });
});

test('3/8: célula que não cabe é erro no arquivo e é corrigida no projeto salvo', () => {
  const result = parseProjectFile('[projeto]\ncompasso = 3/8\ndivisao = 1/4\n');
  assert.equal(result.ok, false);
  assert.match(result.errors[0], /não cabe no compasso 3\/8/);
  const ok = parseProjectFile('[projeto]\ncompasso = 3/8\ndivisao = 1/8\n[piano]\n2.3  C4  1+1/2\n');
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.items[0], { instrument: 'piano', midi: 60, start: 18 + 12, duration: 9, kind: 'note' });
  assert.equal(sanitizeSettings({ meter: '3/8', division: '1/4' }).division, '1/16');
});

test('o arquivo é legível: cabeçalho, volume e notas por instrumento', () => {
  const seq = new Sequence(192);
  seq.addNote({ instrument: 'piano', midi: 60, start: 0, duration: 12 });
  seq.addNote({ instrument: 'piano', midi: 64, start: 18, duration: 6 });
  seq.addRest({ instrument: 'piano', midi: 62, start: 48, duration: 24 });
  seq.addNote({ instrument: 'drums', midi: 48, start: 0, duration: 3 });
  const text = serializeProjectFile(defaultSettings(), seq.toJSON());
  assert.match(text, /\[projeto\]\nversao\s+= 1\nbpm\s+= 120/);
  assert.match(text, /compasso\s+= 4\/4/);
  assert.match(text, /\[volume\][^\n]*\npiano\s+= 100/);
  assert.match(text, /\[piano\]\n# posição  nota  duração\n1\.1\s+C4\s+1\n1\.2\+1\/2\s+E4\s+1\/2\n2\.1\s+D4\s+2\s+pausa\n/);
  assert.match(text, /\[bateria\]\n# posição  nota  duração\n1\.1\s+C3\s+1\/4\s+# bumbo/);
  assert.doesNotMatch(text, /\[lofi\]/); // instrumento sem notas não aparece
});

test('arquivo escrito à mão: comentários, acentos, campos faltando e forma curta de pausa', () => {
  const text = [
    '# minha música',
    '[Projeto]',
    'BPM = 90   # rápido',
    'Divisão = 1/8',
    'compasso = 3/4',
    '',
    '[bateria]',
    '1.1   bumbo  1/4',
    '1.2   caixa  1/4',
    '[piano]',
    '1.1  Eb4  1+1/2',
    '1.3  F#4  1  # sustenido seguido de comentário',
    '2.1  pausa  3',
  ].join('\r\n');
  const result = parseProjectFile(text);
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.equal(result.settings.bpm, 90);
  assert.equal(result.settings.division, '1/8');
  assert.equal(result.settings.meter, '3/4');
  assert.equal(result.settings.bars, defaultSettings().bars); // faltou → padrão
  assert.deepEqual(sortItems(result.items), sortItems([
    { instrument: 'drums', midi: 48, start: 0, duration: 3, kind: 'note' },
    { instrument: 'drums', midi: 49, start: 12, duration: 3, kind: 'note' },
    { instrument: 'piano', midi: 63, start: 0, duration: 18, kind: 'note' },
    { instrument: 'piano', midi: 66, start: 24, duration: 12, kind: 'note' },
    { instrument: 'piano', midi: 60, start: 36, duration: 36, kind: 'rest' },
  ]));
});

test('erros apontam a linha e o motivo; nada é importado pela metade', () => {
  const text = [
    '[projeto]',
    'bpm = 999',
    'tempo = 4',
    '[piano]',
    '1.1  C4',
    '1.9  C4  1',
    '1.1  C9  1',
    '[violino]',
  ].join('\n');
  const result = parseProjectFile(text);
  assert.equal(result.ok, false);
  assert.deepEqual(result.errors.map((e) => e.split(':')[0]), ['linha 2', 'linha 3', 'linha 5', 'linha 6', 'linha 7', 'linha 8']);
  assert.match(result.errors[0], /bpm 999 fora da faixa/);
  assert.match(result.errors[1], /campo "tempo" desconhecido/);
  assert.match(result.errors[4], /fora da faixa do grid/);
  assert.match(result.errors[5], /\[violino\] desconhecida/);
  assert.equal(parseProjectFile('').ok, false);
  assert.equal(parseProjectFile('1.1 C4 1').ok, false);
});

test('avisos: sobreposição na mesma linha e notas depois do fim do grid', () => {
  const text = '[projeto]\ncompassos = 1\n[piano]\n1.1 C4 2\n1.2 C4 1\n3.1 D4 1\n';
  const result = parseProjectFile(text);
  assert.equal(result.ok, true);
  assert.equal(result.warnings.length, 2);
  assert.match(result.warnings.join(' '), /sobrepostas/);
  assert.match(result.warnings.join(' '), /depois do fim do grid/);
});
