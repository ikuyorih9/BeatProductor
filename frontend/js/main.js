/**
 * Ponto de entrada do frontend: cria o estado, os componentes e liga tudo.
 */
import { INSTRUMENTS, LOWEST_MIDI, OCTAVES } from './config.js';
import { AudioEngine } from './audio/engine.js';
import { AudioScheduler } from './audio/scheduler.js';
import { buildExportPayload } from './core/export.js';
import { computeLayout } from './core/layout.js';
import { buildRange } from './core/music.js';
import { defaultSettings } from './core/project.js';
import { countMergeableGroups } from './core/selection.js';
import { Sequence } from './core/sequence.js';
import { createStore } from './core/store.js';
import { formatClock, lengthInTicks, ticksToSeconds } from './core/timing.js';
import { Transport } from './core/transport.js';
import { downloadBlob, requestExport } from './services/api.js';
import { createAutosave, loadProject, saveProject } from './services/storage.js';
import { byId } from './ui/dom.js';
import { PianoRollGrid } from './ui/grid.js';
import { initHeader } from './ui/header.js';
import { PianoKeys } from './ui/piano-keys.js';
import { Playhead } from './ui/playhead.js';
import { showToast } from './ui/toast.js';
import { initTransportControls } from './ui/transport-controls.js';

const INSTRUMENT_LABEL = Object.fromEntries(INSTRUMENTS.map((i) => [i.id, i.label]));

// ---------------------------------------------------------------- estado (restaurado do último uso, se houver)
const saved = loadProject();
// `tool` (desenhar/selecionar) não é salva: o app sempre abre desenhando.
const store = createStore({ ...(saved ? saved.settings : defaultSettings()), tool: 'draw' });
const range = buildRange(LOWEST_MIDI, OCTAVES);
const sequence = new Sequence(lengthInTicks(store.get().bars));
if (saved) sequence.loadJSON(saved.notes);

// Motor de áudio. Se a Web Audio API não estiver disponível, o app segue
// funcionando em modo silencioso (cursor guiado pelo relógio do sistema).
let engine = null;
let audioError = null;
try {
  engine = new AudioEngine();
} catch (error) {
  audioError = error;
}

const clock = engine ? () => engine.now() : () => performance.now() / 1000;
const transport = new Transport({
  now: clock,
  bpm: store.get().bpm,
  lengthTicks: sequence.endTick(), // o play vai até o fim da última nota/pausa
  loop: store.get().loop,
});

let layout = computeLayout(store.get());
const autosave = createAutosave(() => saveProject(store.get(), sequence));

// ---------------------------------------------------------------- componentes
const header = initHeader(store, {
  onExport: () => exportSequence(),
  onClear: () => clearCurrentInstrument(),
  onMerge: () => mergeSelection(),
});

const keys = new PianoKeys(byId('piano-keys'), range, {
  onPreview: (midi) => previewNote(midi),
});

const grid = new PianoRollGrid({
  elements: {
    grid: byId('grid'),
    rows: byId('grid-rows'),
    lines: byId('grid-lines'),
    notes: byId('notes-layer'),
    ghost: byId('ghost-note'),
    ruler: byId('ruler'),
    selectionBox: byId('selection-box'),
    endMarker: byId('end-marker'),
    endFlag: byId('end-flag'),
  },
  range,
  sequence,
  getState: () => store.get(),
  onAdd: ({ midi, start, duration }) => {
    sequence.addNote({ instrument: store.get().instrument, midi, start, duration });
    onSequenceChanged();
    if (!transport.playing) previewNote(midi, Math.min(ticksToSeconds(duration, store.get().bpm), 1.5));
  },
  onAddRest: ({ midi, start, duration }) => {
    sequence.addRest({ instrument: store.get().instrument, midi, start, duration });
    onSequenceChanged();
  },
  onRemove: (id) => {
    if (sequence.removeNote(id)) onSequenceChanged();
  },
  onSeek: (tick) => seek(tick),
  onSelectionChange: () => updateMergeState(),
});

