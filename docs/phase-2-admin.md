# Phase 2 — Admin UI + JSON API

**Goal:** let an editor change content in D1 without a developer. Password-gated admin, version history, revert.

**Status:** complete. Commit `a473b65`.

## What shipped

### Adapter

- Astro flipped to `output: 'server'`. Public pages opt into `prerender = true` (the catch-all, homepage, news, scholarships). Admin + API routes run on the Worker.

### Auth

- [src/lib/auth.ts](../src/lib/auth.ts) — PBKDF2-SHA256 (100k iterations) for the password, HMAC-SHA256 for the session cookie. Pure Web Crypto; no external deps. 30-day session TTL.
- [src/middleware.ts](../src/middleware.ts) — gates `/cpadmin/**` and `/api/**`. `/api/login` and `/cpadmin/login` are the only exceptions.
- `scripts/generate-password-hash.mjs` — helper that prints the three secrets to paste into `wrangler secret put` or `.dev.vars`.

### JSON API (`/api/**`)

All SSR, all gated by the session cookie.

- `POST /api/login` — accepts `{ password }` JSON or form data. Returns 200 + sets `cpadmin_auth` cookie on success.
- `POST /api/logout` — clears the cookie.
- `GET /api/pages` — list pages (supports `?search=` substring match on title or path).
- `GET /api/pages/[...slug]` — single page, including parsed `sections` and raw `legacy_body`.
- `PUT /api/pages/[...slug]` — update title / subtitle / template / sections / legacyBody. Snapshots previous state to `page_versions` in the same D1 batch. Rejects sections JSON over 500KB.
- `GET /api/pages/[...slug]/versions` — history.
- `POST /api/pages/[...slug]/revert` — revert to a version id.

### Admin UI (`/cpadmin/**`)

- `/cpadmin/login` — password form.
- `/cpadmin` — searchable page list.
- `/cpadmin/pages/[...key]` — per-page editor. Meta fields, template dropdown, sections JSON textarea, legacy body textarea. Save button writes via PUT. Live SSR preview iframe on the right. Version history panel with one-click revert.
- `/cpadmin/preview/[...key]` — SSR'd page rendered from D1. Used by the editor iframe. Also shareable as a direct link for anyone with a valid session.

## Key design decisions

**Password + HMAC cookie, no Cloudflare Access.** The client asked for no-auth-yet; we compromised on a shared password. Easy to upgrade to Cloudflare Access later by changing `middleware.ts`.

**Catch-all routes for slugs with slashes.** Attempted `/api/pages/[slug].ts` first; 93 of 109 pages have slashes in the slug, so nested routes are the common case. Everything uses `[...slug]`.

**Apply + version in one batch.** `updatePage()` in [src/lib/d1.ts](../src/lib/d1.ts) inserts a `page_versions` row and updates `pages` as a single D1 `batch()`. If either fails, both roll back — the history never goes out of sync with the current state.

**Preview renders from D1, not from a build.** The admin preview is SSR'd from current D1 state, so an edit is visible in ~300ms without waiting for a site rebuild. The public site still needs a rebuild; that's Phase 2.5.

## Gotchas

- **Local D1 vs remote D1.** `npm run dev` hits local D1 (`.wrangler/state/v3/d1`). Seeding the local DB is manual (see [operations.md](operations.md)). Production goes to remote.
- **Slug URL encoding.** The editor's client JS encodes each segment of the slug with `encodeURIComponent` and joins with `/`. Using `encodeURIComponent(slug)` whole would turn slashes into `%2F` and break routing.
- **Latent slug conflict.** A page whose slug ends in `/versions` or `/revert` would collide with the action routes. Not a current problem (no such pages) but flagged for future.

## Stress tests run

✅ Login with correct/wrong password, no cookie, tampered cookie
✅ CRUD on nested slugs (`about/board/raytown-advisory-board`)
✅ Invalid JSON → 400
✅ Unknown slug PUT → 404
✅ Oversized payload (>500KB) → 400
✅ Revert round-trip (edit → revert → check)
✅ Public pages unaffected (402-page static build byte-identical to Phase 1)

## Intentionally deferred

- **Auto-rebuild on edit.** Phase 2.5 (GitHub Actions + `repository_dispatch`) will fire `npm run build:d1 && wrangler deploy` after each admin write.
- **Multi-user conflict detection.** Last-write-wins. Won't matter pre-launch; might matter post-launch.
- **Draft/publish split.** Every save goes live (to the next rebuild). Add drafts when we have something to protect.
