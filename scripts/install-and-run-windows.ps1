# Windows: install everything necessary and run the app.
#   Usage (PowerShell):  ./scripts/install-and-run-windows.ps1
#   If blocked by execution policy, run:
#     powershell -ExecutionPolicy Bypass -File .\scripts\install-and-run-windows.ps1
$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
$Port = if ($env:PORT) { $env:PORT } else { "3000" }

function Log($m)  { Write-Host "==> $m" -ForegroundColor Blue }
function Ok($m)   { Write-Host "OK  $m" -ForegroundColor Green }
function Warn($m) { Write-Host "!   $m" -ForegroundColor Yellow }
function Have($c) { return [bool](Get-Command $c -ErrorAction SilentlyContinue) }

function NodeMajor {
  if (-not (Have node)) { return 0 }
  try { return [int](node -p "process.versions.node.split('.')[0]") } catch { return 0 }
}

Log "Etsy -> Shopify migrator - Windows setup"

if ((NodeMajor) -lt 20) {
  Warn "Node.js >= 20 not found."
  if (Have winget) {
    Log "Installing Node.js LTS via winget..."
    winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
  } elseif (Have choco) {
    Log "Installing Node.js LTS via Chocolatey..."
    choco install nodejs-lts -y
  } else {
    throw "No winget or choco found. Install Node.js >= 20 from https://nodejs.org/ and re-run."
  }
  # Refresh PATH for the current session so 'node' resolves after install.
  $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" +
              [System.Environment]::GetEnvironmentVariable("Path","User")
}
Ok ("Node " + (node --version))

# Ensure pnpm (prefer corepack bundled with Node).
if (-not (Have pnpm)) {
  if (Have corepack) {
    Log "Enabling pnpm via corepack..."
    corepack enable
    corepack prepare pnpm@latest --activate
  } elseif (Have npm) {
    Log "Installing pnpm via npm..."
    npm install -g pnpm
  }
}
if (-not (Have pnpm)) { throw "Could not install pnpm. See https://pnpm.io/installation" }
Ok ("pnpm " + (pnpm --version))

Set-Location $RepoRoot
Log "Installing dependencies..."
pnpm install
Log "Building..."
pnpm build

# Show a LAN URL so a phone on the same Wi-Fi can open the app.
$ip = (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
       Where-Object { $_.PrefixOrigin -ne 'WellKnown' -and $_.IPAddress -ne '127.0.0.1' } |
       Select-Object -First 1).IPAddress
Ok "App will be available at:"
Write-Host ("    - This device: http://localhost:{0}" -f $Port) -ForegroundColor Green
if ($ip) {
  Write-Host ("    - Phone on same Wi-Fi: http://{0}:{1}  (then 'Add to Home Screen')" -f $ip, $Port) -ForegroundColor Green
}

Log "Starting server on port $Port (Ctrl+C to stop)..."
$env:PORT = $Port
pnpm start
