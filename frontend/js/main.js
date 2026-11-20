/**
 * Ponto de entrada do frontend: cria o estado, os componentes e liga tudo.
 */
import {
  APP_BUILD, INSTRUMENT_IDS, INSTRUMENTS, LOWEST_MIDI, OCTAVES, ROW_HEIGHT,
} from './config.js';
import { AudioEngine } from './audio/engine.js';
import { AudioScheduler } from './audio/scheduler.js';
import { buildExportPayload } from './core/export.js';
import { computeLayout } from './core/layout.js';
import { buildRange, isPlayable, playableRange } from './core/music.js';
import { defaultSettings } from './core/project.js';
import { UndoHistory } from './core/history.js';
import { parseProjectFile, serializeProjectFile } from './core/project-file.js';
import {
  clampMove, copyItems, countMergeableGroups, countSplittable, pasteItems,
} from './core/selection.js';
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
const rowIndex = new Map(range.map((midi, index) => [midi, index]));
const gridLength = () => lengthInTicks(store.get().bars, store.get().meter);
const sequence = new Sequence(gridLength());
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
  gridTicks: gridLength(), // parado, o cursor pode ir até o fim do grid
  loop: store.get().loop,
});

let layout = computeLayout(store.get());
const autosave = createAutosave(() => saveProject(store.get(), sequence));

/** Área de transferência interna (Ctrl+C / Ctrl+V). */
let clipboard = null;

// ---------------------------------------------------------------- desfazer / refazer (Ctrl+Z / Ctrl+Y)
const notesSnapshot = () => JSON.stringify(sequence.toJSON());
/** Configurações do projeto (tudo menos a ferramenta) — guardadas quando uma ação as muda (importar). */
const projectSettings = () => {
  const { tool, ...settings } = store.get();
  return settings;
};
const undoHistory = new UndoHistory({ notes: notesSnapshot() });
let pointerGesture = false; // um arrasto (mover, apagar arrastando…) vira UM passo só
let gestureDirty = false;
let restoringHistory = false;
let settingsBeforeChange = null;

function recordHistory() {
  if (restoringHistory) return;
  if (pointerGesture) {
    gestureDirty = true;
    return;
  }
  undoHistory.record({ notes: notesSnapshot() }, settingsBeforeChange);
  settingsBeforeChange = null;
}

function finishGesture() {
  if (!pointerGesture) return;
  pointerGesture = false;
  if (gestureDirty) {
    gestureDirty = false;
    recordHistory();
  }
}

window.addEventListener('pointerdown', () => {
  finishGesture(); // gesto anterior sem pointerup (soltou fora da janela)
  pointerGesture = true;
}, true);
for (const type of ['pointerup', 'pointercancel']) {
  // Depois dos handlers do grid (o clique que cria a nota acontece no pointerup).
  window.addEventListener(type, () => window.setTimeout(finishGesture, 0), true);
}

function undoRedo(direction) {
  finishGesture();
  const target = direction === 'undo' ? undoHistory.undo(projectSettings()) : undoHistory.redo(projectSettings());
  if (!target) {
    showToast(direction === 'undo' ? 'Nada para desfazer.' : 'Nada para refazer.');
    return;
  }
  restoringHistory = true;
  try {
    if (target.settings) store.set(target.settings);
    sequence.loadJSON(JSON.parse(target.notes));
    grid.clearSelection();
    onSequenceChanged();
  } finally {
    restoringHistory = false;
  }
}

