/**
 * Coluna de teclas de piano vertical (referência visual à esquerda do grid).
 * No modo Bateria, cada tecla mostra a peça correspondente.
 * Clicar numa tecla chama `onPreview(midi)` (pré-escuta do som).
 */
import { drumPieceForMidi, isBlackKey, midiToName, pitchClass } from '../core/music.js';
import { createElement } from './dom.js';

export class PianoKeys {
  constructor(container, range, { onPreview }) {
    this.container = container;
    this.range = range;
    this.onPreview = onPreview;
    this.keys = new Map();

    container.addEventListener('pointerdown', (event) => {
      const key = event.target.closest('[data-midi]');
      if (!key) return;
      event.preventDefault();
      const midi = Number(key.dataset.midi);
      this.flash(midi);
      this.onPreview(midi);
    });
  }

  render(instrument) {
    this.container.replaceChildren();
    this.keys.clear();
    const drumMode = instrument === 'drums';

    for (const midi of this.range) {
      const black = isBlackKey(midi);
      const classes = ['key', black ? 'key-black' : 'key-white'];
      if (pitchClass(midi) === 0) classes.push('key-c');
      if (drumMode) classes.push('key-drum');

      const name = midiToName(midi);
      const label = drumMode ? drumPieceForMidi(midi).label : (black ? '' : name);
      const key = createElement('div', classes.join(' '), {
        'data-midi': String(midi),
        title: drumMode ? `${drumPieceForMidi(midi).label} (${name})` : name,
        text: label,
      });
      this.keys.set(midi, key);
      this.container.appendChild(key);
    }
  }

  /** Destaque visual rápido de uma tecla (ao clicar ou ao tocar). */
  flash(midi, ms = 160) {
    const key = this.keys.get(midi);
    if (!key) return;
    key.classList.add('is-active');
    window.setTimeout(() => key.classList.remove('is-active'), ms);
  }
}
