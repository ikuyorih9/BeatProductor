import assert from 'node:assert/strict';
import { test } from 'node:test';

import { CELL_WIDTH } from '../js/config.js';
import { cellAtX, computeLayout, dragToSpan, rowAtY } from '../js/core/layout.js';
import {
  cellWidthPx, formatBarBeat, formatClock, lengthInTicks, secondsPerTick, ticksPerCell, ticksToSeconds, toBoundedInt,
} from '../js/core/timing.js';

test('ticks por célula são inteiros para todas as divisões', () => {
  assert.equal(ticksPerCell('1/2'), 6);
  assert.equal(ticksPerCell('1/4'), 3);
  assert.equal(ticksPerCell('1/6'), 2);
  assert.throws(() => ticksPerCell('1/3'));
});

test('conversão de ticks para segundos', () => {
  assert.equal(secondsPerTick(120), 60 / (120 * 12));
  assert.equal(ticksToSeconds(12, 120), 0.5); // 1 batida a 120 BPM
  assert.equal(ticksToSeconds(48, 60), 4); // 1 compasso a 60 BPM
  assert.equal(lengthInTicks(4), 192);
});

test('largura da célula depende do BPM e fica dentro dos limites', () => {
  assert.ok(cellWidthPx(60, '1/4') > cellWidthPx(120, '1/4'));
  for (const bpm of [40, 120, 240]) {
    for (const division of ['1/2', '1/4', '1/6']) {
      const width = cellWidthPx(bpm, division);
      assert.ok(width >= CELL_WIDTH.MIN && width <= CELL_WIDTH.MAX, `${bpm} ${division} → ${width}`);
    }
  }
});

test('layout é consistente', () => {
  for (const division of ['1/2', '1/4', '1/6']) {
    const layout = computeLayout({ bpm: 120, division, bars: 4 });
    assert.equal(layout.lengthTicks, 192);
    assert.ok(Number.isInteger(layout.totalCells));
    assert.equal(layout.width, layout.totalCells * layout.cellWidth);
    assert.equal(layout.barWidth * layout.bars, layout.width);
    assert.equal(layout.pxPerTick * layout.lengthTicks, layout.width);
  }
});

test('coordenadas → célula/linha, sempre dentro do grid', () => {
  const layout = computeLayout({ bpm: 120, division: '1/4', bars: 1 });
  assert.equal(cellAtX(layout, 0), 0);
  assert.equal(cellAtX(layout, layout.cellWidth * 2 + 1), 2);
  assert.equal(cellAtX(layout, -50), 0);
  assert.equal(cellAtX(layout, 1e6), layout.totalCells - 1);
  assert.equal(rowAtY(-3, 36), 0);
  assert.equal(rowAtY(23, 36), 1);
  assert.equal(rowAtY(1e6, 36), 35);
});

test('arraste vira intervalo de notas em qualquer direção', () => {
  const layout = computeLayout({ bpm: 120, division: '1/4', bars: 1 });
  assert.deepEqual(dragToSpan(layout, 2, 2), { start: 6, duration: 3 });
  assert.deepEqual(dragToSpan(layout, 2, 5), { start: 6, duration: 12 });
  assert.deepEqual(dragToSpan(layout, 5, 2), { start: 6, duration: 12 });
});

test('formatação de posição e relógio', () => {
  assert.equal(formatBarBeat(0), '1.1');
  assert.equal(formatBarBeat(12), '1.2');
  assert.equal(formatBarBeat(48), '2.1');
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
