/**
 * Cabeçalho: instrumento, divisão, BPM, compassos, loop e ações.
 * Os controles escrevem na store; a store é a fonte da verdade e
 * re-sincroniza os controles (ex.: valor fora da faixa é corrigido no blur).
 */
import { BARS, BPM, DIVISIONS, INSTRUMENTS, LOOPS } from '../config.js';
import { toBoundedInt } from '../core/timing.js';
import { byId, createElement } from './dom.js';

/** Liga um <input type=number> a uma chave numérica da store. */
function bindNumberInput(input, store, key, { MIN, MAX }) {
  input.min = String(MIN);
  input.max = String(MAX);
  input.step = '1';

  // Enquanto digita: aplica em tempo real somente valores válidos.
  input.addEventListener('input', () => {
    const raw = Number(input.value);
    const valid = input.value !== '' && Number.isInteger(raw) && raw >= MIN && raw <= MAX;
    input.classList.toggle('is-invalid', !valid);
    if (valid) store.set({ [key]: raw });
  });

  // Ao sair do campo / Enter: corrige para a faixa permitida.
  input.addEventListener('change', () => {
    const value = toBoundedInt(input.value, MIN, MAX, store.get()[key]);
    input.classList.remove('is-invalid');
    input.value = String(value);
    store.set({ [key]: value });
  });
}

export function initHeader(store, { onExport, onClear }) {
  const instrumentSelect = byId('instrument-select');
  const divisionSelect = byId('division-select');
  const bpmInput = byId('bpm-input');
  const barsInput = byId('bars-input');
  const loopCheckbox = byId('loop-checkbox');
  const loopsInput = byId('loops-input');
  const exportButton = byId('export-button');
  const clearButton = byId('clear-button');

  for (const instrument of INSTRUMENTS) {
    instrumentSelect.appendChild(createElement('option', '', { value: instrument.id, text: instrument.label }));
  }
  for (const division of Object.keys(DIVISIONS)) {
    divisionSelect.appendChild(createElement('option', '', { value: division, text: division }));
  }

  instrumentSelect.addEventListener('change', () => store.set({ instrument: instrumentSelect.value }));
  divisionSelect.addEventListener('change', () => store.set({ division: divisionSelect.value }));
  loopCheckbox.addEventListener('change', () => store.set({ loop: loopCheckbox.checked }));
  bindNumberInput(bpmInput, store, 'bpm', BPM);
  bindNumberInput(barsInput, store, 'bars', BARS);
  bindNumberInput(loopsInput, store, 'loops', LOOPS);

  exportButton.addEventListener('click', () => onExport());
  clearButton.addEventListener('click', () => onClear());

  function render(state) {
    instrumentSelect.value = state.instrument;
    divisionSelect.value = state.division;
    loopCheckbox.checked = state.loop;
    loopsInput.disabled = !state.loop;
    // Não sobrescreve um campo que o usuário está editando.
    if (document.activeElement !== bpmInput) bpmInput.value = String(state.bpm);
    if (document.activeElement !== barsInput) barsInput.value = String(state.bars);
    if (document.activeElement !== loopsInput) loopsInput.value = String(state.loops);
  }

  render(store.get());
  store.subscribe((state) => render(state));

  return {
    setExporting(busy) {
      exportButton.disabled = busy;
      exportButton.textContent = busy ? 'Gerando…' : 'Exportar MP3';
    },
  };
}
