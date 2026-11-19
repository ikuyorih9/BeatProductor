import numpy as np
import pytest

from app.audio.renderer import Event, render_pass, render_sequence
from app.core.config import SAMPLE_RATE, TARGET_PEAK

SR = SAMPLE_RATE


def first_sound(signal, threshold=1e-4):
    return int(np.argmax(np.abs(signal) > threshold))


def test_empty_sequence_is_silence_of_pattern_length():
    out = render_sequence([], 2.0, 1)
    assert len(out) == 2 * SR
    assert not np.any(out)


def test_note_starts_at_the_right_sample():
    out = render_sequence([Event(0.5, "C4", 0.25, "piano")], 2.0)
    assert abs(first_sound(out) - int(0.5 * SR)) <= 2


def test_tail_rings_after_end_without_hard_cut():
    # Nota que termina exatamente no fim do padrão: a cauda do release continua no arquivo.
    out = render_sequence([Event(1.5, "C4", 0.5, "lofi")], 2.0)
    assert len(out) > 2 * SR
    assert abs(float(out[-1])) < 1e-3


def test_loops_multiply_length_and_repeat_identically():
    events = [Event(0.0, "D4", 0.1, "drums"), Event(0.5, "D#4", 0.1, "drums"), Event(0.25, "E4", 0.5, "lead")]
    length = 1.0
    out = render_sequence(events, length, 4)
    assert len(out) >= 4 * SR
    # Voltas 2 e 3 (estado estacionário) são idênticas amostra a amostra.
    second = out[1 * SR:2 * SR]
    third = out[2 * SR:3 * SR]
    np.testing.assert_allclose(second, third, atol=1e-6)


def test_loop_seam_is_continuous():
    """A cauda da volta N soa por cima do início da volta N+1 (sem corte abrupto)."""
    events = [Event(0.9, "C4", 0.1, "piano")]  # nota curta perto do fim, release atravessa a emenda
    out = render_sequence(events, 1.0, 3)
    seam = SR  # emenda entre a volta 1 e a 2
    assert np.max(np.abs(out[seam:seam + 200])) > 0.01  # ainda soando logo após a emenda
    jump = np.max(np.abs(np.diff(out[seam - 50:seam + 50])))
    typical = np.max(np.abs(np.diff(out[seam - 2000:seam - 100])))
    assert jump <= typical * 1.5 + 1e-6


def test_no_clipping_even_with_many_overlapping_notes():
    events = [Event(0.0, f"{name}4", 1.0, inst) for name in "CDEFGAB" for inst in ("piano", "lofi", "lead")]
    events += [Event(0.0, "D4", 0.1, "drums")]
    out = render_sequence(events, 1.0, 2)
    assert np.all(np.isfinite(out))
    assert float(np.max(np.abs(out))) == pytest.approx(TARGET_PEAK, rel=1e-3)


def test_quiet_single_note_is_normalized_to_target():
    out = render_sequence([Event(0.0, "E4", 0.05, "drums")], 1.0)  # hi-hat fechado
    assert float(np.max(np.abs(out))) == pytest.approx(TARGET_PEAK, rel=1e-3)


def test_edges_fade_to_zero():
    out = render_sequence([Event(0.0, "C4", 2.0, "lead")], 2.0)
    assert out[0] == 0.0
    assert abs(float(out[-1])) < 1e-6


def test_render_pass_reuses_identical_notes():
    events = [Event(t / 10, "D4", 0.1, "drums") for t in range(10)]
    buffer = render_pass(events, 1.0)
    assert len(buffer) >= SR


@pytest.mark.parametrize("length,reps", [(0, 1), (-1, 1), (1, 0)])
def test_invalid_arguments(length, reps):
    with pytest.raises(ValueError):
        render_sequence([], length, reps)


def _rms(signal):
    return float(np.sqrt(np.mean(np.square(signal, dtype=np.float64))))


def test_gain_scales_the_instrument_relative_to_the_others():
    loud = render_pass([Event(0.0, "C4", 0.5, "piano", 1.0)], 1.0)
    quiet = render_pass([Event(0.0, "C4", 0.5, "piano", 0.5)], 1.0)
    assert _rms(quiet) == pytest.approx(_rms(loud) * 0.5, rel=1e-5)


def test_gain_zero_mutes_the_instrument():
    out = render_pass([Event(0.0, "C4", 0.5, "piano", 0.0), Event(0.0, "C4", 0.5, "lead", 1.0)], 1.0)
    only_lead = render_pass([Event(0.0, "C4", 0.5, "lead", 1.0)], 1.0)
    np.testing.assert_array_equal(out, only_lead)


def test_muted_sequence_is_silence_without_errors():
    out = render_sequence([Event(0.0, "C4", 0.5, "piano", 0.0)], 1.0, 1)
    assert not np.any(out)


def test_instruments_are_calibrated_to_similar_loudness():
    """No volume 100%, nenhum instrumento melódico fica mais de 3 dB longe dos outros."""
    levels = {}
    for instrument in ("piano", "lofi", "lead"):
        out = render_pass([Event(0.0, "C4", 0.5, instrument)], 0.5)[: SR // 2]
        levels[instrument] = 20 * np.log10(_rms(out))
    assert max(levels.values()) - min(levels.values()) < 3.0, levels


def _drum_hit(note):
    """Um golpe isolado, já com as calibrações (instrumento × peça) aplicadas."""
    return render_pass([Event(0.0, note, 0.1, "drums")], 0.5).astype(np.float64)


def _short_term_db(signal):
    """Intensidade de um golpe curto: o maior RMS numa janela de 50 ms."""
    window = int(0.05 * SR)
    energy = np.convolve(signal * signal, np.ones(window), "valid") / window
    return 10 * np.log10(energy.max())


#: Quanto cada peça fica abaixo do bumbo (dB, intensidade de curto prazo): (mínimo, máximo).
DRUM_BALANCE = {
    "D#4": ("caixa", 2, 5), "E4": ("chimbal", 10, 14), "F4": ("surdo", 0, 2.5), "F#4": ("tom 2", 0, 2.5),
    "G4": ("tom 1", 0, 2.5), "G#4": ("ride", 8, 12), "A4": ("prato de ataque", 2.5, 6),
}


def test_drum_pieces_are_balanced_against_the_kick():
    """Nenhuma peça fica enterrada nem passa do bumbo."""
    kick = _short_term_db(_drum_hit("D4"))
    for note, (name, low, high) in DRUM_BALANCE.items():
        below = kick - _short_term_db(_drum_hit(note))
        assert low <= below <= high, (name, below)


def test_no_drum_piece_peaks_far_above_the_kick():
    """O pico de cada peça fica até 1,25× o do bumbo: nenhuma domina a normalização do arquivo
    (no navegador, o mesmo limite deixa a bateria abaixo do limitador, sem saturar)."""
    kick = np.max(np.abs(_drum_hit("D4")))
    for note, (name, _low, _high) in DRUM_BALANCE.items():
        assert np.max(np.abs(_drum_hit(note))) <= 1.25 * kick, name


def test_drums_at_200_percent_are_12_db_louder_in_the_mix():
    base = render_pass([Event(0.0, "D#4", 0.1, "drums", 1.0)], 0.5)
    loud = render_pass([Event(0.0, "D#4", 0.1, "drums", 4.0)], 0.5)
    assert 20 * np.log10(_rms(loud) / _rms(base)) == pytest.approx(12.04, abs=0.01)
