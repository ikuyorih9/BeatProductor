# Imagem única do Beat Productor: o FastAPI serve a API (/api) e o frontend estático.
# Usada no Hugging Face Spaces (porta 7860), mas roda em qualquer host com Docker;
# a porta pode ser trocada pela variável PORT (ex.: Render, Cloud Run).
FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PORT=7860

# O Hugging Face roda o container com o usuário de UID 1000.
RUN useradd --create-home --uid 1000 user

WORKDIR /app

# Dependências primeiro: só reinstalam quando o requirements.txt muda.
COPY backend/requirements.txt backend/requirements.txt
RUN pip install --only-binary :all: -r backend/requirements.txt

COPY --chown=user backend/app backend/app
COPY --chown=user frontend frontend

USER user
EXPOSE 7860

CMD ["sh", "-c", "exec uvicorn app.main:app --app-dir backend --host 0.0.0.0 --port ${PORT} --proxy-headers --forwarded-allow-ips='*'"]
