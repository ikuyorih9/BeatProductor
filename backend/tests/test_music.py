import pytest

from app.core.music import drum_piece_for_midi, midi_to_frequency, midi_to_name, note_to_midi


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


def test_drum_mapping_matches_frontend():
    # Mesma tabela de frontend/tests/music.test.js
    assert [drum_piece_for_midi(m) for m in range(60, 64)] == ["kick", "snare", "hihat_closed", "hihat_open"]
    assert drum_piece_for_midi(64) == "kick"
    assert drum_piece_for_midi(48) == drum_piece_for_midi(72)
