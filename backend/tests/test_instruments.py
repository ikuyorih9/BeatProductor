import numpy as np
import pytest

from app.audio.instruments import SYNTHS, adsr, render_note
from app.core.config import SAMPLE_RATE

NOTES = [48, 60, 61, 62, 63, 71, 83]  # inclui as 4 peças da bateria e os extremos da faixa


@pytest.mark.parametrize("instrument", list(SYNTHS))
@pytest.mark.parametrize("midi", NOTES)
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
    voice = render_note(instrument, 60, 0.3)
    assert abs(float(voice[-1])) < 1e-6
    assert float(np.max(np.abs(voice[-int(0.002 * SAMPLE_RATE):]))) < 0.02


@pytest.mark.parametrize("instrument", ["piano", "lofi", "lead"])
def test_sustained_instruments_follow_duration(instrument):
    short = render_note(instrument, 60, 0.2)
    long = render_note(instrument, 60, 1.5)
    assert len(long) > len(short)
    assert len(long) / SAMPLE_RATE >= 1.5


def test_drums_are_one_shot():
    assert len(render_note("drums", 60, 0.1)) == len(render_note("drums", 60, 3.0))


def test_drum_pieces_differ():
    pieces = [render_note("drums", midi, 0.1) for midi in (60, 61, 62, 63)]
    lengths = {len(p) for p in pieces}
    assert len(lengths) >= 3  # bumbo, caixa e hi-hats têm durações diferentes


def test_drums_are_deterministic():
    np.testing.assert_array_equal(render_note("drums", 61, 0.1), render_note("drums", 61, 0.1))


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
