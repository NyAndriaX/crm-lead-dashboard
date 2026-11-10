#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -d .venv ]; then
  echo "Creez d'abord le venv : voir README.md"
  exit 1
fi

source .venv/bin/activate
exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
