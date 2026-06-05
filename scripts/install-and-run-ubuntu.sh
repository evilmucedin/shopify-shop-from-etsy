#!/usr/bin/env bash
# Ubuntu / Debian: install everything necessary and run the app.
#
# Everything required is installed from the DEFAULT apt repositories — no
# external repos, no NodeSource, no `curl | bash`, and no pnpm. The app runs
# entirely on the apt-provided `nodejs` + `npm`.
#
#   Usage:  ./scripts/install-and-run-ubuntu.sh
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/lib.sh
source "$DIR/lib.sh"

log "Etsy → Shopify migrator — Ubuntu/Debian setup (apt + npm)"

# Use sudo only when not already root (e.g. inside containers).
SUDO=""
if [ "$(id -u)" -ne 0 ]; then
  have sudo || { err "This script needs root or sudo to run apt."; exit 1; }
  SUDO="sudo"
fi

# 1) Refresh the default package index and install Node.js + npm from apt.
log "Updating apt package index…"
$SUDO apt-get update

log "Installing Node.js and npm via apt…"
$SUDO apt-get install -y nodejs npm

ok "Node $(node --version)"
ok "npm $(npm --version)"
if [ "$(node_major)" -lt 20 ]; then
  warn "apt provided Node $(node --version); the app targets >= 20."
  warn "It should still build, but consider a newer Ubuntu release if anything fails."
fi

# 2) Install JS dependencies, build, and run — all via npm (no pnpm needed).
cd "$REPO_ROOT"
log "Installing dependencies (npm install)…"
npm install

log "Building…"
npm run build

print_access_urls
open_browser_when_ready "http://localhost:${PORT}"
log "Starting server on port ${PORT} (Ctrl+C to stop)…"
PORT="$PORT" npm start
