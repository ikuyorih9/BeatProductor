"""Síntese dos 5 instrumentos (a bateria com 17 peças) com NumPy/SciPy.

Cada função devolve um array mono ``float32`` com a nota completa,
incluindo a cauda (release). Os parâmetros espelham
frontend/js/audio/instruments.js para que exportação e pré-escuta soem parecidas.

Toda voz termina em silêncio (envelope → 0), o que evita estalos na mixagem.
"""

from __future__ import annotations

from functools import lru_cache

import numpy as np
from scipy.signal import butter, sosfilt

from ..core.config import SAMPLE_RATE
from ..core.music import drum_piece_for_midi, midi_to_frequency

TWO_PI = 2.0 * np.pi


# --------------------------------------------------------------------------- utilitários
def _time(n: int, sr: int) -> np.ndarray:
    return np.arange(n, dtype=np.float64) / sr


def _phase(freq_hz: np.ndarray | float, n: int, sr: int) -> np.ndarray:
    """Fase acumulada (em ciclos) para uma frequência constante ou variável."""
    if np.isscalar(freq_hz):
        return _time(n, sr) * float(freq_hz)
    return np.cumsum(freq_hz) / sr


def _cents(cents: float | np.ndarray) -> float | np.ndarray:
    return 2.0 ** (np.asarray(cents) / 1200.0)


def _saw_polyblep(phase_cycles: np.ndarray, freq_hz: float, sr: int) -> np.ndarray:
    """Dente-de-serra com correção PolyBLEP (reduz aliasing)."""
    p = np.mod(phase_cycles, 1.0)
    dt = min(freq_hz / sr, 0.5)
    out = 2.0 * p - 1.0
    low = p < dt
    t = p[low] / dt
    out[low] -= t + t - t * t - 1.0
    high = p > 1.0 - dt
    t = (p[high] - 1.0) / dt
    out[high] -= t * t + t + t + 1.0
    return out


def _triangle(phase_cycles: np.ndarray) -> np.ndarray:
    p = np.mod(phase_cycles, 1.0)
    return 2.0 * np.abs(2.0 * p - 1.0) - 1.0


def _filter(signal: np.ndarray, kind: str, cutoff_hz: float, sr: int, order: int = 2) -> np.ndarray:
    cutoff = min(cutoff_hz, sr * 0.45)
    sos = butter(order, cutoff, btype=kind, fs=sr, output="sos")
    return sosfilt(sos, signal)


def adsr(n: int, sr: int, *, duration: float, attack: float, decay: float,
         sustain: float, release: float, peak: float) -> np.ndarray:
    """Envelope ADSR (mesmo formato do applyAdsr do frontend)."""
    t = _time(n, sr)
    env = np.zeros(n)
    sustain_level = peak * sustain
    release_start = max(duration, attack)

    in_attack = t < attack
    env[in_attack] = peak * t[in_attack] / attack

    in_decay = (t >= attack) & (t < release_start)
    env[in_decay] = sustain_level + (peak - sustain_level) * np.exp(-(t[in_decay] - attack) / (decay / 3.0))

    level_at_release = sustain_level + (peak - sustain_level) * np.exp(-(release_start - attack) / (decay / 3.0))
    in_release = t >= release_start
    env[in_release] = level_at_release * np.exp(-(t[in_release] - release_start) / (release / 4.0))
    return env


def _fade_tail(signal: np.ndarray, sr: int, seconds: float = 0.005) -> np.ndarray:
    """Garante que a voz termine exatamente em zero (sem estalo)."""
    n = min(len(signal), max(1, int(seconds * sr)))
    signal[-n:] *= np.linspace(1.0, 0.0, n)
    return signal


