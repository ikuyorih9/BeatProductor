import pytest

from app.core.music import DRUM_KIT, drum_piece_for_midi, midi_to_frequency, midi_to_name, note_to_midi


def test_note_to_midi_known_values():
    assert note_to_midi("C4") == 60
    assert note_to_midi("A4") == 69
    assert note_to_midi("C3") == 48
    assert note_to_midi("B5") == 83
    assert note_to_midi("C#4") == 61
    assert note_to_midi("C-1") == 0


def test_round_trip_all_midi():
    for midi in range(128):
        assert note_to_midi(midi_to_name(midi)) == midi


@pytest.mark.parametrize("bad", ["H4", "C", "Cb4", "E#4", "C##4", "", "c4", "C44"])
def test_invalid_names(bad):
    with pytest.raises(ValueError):
        note_to_midi(bad)


def test_frequencies():
    assert midi_to_frequency(69) == 440.0
    assert midi_to_frequency(81) == pytest.approx(880.0)
    assert midi_to_frequency(60) == pytest.approx(261.6256, abs=1e-3)


def test_drum_kit_matches_frontend():
    # Mesmas teclas de DRUM_PIECES em frontend/js/config.js (A3 a C#5, uma peça por tecla, no centro).
    # As 8 peças originais continuam em D4 a A4 (projetos salvos não precisam de conversão).
    assert [drum_piece_for_midi(m) for m in range(57, 74)] == [
        "tambourine", "jam_block", "cowbell", "rototoms", "octobans",
        "kick", "snare", "hihat", "floor_tom", "tom2", "tom1", "ride", "crash",
        "splash", "china", "stack", "bell",
    ]
    assert drum_piece_for_midi(56) is None
    assert drum_piece_for_midi(74) is None
    assert drum_piece_for_midi(48) is None  # antes, o kit ficava em C3–G3


def test_drum_kit_is_centered_in_the_grid():
    # Grid: C3 (48) a B5 (83) = 36 teclas; 17 do kit no meio → 9 abaixo e 10 acima.
    assert min(DRUM_KIT) - 48 == 9
    assert 83 - max(DRUM_KIT) == 10


def test_drum_kit_is_the_same_in_frontend_config():
    import re
    from pathlib import Path

    config = (Path(__file__).resolve().parents[2] / "frontend" / "js" / "config.js").read_text(encoding="utf-8")
    pieces = re.findall(r"\{ id: '(\w+)', label: '[^']+', midi: (\d+),", config)
    assert {int(midi): piece for piece, midi in pieces} == DRUM_KIT
