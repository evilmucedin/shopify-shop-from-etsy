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
