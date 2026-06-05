#!/usr/bin/env bash
# Shared helpers for the POSIX install/run scripts (Ubuntu, macOS, Termux).
# shellcheck shell=bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${PORT:-3000}"

c_reset='\033[0m'; c_green='\033[32m'; c_yellow='\033[33m'; c_red='\033[31m'; c_blue='\033[34m'
log()  { printf "${c_blue}==>${c_reset} %s\n" "$*"; }
ok()   { printf "${c_green}✓${c_reset} %s\n" "$*"; }
warn() { printf "${c_yellow}!${c_reset} %s\n" "$*"; }
err()  { printf "${c_red}✗${c_reset} %s\n" "$*" >&2; }

have() { command -v "$1" >/dev/null 2>&1; }

node_major() {
  have node || { echo 0; return; }
  node -p "process.versions.node.split('.')[0]" 2>/dev/null || echo 0
}

# Ensure pnpm is available, preferring corepack (bundled with Node >= 16.10).
ensure_pnpm() {
  if have pnpm; then ok "pnpm $(pnpm --version)"; return; fi
  if have corepack; then
    log "Enabling pnpm via corepack…"
    corepack enable >/dev/null 2>&1 || true
    corepack prepare pnpm@latest --activate >/dev/null 2>&1 || true
  fi
  if have pnpm; then ok "pnpm $(pnpm --version)"; return; fi
  if have npm; then
    log "Installing pnpm via npm…"
    npm install -g pnpm >/dev/null 2>&1 || true
  fi
  have pnpm || { err "Could not install pnpm. Install it from https://pnpm.io/installation"; exit 1; }
  ok "pnpm $(pnpm --version)"
}

# Install deps, build, and start the server. Prints the LAN URL for phones.
install_build_run() {
  cd "$REPO_ROOT"
  log "Installing dependencies…"
  pnpm install
  log "Building…"
  pnpm build
  print_access_urls
  open_browser_when_ready "http://localhost:${PORT}"
  log "Starting server on port ${PORT} (Ctrl+C to stop)…"
  PORT="$PORT" pnpm start
}

# Open the app in the default browser once the server answers. Runs in the
# background so it can wait for readiness while the server starts in the
# foreground. Set NO_OPEN=1 (or BROWSER=none) to disable.
open_browser_when_ready() {
  local url="$1"
  if [ -n "${NO_OPEN:-}" ] || [ "${BROWSER:-}" = "none" ]; then
    log "Auto-open disabled; open ${url} in your browser."
    return
  fi

  # Detect a platform browser opener.
  local opener=""
  if have xdg-open; then opener="xdg-open"
  elif have open; then opener="open"                  # macOS
  elif have termux-open-url; then opener="termux-open-url"  # Android/Termux
  elif have sensible-browser; then opener="sensible-browser"
  fi
  if [ -z "$opener" ]; then
    warn "No browser opener found; open ${url} manually."
    return
  fi

  (
    # Wait for the server to respond before launching the browser.
    local ready=""
    for _ in $(seq 1 60); do
      if have curl && curl -fsS "${url}/api/health" >/dev/null 2>&1; then ready=1; break; fi
      if have wget && wget -qO- "${url}/api/health" >/dev/null 2>&1; then ready=1; break; fi
      # No curl/wget? give the server a moment, then just open.
      if ! have curl && ! have wget; then sleep 2; ready=1; break; fi
      sleep 0.5
    done
    [ -n "$ready" ] || true
    log "Opening ${url} in your browser…"
    "$opener" "$url" >/dev/null 2>&1 || warn "Could not open a browser automatically; visit ${url}."
  ) &
}

# Best-effort local IP so a phone on the same Wi-Fi can open the app.
lan_ip() {
  if have ipconfig && ipconfig getifaddr en0 >/dev/null 2>&1; then
    ipconfig getifaddr en0 2>/dev/null && return
  fi
  if have hostname && hostname -I >/dev/null 2>&1; then
    hostname -I 2>/dev/null | awk '{print $1}' && return
  fi
  if have ip; then
    ip route get 1.1.1.1 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i=="src"){print $(i+1); exit}}' && return
  fi
  echo ""
}

print_access_urls() {
  ok "App will be available at:"
  printf "    • This device: ${c_green}http://localhost:%s${c_reset}\n" "$PORT"
  local ip; ip="$(lan_ip)"
  if [ -n "$ip" ]; then
    printf "    • Phone/tablet on same Wi-Fi: ${c_green}http://%s:%s${c_reset}\n" "$ip" "$PORT"
    printf "      (open that URL in mobile Safari/Chrome, then 'Add to Home Screen')\n"
  fi
}
