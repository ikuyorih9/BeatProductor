/**
 * Ponto de entrada do frontend: cria o estado, os componentes e liga tudo.
 */
import {
  BARS, BPM, DEFAULT_DIVISION, DEFAULT_INSTRUMENT, INSTRUMENTS, LOOPS, LOWEST_MIDI, OCTAVES,
} from './config.js';
import { computeLayout } from './core/layout.js';
import { buildRange } from './core/music.js';
import { Sequence } from './core/sequence.js';
import { createStore } from './core/store.js';
import { lengthInTicks } from './core/timing.js';
import { Transport } from './core/transport.js';
import { byId } from './ui/dom.js';
import { PianoRollGrid } from './ui/grid.js';
import { initHeader } from './ui/header.js';
import { PianoKeys } from './ui/piano-keys.js';
import { Playhead } from './ui/playhead.js';
import { showToast } from './ui/toast.js';
import { initTransportControls } from './ui/transport-controls.js';

const INSTRUMENT_LABEL = Object.fromEntries(INSTRUMENTS.map((i) => [i.id, i.label]));

// ---------------------------------------------------------------- estado
const store = createStore({
  instrument: DEFAULT_INSTRUMENT,
  division: DEFAULT_DIVISION,
  bpm: BPM.DEFAULT,
  bars: BARS.DEFAULT,
  loop: false,
  loops: LOOPS.DEFAULT,
});
const range = buildRange(LOWEST_MIDI, OCTAVES);
const sequence = new Sequence(lengthInTicks(store.get().bars));

const clock = () => performance.now() / 1000;
const transport = new Transport({
  now: clock,
  bpm: store.get().bpm,
  lengthTicks: sequence.lengthTicks,
  loop: store.get().loop,
});

let layout = computeLayout(store.get());

// ---------------------------------------------------------------- componentes
initHeader(store, {
  onExport: () => showToast('A exportação será habilitada na Fase 4.'),
  onClear: clearCurrentInstrument,
});

const keys = new PianoKeys(byId('piano-keys'), range, { onPreview: () => {} });

const grid = new PianoRollGrid({
  elements: {
    grid: byId('grid'),
    rows: byId('grid-rows'),
    lines: byId('grid-lines'),
    notes: byId('notes-layer'),
    ghost: byId('ghost-note'),
    ruler: byId('ruler'),
  },
  range,
  sequence,
  getState: () => store.get(),
  onAdd: ({ midi, start, duration }) => {
    sequence.addNote({ instrument: store.get().instrument, midi, start, duration });
    onSequenceChanged();
  },
  onRemove: (id) => {
    if (sequence.removeNote(id)) onSequenceChanged();
  },
  onSeek: (tick) => seek(tick),
});

const keysWidth = byId('piano-keys').getBoundingClientRect().width || 88;
const playhead = new Playhead({
  line: byId('playhead'),
  marker: byId('ruler-marker'),
  scroller: byId('roll-scroll'),
  keysWidth,
});

const controls = initTransportControls({
  onStart: () => seek(0),
  onToggle: () => togglePlayback(),
  onEnd: () => seek(sequence.lengthTicks),
});

// ---------------------------------------------------------------- ações
function togglePlayback() {
  transport.toggle();
}

function seek(tick) {
  transport.seek(tick);
  playhead.reveal(transport.tick, layout.pxPerTick);
}

function updateStatus() {
  const { instrument } = store.get();
  const all = sequence.activeNotes();
  const own = all.filter((n) => n.instrument === instrument).length;
  controls.setStatus(`${INSTRUMENT_LABEL[instrument]}: ${own} nota(s) · total: ${all.length}`);
}

function onSequenceChanged() {
  grid.renderNotes();
  updateStatus();
}

function clearCurrentInstrument() {
  const { instrument } = store.get();
  const count = sequence.activeNotes().filter((n) => n.instrument === instrument).length;
  if (count === 0) {
    showToast(`Não há notas de ${INSTRUMENT_LABEL[instrument]} para apagar.`);
    return;
  }
  if (!window.confirm(`Apagar ${count} nota(s) de ${INSTRUMENT_LABEL[instrument]}?`)) return;
  sequence.clear(instrument);
  onSequenceChanged();
  showToast('Notas apagadas.');
}

function relayout() {
  layout = computeLayout(store.get());
  grid.applyLayout(layout);
}

// ---------------------------------------------------------------- reações ao estado
store.subscribe((state, _previous, changed) => {
  const has = (key) => changed.includes(key);
  if (has('bpm')) transport.setBpm(state.bpm);
  if (has('bars')) {
    sequence.setLength(lengthInTicks(state.bars));
    transport.setLength(sequence.lengthTicks);
  }
  if (has('loop')) transport.setLoop(state.loop);
  if (has('bpm') || has('division') || has('bars')) relayout();
  if (has('instrument')) {
    keys.render(state.instrument);
    grid.renderNotes();
  }
  if (has('instrument') || has('bars')) updateStatus();
});

transport.on(() => controls.setPlaying(transport.playing));

// ---------------------------------------------------------------- atalhos de teclado
function isEditable(target) {
  return target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName));
}

window.addEventListener('keydown', (event) => {
  if (isEditable(event.target) || event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.code === 'Space') {
    event.preventDefault(); // evita também "clicar" o botão focado
    if (!event.repeat) togglePlayback();
  } else if (event.code === 'Home') {
    event.preventDefault();
    seek(0);
  } else if (event.code === 'End') {
    event.preventDefault();
    seek(sequence.lengthTicks);
  }
});
window.addEventListener('keyup', (event) => {
  if (event.code === 'Space' && !isEditable(event.target)) event.preventDefault();
});

// ---------------------------------------------------------------- laço de animação
function frame() {
  transport.update();
  const tick = transport.tick;
  playhead.update(tick, layout.pxPerTick, transport.playing);
  controls.setPosition(tick, store.get().bpm);
  window.requestAnimationFrame(frame);
}

// ---------------------------------------------------------------- inicialização
// Ponto de inspeção para depuração no console e para os testes E2E.
window.__beatProductor = {
  store, sequence, transport, range, getLayout: () => layout,
};

keys.render(store.get().instrument);
relayout();
updateStatus();
controls.setPlaying(false);
window.requestAnimationFrame(frame);
