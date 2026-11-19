"""Aplicação FastAPI: API de exportação + frontend estático no mesmo servidor.

Execução (a partir da pasta backend/):
    uvicorn app.main:app --port 8000
"""

from __future__ import annotations

import logging
import mimetypes

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from . import __version__
from .api.routes import router
from .core.config import FRONTEND_DIR

logger = logging.getLogger("beat_productor")

# No Windows o registro pode mapear .js para "text/plain", o que faz o navegador
# recusar os ES Modules. Fixamos os tipos corretos.
mimetypes.add_type("text/javascript", ".js")
mimetypes.add_type("text/javascript", ".mjs")
mimetypes.add_type("text/css", ".css")


def create_app() -> FastAPI:
    app = FastAPI(
        title="Beat Productor API",
        version=__version__,
        description="Síntese e exportação (MP3/WAV) das sequências criadas no Beat Productor.",
    )
    app.include_router(router)

    @app.middleware("http")
    async def _always_revalidate_frontend(request: Request, call_next):
        """Sem isto o navegador reaproveita JS antigo do cache depois de uma atualização e pode
        misturar módulos de versões diferentes (o app quebra ao carregar). Com `no-cache` ele
        confere cada arquivo a cada abertura — barato: sem mudança, responde 304 pelo ETag."""
        response = await call_next(request)
        if not request.url.path.startswith("/api"):
            response.headers["Cache-Control"] = "no-cache"
        return response

    @app.exception_handler(Exception)
    async def _unexpected_error(_request: Request, exc: Exception) -> JSONResponse:
        logger.exception("Erro inesperado: %s", exc)
        return JSONResponse(status_code=500, content={"detail": "Erro interno ao gerar o áudio."})

    if FRONTEND_DIR.is_dir():
        # Montado por último: as rotas /api têm prioridade.
        app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")
    else:  # pragma: no cover - só acontece se a pasta for removida
        logger.warning("Pasta do frontend não encontrada: %s", FRONTEND_DIR)

    return app


app = create_app()
