"""Mixagem da sequência completa (com loops) num único buffer.

Estratégia sem cortes entre repetições (RNF03):
1. renderiza UMA passada do padrão, incluindo as caudas que ultrapassam o fim;
2. soma (overlap-add) essa passada a cada `length` segundos — a cauda da volta N
   continua soando por cima do início da volta N+1, exatamente como no navegador;
3. normaliza o pico para -1 dBFS (nunca há clipping) e aplica fades de borda.

Os deslocamentos são calculados em amostras inteiras, então as repetições
ficam alinhadas amostra a amostra.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable

import numpy as np

from ..core.config import DRUM_PIECE_TRIM, INSTRUMENT_TRIM, MAX_TAIL_SECONDS, SAMPLE_RATE, TARGET_PEAK
from ..core.music import drum_piece_for_midi, note_to_midi
from .instruments import render_note

SILENCE_THRESHOLD = 10 ** (-70 / 20)  # -70 dBFS


@dataclass(frozen=True)
class Event:
    time: float
    note: str
    duration: float
    instrument: str
    gain: float = 1.0


def render_pass(events: Iterable[Event], length: float, sr: int = SAMPLE_RATE) -> np.ndarray:
    """Renderiza uma passada do padrão. O array pode ser maior que `length` (caudas)."""
    pattern_samples = int(round(length * sr))
    rendered: list[tuple[int, np.ndarray, float]] = []
    cache: dict[tuple[str, int, int], np.ndarray] = {}
    end = pattern_samples

    for event in events:
        midi = note_to_midi(event.note)
        duration_samples = max(1, int(round(event.duration * sr)))
        key = (event.instrument, midi, duration_samples)
        if key not in cache:
            cache[key] = render_note(event.instrument, midi, duration_samples / sr, sr)
        start = int(round(event.time * sr))
        voice = cache[key]
        rendered.append((start, voice, _scale(event.instrument, midi, event.gain)))
        end = max(end, start + len(voice))

    buffer = np.zeros(end, dtype=np.float32)
    for start, voice, scale in rendered:
        if scale > 0:
            buffer[start:start + len(voice)] += voice * np.float32(scale)
    return buffer


def _scale(instrument: str, midi: int, gain: float) -> float:
    """Calibração do instrumento (e da peça, na bateria) × volume escolhido.
    O cache guarda a voz sem ganho; a escala é aplicada na mixagem."""
    scale = INSTRUMENT_TRIM.get(instrument, 1.0) * gain
    if instrument == "drums":
        scale *= DRUM_PIECE_TRIM[drum_piece_for_midi(midi)]
    return scale


def render_sequence(events: Iterable[Event], length: float, repetitions: int = 1,
                    sr: int = SAMPLE_RATE) -> np.ndarray:
    """Renderiza a sequência repetida `repetitions` vezes. Retorna mono float32 em [-1, 1]."""
    if length <= 0:
        raise ValueError("length deve ser positivo")
    if repetitions < 1:
        raise ValueError("repetitions deve ser >= 1")

    one_pass = render_pass(events, length, sr)
    pattern_samples = int(round(length * sr))
    musical_end = pattern_samples * repetitions
    total = max(musical_end, pattern_samples * (repetitions - 1) + len(one_pass))

    output = np.zeros(total, dtype=np.float32)
    for rep in range(repetitions):
        offset = rep * pattern_samples
        output[offset:offset + len(one_pass)] += one_pass

    output = _trim_tail(output, musical_end, int(MAX_TAIL_SECONDS * sr))
    output = _normalize(output)
    return _edge_fades(output, sr)


def _trim_tail(signal: np.ndarray, musical_end: int, max_tail: int) -> np.ndarray:
    """Corta o silêncio após o fim musical, mantendo a cauda audível (até `max_tail`)."""
    limit = min(len(signal), musical_end + max_tail)
    tail = np.abs(signal[musical_end:limit])
    audible = np.nonzero(tail > SILENCE_THRESHOLD)[0]
    end = musical_end + (int(audible[-1]) + 1 if audible.size else 0)
    return signal[:end].copy()


def _normalize(signal: np.ndarray) -> np.ndarray:
    peak = float(np.max(np.abs(signal))) if signal.size else 0.0
    if peak > 0:
        signal *= TARGET_PEAK / peak
    return signal


def _edge_fades(signal: np.ndarray, sr: int, fade_in: float = 0.002, fade_out: float = 0.03) -> np.ndarray:
    """Fade-in mínimo e fade-out curto no fim do arquivo (evita estalo no último sample)."""
    n_in = min(len(signal), int(fade_in * sr))
    if n_in > 0:
        signal[:n_in] *= np.linspace(0.0, 1.0, n_in, dtype=np.float32)
    n_out = min(len(signal), int(fade_out * sr))
    if n_out > 0:
        signal[-n_out:] *= np.linspace(1.0, 0.0, n_out, dtype=np.float32)
    return signal
