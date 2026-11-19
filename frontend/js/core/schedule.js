/**
 * Cálculo puro de quais notas caem em uma janela de ticks absolutos.
 * Usado pelo agendador de áudio (lookahead) — em loop, o padrão se repete
 * a cada `lengthTicks`.
 *
 * @param {Array<{start:number,duration:number}>} notes notas ativas (já cortadas no fim do padrão)
 * @param {number} fromAbs início da janela (inclusivo)
 * @param {number} toAbs fim da janela (exclusivo)
 * @returns {Array<{note:object, absStart:number}>} ordenado por absStart
 */
export function notesInWindow(notes, fromAbs, toAbs, lengthTicks, loop) {
  const result = [];
  if (!(toAbs > fromAbs) || lengthTicks <= 0) return result;

  const firstRep = loop ? Math.floor(fromAbs / lengthTicks) : 0;
  const lastRep = loop ? Math.floor(toAbs / lengthTicks) : 0;

  for (let rep = Math.max(0, firstRep); rep <= lastRep; rep += 1) {
    const offset = rep * lengthTicks;
    for (const note of notes) {
      if (note.start >= lengthTicks) continue;
      const absStart = offset + note.start;
      if (absStart >= fromAbs && absStart < toAbs) result.push({ note, absStart });
    }
  }
  result.sort((a, b) => a.absStart - b.absStart);
  return result;
}
