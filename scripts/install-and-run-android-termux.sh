#!/usr/bin/env bash
# Android (via Termux): install everything necessary and run the app ON the phone.
#
# 1. Install Termux from F-Droid: https://f-droid.org/packages/com.termux/
# 2. In Termux:  pkg install git -y && git clone <repo-url> && cd shopify-shop-from-etsy
# 3. Run:        ./scripts/install-and-run-android-termux.sh
# 4. Open Chrome on the phone at http://localhost:3000 and 'Add to Home Screen'.
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/lib.sh
source "$DIR/lib.sh"

log "Etsy → Shopify migrator — Android/Termux setup"

if [ "$(node_major)" -lt 20 ]; then
  warn "Node.js not found; installing via pkg…"
  pkg update -y
  pkg install -y nodejs
fi
ok "Node $(node --version)"

ensure_pnpm
install_build_run
