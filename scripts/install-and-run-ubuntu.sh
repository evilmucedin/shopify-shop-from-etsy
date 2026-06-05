#!/usr/bin/env bash
# Ubuntu / Debian: install everything necessary and run the app.
#   Usage:  ./scripts/install-and-run-ubuntu.sh
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/lib.sh
source "$DIR/lib.sh"

log "Etsy → Shopify migrator — Ubuntu/Debian setup"

# Pick sudo only when not already root (e.g. in containers).
SUDO=""
if [ "$(id -u)" -ne 0 ]; then
  have sudo || { err "This script needs root or sudo to run apt."; exit 1; }
  SUDO="sudo"
fi

# Everything needed is installed from apt: refresh the package index first,
# then install Node.js and npm from the Ubuntu/Debian repositories.
log "Updating apt package index…"
$SUDO apt-get update

log "Installing Node.js and npm via apt…"
$SUDO apt-get install -y nodejs npm

ok "Node $(node --version)"
if [ "$(node_major)" -lt 20 ]; then
  warn "apt provided Node $(node --version); the app targets >= 20."
  warn "It should still build, but consider a newer Ubuntu release if anything fails."
fi

# pnpm is not packaged in apt; bootstrap it from the apt-installed npm/corepack.
if ! have pnpm; then
  log "Installing pnpm…"
  if have corepack; then
    $SUDO corepack enable >/dev/null 2>&1 || true
    $SUDO corepack prepare pnpm@latest --activate >/dev/null 2>&1 || true
  fi
  have pnpm || $SUDO npm install -g pnpm
fi
ok "pnpm $(pnpm --version)"

install_build_run
