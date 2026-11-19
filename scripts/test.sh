#!/usr/bin/env bash
# Roda TODOS os testes: backend (pytest), frontend (node:test + sintaxe) e E2E no navegador.
# Uso: scripts/test.sh            (pressupõe .venv criado — rode scripts/run.sh uma vez antes)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${E2E_PORT:-8765}"
if [ -x "$ROOT/.venv/Scripts/python.exe" ]; then PYTHON="$ROOT/.venv/Scripts/python.exe"; else PYTHON="$ROOT/.venv/bin/python"; fi

echo "== Dependências de teste =="
"$PYTHON" -m pip install --disable-pip-version-check -q -r "$ROOT/backend/requirements-dev.txt"

echo "== Backend (pytest) =="
(cd "$ROOT/backend" && "$PYTHON" -m pytest)

echo "== Frontend (node:test + sintaxe) =="
(cd "$ROOT/frontend" && npm test --silent && npm run check --silent)

echo "== E2E (navegador headless) =="
"$PYTHON" -m uvicorn app.main:app --app-dir "$ROOT/backend" --host 127.0.0.1 --port "$PORT" --log-level warning &
SERVER=$!
trap 'kill $SERVER 2>/dev/null || true' EXIT
for _ in $(seq 1 50); do
  "$PYTHON" -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:$PORT/api/health')" 2>/dev/null && break
  sleep 0.2
done
node "$ROOT/tests/e2e/smoke.mjs" "http://127.0.0.1:$PORT/" --export

echo
echo "Todos os testes passaram."
