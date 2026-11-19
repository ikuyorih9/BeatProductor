"""Endpoints da API (prefixo /api)."""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter
from fastapi.responses import Response

from .. import __version__
from ..audio.encoder import encode
from ..audio.renderer import Event, render_sequence
from ..core.config import FORMATS, INSTRUMENTS, MAX_LOOPS, MAX_TOTAL_SECONDS, SAMPLE_RATE
from ..schemas import ExportRequest

router = APIRouter(prefix="/api", tags=["api"])

MEDIA_TYPES = {"mp3": "audio/mpeg", "wav": "audio/wav"}


@router.get("/health")
def health() -> dict:
    """Verificação de saúde e capacidades do servidor."""
    return {
        "status": "ok",
        "version": __version__,
        "sample_rate": SAMPLE_RATE,
        "instruments": list(INSTRUMENTS),
        "formats": list(FORMATS),
        "limits": {"max_loops": MAX_LOOPS, "max_total_seconds": MAX_TOTAL_SECONDS},
    }


# Função síncrona de propósito: o FastAPI a executa num pool de threads,
# então a síntese (CPU) não bloqueia o loop de eventos do servidor.
@router.post(
    "/export",
    response_class=Response,
    responses={200: {"content": {"audio/mpeg": {}, "audio/wav": {}}, "description": "Arquivo de áudio"}},
)
def export_audio(request: ExportRequest) -> Response:
    """Renderiza a sequência recebida e devolve o arquivo de áudio para download."""
    events = [Event(e.time, e.note, e.duration, e.instrument, e.gain) for e in request.events]
    samples = render_sequence(events, request.length, request.repetitions)
    data = encode(samples, request.format)

    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    filename = f"beat-productor-{stamp}.{request.format}"
    return Response(
        content=data,
        media_type=MEDIA_TYPES[request.format],
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "X-Audio-Duration": f"{len(samples) / SAMPLE_RATE:.3f}",
            "Access-Control-Expose-Headers": "Content-Disposition, X-Audio-Duration",
        },
    )
