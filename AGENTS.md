# AGENTS.md

Guidance for AI coding agents (e.g. [Pi](https://withpi.ai) and other tools that
read `AGENTS.md`) working in this repository.

## Project

**shopify-shop-from-etsy** — tooling to build/populate a Shopify shop from Etsy
data (listings, images, inventory, orders). The project is in an early stage;
much of the structure below is the intended convention as code lands.

## Working agreements

- Keep changes small and focused; prefer the smallest diff that solves the task.
- Match the style, naming, and structure of surrounding code.
- Don't commit secrets. API keys/tokens (Etsy, Shopify) belong in a local
  `.env` (gitignored), never in source or commit messages.
- Update `README.md` when you add a runnable entry point or change setup steps.

## Setup, build & test

Once a toolchain is chosen, document the exact commands here so they can be run
without guessing. Until then, discover them from the repo (`package.json`,
`pyproject.toml`, `Makefile`, etc.) before assuming.

```bash
# install:   pnpm install
# run (dev): pnpm dev      # tsx watch, serves PWA on http://localhost:3000
# build:     pnpm build    # tsc -> dist/
# run (prod):pnpm start
# test:      pnpm test     # vitest (clients are mocked; no live API calls)
# typecheck: pnpm typecheck
```

Run the relevant tests/linters before declaring a task done, and report the
actual output — if something fails or is skipped, say so.

## Domain notes

- **Etsy API**: read-side source of truth (listings, images, inventory).
- **Shopify Admin API**: write-side target (products, variants, media).
- Be deliberate about rate limits and pagination on both APIs.
- Treat external API calls as side effects: make them easy to mock in tests and
  avoid hitting live shops from automated runs.

## Git & PRs

- Branch off `main`; don't commit directly to `main` unless asked.
- Write clear, imperative commit messages.
- Confirm before pushing or any other outward-facing action.

## Related files

`CLAUDE.md` (Claude Code) and `.github/copilot-instructions.md` (VS Code /
GitHub Copilot) carry the same conventions. Keep all three in sync when you
change shared guidance.
