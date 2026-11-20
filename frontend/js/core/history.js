/**
 * Histórico para desfazer/refazer (Ctrl+Z / Ctrl+Y).
 *
 * Guarda "fotos" do projeto: `{ notes, settings }`, onde `notes` é a lista de itens serializada
 * (string, para comparar barato) e `settings` é opcional (só quando a ação mudou configurações
 * junto com as notas, como importar um projeto).
 * Módulo puro (sem DOM) — testado em frontend/tests/history.test.js.
 */
export const HISTORY_LIMIT = 200;

export class UndoHistory {
  /** @param {{notes: string, settings?: object}} initial estado atual do projeto */
  constructor(initial, limit = HISTORY_LIMIT) {
    this.current = initial;
    this.limit = limit;
    this.undoStack = [];
    this.redoStack = [];
  }

  /**
   * Registra o novo estado depois de uma edição. Não faz nada se as notas não mudaram.
   * `previousSettings`: configurações de ANTES da edição, quando ela também as mudou.
   * @returns {boolean} se um passo foi registrado
   */
  record(state, previousSettings = null) {
    if (state.notes === this.current.notes && !previousSettings) return false;
    this.undoStack.push(previousSettings ? { ...this.current, settings: previousSettings } : this.current);
    if (this.undoStack.length > this.limit) this.undoStack.shift();
    this.redoStack = [];
    this.current = { notes: state.notes };
    return true;
  }

  get canUndo() {
    return this.undoStack.length > 0;
  }

  get canRedo() {
    return this.redoStack.length > 0;
  }

  /**
   * Volta um passo. `currentSettings` = configurações atuais (guardadas para o refazer quando o
   * passo desfeito mexia nelas). Retorna o estado a aplicar, ou null.
   */
  undo(currentSettings = null) {
    return this._step(this.undoStack, this.redoStack, currentSettings);
  }

  redo(currentSettings = null) {
    return this._step(this.redoStack, this.undoStack, currentSettings);
  }

  _step(from, to, currentSettings) {
    const target = from.pop();
    if (!target) return null;
    to.push(target.settings ? { notes: this.current.notes, settings: currentSettings } : { notes: this.current.notes });
    this.current = { notes: target.notes };
    return target;
  }
}