# --------------------------------------------------------------------------- piano
def piano(midi: int, duration: float, sr: int = SAMPLE_RATE) -> np.ndarray:
    """Piano acústico simulado: parciais com leve inarmonicidade e decaimento natural."""
    freq = midi_to_frequency(midi)
    n = int((duration + 0.35) * sr)
    t = _time(n, sr)

    decay = min(2.4, max(0.35, 1.4 * np.sqrt(261.63 / freq)))
    tau = decay / 2.5
    signal = np.zeros(n)
    for ratio, gain in ((1, 1.0), (2, 0.42), (3, 0.2), (4, 0.1), (5, 0.05)):
        partial = freq * ratio * (1 + 0.0004 * ratio * ratio)
        if partial >= sr / 2:
            continue
        # Parciais agudas morrem um pouco antes — soa mais natural.
        signal += gain * np.sin(TWO_PI * partial * t) * np.exp(-t / (tau / np.sqrt(ratio)) * 0.5)
    signal = _filter(signal, "lowpass", min(9000.0, freq * 10), sr)

    attack = 0.004
    env = np.where(t < attack, 0.42 * t / attack, 0.42 * np.exp(-(t - attack) / tau))
    released = t >= duration
    env[released] = env[released] * np.exp(-(t[released] - duration) / 0.05)
    return _fade_tail((signal * env).astype(np.float32), sr)


# --------------------------------------------------------------------------- bateria
def _exp_decay(t: np.ndarray, start_level: float, seconds_to_silence: float) -> np.ndarray:
    """Queda exponencial de `start_level` até 0,001 em `seconds_to_silence`."""
    return start_level * (0.001 / start_level) ** np.minimum(t / seconds_to_silence, 1.0)


@lru_cache(maxsize=16)
def _noise(n: int, seed: int) -> np.ndarray:
    return np.random.default_rng(seed).uniform(-1.0, 1.0, n)


def _kick(sr: int) -> np.ndarray:
    """Seno grave (160→50 Hz) + knock médio (330→110 Hz): o knock faz o bumbo ser ouvido mesmo em
    alto-falantes pequenos, que não reproduzem 50 Hz. Sem ruído (um estalo de ruído soava como chiado)."""
    n = int(0.47 * sr)
    t = _time(n, sr)
    freq = np.where(t < 0.12, 160.0 * (50.0 / 160.0) ** (t / 0.12), 50.0)
    env = np.where(t < 0.003, 0.8 * t / 0.003, _exp_decay(np.maximum(t - 0.003, 0), 0.8, 0.447))
    body = np.sin(TWO_PI * _phase(freq, n, sr)) * env
    knock_freq = np.where(t < 0.04, 330.0 * (110.0 / 330.0) ** (t / 0.04), 110.0)
    knock = np.sin(TWO_PI * _phase(knock_freq, n, sr)) * _exp_decay(t, 0.3, 0.12)
    return body + knock


def _snare(sr: int) -> np.ndarray:
    # Decaimentos mais longos que um "estalo": a caixa tem corpo sem precisar de pico maior.
    n = int(0.32 * sr)
    t = _time(n, sr)
    noise = _filter(_noise(n, 1), "highpass", 1200.0, sr) * _exp_decay(t, 0.42, 0.3)
    body = _triangle(185.0 * t) * _exp_decay(t, 0.38, 0.15)
    return noise + body


def _hihat(sr: int, decay: float, seed: int) -> np.ndarray:
    n = int((decay + 0.02) * sr)
    t = _time(n, sr)
    return _filter(_noise(n, seed), "highpass", 7000.0, sr) * _exp_decay(t, 0.32, decay)


#: Tons: queda de afinação `from`→`to` Hz em `glide` s; silencia em `decay` s (= frontend TOMS).
TOMS = {
    "floor_tom": {"start": 120.0, "end": 82.0, "glide": 0.2, "decay": 0.7},
    "tom2": {"start": 165.0, "end": 118.0, "glide": 0.18, "decay": 0.55},
    "tom1": {"start": 220.0, "end": 160.0, "glide": 0.16, "decay": 0.45},
    "rototoms": {"start": 290.0, "end": 175.0, "glide": 0.25, "decay": 0.4},
    "octobans": {"start": 340.0, "end": 290.0, "glide": 0.08, "decay": 0.3},
}


def _tom(sr: int, start: float, end: float, glide: float, decay: float, seed: int) -> np.ndarray:
    n = int((decay + 0.02) * sr)
    t = _time(n, sr)
    freq = np.where(t < glide, start * (end / start) ** (t / glide), end)
    body_env = np.where(t < 0.002, 0.8 * t / 0.002, _exp_decay(np.maximum(t - 0.002, 0), 0.8, decay - 0.002))
    body = np.sin(TWO_PI * _phase(freq, n, sr)) * body_env
    stick = _filter(_noise(n, seed), "highpass", 2000.0, sr) * _exp_decay(t, 0.12, 0.05)
    return body + stick