const keysWidth = byId('piano-keys').getBoundingClientRect().width || 88;
const playhead = new Playhead({
  line: byId('playhead'),
  marker: byId('ruler-marker'),
  scroller: byId('roll-scroll'),
  keysWidth,
});

const scheduler = engine ? new AudioScheduler({
  engine,
  transport,
  getNotes: () => sequence.activeNotes(),
  onNoteScheduled: (note, when) => {
    // Acende a tecla no momento em que a nota soa.
    const delayMs = Math.max(0, (when - engine.now() + engine.outputLatency) * 1000);
    const lengthMs = Math.max(120, ticksToSeconds(note.duration, transport.bpm) * 1000);
    const id = window.setTimeout(() => {
      pendingFlashes.delete(id);
      keys.flash(note.midi, lengthMs);
    }, delayMs);
    pendingFlashes.add(id);
  },
}) : null;

// Destaques de tecla ainda não disparados (cancelados no pause/seek junto com as vozes).
const pendingFlashes = new Set();
function cancelPendingFlashes() {
  for (const id of pendingFlashes) window.clearTimeout(id);
  pendingFlashes.clear();
}

// Se o sistema suspender o áudio (troca de dispositivo, economia de energia),
// pausa o transporte para o cursor não seguir andando em silêncio.
if (engine) {
  engine.context.addEventListener('statechange', () => {
    if (engine.context.state !== 'running' && transport.playing) {
      transport.pause();
      showToast('O áudio foi interrompido pelo sistema; reprodução pausada.', 'error');
    }
  });
}

const controls = initTransportControls({
  onStart: () => seek(0),
  onToggle: () => togglePlayback(),
  onEnd: () => seek(sequence.endTick()),
});

// ---------------------------------------------------------------- ações
let toggling = false;
async function togglePlayback() {
  if (toggling) return; // evita duplo disparo enquanto o áudio é liberado
  toggling = true;
  try {
    if (!transport.playing && engine) {
      try {
        await engine.resume();
      } catch {
        showToast('Não foi possível ativar o áudio do navegador.', 'error');
      }
    }
    transport.toggle();
  } finally {
    toggling = false;
  }
}

function previewNote(midi, duration = 0.35) {
  if (!engine) return;
  engine.preview(store.get().instrument, midi, duration).catch(() => {
    showToast('Não foi possível ativar o áudio do navegador.', 'error');
  });
}

function seek(tick) {
  transport.seek(tick);
  playhead.reveal(transport.tick, layout.pxPerTick);
}

function updateStatus() {
  const { instrument, bpm } = store.get();
  const own = sequence.activeItems().filter((n) => n.instrument === instrument);
  const notes = own.filter((n) => n.kind === 'note').length;
  const rests = own.length - notes;
  const duration = sequence.hasItems ? ` · duração ${formatClock(ticksToSeconds(sequence.endTick(), bpm))}` : '';
  controls.setStatus(`${INSTRUMENT_LABEL[instrument]}: ${notes} nota(s), ${rests} pausa(s)${duration}`);
}

/** O transporte toca até o FIM da música (fim da última nota ou pausa). */
function syncLength() {
  transport.setLength(sequence.endTick());
}

function onSequenceChanged() {
  syncLength();
  grid.renderNotes();
  updateStatus();
  updateMergeState();
  autosave();
}

function updateMergeState() {
  const selected = grid.getSelection();
  header.setMergeState(selected.length, countMergeableGroups(sequence.notes, selected));
}

function mergeSelection() {
  const selected = grid.getSelection();
  if (selected.length < 2) {
    showToast('Selecione 2 ou mais blocos na mesma linha (ferramenta Selecionar ou Shift+arrastar).');
    return;
  }
  const { merged, ids } = sequence.mergeItems(selected);
  if (merged === 0) {
    showToast('Só é possível unir blocos da mesma linha (mesma nota). Notas com pausas não se unem.', 'error');
    return;
  }
  onSequenceChanged();
  grid.setSelection(ids);
  showToast(merged === 1 ? 'Blocos unidos.' : `${merged} linhas unidas.`, 'success');
}

