"""Teoria musical: nomes de notas, MIDI, frequências e peças da bateria.

Espelha frontend/js/core/music.js — as duas implementações precisam concordar.
"""

import re

NOTE_NAMES = ("C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B")
#: Kit de bateria: tecla (MIDI) → peça. Só estas teclas valem na bateria: D4 a A4, no centro do
#: grid (14 teclas desativadas acima e 14 abaixo). Espelha DRUM_PIECES de frontend/js/config.js.
DRUM_KIT = {
    62: "kick",       # D4  bumbo
    63: "snare",      # D#4 caixa
    64: "hihat",      # E4  chimbal
    65: "floor_tom",  # F4  surdo
    66: "tom2",       # F#4 tom 2
    67: "tom1",       # G4  tom 1
    68: "ride",       # G#4 ride
    69: "crash",      # A4  prato de ataque
}
DRUM_PIECES = tuple(DRUM_KIT.values())

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


def drum_piece_for_midi(midi: int) -> str | None:
    """Peça da bateria tocada pela tecla, ou None se a tecla não faz parte do kit."""
    return DRUM_KIT.get(midi)
