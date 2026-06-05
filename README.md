# shopify-shop-from-etsy

One-click app that **fills a Shopify shop from an existing Etsy shop**. Enter
your Etsy and Shopify credentials, press **Migrate now**, and the app copies as
much useful data as possible (listings, descriptions, prices, inventory, tags,
SKUs and images) from Etsy into Shopify.

## Runs everywhere

It's built as a responsive **Progressive Web App (PWA)** served by a small
Node.js API. One codebase runs on **Ubuntu, Windows and macOS** and on
**laptops and phones** — open it in any modern browser, or "Install / Add to
Home Screen" to use it like a native app.

```
Etsy Open API v3  ──read──▶  Migrator  ──write──▶  Shopify Admin API
        (listings, images, inventory)        (products, variants, media)
```

## Architecture

| Layer | Path | Responsibility |
|-------|------|----------------|
| Etsy client (read) | `src/etsy/client.ts` | Fetch + paginate listings and images, normalize them |
| Shopify client (write) | `src/shopify/client.ts` | Verify creds, create products/variants/images |
| Migrator | `src/migrate/migrator.ts` | Orchestrate the one-click run, per-item resilience, progress |
| API server | `src/server.ts` | `/api/verify`, `/api/migrate` (SSE progress), static PWA |
| PWA UI | `public/` | Responsive form, live progress, installable (manifest + service worker) |

Network access in both clients is injected, so all logic is unit-tested against
mocked APIs — **no live shop is ever hit from automated runs** (see `tests/`).

## Setup, build & test

Requires Node.js >= 20. This repo uses **pnpm**.

```bash
# install:   pnpm install
# run (dev): pnpm dev          # tsx watch, http://localhost:3000
# build:     pnpm build        # tsc -> dist/
# run (prod):pnpm start        # node dist/server.js
# test:      pnpm test         # vitest
# typecheck: pnpm typecheck
```

Then open http://localhost:3000 on any device on your network.

## One-command install & run

Don't want to install Node/pnpm yourself? Use the platform scripts in
`scripts/` — they install everything necessary, build, and start the app, then
print the URL to open (including a LAN URL for your phone).

| Platform | Command |
|----------|---------|
| **Ubuntu / Debian** | `./scripts/install-and-run-ubuntu.sh` (everything from default `apt`: Node.js + npm; runs via npm, no pnpm) |
| **macOS** | `./scripts/install-and-run-macos.sh` |
| **Windows** | double-click `scripts\install-and-run-windows.bat` (or `powershell -ExecutionPolicy Bypass -File scripts\install-and-run-windows.ps1`) |
| **Android phone** (runs on the phone) | install [Termux](https://f-droid.org/packages/com.termux/), then `./scripts/install-and-run-android-termux.sh` |

Each script installs deps, builds, **opens the app in your default browser**
once the server is ready, and keeps it running (Ctrl+C to stop).

Override the port with `PORT=8080 ./scripts/install-and-run-macos.sh`, or skip
auto-opening the browser with `NO_OPEN=1 ./scripts/install-and-run-macos.sh`
(`$env:NO_OPEN="1"` on Windows). Auto-open is also skipped automatically when no
desktop browser opener is available (e.g. a headless server or Termux).

### Using it on a phone

The app is a web app, so phones don't need a build — just a browser:

1. **Easiest:** run a script on your laptop (same Wi-Fi as the phone). The
   script prints a `http://<your-lan-ip>:3000` URL — open it in mobile
   Safari/Chrome and choose **Add to Home Screen** to install the PWA.
2. **Fully on-device (Android):** use the Termux script above to run the server
   directly on the phone, then open `http://localhost:3000` in Chrome.
3. **iPhone/iPad:** there's no on-device Node server; use option 1 (open the
   laptop's LAN URL and Add to Home Screen).

## Credentials

You can type credentials into the app, or set them once in a local `.env`
(see `.env.example`) to run in single-operator mode.

**Etsy (read side)** — an [Etsy Open API v3](https://developers.etsy.com/) app:
- `ETSY_API_KEY` — your app's keystring
- `ETSY_ACCESS_TOKEN` — OAuth token with the `listings_r` scope
- `ETSY_SHOP_ID` — the numeric shop id

**Shopify (write side)** — a [custom app](https://help.shopify.com/en/manual/apps/app-types/custom-apps)
with Admin API access:
- `SHOPIFY_STORE_DOMAIN` — e.g. `my-store.myshopify.com`
- `SHOPIFY_ADMIN_TOKEN` — Admin API access token (`shpat_...`) with
  `write_products` scope

> Secrets live only in your local `.env` (gitignored) or in the browser session.
> The app stores only your store domain / shop id in `localStorage`, never tokens.

## What gets copied

For each active Etsy listing the app creates a Shopify product with: title,
description (converted to HTML), tags, product type, a default variant with
price + SKU + inventory quantity, and all listing images.

Use the **Dry run** checkbox to preview how many listings would be migrated
without writing anything to Shopify.

## Roadmap / not yet covered

- Multiple variants / option combinations (currently one default variant)
- Orders and customers
- Incremental sync / de-duplication on re-runs
- Etsy OAuth flow inside the app (tokens are currently supplied directly)