function deleteSelection() {
  const selected = grid.getSelection();
  if (selected.length === 0) return;
  sequence.removeNotes(selected);
  grid.clearSelection();
  onSequenceChanged();
}

function clearCurrentInstrument() {
  const { instrument } = store.get();
  const count = sequence.activeItems().filter((n) => n.instrument === instrument).length;
  if (count === 0) {
    showToast(`Não há notas nem pausas de ${INSTRUMENT_LABEL[instrument]} para apagar.`);
    return;
  }
  if (!window.confirm(`Apagar ${count} nota(s)/pausa(s) de ${INSTRUMENT_LABEL[instrument]}?`)) return;
  sequence.clear(instrument);
  onSequenceChanged();
  showToast('Notas apagadas.');
}

let exporting = false;
async function exportSequence() {
  if (exporting) return;
  const result = buildExportPayload(sequence, store.get(), 'mp3');
  if (!result.ok) {
    showToast(result.error, 'error');
    return;
  }
  exporting = true;
  header.setExporting(true);
  try {
    const { blob, filename } = await requestExport(result.payload);
    downloadBlob(blob, filename);
    const reps = result.payload.loop ? ` (${result.payload.loops} loops)` : '';
    showToast(`MP3 gerado${reps}: ${filename}`, 'success');
  } catch (error) {
    showToast(`Falha na exportação: ${error.message}`, 'error');
  } finally {
    exporting = false;
    header.setExporting(false);
  }
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
    syncLength();
  }
  if (has('loop')) transport.setLoop(state.loop);
  if (has('bpm') || has('division') || has('bars')) relayout();
  if (has('instrument')) {
    keys.render(state.instrument);
    grid.clearSelection(); // a seleção vale só para o instrumento atual
    grid.renderNotes();
  }
  if (has('instrument') || has('bars') || has('bpm')) updateStatus();
  autosave();
});

transport.on((type) => {
  controls.setPlaying(transport.playing);
  if (!scheduler) return;
  if (type === 'reanchor' && transport.playing) {
    // Posição mudou durante o play (seek, loop, compassos): descarta o que já estava agendado.
    engine.cancelPending();
    cancelPendingFlashes();
    scheduler.reset();
  } else if (type === 'play') {
    scheduler.start();
  } else if (type === 'pause') {
    scheduler.stop();
    engine.stopAll();
    cancelPendingFlashes();
  } else if (type === 'end') {
    scheduler.stop(); // as caudas das últimas notas terminam naturalmente
  }
});

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
    seek(sequence.endTick());
  } else if (event.code === 'Delete' || event.code === 'Backspace') {
    event.preventDefault();
    deleteSelection();
  } else if (event.code === 'Escape') {
    grid.clearSelection();
  } else if (event.code === 'KeyU') {
    mergeSelection();
  } else if (event.code === 'KeyS') {
    store.set({ tool: 'select' });
  } else if (event.code === 'KeyD') {
    store.set({ tool: 'draw' });
  }
});
window.addEventListener('keyup', (event) => {
  if (event.code === 'Space' && !isEditable(event.target)) event.preventDefault();
});

// ---------------------------------------------------------------- laço de animação
function frame() {
  transport.update();
  // Cursor alinhado com o que está SAINDO no alto-falante (compensa a latência de saída).
  const tick = transport.playing && engine ? transport.tickAt(engine.now() - engine.outputLatency) : transport.tick;
  playhead.update(tick, layout.pxPerTick, transport.playing);
  controls.setPosition(tick, store.get().bpm);
  window.requestAnimationFrame(frame);
}

// ---------------------------------------------------------------- inicialização
// Ponto de inspeção para depuração no console e para os testes E2E.
window.__beatProductor = {
  store, sequence, transport, range, grid, audio: engine, getLayout: () => layout,
};

keys.render(store.get().instrument);
relayout();
updateStatus();
updateMergeState();
controls.setPlaying(false);
window.requestAnimationFrame(frame);
if (audioError) showToast(`Áudio indisponível: ${audioError.message}`, 'error');
if (saved && !sequence.isEmpty) showToast('Projeto anterior restaurado.');
