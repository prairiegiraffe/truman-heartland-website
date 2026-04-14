# For developers

## Stack

- **Astro 5** — site generator. `output: 'server'` on Cloudflare adapter; public pages opt into `prerender = true`.
- **Cloudflare Pages** — hosts the static build.
- **Cloudflare Workers** — SSR for `/api/**` and `/cpadmin/**` and the chat API.
- **Cloudflare D1** — content source of truth (`thcf-content` database).
- **Cloudflare R2** — image storage (bucket `thcf-assets`, binding `ASSETS_BUCKET`).
- **Zod** — schemas for sections + templates; validates both admin writes and AI tool output.
- **Anthropic SDK** — Claude Sonnet 4.6 drives the chat assistant.

## Key directories

```
migrations/             0001_init.sql + D1 seed files
scripts/
  migrate-to-d1.mjs     One-time content migration (JSON → D1 rows)
  dump-d1.mjs           D1 → src/data/*.json build cache
  seed-template-demos.mjs  Seed /templates/* demo pages as structured sections
  generate-password-hash.mjs  Create admin password hash + session secret
src/
  lib/
    sections.ts         Zod union of 25 section kinds
    templates.ts        Template registry (legacy, pillar, program, landing, image-sections)
    content-parser.ts   WordPress HTML → Section[] (legacy import path)
    d1.ts               D1 CRUD helpers; called from API routes
    auth.ts             PBKDF2 password + HMAC session (Web Crypto only)
    ai/                 Chatbot tool schema + system prompt
  components/
    PageRenderer.astro  Switch-on-section-kind renderer
    sections/           One .astro per section kind
  pages/
    [...slug].astro     Public catch-all; prerendered
    cpadmin/            Password-gated admin (SSR)
    api/                JSON API (SSR)
  middleware.ts         Gates /cpadmin/** and /api/**
```

## Source of truth

**D1 is authoritative** for `pages`, `news`, `scholarships`, `page_versions`, `assets`. The files in `src/data/*.json` are a build cache produced by `npm run dump-d1`.

**Never hand-edit `src/data/*.json`.** Write to D1 (via admin, API, or `wrangler d1 execute`) then run `npm run dump-d1`.

## Adding a new section kind

1. Define a Zod schema in [src/lib/sections.ts](../src/lib/sections.ts) with a unique `kind` literal.
2. Add the schema to the `sectionSchemaBeforeSidebar` discriminated union (and add its `kind` string to `SECTION_KINDS`).
3. Create `src/components/sections/YourKind.astro` with props matching the schema.
4. Add a `case 'your-kind':` arm in [src/components/PageRenderer.astro](../src/components/PageRenderer.astro).
5. Optionally add it to a template's `preferredSections` in [src/lib/templates.ts](../src/lib/templates.ts).
6. The chatbot picks it up automatically once it's in `SECTION_KINDS` — the system prompt enumerates them at request time.

## Adding a new template

Add a `TemplateDef` to `TEMPLATES` in [src/lib/templates.ts](../src/lib/templates.ts). Fill in `preferredSections`, `defaultSections`, and `layout.mode`. The admin editor dropdown and chatbot system prompt pick it up automatically.

## Public vs SSR routes

Every page under `src/pages/` is SSR-by-default (because `output: 'server'`). Public pages must include `export const prerender = true` to bake out to static HTML at build time. The `/cpadmin/**` and `/api/**` routes deliberately omit that export so they run on the Worker at request time.

## Auth

Admin auth is a single shared password stored as a PBKDF2-SHA256 hash in `ADMIN_PASSWORD_HASH` + `ADMIN_PASSWORD_SALT` env vars. Sessions are HMAC-signed cookies (30-day TTL) signed with `ADMIN_SESSION_SECRET`. All three are set with `wrangler secret put` in production; local dev uses `.dev.vars` (gitignored).

Generate fresh creds: `node scripts/generate-password-hash.mjs '<password>'`.

## The build cache contract

- `npm run build` = `astro build` using whatever is in `src/data/*.json`. Deterministic; good for CI.
- `npm run build:d1` = `dump-d1 && astro build`. Pulls fresh content from remote D1 first. Used in production.
- `npm run dump-d1` = overwrite `src/data/pages.json`, `news.json`, `scholarships.json` from remote D1.
- `npm run migrate-to-d1` = one-time; converts `src/data/pages.json` (already imported from scraped content) into D1 rows and auto-runs the parser to store `sections[]`.

## Chatbot architecture

The chat API streams from Anthropic's Messages API with the `tool_use` feature enabled. The bot has ~12 tools (see [phase-4-chatbot.md](phase-4-chatbot.md) for the full list) that wrap D1 operations. Tool outputs return JSON; the bot reads them and decides the next step.

Large writes (`applyTemplate`, `proposeSections`) don't commit immediately — they store a "proposal" in memory per chat session and wait for the user to click **Apply**. Small edits (`rewriteSection`, `addSection`, `setPageMeta`) commit straight through because they're bounded in blast radius and the version history provides undo.

## Version history

Every D1 write goes through [src/lib/d1.ts](../src/lib/d1.ts) `updatePage()`, which inserts a row into `page_versions` in the same batch as the `pages` UPDATE. The `author` column is `'admin' | 'bot' | 'migration'`; the `chat_turn` column stores the user message + tool calls JSON for bot edits so you can always see what triggered a change.

`revertToVersion()` writes the old state back as a new version (non-destructive history).

## R2 assets

The `assets` table is defined but not yet populated. Phase 2.5 will add an upload endpoint that writes to the `thcf-assets` R2 bucket and indexes the object keys + alt text in D1. For now, all imported content references the original `blob.core.windows.net` URLs.

## What's intentionally not built

- **Automatic public rebuild on D1 writes** — today, a developer runs `npm run build:d1` to push D1 changes to the public deploy. Phase 2.5 wires this to GitHub Actions so the admin UI can "Publish."
- **Multi-user conflict detection** — last-write-wins.
- **Draft/published split** — edits go straight to what the next build will serve. Acceptable during pre-launch.
- **Real-time collaboration** — out of scope.
- **AI image generation** — deliberately excluded. Images must come from the existing R2 catalog or be uploaded.
