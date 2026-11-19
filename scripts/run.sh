#!/usr/bin/env bash
# Inicia o Beat Productor (API + frontend) em http://127.0.0.1:8000
# Uso: scripts/run.sh [porta]
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${1:-8000}"
VENV="$ROOT/.venv"

if [ -x "$VENV/Scripts/python.exe" ]; then
  PYTHON="$VENV/Scripts/python.exe"     # Windows (Git Bash)
elif [ -x "$VENV/bin/python" ]; then
  PYTHON="$VENV/bin/python"             # Linux / macOS
else
  echo "Criando ambiente virtual em .venv ..."
  python3 -m venv "$VENV" 2>/dev/null || python -m venv "$VENV"
  if [ -x "$VENV/Scripts/python.exe" ]; then PYTHON="$VENV/Scripts/python.exe"; else PYTHON="$VENV/bin/python"; fi
fi

echo "Verificando dependências ..."
"$PYTHON" -m pip install --disable-pip-version-check -q -r "$ROOT/backend/requirements.txt"

echo
echo "Beat Productor rodando em http://127.0.0.1:$PORT  (Ctrl+C para parar)"
echo
exec "$PYTHON" -m uvicorn app.main:app --app-dir "$ROOT/backend" --host 127.0.0.1 --port "$PORT"
