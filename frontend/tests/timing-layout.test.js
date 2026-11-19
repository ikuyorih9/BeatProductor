import assert from 'node:assert/strict';
import { test } from 'node:test';

import { CELL_WIDTH, DIVISIONS, METERS } from '../js/config.js';
import { cellAtX, computeLayout, dragToSpan, rowAtY } from '../js/core/layout.js';
import {
  cellWidthPx, divisionFitsMeter, formatBarBeat, formatClock, lengthInTicks, meterInfo, secondsPerTick, ticksPerBar, ticksPerCell,
  ticksToSeconds, toBoundedInt,
} from '../js/core/timing.js';

test('cada divisão é a figura da partitura (1/4 = semínima = 1 batida)', () => {
  assert.equal(ticksPerCell('1/4'), 12); // semínima ♩ = 1 batida do BPM
  assert.equal(ticksPerCell('1/8'), 6); // colcheia
  assert.equal(ticksPerCell('1/8T'), 4); // tercina de colcheia (3 por batida)
  assert.equal(ticksPerCell('1/16'), 3); // semicolcheia
  assert.equal(ticksPerCell('1/16T'), 2); // sextina
  assert.throws(() => ticksPerCell('1/3'));
});

test('a 60 BPM uma semínima dura 1 s, como no metrônomo', () => {
  assert.equal(ticksToSeconds(ticksPerCell('1/4'), 60), 1);
  assert.equal(ticksToSeconds(ticksPerCell('1/8'), 60), 0.5);
  assert.equal(ticksToSeconds(ticksPerCell('1/16'), 60), 0.25);
});

test('fórmulas de compasso', () => {
  assert.deepEqual(meterInfo('4/4'), { beats: 4, unit: 4, beatTicks: 12, barTicks: 48 });
  assert.deepEqual(meterInfo('3/4'), { beats: 3, unit: 4, beatTicks: 12, barTicks: 36 });
  assert.deepEqual(meterInfo('6/8'), { beats: 6, unit: 8, beatTicks: 6, barTicks: 36 });
  assert.equal(ticksPerBar('12/8'), 72);
  assert.equal(lengthInTicks(4, '3/4'), 144);
  assert.throws(() => meterInfo('7/9'));
  assert.deepEqual(meterInfo('3/8'), { beats: 3, unit: 8, beatTicks: 6, barTicks: 18 });
  assert.equal(ticksPerBar('7/8'), 42);
  assert.equal(formatBarBeat(18, '3/8'), '2.1');
});

test('células que não cabem no compasso (semínima em 3/8) são recusadas', () => {
  assert.equal(divisionFitsMeter('1/4', '3/8'), false); // 3/8 = 1 semínima e meia
  assert.equal(divisionFitsMeter('1/8T', '3/8'), false);
  for (const division of ['1/8', '1/16', '1/16T']) {
    for (const meter of Object.keys(METERS)) assert.ok(divisionFitsMeter(division, meter), `${division} em ${meter}`);
  }
  for (const meter of ['2/4', '3/4', '4/4', '5/4', '6/8', '12/8']) {
    for (const division of Object.keys(DIVISIONS)) assert.ok(divisionFitsMeter(division, meter), `${division} em ${meter}`);
  }
});

test('conversão de ticks para segundos', () => {
  assert.equal(secondsPerTick(120), 60 / (120 * 12));
  assert.equal(ticksToSeconds(12, 120), 0.5); // 1 batida a 120 BPM
  assert.equal(ticksToSeconds(48, 60), 4); // 1 compasso a 60 BPM
  assert.equal(lengthInTicks(4), 192);
});

test('largura da célula depende do BPM e fica dentro dos limites', () => {
  assert.ok(cellWidthPx(60, '1/16') > cellWidthPx(120, '1/16'));
  for (const bpm of [40, 120, 240]) {
    for (const division of Object.keys(DIVISIONS)) {
      const width = cellWidthPx(bpm, division);
      assert.ok(width >= CELL_WIDTH.MIN && width <= CELL_WIDTH.MAX, `${bpm} ${division} → ${width}`);
    }
  }
});

test('layout é consistente em qualquer divisão e compasso', () => {
  for (const meter of Object.keys(METERS)) {
    for (const division of Object.keys(DIVISIONS).filter((d) => divisionFitsMeter(d, meter))) {
      const layout = computeLayout({ bpm: 120, division, bars: 4, meter });
      assert.equal(layout.lengthTicks, 4 * ticksPerBar(meter));
      assert.ok(Number.isInteger(layout.totalCells));
      assert.equal(layout.width, layout.totalCells * layout.cellWidth);
      assert.ok(Math.abs(layout.barWidth * layout.bars - layout.width) < 1e-6);
      assert.ok(Math.abs(layout.pxPerTick * layout.lengthTicks - layout.width) < 1e-6);
      assert.equal(layout.beatsPerBar, METERS[meter].beats);
    }
  }
});

test('coordenadas → célula/linha, sempre dentro do grid', () => {
  const layout = computeLayout({ bpm: 120, division: '1/16', bars: 1 });
  assert.equal(cellAtX(layout, 0), 0);
  assert.equal(cellAtX(layout, layout.cellWidth * 2 + 1), 2);
  assert.equal(cellAtX(layout, -50), 0);
  assert.equal(cellAtX(layout, 1e6), layout.totalCells - 1);
  assert.equal(rowAtY(-3, 36), 0);
  assert.equal(rowAtY(23, 36), 1);
  assert.equal(rowAtY(1e6, 36), 35);
});

test('arraste vira intervalo de notas em qualquer direção', () => {
  const layout = computeLayout({ bpm: 120, division: '1/16', bars: 1 });
  assert.deepEqual(dragToSpan(layout, 2, 2), { start: 6, duration: 3 });
  assert.deepEqual(dragToSpan(layout, 2, 5), { start: 6, duration: 12 });
  assert.deepEqual(dragToSpan(layout, 5, 2), { start: 6, duration: 12 });
});

test('formatação de posição e relógio', () => {
  assert.equal(formatBarBeat(0), '1.1');
  assert.equal(formatBarBeat(12), '1.2');
  assert.equal(formatBarBeat(48), '2.1');
  assert.equal(formatBarBeat(36, '3/4'), '2.1');
  assert.equal(formatBarBeat(30, '6/8'), '1.6');
  assert.equal(formatClock(0), '0:00.0');
  assert.equal(formatClock(61.25), '1:01.2');
  assert.equal(formatClock(-1), '0:00.0');
});

test('toBoundedInt corrige entradas do usuário', () => {
  assert.equal(toBoundedInt('300', 40, 240, 120), 240);
  assert.equal(toBoundedInt('10', 40, 240, 120), 40);
  assert.equal(toBoundedInt('abc', 40, 240, 120), 120);
  assert.equal(toBoundedInt('', 40, 240, 120), 120);
  assert.equal(toBoundedInt('99', 40, 240, 120), 99);
});