// ---------------------------------------------------------------- componentes
const header = initHeader(store, {
  onExport: () => exportSequence(),
  onExportProject: () => exportProjectFile(),
  onImportProject: (file) => importProjectFile(file),
  onMerge: () => mergeSelection(),
  onSplit: () => splitSelection(),
  onDelete: () => deleteSelection(),
  onClear: () => clearCurrentInstrument(),
  onClearAll: () => clearAll(),
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
  onSelectionChange: () => updateSelectionState(),
  onMove: (ids, dMidi, dTicks) => applyMove(ids, dMidi, dTicks),
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
      // Só acende as teclas do instrumento que está aberto (os outros continuam tocando).
      if (note.instrument === store.get().instrument) keys.flash(note.midi, lengthMs);
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

// ---------------------------------------------------------------- reprodução
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

/**
 * Rola o grid na vertical para a região do instrumento: o kit da bateria fica no meio da tela; no
 * baixo, a tela desce até as teclas graves (onde ficam as linhas de baixo).
 */
function revealPlayableRows(instrument) {
  const scroller = byId('roll-scroll');
  if (instrument === 'bass') {
    scroller.scrollTop = scroller.scrollHeight;
    return;
  }
  const { minMidi, maxMidi } = playableRange(instrument);
  if (minMidi === LOWEST_MIDI && maxMidi === range[0]) return; // faixa inteira: nada a fazer
  const top = rowIndex.get(maxMidi) * ROW_HEIGHT;
  const bottom = (rowIndex.get(minMidi) + 1) * ROW_HEIGHT;
  const rulerHeight = 24;
  const visible = scroller.clientHeight - rulerHeight;
  scroller.scrollTop = Math.max(0, Math.round((top + bottom) / 2 - visible / 2));
}

function seek(tick) {
  transport.seek(tick);
  playhead.reveal(transport.tick, layout.pxPerTick);
}

function applyVolumes(volumes) {
  if (!engine) return;
  for (const id of INSTRUMENT_IDS) engine.setVolume(id, volumes[id]);
}

// ---------------------------------------------------------------- estado derivado
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
  recordHistory();
  syncLength();
  grid.renderNotes();
  updateStatus();
  updateSelectionState();
  autosave();
}

function updateSelectionState() {
  const selected = grid.getSelection();
  header.setSelectionState({
    selected: selected.length,
    mergeable: countMergeableGroups(sequence.notes, selected),
    splittable: countSplittable(sequence.notes, selected, layout.ticksPerCell),
  });
}

function selectedItems() {
  const ids = new Set(grid.getSelection());
  return sequence.activeItems().filter((item) => ids.has(item.id));
}

// ---------------------------------------------------------------- edição da seleção
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

function splitSelection() {
  const selected = grid.getSelection();
  if (selected.length === 0) {
    showToast('Selecione as notas que quer separar (ferramenta Selecionar ou Shift+arrastar).');
    return;
  }
  const { split, ids } = sequence.splitItems(selected, layout.ticksPerCell);
  if (split === 0) {
    showToast('As notas selecionadas já têm 1 célula. Escolha uma célula menor para separar mais.');
    return;
  }
  onSequenceChanged();
  grid.setSelection(ids);
  showToast(split === 1 ? 'Nota separada em células.' : `${split} notas separadas em células.`, 'success');
}

function deleteSelection() {
  const selected = grid.getSelection();
  if (selected.length === 0) return;
  sequence.removeNotes(selected);
  grid.clearSelection();
  onSequenceChanged();
}

/** Move a seleção (ids preservados). dMidi em semitons, dTicks em ticks. */
function applyMove(ids, dMidi, dTicks) {
  // Limites da faixa do instrumento (na bateria, só as teclas do kit).
  if (sequence.moveItems(ids, dMidi, dTicks, playableRange(store.get().instrument)) === 0) return;
  onSequenceChanged();
  // Ao mudar a altura, deixa ouvir a nova nota mais aguda da seleção.
  if (dMidi !== 0 && !transport.playing) {
    const top = selectedItems().filter((n) => n.kind === 'note').sort((a, b) => b.midi - a.midi)[0];
    if (top) previewNote(top.midi);
  }
}

/** Setas do teclado: move a seleção respeitando os limites do grid. */
function nudgeSelection(dMidi, dTicks) {
  const items = selectedItems();
  if (items.length === 0) return;
  const limited = clampMove(items, -dMidi, dTicks, {
    rowIndex, rowCount: range.length, lengthTicks: layout.lengthTicks, ...grid.playableRows(),
  });
  if (limited.dRows === 0 && limited.dTicks === 0) return;
  applyMove(items.map((n) => n.id), -limited.dRows, limited.dTicks);
}

function copySelection({ cut = false } = {}) {
  const selected = grid.getSelection();
  const copied = copyItems(sequence.activeItems(), selected, layout.beatTicks);
  if (!copied) {
    showToast('Selecione notas para copiar (ferramenta Selecionar ou Shift+arrastar).');
    return;
  }
  clipboard = copied;
  if (cut) {
    sequence.removeNotes(selected);
    grid.clearSelection();
    onSequenceChanged();
  }
  showToast(`${copied.items.length} bloco(s) ${cut ? 'recortado(s)' : 'copiado(s)'}. Posicione o cursor e use Ctrl+V.`);
}

function pasteClipboard() {
  if (!clipboard) {
    showToast('Nada copiado ainda: selecione notas e use Ctrl+C.');
    return;
  }
  const { instrument } = store.get();
  // Cola no cursor, alinhado à célula do grid.
  const start = Math.floor(transport.tick / layout.ticksPerCell) * layout.ticksPerCell;
  const placed = pasteItems(clipboard, { instrument, start });
  // Na bateria só valem as teclas do kit: o que foi copiado de outras alturas fica de fora.
  const fitting = placed.filter((item) => isPlayable(instrument, item.midi));
  if (fitting.length === 0) {
    showToast(`Nada colado: as notas copiadas estão fora das teclas de ${INSTRUMENT_LABEL[instrument]}.`, 'error');
    return;
  }
  const pasted = sequence.insertItems(fitting);
  onSequenceChanged();
  if (fitting.length < placed.length) {
    showToast(`${placed.length - fitting.length} bloco(s) ficaram de fora: fora das teclas de ${INSTRUMENT_LABEL[instrument]}.`, 'error');
  }
  grid.setSelection(pasted.map((n) => n.id));
  const outside = pasted.filter((n) => n.start >= layout.lengthTicks).length;
  if (outside > 0) {
    showToast(`${outside} bloco(s) ficaram depois do fim do grid — aumente os compassos para vê-los.`, 'error');
  }
  // O cursor vai para o fim do trecho colado: Ctrl+V de novo cola logo em seguida.
  if (!transport.playing) seek(Math.min(start + clipboard.span, layout.lengthTicks));
}

function selectAll() {
  const { instrument } = store.get();
  if (store.get().tool !== 'select') store.set({ tool: 'select' });
  grid.setSelection(sequence.activeItems().filter((n) => n.instrument === instrument).map((n) => n.id));
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

function clearAll() {
  const count = sequence.notes.length;
  if (count === 0) {
    showToast('O projeto já está vazio.');
    return;
  }
  if (!window.confirm(`Apagar TODAS as ${count} nota(s)/pausa(s) de todos os instrumentos?`)) return;
  sequence.clear();
  grid.clearSelection();
  onSequenceChanged();
  seek(0);
  showToast('Projeto limpo.');
}

// ---------------------------------------------------------------- arquivos
function timestamp() {
  const d = new Date();
  const two = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${two(d.getMonth() + 1)}${two(d.getDate())}-${two(d.getHours())}${two(d.getMinutes())}${two(d.getSeconds())}`;
}

function exportProjectFile() {
  const text = serializeProjectFile(store.get(), sequence.toJSON());
  const filename = `beat-productor-${timestamp()}.txt`;
  downloadBlob(new Blob([text], { type: 'text/plain;charset=utf-8' }), filename);
  showToast(`Projeto exportado: ${filename}`, 'success');
}

async function importProjectFile(file) {
  let text;
  try {
    text = await file.text();
  } catch {
    showToast('Não foi possível ler o arquivo.', 'error');
    return;
  }
  const result = parseProjectFile(text);
  if (!result.ok) {
    showToast(`Arquivo inválido — ${result.errors.slice(0, 3).join(' · ')}`, 'error');
    console.warn('Erros ao importar o projeto:', result.errors);
    return;
  }
  if (sequence.notes.length > 0 && !window.confirm('Importar substitui o projeto atual. Continuar?')) return;

  if (transport.playing) transport.pause();
  grid.clearSelection();
  settingsBeforeChange = projectSettings(); // Ctrl+Z desfaz a importação inteira (notas e configurações)
  store.set({ ...result.settings, tool: store.get().tool });
  sequence.setLength(gridLength());
  transport.setGridLength(gridLength());
  sequence.loadJSON(result.items);
  onSequenceChanged();
  seek(0);
  const notes = result.items.length;
  const notices = result.notices.length ? ` ${result.notices.join('; ')}.` : '';
  showToast(`Projeto importado: ${notes} nota(s)/pausa(s).${notices}${result.warnings.length ? ` Atenção: ${result.warnings.join('; ')}.` : ''}`,
    result.warnings.length ? 'error' : 'success');
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
  updateSelectionState(); // SEPARAR depende do tamanho da célula
}

// ---------------------------------------------------------------- reações ao estado
store.subscribe((state, _previous, changed) => {
  const has = (key) => changed.includes(key);
  if (has('bpm')) transport.setBpm(state.bpm);
  if (has('bars') || has('meter')) {
    sequence.setLength(gridLength());
    transport.setGridLength(gridLength());
    syncLength();
  }
  if (has('loop')) transport.setLoop(state.loop);
  if (has('volumes')) applyVolumes(state.volumes);
  if (has('bpm') || has('division') || has('bars') || has('meter')) relayout();
  if (has('instrument')) {
    keys.render(state.instrument);
    grid.refreshRows(); // a faixa ativa depende do instrumento (bateria: só o kit)
    grid.clearSelection(); // a seleção vale só para o instrumento atual
    grid.renderNotes();
    revealPlayableRows(state.instrument);
  }
  if (has('instrument') || has('bars') || has('bpm') || has('meter')) updateStatus();
  if (!(changed.length === 1 && has('tool'))) autosave();
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

const CTRL_SHORTCUTS = {
  KeyC: () => copySelection(),
  KeyX: () => copySelection({ cut: true }),
  KeyV: () => pasteClipboard(),
  KeyA: () => selectAll(),
  KeyZ: () => undoRedo('undo'),
  KeyY: () => undoRedo('redo'),
};
const CTRL_SHIFT_SHORTCUTS = {
  KeyZ: () => undoRedo('redo'),
};

window.addEventListener('keydown', (event) => {
  if (isEditable(event.target)) return;
  if (event.ctrlKey || event.metaKey) {
    const table = event.shiftKey ? CTRL_SHIFT_SHORTCUTS : CTRL_SHORTCUTS;
    const action = event.altKey ? null : table[event.code];
    if (action) {
      event.preventDefault();
      action();
    }
    return;
  }
  if (event.altKey) return;

  const cell = layout.ticksPerCell;
  switch (event.code) {
    case 'Space':
      event.preventDefault(); // evita também "clicar" o botão focado
      if (!event.repeat) togglePlayback();
      break;
    case 'Home':
      event.preventDefault();
      seek(0);
      break;
    case 'End':
      event.preventDefault();
      seek(sequence.endTick());
      break;
    case 'Delete':
    case 'Backspace':
      event.preventDefault();
      deleteSelection();
      break;
    case 'Escape':
      grid.clearSelection();
      break;
    case 'KeyU':
      if (event.shiftKey) splitSelection();
      else mergeSelection();
      break;
    case 'KeyS':
      store.set({ tool: 'select' });
      break;
    case 'KeyD':
      store.set({ tool: 'draw' });
      break;
    case 'ArrowUp':
    case 'ArrowDown':
    case 'ArrowLeft':
    case 'ArrowRight': {
      if (grid.getSelection().length === 0) return; // sem seleção, as setas rolam a tela
      event.preventDefault();
      const octave = event.shiftKey ? 12 : 1;
      if (event.code === 'ArrowUp') nudgeSelection(octave, 0);
      else if (event.code === 'ArrowDown') nudgeSelection(-octave, 0);
      else if (event.code === 'ArrowLeft') nudgeSelection(0, -cell);
      else nudgeSelection(0, cell);
      break;
    }
    default:
      break;
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
  controls.setPosition(tick, store.get().bpm, store.get().meter);
  window.requestAnimationFrame(frame);
}

// ---------------------------------------------------------------- inicialização
// Ponto de inspeção para depuração no console e para os testes E2E.
window.__beatProductor = {
  store, sequence, transport, range, grid, audio: engine, history: undoHistory, getLayout: () => layout, build: APP_BUILD,
};

keys.render(store.get().instrument);
applyVolumes(store.get().volumes);
relayout();
revealPlayableRows(store.get().instrument);
updateStatus();
controls.setPlaying(false);
window.requestAnimationFrame(frame);
if (audioError) showToast(`Áudio indisponível: ${audioError.message}`, 'error');
if (saved && !sequence.isEmpty) showToast('Projeto anterior restaurado.');
