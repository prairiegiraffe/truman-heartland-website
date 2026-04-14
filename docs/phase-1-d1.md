# Phase 1 — D1 migration

**Goal:** move content out of `src/data/*.json` in the repo into Cloudflare D1. Site must still build byte-identically.

**Status:** complete. Commit `7d4ec9a`.

## What shipped

- `thcf-content` D1 database (id `d5ba1f65-ceb0-4e47-9481-90f1182ed33e`) with 6 tables
- `migrations/0001_init.sql` — schema
- `scripts/migrate-to-d1.mjs` — one-time importer. Reads `src/data/pages.json`, runs `content-parser.ts` `segment()` on each page's WordPress HTML, persists `legacy_body` + pre-parsed `sections` JSON
- `scripts/dump-d1.mjs` — the inverse. Pulls D1 back to `src/data/*.json` so `astro build` stays fully deterministic
- `npm run build:d1` — `dump-d1 && astro build`
- D1 binding (`thcf_content`) added to [wrangler.jsonc](../wrangler.jsonc)

## Dataset

- 109 pages (including the homepage)
- 184 news articles
- 103 scholarships
- 6 tables total (pages, news, scholarships, page_versions, assets, rebuild_log)
- ~2.8 MB D1 size

## Key design decisions

**D1 as source of truth, JSON as build cache.** Considered reading D1 directly at build time via the HTTP API (requires an account token in CI). Chose the dump approach because:
- Build is deterministic; no network in `astro build`
- `git diff src/data/pages.json` shows exactly what changed between builds
- Local dev works without any Cloudflare creds

**`legacy_body` + parsed `sections` stored side by side.** The migration script runs `segment()` on every page's WordPress HTML and stores the result. Downstream consumers (chatbot, future SSR renderer) can use pre-parsed sections without re-running the parser. The raw `legacy_body` stays so we can re-parse if the rules change.

**Homepage stays hand-authored.** The homepage (`/`) is a custom-designed Astro file (`src/pages/index.astro`) using React-style components, not WordPress content. We seeded the WordPress version as a D1 row so the chatbot *could* edit it later, but the public homepage is still served from the hand-authored file. Revisit in Phase 3.5 if we want to convert it.

## Gotchas worth remembering

- Wrangler's `--json` output truncates on multi-MB payloads over a pipe. `dump-d1.mjs` redirects to a temp file and reads it back.
- SQL `ORDER BY date DESC` on a human-readable string column like `"February 04, 2026"` sorts alphabetically, not chronologically. Sort in JS after reading.
- Slugs with slashes (e.g. `about/board`) are the common case, not the edge case. 93 of 109 pages. Any routing needs catch-all `[...slug]`.

## Verification

`npm run build` produces an identical public `dist/` compared to pre-migration — 402 HTML files, zero content diffs after normalising CSS bundle hashes.
