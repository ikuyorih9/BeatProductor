"""Teoria musical: nomes de notas, MIDI, frequências e peças da bateria.

Espelha frontend/js/core/music.js — as duas implementações precisam concordar.
"""

import re

NOTE_NAMES = ("C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B")
DRUM_PIECES = ("kick", "snare", "hihat_closed", "hihat_open")

NOTE_PATTERN = r"^[A-G]#?-?\d$"
_NOTE_RE = re.compile(r"^([A-G]#?)(-?\d)$")


def note_to_midi(name: str) -> int:
    """Converte nome científico em número MIDI ("C4" → 60, "A4" → 69)."""
    match = _NOTE_RE.match(name)
    if not match or match.group(1) not in NOTE_NAMES:
        raise ValueError(f"Nome de nota inválido: {name!r}")
    return (int(match.group(2)) + 1) * 12 + NOTE_NAMES.index(match.group(1))


def midi_to_name(midi: int) -> str:
    return f"{NOTE_NAMES[midi % 12]}{midi // 12 - 1}"


def midi_to_frequency(midi: int) -> float:
    """Temperamento igual com A4 = 440 Hz."""
    return 440.0 * 2.0 ** ((midi - 69) / 12.0)


def drum_piece_for_midi(midi: int) -> str:
    """Peça da bateria pela classe de altura % 4 (C = bumbo, C# = caixa, D = hi-hat fechado, D# = hi-hat aberto…)."""
    return DRUM_PIECES[(midi % 12) % len(DRUM_PIECES)]
