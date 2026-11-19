/**
 * Cabeçalho (configurações da música) + barra de edição (ferramentas, UNIR/SEPARAR,
 * apagar/limpar) + mixer.
 * Os controles escrevem na store; a store é a fonte da verdade e
 * re-sincroniza os controles (ex.: valor fora da faixa é corrigido no blur).
 */
import { BARS, BPM, DIVISIONS, INSTRUMENTS, LOOPS, METERS, VOLUME } from '../config.js';
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

/** Um canal do mixer por instrumento: ● Nome [slider] 100% (duplo clique volta a 100%). */
function buildMixer(container, store) {
  const channels = {};
  for (const instrument of INSTRUMENTS) {
    const slider = createElement('input', 'mixer-slider', {
      type: 'range',
      id: `volume-${instrument.id}`,
      min: String(VOLUME.MIN),
      max: String(VOLUME.MAX),
      step: '5',
      'aria-label': `Volume: ${instrument.label}`,
      title: `Volume: ${instrument.label} (duplo clique = 100%)`,
    });
    slider.style.accentColor = instrument.color;
    const value = createElement('span', 'mixer-value');
    const dot = createElement('span', 'mixer-dot');
    dot.style.background = instrument.color;
    const name = createElement('span', '', { text: instrument.label.split(' ')[0] });
    const channel = createElement('label', 'mixer-channel');
    channel.append(dot, name, slider, value);
    container.appendChild(channel);

    const setVolume = (percent) => {
      store.set({ volumes: { ...store.get().volumes, [instrument.id]: percent } });
    };
    slider.addEventListener('input', () => setVolume(Number(slider.value)));
    slider.addEventListener('dblclick', () => setVolume(VOLUME.DEFAULT));
    channels[instrument.id] = { slider, value, channel };
  }

  return (volumes) => {
    for (const [id, { slider, value, channel }] of Object.entries(channels)) {
      const percent = volumes[id];
      if (Number(slider.value) !== percent) slider.value = String(percent);
      value.textContent = `${percent}%`;
      channel.classList.toggle('is-muted', percent === 0);
    }
  };
}

/**
 * @param {object} store
 * @param {object} actions callbacks dos botões
 */
export function initHeader(store, actions) {
  const instrumentSelect = byId('instrument-select');
  const meterSelect = byId('meter-select');
  const divisionSelect = byId('division-select');
  const bpmInput = byId('bpm-input');
  const barsInput = byId('bars-input');
  const loopCheckbox = byId('loop-checkbox');
  const loopsInput = byId('loops-input');
  const exportButton = byId('export-button');
  const exportProjectButton = byId('export-project-button');
  const importButton = byId('import-button');
  const importFile = byId('import-file');
  const toolDraw = byId('tool-draw');
  const toolSelect = byId('tool-select');
  const mergeButton = byId('merge-button');
  const splitButton = byId('split-button');
  const deleteButton = byId('delete-button');
  const clearButton = byId('clear-button');
  const clearAllButton = byId('clear-all-button');

  for (const instrument of INSTRUMENTS) {
    instrumentSelect.appendChild(createElement('option', '', { value: instrument.id, text: instrument.label }));
  }
  for (const meter of Object.keys(METERS)) {
    meterSelect.appendChild(createElement('option', '', { value: meter, text: meter }));
  }
  for (const [division, { label }] of Object.entries(DIVISIONS)) {
    divisionSelect.appendChild(createElement('option', '', { value: division, text: label }));
  }

  instrumentSelect.addEventListener('change', () => store.set({ instrument: instrumentSelect.value }));
  meterSelect.addEventListener('change', () => store.set({ meter: meterSelect.value }));
  divisionSelect.addEventListener('change', () => store.set({ division: divisionSelect.value }));
  loopCheckbox.addEventListener('change', () => store.set({ loop: loopCheckbox.checked }));
  bindNumberInput(bpmInput, store, 'bpm', BPM);
  bindNumberInput(barsInput, store, 'bars', BARS);
  bindNumberInput(loopsInput, store, 'loops', LOOPS);

  exportButton.addEventListener('click', () => actions.onExport());
  exportProjectButton.addEventListener('click', () => actions.onExportProject());
  importButton.addEventListener('click', () => importFile.click());
  importFile.addEventListener('change', () => {
    const [file] = importFile.files;
    importFile.value = ''; // permite reimportar o mesmo arquivo
    if (file) actions.onImportProject(file);
  });
  toolDraw.addEventListener('click', () => store.set({ tool: 'draw' }));
  toolSelect.addEventListener('click', () => store.set({ tool: 'select' }));
  mergeButton.addEventListener('click', () => actions.onMerge());
  splitButton.addEventListener('click', () => actions.onSplit());
  deleteButton.addEventListener('click', () => actions.onDelete());
  clearButton.addEventListener('click', () => actions.onClear());
  clearAllButton.addEventListener('click', () => actions.onClearAll());

  const renderMixer = buildMixer(byId('mixer'), store);
  const colorOf = Object.fromEntries(INSTRUMENTS.map((i) => [i.id, i.color]));

  function render(state) {
    instrumentSelect.value = state.instrument;
    // Faixa colorida = cor das notas do instrumento atual no grid.
    instrumentSelect.style.borderLeft = `6px solid ${colorOf[state.instrument]}`;
    meterSelect.value = state.meter;
    divisionSelect.value = state.division;
    loopCheckbox.checked = state.loop;
    loopsInput.disabled = !state.loop;
    toolDraw.classList.toggle('is-active', state.tool !== 'select');
    toolSelect.classList.toggle('is-active', state.tool === 'select');
    toolDraw.setAttribute('aria-pressed', String(state.tool !== 'select'));
    toolSelect.setAttribute('aria-pressed', String(state.tool === 'select'));
    // Não sobrescreve um campo que o usuário está editando.
    if (document.activeElement !== bpmInput) bpmInput.value = String(state.bpm);
    if (document.activeElement !== barsInput) barsInput.value = String(state.bars);
    if (document.activeElement !== loopsInput) loopsInput.value = String(state.loops);
    renderMixer(state.volumes);
  }

  render(store.get());
  store.subscribe((state) => render(state));

  return {
    /**
     * Estado dos botões que dependem da seleção.
     * @param {{selected:number, mergeable:number, splittable:number}} counts
     */
    setSelectionState({ selected, mergeable, splittable }) {
      mergeButton.disabled = mergeable === 0;
      mergeButton.classList.toggle('btn-ready', mergeable > 0);
      mergeButton.textContent = selected > 0 ? `UNIR (${selected})` : 'UNIR';
      splitButton.disabled = splittable === 0;
      splitButton.classList.toggle('btn-ready', splittable > 0);
      splitButton.textContent = splittable > 0 ? `SEPARAR (${splittable})` : 'SEPARAR';
      deleteButton.disabled = selected === 0;
      deleteButton.classList.toggle('btn-danger-ready', selected > 0);
    },
    setExporting(busy) {
      exportButton.disabled = busy;
      exportButton.textContent = busy ? 'Gerando…' : 'Exportar MP3';
    },
  };
}
