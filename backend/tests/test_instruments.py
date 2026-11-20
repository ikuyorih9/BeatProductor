import numpy as np
import pytest

from app.audio.instruments import SYNTHS, TOMS, adsr, bass, render_note
from app.core.config import SAMPLE_RATE
from app.core.music import DRUM_KIT

NOTES = [48, 60, 61, 62, 63, 71, 83]  # extremos da faixa e notas do meio
DRUM_NOTES = list(DRUM_KIT)  # as 17 peças do kit (A3 a C#5)
CASES = [(i, m) for i in SYNTHS if i != "drums" for m in NOTES] + [("drums", m) for m in DRUM_NOTES]
#: Uma nota válida de cada instrumento (a bateria só aceita as teclas do kit).
SAMPLE_NOTE = {"piano": 60, "drums": 62, "bass": 52, "lofi": 60, "lead": 60}


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


@pytest.mark.parametrize("instrument", ["piano", "bass", "lofi", "lead"])
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


@pytest.mark.parametrize("midi", [48, 55, 56, 74, 83])
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


def _pitch_by_autocorrelation(voice: np.ndarray, low_hz: float = 30.0, high_hz: float = 200.0) -> float:
    lags = range(int(SAMPLE_RATE / high_hz), int(SAMPLE_RATE / low_hz) + 1)
    best = max(lags, key=lambda lag: float(np.dot(voice[:-lag], voice[lag:])))
    return SAMPLE_RATE / best


@pytest.mark.parametrize(("written", "hz"), [(52, 41.2), (59, 61.7), (64, 82.4)])
def test_bass_sounds_two_octaves_below_the_key(written, hz):
    """E3 no grid = E1 (41,2 Hz), a corda Mi solta de um baixo de 4 cordas; B3 = B1; E4 = E2."""
    voice = render_note("bass", written, 1.0).astype(np.float64)[: SAMPLE_RATE // 2]
    assert abs(_pitch_by_autocorrelation(voice) - hz) < hz * 0.02


#: Valores de referência — os MESMOS em frontend/tests/bass.test.js e backend/tests/test_instruments.py:
#: navegador e servidor fazem a mesma conta, então as amostras têm de bater.
BASS_REFERENCE = {
    (59, 0.5): ((100, 0.263136), (1000, -0.09178), (5000, 0.058106), (20000, 0.107314), 28665),
    (52, 0.25): ((37, 0.098067), (777, -0.113711), (4444, 0.268328), (12000, 0.088562), 17640),
}


@pytest.mark.parametrize("key", list(BASS_REFERENCE))
def test_bass_matches_the_browser_sample_by_sample(key):
    midi, duration = key
    *samples, length = BASS_REFERENCE[key]
    voice = bass(midi, duration)
    assert len(voice) == length
    for index, value in samples:
        assert float(voice[index]) == pytest.approx(value, abs=2e-6), index


def _centroid(voice, start, end):
    part = voice[int(start * SAMPLE_RATE):int(end * SAMPLE_RATE)]
    spectrum = np.abs(np.fft.rfft(part * np.hanning(len(part))))
    freqs = np.fft.rfftfreq(len(part), 1 / SAMPLE_RATE)
    return float((spectrum * freqs).sum() / spectrum.sum())


def _level_db(voice, start, end):
    part = voice[int(start * SAMPLE_RATE):int(end * SAMPLE_RATE)]
    return 20 * np.log10(np.sqrt(np.mean(part ** 2)))


def test_bass_is_dark_and_sustains_like_the_reference_b1():
    """Medidas da gravação de referência (baixo elétrico, B1): som escuro (centroide ~200 Hz, nada de
    brilho de violão) e sustentação longa (perde só ~7 dB em 2 s)."""
    voice = bass(59, 3.3).astype(np.float64)
    assert _centroid(voice, 0.0, 0.2) < 260
    assert _centroid(voice, 1.0, 1.2) < 260
    drop = _level_db(voice, 2.0, 2.05) - _level_db(voice, 0.05, 0.1)
    assert -10 < drop < -5, drop
    # O 2º harmônico começa tão forte quanto a fundamental e cai ~11 dB em 2 s (como na gravação).
    def harmonic(t, k):
        part = voice[int(t * SAMPLE_RATE):int(t * SAMPLE_RATE) + SAMPLE_RATE // 5]
        spectrum = np.abs(np.fft.rfft(part * np.hanning(len(part)), 8 * len(part)))
        freqs = np.fft.rfftfreq(8 * len(part), 1 / SAMPLE_RATE)
        return spectrum[(freqs > k * 61.7 * 0.97) & (freqs < k * 61.7 * 1.03)].max()
    assert abs(20 * np.log10(harmonic(0.05, 2) / harmonic(0.05, 1))) < 2
    assert -14 < 20 * np.log10(harmonic(2.0, 2) / harmonic(2.0, 1)) < -8
