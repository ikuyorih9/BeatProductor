/**
 * Store mínima de estado da aplicação com assinatura de mudanças.
 * `set` só notifica quando algum valor realmente muda.
 */
export function createStore(initialState) {
  let state = { ...initialState };
  const listeners = new Set();

  return {
    get() {
      return state;
    },
    set(patch) {
      const changed = Object.keys(patch).filter((key) => !Object.is(state[key], patch[key]));
      if (changed.length === 0) return [];
      const previous = state;
      state = { ...state, ...patch };
      for (const listener of listeners) listener(state, previous, changed);
      return changed;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
