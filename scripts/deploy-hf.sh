#!/usr/bin/env bash
# Publica o Beat Productor num Space do Hugging Face (Docker).
# Uso: scripts/deploy-hf.sh <usuario>/<nome-do-space>
#
# Envia só o necessário para rodar (Dockerfile, backend/app, frontend) a partir do último
# commit, com um README próprio que tem o cabeçalho de configuração exigido pelo Hugging Face.
# Assim o README do GitHub fica intacto e arquivos binários (banner.png, BeatProductor.exe),
# que o Hugging Face recusa sem Git LFS, ficam de fora.
set -euo pipefail

SPACE="${1:-}"
if [[ ! "$SPACE" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]]; then
  echo "Uso: scripts/deploy-hf.sh <usuario>/<nome-do-space>" >&2
  exit 1
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [ -n "$(git status --porcelain -- Dockerfile .dockerignore backend frontend)" ]; then
  echo "Aviso: há mudanças não commitadas em backend/ ou frontend/; elas NÃO serão enviadas."
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

git archive HEAD Dockerfile .dockerignore backend/requirements.txt backend/app frontend | tar -x -C "$TMP"

cat > "$TMP/README.md" <<'MD'
---
title: Beat Productor
emoji: 🎹
colorFrom: indigo
colorTo: pink
sdk: docker
app_port: 7860
pinned: false
---

Crie beats e melodias num piano roll, direto no navegador, e exporte em MP3 ou WAV.

Código-fonte: https://github.com/ikuyorih9/BeatProductor
MD

COMMIT="$(git rev-parse --short HEAD)"
cd "$TMP"
git init -q -b main
git add -A
git -c user.name="$(git -C "$ROOT" config user.name)" -c user.email="$(git -C "$ROOT" config user.email)" \
  commit -q -m "Deploy de $COMMIT"

echo "Enviando o commit $COMMIT para https://huggingface.co/spaces/$SPACE ..."
git push --force "https://huggingface.co/spaces/$SPACE" main
echo
echo "Pronto. Acompanhe o build em https://huggingface.co/spaces/$SPACE"
