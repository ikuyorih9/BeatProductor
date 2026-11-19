/**
 * Cursor de reprodução (linha vermelha no grid + marcador na régua).
 * Usa transform para mover sem forçar relayout a cada frame.
 */
export class Playhead {
  constructor({ line, marker, scroller, keysWidth }) {
    this.line = line;
    this.marker = marker;
    this.scroller = scroller;
    this.keysWidth = keysWidth;
    this.lastX = -1;
  }

  /**
   * @param {number} tick posição dentro do padrão
   * @param {number} pxPerTick escala atual do grid
   * @param {boolean} follow rolar a tela para acompanhar o cursor
   */
  update(tick, pxPerTick, follow) {
    const x = Math.round(tick * pxPerTick * 10) / 10;
    if (x !== this.lastX) {
      this.line.style.transform = `translateX(${x}px)`;
      this.marker.style.transform = `translateX(${x}px)`;
      this.lastX = x;
    }
    if (follow) this._follow(x);
  }

  /** Mantém o cursor visível: se sair da área visível, rola para deixá-lo perto da esquerda. */
  _follow(x) {
    const visibleStart = this.scroller.scrollLeft;
    const visibleWidth = this.scroller.clientWidth - this.keysWidth;
    if (visibleWidth <= 0) return;
    if (x < visibleStart || x > visibleStart + visibleWidth - 24) {
      this.scroller.scrollLeft = Math.max(0, x - visibleWidth * 0.1);
    }
  }

  /** Garante que o cursor fique visível (após INÍCIO/FIM). */
  reveal(tick, pxPerTick) {
    this._follow(Math.round(tick * pxPerTick));
  }
}
