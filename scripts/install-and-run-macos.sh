#!/usr/bin/env bash
# macOS: install everything necessary and run the app.
#   Usage:  ./scripts/install-and-run-macos.sh
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/lib.sh
source "$DIR/lib.sh"

log "Etsy → Shopify migrator — macOS setup"

if [ "$(node_major)" -lt 20 ]; then
  warn "Node.js >= 20 not found."
  if ! have brew; then
    log "Installing Homebrew…"
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    # Make brew available in this shell (Apple Silicon vs Intel paths).
    if [ -x /opt/homebrew/bin/brew ]; then eval "$(/opt/homebrew/bin/brew shellenv)"; fi
    if [ -x /usr/local/bin/brew ]; then eval "$(/usr/local/bin/brew shellenv)"; fi
  fi
  log "Installing Node.js via Homebrew…"
  brew install node
fi
ok "Node $(node --version)"

ensure_pnpm
install_build_run
