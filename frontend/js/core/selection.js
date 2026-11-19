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

/** Quantos itens selecionados SEPARAR cortaria (passam por alguma divisa de célula). */
export function countSplittable(items, selectedIds, cellTicks) {
  const selected = new Set(selectedIds);
  return items.filter((item) => {
    if (!selected.has(item.id)) return false;
    const nextBoundary = (Math.floor(item.start / cellTicks) + 1) * cellTicks;
    return nextBoundary < item.start + item.duration;
  }).length;
}

/**
 * Limita um arraste da seleção para que nenhum item saia do grid.
 * dRows > 0 = para baixo (notas mais graves). Retorna o deslocamento possível.
 * @param {{rowIndex:Map<number,number>, rowCount:number, lengthTicks:number}} bounds
 */
export function clampMove(items, dRows, dTicks, { rowIndex, rowCount, lengthTicks }) {
  if (items.length === 0) return { dRows: 0, dTicks: 0 };
  const rows = items.map((item) => rowIndex.get(item.midi));
  const minRow = Math.min(...rows);
  const maxRow = Math.max(...rows);
  const minStart = Math.min(...items.map((item) => item.start));
  const maxStart = Math.max(...items.map((item) => item.start));
  return {
    dRows: Math.min(Math.max(dRows, -minRow), rowCount - 1 - maxRow),
    // Nenhum item pode começar antes do 0 nem depois do fim do grid.
    dTicks: Math.min(Math.max(dTicks, -minStart), lengthTicks - 1 - maxStart),
  };
}

/**
 * Copia os itens selecionados (Ctrl+C) para uma "área de transferência" independente de
 * instrumento: posições relativas ao início do tempo (beat) onde a seleção começa.
 * `span` = tamanho do trecho arredondado para tempos inteiros — colar várias vezes em
 * sequência encaixa um trecho logo depois do outro.
 * @returns {{ items: Array<{midi:number, offset:number, duration:number, kind:string}>, span: number } | null}
 */
export function copyItems(items, selectedIds, beatTicks) {
  const selected = new Set(selectedIds);
  const chosen = items.filter((item) => selected.has(item.id));
  if (chosen.length === 0) return null;
  const origin = Math.floor(Math.min(...chosen.map((n) => n.start)) / beatTicks) * beatTicks;
  const end = Math.max(...chosen.map((n) => n.start + n.duration));
  return {
    items: chosen.map(({ midi, start, duration, kind }) => ({ midi, offset: start - origin, duration, kind })),
    span: Math.ceil((end - origin) / beatTicks) * beatTicks,
  };
}

/** Posiciona o conteúdo copiado no instrumento e no tick dados (Ctrl+V). */
export function pasteItems(clipboard, { instrument, start }) {
  return clipboard.items.map(({ midi, offset, duration, kind }) => ({
    instrument, midi, start: start + offset, duration, kind,
  }));
}
