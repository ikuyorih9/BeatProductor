import numpy as np
import pytest

from app.audio.instruments import SYNTHS, TOMS, adsr, render_note
from app.core.config import SAMPLE_RATE
from app.core.music import DRUM_KIT

NOTES = [48, 60, 61, 62, 63, 71, 83]  # extremos da faixa e notas do meio
DRUM_NOTES = list(DRUM_KIT)  # as 8 peças do kit (D4 a A4)
CASES = [(i, m) for i in SYNTHS if i != "drums" for m in NOTES] + [("drums", m) for m in DRUM_NOTES]
#: Uma nota válida de cada instrumento (a bateria só aceita as teclas do kit).
SAMPLE_NOTE = {"piano": 60, "drums": 62, "lofi": 60, "lead": 60}


@pytest.mark.parametrize("instrument,midi", CASES)
def test_voice_is_audible_finite_and_unclipped(instrument, midi):
    voice = render_note(instrument, midi, 0.5)
    assert voice.dtype == np.float32
    assert voice.size > 0
    assert np.all(np.isfinite(voice))
    peak = float(np.max(np.abs(voice)))
    assert 0.02 < peak <= 1.0, f"{instrument}/{midi}: pico {peak}"


@pytest.mark.parametrize("instrument", list(SYNTHS))
def test_voice_ends_in_silence(instrument):
    """A voz precisa terminar em zero — senão a mixagem teria estalos."""
    voice = render_note(instrument, SAMPLE_NOTE[instrument], 0.3)
    assert abs(float(voice[-1])) < 1e-6
    assert float(np.max(np.abs(voice[-int(0.002 * SAMPLE_RATE):]))) < 0.02


@pytest.mark.parametrize("instrument", ["piano", "lofi", "lead"])
def test_sustained_instruments_follow_duration(instrument):
    short = render_note(instrument, 60, 0.2)
    long = render_note(instrument, 60, 1.5)
    assert len(long) > len(short)
    assert len(long) / SAMPLE_RATE >= 1.5


@pytest.mark.parametrize("midi", DRUM_NOTES)
def test_every_drum_piece_ends_in_silence(midi):
    voice = render_note("drums", midi, 0.1)
    assert abs(float(voice[-1])) < 1e-6


def test_drums_are_one_shot():
    assert len(render_note("drums", 62, 0.1)) == len(render_note("drums", 62, 3.0))


def test_the_8_drum_pieces_are_all_different():
    pieces = [render_note("drums", midi, 0.1) for midi in DRUM_NOTES]
    for i, a in enumerate(pieces):
        for b in pieces[i + 1:]:
            n = min(len(a), len(b))
            assert not np.allclose(a[:n], b[:n], atol=1e-3)


def test_cymbals_ring_longer_than_drums_and_toms_are_tuned_low_to_high():
    lengths = {DRUM_KIT[m]: len(render_note("drums", m, 0.1)) for m in DRUM_NOTES}
    assert lengths["crash"] > lengths["ride"] > lengths["floor_tom"] > lengths["kick"]
    assert TOMS["floor_tom"]["end"] < TOMS["tom2"]["end"] < TOMS["tom1"]["end"]


@pytest.mark.parametrize("midi", [48, 55, 61, 70, 83])
def test_drum_note_outside_the_kit_is_rejected(midi):
    with pytest.raises(ValueError, match="não faz parte da bateria"):
        render_note("drums", midi, 0.1)


@pytest.mark.parametrize("midi", DRUM_NOTES)
def test_drums_are_deterministic(midi):
    np.testing.assert_array_equal(render_note("drums", midi, 0.1), render_note("drums", midi, 0.1))


def test_unknown_instrument():
    with pytest.raises(ValueError):
        render_note("tuba", 60, 0.5)


def test_adsr_shape():
    sr = 1000
    env = adsr(2000, sr, duration=1.0, attack=0.1, decay=0.3, sustain=0.5, release=0.4, peak=1.0)
    assert env[0] == 0.0
    assert env[100] == pytest.approx(1.0, abs=0.02)  # fim do ataque
    assert env[999] == pytest.approx(0.5, abs=0.01)  # sustain
    assert env[1999] < 0.01  # release
    assert np.all(np.diff(env[100:]) <= 1e-12)  # depois do ataque, nunca sobe


def test_adsr_note_shorter_than_attack():
    env = adsr(1000, 1000, duration=0.01, attack=0.05, decay=0.1, sustain=0.5, release=0.2, peak=1.0)
    assert np.all(np.isfinite(env))
    assert env.max() <= 1.0
