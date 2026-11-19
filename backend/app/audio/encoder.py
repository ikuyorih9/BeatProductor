"""Codificação do áudio final em WAV (biblioteca padrão) e MP3 (lameenc).

O MP3 usa o `lameenc` (encoder LAME empacotado como wheel do pip), então não
há dependência de binários externos como o ffmpeg.
"""

from __future__ import annotations

import io
import wave

import lameenc
import numpy as np

from ..core.config import MP3_BITRATE, SAMPLE_RATE


def to_pcm16(samples: np.ndarray) -> bytes:
    """float [-1, 1] → PCM 16 bits little-endian (com saturação de segurança)."""
    clipped = np.clip(samples, -1.0, 1.0)
    return (np.round(clipped * 32767.0)).astype("<i2").tobytes()


def encode_wav(samples: np.ndarray, sr: int = SAMPLE_RATE) -> bytes:
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(sr)
        wav.writeframes(to_pcm16(samples))
    return buffer.getvalue()


def encode_mp3(samples: np.ndarray, sr: int = SAMPLE_RATE, bitrate: int = MP3_BITRATE) -> bytes:
    encoder = lameenc.Encoder()
    encoder.set_bit_rate(bitrate)
    encoder.set_in_sample_rate(sr)
    encoder.set_channels(1)
    encoder.set_quality(2)  # 2 = alta qualidade (0 melhor … 7 mais rápido)
    data = encoder.encode(to_pcm16(samples))
    data += encoder.flush()
    return bytes(data)


def encode(samples: np.ndarray, fmt: str, sr: int = SAMPLE_RATE) -> bytes:
    if fmt == "mp3":
        return encode_mp3(samples, sr)
    if fmt == "wav":
        return encode_wav(samples, sr)
    raise ValueError(f"Formato não suportado: {fmt!r}")