#: Frequências das 6 ondas quadradas do timbre metálico dos pratos (= frontend METAL_FREQUENCIES).
METAL_FREQUENCIES = (205.3, 304.4, 369.6, 522.7, 540.0, 800.0)

#: Pratos: nível do metal, corte do metal, nível do ruído, decaimento, multiplicador das frequências
#: do metal e corte do ruído (= frontend CYMBALS).
CYMBALS = {
    "ride": {"metal": 0.3, "metal_cutoff": 5000.0, "noise": 0.08, "decay": 1.6},
    "crash": {"metal": 0.2, "metal_cutoff": 6000.0, "noise": 0.35, "decay": 1.8},
    "splash": {"metal": 0.2, "metal_cutoff": 7000.0, "noise": 0.3, "decay": 0.7, "scale": 1.4},
    "china": {"metal": 0.35, "metal_cutoff": 2500.0, "noise": 0.25, "noise_cutoff": 3000.0, "decay": 1.3,
              "scale": 0.82},
    "stack": {"metal": 0.3, "metal_cutoff": 3500.0, "noise": 0.4, "noise_cutoff": 3500.0, "decay": 0.35,
              "scale": 1.27},
}
_CYMBAL_SEEDS = {"ride": 5, "crash": 6, "splash": 8, "china": 9, "stack": 10}


@lru_cache(maxsize=16)
def _metal(n: int, sr: int, scale: float = 1.0) -> np.ndarray:
    """Soma das ondas quadradas, com banda limitada (só harmônicos abaixo de Nyquist, como no navegador)."""
    t = _time(n, sr)
    out = np.zeros(n)
    for base in METAL_FREQUENCIES:
        freq = base * scale
        k = 1
        while k * freq < sr / 2:
            out += (4.0 / np.pi) * np.sin(TWO_PI * k * freq * t) / k
            k += 2
    out.setflags(write=False)
    return out


def _cymbal(sr: int, metal: float, metal_cutoff: float, noise: float, decay: float, seed: int,
            scale: float = 1.0, noise_cutoff: float = 5000.0) -> np.ndarray:
    n = int((decay + 0.02) * sr)
    t = _time(n, sr)
    tone = _filter(_metal(n, sr, scale), "highpass", metal_cutoff, sr) * (metal / len(METAL_FREQUENCIES))
    hiss = _filter(_noise(n, seed), "highpass", noise_cutoff, sr) * noise
    env = np.where(t < 0.002, t / 0.002, _exp_decay(np.maximum(t - 0.002, 0), 1.0, decay - 0.002))
    return (tone + hiss) * env


#: Percussão "afinada": senos (Hz, nível) com um envelope de golpe + ruído agudo opcional (= frontend PINGS).
PINGS = {
    "bell": {"partials": ((740.0, 0.45), (1716.0, 0.3), (2886.0, 0.18), (4100.0, 0.1)), "decay": 1.3},
    "cowbell": {"partials": ((540.0, 0.5), (800.0, 0.5), (1620.0, 0.17), (2400.0, 0.17)), "decay": 0.35},
    "jam_block": {"partials": ((880.0, 0.6), (2030.0, 0.25), (3200.0, 0.08)), "decay": 0.12},
    "tambourine": {"partials": ((5400.0, 0.06), (6800.0, 0.06), (8100.0, 0.05), (9600.0, 0.05)), "decay": 0.3,
                   "noise": 0.4, "noise_cutoff": 6000.0},
}


def _ping(sr: int, partials: tuple, decay: float, noise: float = 0.0, noise_cutoff: float = 6000.0) -> np.ndarray:
    n = int((decay + 0.02) * sr)
    t = _time(n, sr)
    tone = np.zeros(n)
    for freq, level in partials:
        tone += level * np.sin(TWO_PI * freq * t)
    if noise > 0:
        tone += _filter(_noise(n, 7), "highpass", noise_cutoff, sr) * noise
    env = np.where(t < 0.001, t / 0.001, _exp_decay(np.maximum(t - 0.001, 0), 1.0, decay - 0.001))
    return tone * env


