$ErrorActionPreference = "Stop"
py -3 -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
if (!(Test-Path ".env")) { Copy-Item ".env.example" ".env" }
Write-Host "Set APP_SECRET_KEY in .env, then run: .\.venv\Scripts\python.exe -m uvicorn app.main:app --reload"
