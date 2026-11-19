/** Rodapé: botões INÍCIO, PLAY/PAUSE, FIM e mostradores de posição. */
import { formatBarBeat, formatClock, ticksToSeconds } from '../core/timing.js';
import { byId } from './dom.js';

export function initTransportControls({ onStart, onToggle, onEnd }) {
  const startButton = byId('start-button');
  const playButton = byId('play-button');
  const endButton = byId('end-button');
  const positionDisplay = byId('position-display');
  const clockDisplay = byId('clock-display');
  const statusDisplay = byId('status-display');

  startButton.addEventListener('click', () => onStart());
  playButton.addEventListener('click', () => onToggle());
  endButton.addEventListener('click', () => onEnd());

  let lastPosition = '';
  let lastClock = '';

  return {
    setPlaying(playing) {
      playButton.textContent = playing ? '⏸ PAUSE' : '▶ PLAY';
      playButton.setAttribute('aria-pressed', String(playing));
    },
    setPosition(tick, bpm) {
      const position = formatBarBeat(tick);
      const clock = formatClock(ticksToSeconds(tick, bpm));
      if (position !== lastPosition) positionDisplay.textContent = lastPosition = position;
      if (clock !== lastClock) clockDisplay.textContent = lastClock = clock;
    },
    setStatus(text) {
      statusDisplay.textContent = text;
    },
  };
}