def drums(midi: int, duration: float, sr: int = SAMPLE_RATE) -> np.ndarray:  # noqa: ARG001 (one-shot)
    """Bateria one-shot: cada tecla do kit (A3 a C#5) é uma peça; a duração é ignorada."""
    piece = drum_piece_for_midi(midi)
    if piece == "kick":
        signal = _kick(sr)
    elif piece == "snare":
        signal = _snare(sr)
    elif piece == "hihat":
        signal = _hihat(sr, 0.08, seed=2)
    elif piece in TOMS:
        signal = _tom(sr, **TOMS[piece], seed=4)
    elif piece in CYMBALS:
        signal = _cymbal(sr, **CYMBALS[piece], seed=_CYMBAL_SEEDS[piece])
    elif piece in PINGS:
        signal = _ping(sr, **PINGS[piece])
    else:
        raise ValueError(f"A tecla MIDI {midi} não faz parte da bateria (use A3 a C#5).")
    return _fade_tail(signal.astype(np.float32), sr)


# --------------------------------------------------------------------------- baixo
#: O baixo soa DUAS oitavas abaixo da tecla do grid: E3 no grid = E1 (41 Hz), a corda Mi solta de um
#: baixo de 4 cordas; B5 = B3. As teclas abaixo de E3 ficam desativadas no baixo (= frontend).
BASS_TRANSPOSE = -24

#: Modelo medido de um baixo elétrico real (nota B1 de referência, ver docs/DIARIO_DE_CODIFICACAO.md).
#: Espelha frontend BASS_MODEL — as duas implementações fazem a mesma conta.
BASS_MODEL = {
    # Ajustados por mínimos quadrados à trajetória de cada harmônico na gravação de referência (erro
    # de 0,1 a 1,8 dB do 1º ao 5º harmônico). Nível de cada harmônico em dB relativos à fundamental —
    # quase nada acima do 6º: o baixo é escuro.
    "harmonics_db": (0.00, 3.10, -7.30, -8.30, -9.30, -21.30, -32.10, -33.30, -39.10, -32.30, -33.70, -35.00, -40.00, -45.00, -50.00, -55.00),
    # Decaimento lento de cada harmônico (dB/s) no B1; notas mais agudas decaem mais rápido:
    # × (f0 / 61,7 Hz)^0,7 (cordas mais curtas/finas perdem energia mais depressa).
    "decay_db": (1.50, 3.50, 0.50, 3.00, 5.00, 4.20, 6.80, 9.20, 8.20, 9.50, 10.00, 7.00, 12.00, 14.00, 16.00, 18.00),
    "decay_ref_hz": 61.7,
    "decay_exponent": 0.7,
    # Duas fases: parte de alguns harmônicos (o 2º e o 3º, sobretudo) some rápido logo após o ataque
    # (o "estalo" da corda) e o resto sustenta. Fração rápida de cada harmônico e a sua queda (dB/s).
    "fast_fraction": (0.05, 0.70, 0.85, 0.00, 0.05, 0.65, 0.00, 0.75, 0.60, 0.90, 0.90, 0.90, 0.90, 0.90, 0.90, 0.90),
    "fast_decay_db": 30.0,
    "inharmonicity": 1.5e-4,  # corda grossa: os harmônicos ficam levemente acima de k·f0
    "tone_hz": 1000.0,        # captador/amplificador: corte suave nos agudos (notas altas não ficam brilhantes)
    "max_hz": 5000.0,
    "attack": 0.003,          # ataque do dedo, como na gravação (~3 ms)
    "release": 0.1,           # abafar a corda com a mão ao fim da nota
    "level": 0.25,            # RMS no ataque (antes da calibração do instrumento)
}


