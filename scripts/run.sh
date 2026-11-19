#!/usr/bin/env bash
# Inicia o Beat Productor (API + frontend) em http://127.0.0.1:8000
# Uso: scripts/run.sh [porta]
# Precisa de um Python 3.12 a 3.14 (64 bits) — a faixa para a qual as dependências fixadas têm
# pacotes prontos. Mantenha em sincronia com launcher/BeatProductor.cs e backend/pyproject.toml.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${1:-8000}"
VENV="$ROOT/.venv"
MIN_MINOR=12
MAX_MINOR=14
PROBE="import sys, struct, sysconfig; print(int(sys.version_info[0] == 3 and $MIN_MINOR <= sys.version_info[1] <= $MAX_MINOR and struct.calcsize('P') == 8 and not sysconfig.get_config_var('Py_GIL_DISABLED')))"

compatible() { [ "$("$@" -c "$PROBE" 2>/dev/null | tr -d '\r')" = "1" ]; }

venv_python() {
  if [ -x "$VENV/Scripts/python.exe" ]; then echo "$VENV/Scripts/python.exe"   # Windows (Git Bash)
  elif [ -x "$VENV/bin/python" ]; then echo "$VENV/bin/python"                 # Linux / macOS
  fi
}

PYTHON="$(venv_python)"
if [ -n "$PYTHON" ] && ! compatible "$PYTHON"; then
  echo "O .venv foi criado com um Python fora da faixa 3.12–3.14 (ou está quebrado). Recriando ..."
  rm -rf "$VENV"
  PYTHON=""
fi

if [ -z "$PYTHON" ]; then
  BASE=""
  for candidate in python3.13 python3.12 python3.14 python3 python; do
    if command -v "$candidate" >/dev/null 2>&1 && compatible "$candidate"; then BASE="$candidate"; break; fi
  done
  if [ -z "$BASE" ]; then
    if [ -f "$ROOT/BeatProductor.exe" ] && [ -n "${WINDIR:-}" ]; then
      echo "Nenhum Python 3.12–3.14 encontrado; o BeatProductor.exe vai instalar um automaticamente."
      exec "$ROOT/BeatProductor.exe" --port "$PORT"
    fi
    echo "ERRO: nenhum Python 3.12–3.14 (64 bits) encontrado." >&2
    echo "  Ubuntu/Debian:  sudo apt install python3.12 python3.12-venv" >&2
    echo "  macOS:          brew install python@3.13" >&2
    echo "  Outros:         https://www.python.org/downloads/" >&2
    exit 1
  fi
  echo "Criando ambiente virtual em .venv (com $BASE) ..."
  "$BASE" -m venv "$VENV"
  PYTHON="$(venv_python)"
fi

echo "Verificando dependências ..."
"$PYTHON" -m pip install --disable-pip-version-check -q --only-binary :all: --retries 5 -r "$ROOT/backend/requirements.txt"

echo
echo "Beat Productor rodando em http://127.0.0.1:$PORT  (Ctrl+C para parar)"
echo
exec "$PYTHON" -m uvicorn app.main:app --app-dir "$ROOT/backend" --host 127.0.0.1 --port "$PORT"
