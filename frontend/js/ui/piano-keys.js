/**
 * Coluna de teclas de piano vertical (referência visual à esquerda do grid).
 * No modo Bateria, as teclas do kit mostram a peça; as outras ficam desativadas (sem som).
 * Clicar numa tecla ativa chama `onPreview(midi)` (pré-escuta do som).
 */
import {
  drumPieceForMidi, isBlackKey, isPlayable, midiToName, pitchClass,
} from '../core/music.js';
import { BASS_TRANSPOSE } from '../audio/instruments.js';
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
      if (key.classList.contains('key-disabled')) return;
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
      const piece = drumMode ? drumPieceForMidi(midi) : null;
      let label = black ? '' : name;
      let title = name;
      if (drumMode && piece) {
        label = piece.label;
        title = `${piece.label} (${name})`;
      } else if (drumMode) {
        label = '';
        title = `${name} — fora do kit de bateria`;
      } else if (instrument === 'bass') {
        title = isPlayable('bass', midi)
          ? `${name} (soa ${midiToName(midi + BASS_TRANSPOSE)}: o baixo soa duas oitavas abaixo da tecla)`
          : `${name} — abaixo da corda mais grave do baixo (E1)`;
      }
      if (!isPlayable(instrument, midi)) classes.push('key-disabled');
      const key = createElement('div', classes.join(' '), { 'data-midi': String(midi), title, text: label });
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
