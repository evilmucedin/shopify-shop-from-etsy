#!/usr/bin/env bash
# Ubuntu / Debian: install everything necessary and run the app.
#   Usage:  ./scripts/install-and-run-ubuntu.sh
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/lib.sh
source "$DIR/lib.sh"

log "Etsy → Shopify migrator — Ubuntu/Debian setup"

if [ "$(node_major)" -lt 20 ]; then
  warn "Node.js >= 20 not found; installing via NodeSource…"
  if ! have curl; then sudo apt-get update -y && sudo apt-get install -y curl; fi
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
ok "Node $(node --version)"

ensure_pnpm
install_build_run
