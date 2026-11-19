/**
 * Seleção por retângulo (pura, sem DOM).
 */
import { ROW_HEIGHT } from '../config.js';

/**
 * Ids dos itens que tocam o retângulo (em px, relativo ao grid).
 * @param {Array<{id:number, midi:number, start:number, duration:number}>} items
 * @param {{x1:number,y1:number,x2:number,y2:number}} rect cantos em qualquer ordem
 * @param {{pxPerTick:number, rowIndex:Map<number,number>}} geometry
 */
export function itemsInRect(items, rect, { pxPerTick, rowIndex }) {
  const left = Math.min(rect.x1, rect.x2) / pxPerTick;
  const right = Math.max(rect.x1, rect.x2) / pxPerTick;
  const topRow = Math.floor(Math.min(rect.y1, rect.y2) / ROW_HEIGHT);
  const bottomRow = Math.floor(Math.max(rect.y1, rect.y2) / ROW_HEIGHT);
  if (right <= left) return [];

  return items
    .filter((item) => {
      const row = rowIndex.get(item.midi);
      return row !== undefined && row >= topRow && row <= bottomRow
        && item.start < right && item.start + item.duration > left;
    })
    .map((item) => item.id);
}

/** Quantas linhas (instrumento + altura + tipo) têm 2+ itens selecionados — ou seja, o que UNIR faria. */
export function countMergeableGroups(items, selectedIds) {
  const selected = new Set(selectedIds);
  const counts = new Map();
  for (const item of items) {
    if (!selected.has(item.id)) continue;
    const key = `${item.instrument}|${item.midi}|${item.kind}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  let groups = 0;
  for (const count of counts.values()) if (count >= 2) groups += 1;
  return groups;
}
