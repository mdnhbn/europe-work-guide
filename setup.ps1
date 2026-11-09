$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) { throw "Node.js 20+ is required. Install it from https://nodejs.org/ and rerun setup.ps1." }
$major = [int]((node -p "process.versions.node.split('.')[0]").Trim())
if ($major -lt 20) { throw "Node.js 20+ is required. Current version: $(node --version)" }

Push-Location (Join-Path $PSScriptRoot "app")
try {
  npm ci
  if ($LASTEXITCODE -ne 0) { throw "npm ci failed with exit code $LASTEXITCODE" }
  Write-Host "Setup complete. Start the app with: npm run dev" -ForegroundColor Green
} finally { Pop-Location }