def _bass_modes(midi: int) -> list[tuple[float, float, float, float, float]]:
    """(frequência, amplitude, decaimento lento, fração rápida, decaimento rápido) de cada modo audível."""
    m = BASS_MODEL
    f0 = midi_to_frequency(midi + BASS_TRANSPOSE)
    pitch_scale = (f0 / m["decay_ref_hz"]) ** m["decay_exponent"]
    modes = []
    for k, level_db in enumerate(m["harmonics_db"], start=1):
        freq = k * f0 * np.sqrt(1.0 + m["inharmonicity"] * k * k)
        if freq >= m["max_hz"]:
            break
        tone = 1.0 / np.sqrt(1.0 + (freq / m["tone_hz"]) ** 4)
        decay = m["decay_db"][k - 1] * pitch_scale
        modes.append((float(freq), float(10.0 ** (level_db / 20.0) * tone), float(decay),
                      float(m["fast_fraction"][k - 1]), float(m["fast_decay_db"] * pitch_scale)))
    return modes


def bass(midi: int, duration: float, sr: int = SAMPLE_RATE) -> np.ndarray:
    """Baixo elétrico de 4 cordas por SÍNTESE MODAL medida de um baixo real (nota B1 de referência):
    cada modo de vibração da corda é um seno com o nível e o decaimento medidos na gravação.
    Espelha frontend/js/audio/instruments.js (`renderBass`), amostra por amostra."""
    m = BASS_MODEL
    release = m["release"]
    n = max(1, int(round((max(duration, 0.005) + release * 1.5) * sr)))
    t = np.arange(n) / sr
    modes = _bass_modes(midi)
    norm = m["level"] / np.sqrt(sum(mode[1] * mode[1] for mode in modes) / 2.0)
    out = np.zeros(n)
    for freq, amp, decay, fast, fast_decay in modes:
        envelope = (1.0 - fast) * np.power(10.0, -decay * t / 20.0) + fast * np.power(10.0, -fast_decay * t / 20.0)
        out += (amp * norm) * envelope * np.sin(TWO_PI * freq * t)
    env = np.minimum(1.0, t / m["attack"])
    released = t >= duration
    env[released] *= np.exp(-(t[released] - duration) / (release / 4.0))
    return _fade_tail((out * env).astype(np.float32), sr)


# --------------------------------------------------------------------------- lofi synth
def lofi(midi: int, duration: float, sr: int = SAMPLE_RATE) -> np.ndarray:
    """Lofi: triângulo + seno desafinados, vibrato lento e passa-baixa abafado."""
    freq = midi_to_frequency(midi)
    release = 0.35
    n = int((max(duration, 0.03) + release * 1.5) * sr)
    t = _time(n, sr)
    vibrato = 6.0 * np.sin(TWO_PI * 4.5 * t)  # cents
    a = _triangle(_phase(freq * _cents(-8.0 + vibrato), n, sr))
    b = np.sin(TWO_PI * _phase(freq * _cents(8.0 + vibrato), n, sr))
    signal = _filter(0.7 * a + 0.5 * b, "lowpass", 900.0, sr)
    env = adsr(n, sr, duration=duration, attack=0.03, decay=0.3, sustain=0.7, release=release, peak=0.45)
    return _fade_tail((signal * env).astype(np.float32), sr)


# --------------------------------------------------------------------------- lead synth
def lead(midi: int, duration: float, sr: int = SAMPLE_RATE) -> np.ndarray:
    """Lead: duas dentes-de-serra desafinadas (±6 cents), brilhantes."""
    freq = midi_to_frequency(midi)
    release = 0.15
    n = int((max(duration, 0.01) + release * 1.5) * sr)
    fa, fb = freq * _cents(-6.0), freq * _cents(6.0)
    signal = _saw_polyblep(_phase(fa, n, sr), fa, sr) + _saw_polyblep(_phase(fb, n, sr), fb, sr)
    signal = _filter(signal, "lowpass", 4500.0, sr)
    env = adsr(n, sr, duration=duration, attack=0.01, decay=0.15, sustain=0.6, release=release, peak=0.2)
    return _fade_tail((signal * env).astype(np.float32), sr)


SYNTHS = {"piano": piano, "drums": drums, "bass": bass, "lofi": lofi, "lead": lead}


def render_note(instrument: str, midi: int, duration: float, sr: int = SAMPLE_RATE) -> np.ndarray:
    """Renderiza uma nota de qualquer instrumento."""
    try:
        synth = SYNTHS[instrument]
    except KeyError as exc:
        raise ValueError(f"Instrumento desconhecido: {instrument!r}") from exc
    return synth(midi, duration, sr)
