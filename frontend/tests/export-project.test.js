import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildExportPayload, describeApiError, filenameFromDisposition } from '../js/core/export.js';
import { defaultSettings, parseProject, sanitizeSettings, serializeProject } from '../js/core/project.js';
import { Sequence } from '../js/core/sequence.js';

const settings = (overrides = {}) => ({ ...defaultSettings(), ...overrides });

function sequenceWithNote(lengthTicks = 192) {
  const seq = new Sequence(lengthTicks);
  seq.addNote({ instrument: 'piano', midi: 60, start: 0, duration: 12 });
  return seq;
}

test('payload de exportação segue o contrato da API', () => {
  const result = buildExportPayload(sequenceWithNote(), settings({ bpm: 120, loop: true, loops: 3 }));
  assert.equal(result.ok, true);
  assert.deepEqual(result.payload, {
    bpm: 120,
    length: 0.5, // uma passada vai até o fim da última nota (12 ticks = 1 batida = 0,5 s)
    loop: true,
    loops: 3,
    format: 'mp3',
    events: [{ time: 0, note: 'C4', duration: 0.5, instrument: 'piano', gain: 1 }],
  });
});

test('exportação sem notas é bloqueada com mensagem clara', () => {
  const result = buildExportPayload(new Sequence(192), settings());
  assert.equal(result.ok, false);
  assert.match(result.error, /pelo menos uma nota/);
});

test('exportação longa demais é bloqueada antes de chamar o servidor', () => {
  // Pausa no último tick de 64 compassos a 40 BPM = 384 s; × 32 loops = 12288 s > 1800 s
  const seq = sequenceWithNote(64 * 48);
  seq.addRest({ instrument: 'piano', midi: 60, start: 64 * 48 - 3, duration: 3 });
  const result = buildExportPayload(seq, settings({ bpm: 40, loop: true, loops: 32 }));
  assert.equal(result.ok, false);
  assert.match(result.error, /máximo 1800 s/);
  // Sem loop o mesmo projeto passa.
  assert.equal(buildExportPayload(seq, settings({ bpm: 40, loop: false, loops: 32 })).ok, true);
});

test('pausas estendem a passada exportada, mas não viram eventos', () => {
  const seq = sequenceWithNote();
  seq.addRest({ instrument: 'drums', midi: 50, start: 36, duration: 12 }); // pausa até o fim do compasso
  const { payload } = buildExportPayload(seq, settings({ bpm: 120 }));
  assert.equal(payload.length, 2); // 48 ticks = 1 compasso = 2 s
  assert.equal(payload.events.length, 1);
});

test('só pausas não podem ser exportadas', () => {
  const seq = new Sequence(192);
  seq.addRest({ instrument: 'piano', midi: 60, start: 0, duration: 12 });
  assert.equal(buildExportPayload(seq, settings()).ok, false);
});

test('todos os eventos ficam dentro do padrão (time < length) em qualquer divisão', () => {
  const seq = new Sequence(192);
  seq.addNote({ instrument: 'lead', midi: 70, start: 190, duration: 2 }); // última célula 1/6
  const { payload } = buildExportPayload(seq, settings({ bpm: 133 }));
  for (const event of payload.events) assert.ok(event.time < payload.length);
});

test('mensagens de erro da API ficam legíveis', () => {
  const body = { detail: [{ loc: ['body', 'events', 0, 'note'], msg: 'String should match pattern' }] };
  assert.equal(describeApiError(422, body), 'String should match pattern (events.0.note)');
  assert.equal(describeApiError(422, { detail: [{ loc: ['body'], msg: 'Value error, áudio final muito longo' }] }), 'áudio final muito longo');
  assert.equal(describeApiError(500, { detail: 'Erro interno ao gerar o áudio.' }), 'Erro interno ao gerar o áudio.');
  assert.equal(describeApiError(502, null), 'O servidor respondeu com erro 502.');
});

