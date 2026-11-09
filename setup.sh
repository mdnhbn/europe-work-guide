#!/usr/bin/env bash
set -euo pipefail
python3 -m venv .venv
. .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
if [ ! -f .env ]; then cp .env.example .env; fi
echo "Set APP_SECRET_KEY in .env, then run: uvicorn app.main:app --reload"
