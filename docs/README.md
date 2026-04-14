# Truman Heartland Website — Docs

This is the internal documentation set for the Truman Heartland website rewrite. The work moves content out of the repo into a Cloudflare D1 database and adds an AI-assisted editor so the client can update the site without a developer.

## Who these docs are for

- **[for-editors.md](for-editors.md)** — for the client and whoever edits the site day-to-day. Plain language. No code.
- **[for-developers.md](for-developers.md)** — architecture, schemas, how to extend the system.
- **[operations.md](operations.md)** — deploy, secrets, migrations, rollback.
- **phase-N-\*.md** — retrospective notes on what each phase shipped.

## System at a glance

```
Repo               Templates, components, parsers, build scripts
Cloudflare D1      Pages, news, scholarships, page_versions (source of truth)
Cloudflare R2      Images (not yet fully wired — Phase 2.5)
Cloudflare Pages   Static build served at truman-heartland.com
/cpadmin           Password-gated admin UI (SSR on the Worker)
AI chatbot         Scoped editor assistant that talks to D1 through a fixed tool set
```

## Phases

1. **[Phase 1 — D1 migration](phase-1-d1.md)** — content moved into D1; site still builds identically.
2. **[Phase 2 — Admin + API](phase-2-admin.md)** — `/cpadmin` editor, version history, revert, password gate.
3. **[Phase 3 — Templates + sections](phase-3-templates.md)** — structured section schemas and a component library.
4. **[Phase 4 — AI chatbot editor](phase-4-chatbot.md)** — the assistant that turns "merge these three pages into a landing page" into structured edits.

## Quick links

- D1 schema: [migrations/0001_init.sql](../migrations/0001_init.sql)
- Section schemas: [src/lib/sections.ts](../src/lib/sections.ts)
- Template registry: [src/lib/templates.ts](../src/lib/templates.ts)
- Admin UI: [src/pages/cpadmin/](../src/pages/cpadmin/)
- Admin API: [src/pages/api/](../src/pages/api/)