test('nome do arquivo vem do Content-Disposition', () => {
  assert.equal(filenameFromDisposition('attachment; filename="beat-productor-20261119-101010.mp3"', 'x.mp3'), 'beat-productor-20261119-101010.mp3');
  assert.equal(filenameFromDisposition(null, 'x.mp3'), 'x.mp3');
});

test('configurações salvas são saneadas', () => {
  assert.deepEqual(sanitizeSettings(null), defaultSettings());
  assert.deepEqual(
    sanitizeSettings({
      instrument: 'tuba', division: '1/3', meter: '7/9', bpm: 9999, bars: 'x', loop: 'sim', loops: -4,
      volumes: { piano: 999, lead: 'x' },
    }),
    { ...defaultSettings(), bpm: 240, loops: 1, volumes: { ...defaultSettings().volumes, piano: 200 } },
  );
  const valid = {
    instrument: 'lofi', division: '1/16T', meter: '6/8', bpm: 90, bars: 8, loop: true, loops: 7,
    volumes: { piano: 50, drums: 0, bass: 80, lofi: 100, lead: 120 },
  };
  assert.deepEqual(sanitizeSettings(valid), valid);
  // Projeto salvo antes do baixo existir: abre com o baixo em 100%.
  const old = sanitizeSettings({ ...valid, volumes: { piano: 50, drums: 0, lofi: 100, lead: 120 } });
  assert.equal(old.volumes.bass, 100);
  assert.equal(old.volumes.piano, 50);
  assert.equal(sanitizeSettings({ division: 'toString' }).division, defaultSettings().division);
});

test('projeto ida e volta e rejeição de dados corrompidos', () => {
  const seq = sequenceWithNote();
  const text = serializeProject(settings({ bpm: 100 }), seq);
  const parsed = parseProject(text);
  assert.equal(parsed.settings.bpm, 100);
  assert.deepEqual(parsed.notes, seq.toJSON());
  for (const bad of [null, '', '{', '[]', '{"version":99}', 'null']) assert.equal(parseProject(bad), null);
  assert.deepEqual(parseProject('{"version":1,"notes":"x"}').notes, []);
});

test('projetos salvos na v1 migram a divisão para o nome da figura (mesma célula)', () => {
  const legacy = (division) => parseProject(JSON.stringify({ version: 1, settings: { division }, notes: [] })).settings.division;
  assert.equal(legacy('1/2'), '1/8'); // 2 células por batida = colcheia
  assert.equal(legacy('1/4'), '1/16'); // 4 células por batida = semicolcheia
  assert.equal(legacy('1/6'), '1/16T');
  const v1 = parseProject(JSON.stringify({ version: 1, settings: { bpm: 90 }, notes: [] })).settings;
  assert.equal(v1.meter, '4/4');
  assert.deepEqual(v1.volumes, defaultSettings().volumes);
});

test('a ferramenta ativa não vai para o projeto salvo', () => {
  const text = serializeProject({ ...settings(), tool: 'select' }, new Sequence(192));
  assert.equal(JSON.parse(text).settings.tool, undefined);
});

test('projeto salvo v4: o baixo sobe uma oitava no grid (agora soa duas abaixo da tecla) e continua soando igual', () => {
  const notes = [
    { instrument: 'bass', midi: 48, start: 0, duration: 6, kind: 'note' },
    { instrument: 'bass', midi: 80, start: 6, duration: 6, kind: 'note' },
    { instrument: 'piano', midi: 48, start: 0, duration: 6, kind: 'note' },
  ];
  const parsed = parseProject(JSON.stringify({ version: 4, settings: {}, notes }));
  assert.deepEqual(parsed.notes.map((n) => [n.instrument, n.midi]), [['bass', 60], ['piano', 48]]);
  const current = parseProject(JSON.stringify({ version: 5, settings: {}, notes }));
  assert.deepEqual(current.notes.map((n) => n.midi), [48, 80, 48]);
});
