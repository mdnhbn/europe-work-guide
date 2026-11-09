#!/usr/bin/env bash
set -euo pipefail
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js 20+ is required. Install it from https://nodejs.org/ and rerun setup.sh." >&2
  exit 1
fi
node -e 'const major=Number(process.versions.node.split(".")[0]); if (major < 20) { console.error("Node.js 20+ is required."); process.exit(1); }'
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/app"
npm ci
echo "Setup complete. Start the app with: npm run dev"
