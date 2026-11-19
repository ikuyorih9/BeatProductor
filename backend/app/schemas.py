"""Modelos (Pydantic) do contrato JSON entre frontend e backend.

Exemplo de corpo do POST /api/export:

    {
      "bpm": 120,
      "length": 8.0,
      "loop": true,
      "loops": 4,
      "format": "mp3",
      "events": [
        {"time": 0.0, "note": "C4", "duration": 0.5, "instrument": "piano"}
      ]
    }

Tempos em segundos. `length` é a duração de UMA passada do padrão.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from .core.config import (
    MAX_EVENTS, MAX_LOOPS, MAX_NOTE_SECONDS, MAX_PATTERN_SECONDS, MAX_TOTAL_SECONDS,
)
from .core.music import NOTE_PATTERN, note_to_midi

Instrument = Literal["piano", "drums", "lofi", "lead"]

# Tolerância para arredondamentos de ponto flutuante vindos do navegador.
EPSILON = 1e-6


class NoteEvent(BaseModel):
    model_config = ConfigDict(extra="forbid")

    time: float = Field(ge=0, description="Início da nota (s)")
    note: str = Field(pattern=NOTE_PATTERN, description='Nome científico, ex.: "C4", "F#3"')
    duration: float = Field(gt=0, le=MAX_NOTE_SECONDS, description="Duração (s)")
    instrument: Instrument

    @field_validator("note")
    @classmethod
    def _note_in_midi_range(cls, value: str) -> str:
        midi = note_to_midi(value)
        if not 0 <= midi <= 127:
            raise ValueError("nota fora da faixa MIDI (0–127)")
        return value


class ExportRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    events: list[NoteEvent] = Field(default_factory=list, max_length=MAX_EVENTS)
    length: float = Field(gt=0, le=MAX_PATTERN_SECONDS, description="Duração de uma passada do padrão (s)")
    loop: bool = False
    loops: int = Field(default=1, ge=1, le=MAX_LOOPS, description="Repetições quando loop = true")
    bpm: int | None = Field(default=None, ge=40, le=240, description="Informativo (metadados)")
    format: Literal["mp3", "wav"] = "mp3"

    @property
    def repetitions(self) -> int:
        return self.loops if self.loop else 1

    @model_validator(mode="after")
    def _check_consistency(self) -> "ExportRequest":
        for index, event in enumerate(self.events):
            if event.time >= self.length - EPSILON:
                raise ValueError(f"events[{index}]: começa em {event.time:.3f}s, depois do fim do padrão ({self.length:.3f}s)")
        total = self.length * self.repetitions
        if total > MAX_TOTAL_SECONDS:
            raise ValueError(
                f"áudio final muito longo: {total:.0f}s (máximo {MAX_TOTAL_SECONDS:.0f}s). "
                "Reduza a quantidade de loops ou de compassos, ou aumente o BPM."
            )
        return self
