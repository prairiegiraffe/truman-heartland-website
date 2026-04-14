# Phase 3 — Templates + section component library

**Goal:** give pages a structured section model. Instead of raw HTML, a page is `template + sections[]`. Each section has a typed `kind`. The chatbot generates these in Phase 4; the admin editor edits them directly.

**Status:** complete. Commit `5961c24`.

## What shipped

### Schema layer

- [src/lib/sections.ts](../src/lib/sections.ts) — Zod discriminated union of 25 section kinds (`legacy-html`, `custom-block`, `hero-banner`, `page-banner`, `split`, `image-split`, `stat-grid`, `icon-cards`, `bordered-cards`, `feature-grid`, `timeline`, `steps-numbered`, `story-spotlight`, `testimonials`, `pricing-tiers`, `details-grid`, `faq-accordion`, `highlight-box`, `cta-band`, `image-mosaic`, `dual-panels`, `image-quote`, `floating-cards`, `image-fade`, `sidebar-layout`). The `sidebar-layout` kind recursively embeds other sections via `z.lazy()`.
- [src/lib/templates.ts](../src/lib/templates.ts) — registry of 5 templates, each with `preferredSections`, `defaultSections`, `layout.mode`.
- `UNIVERSAL_SECTIONS = ['legacy-html', 'custom-block']` — the two escape hatches valid in every template.

### Component layer

- [src/components/PageRenderer.astro](../src/components/PageRenderer.astro) — switch-on-`kind` dispatcher with TS exhaustiveness check. Used by public catch-all and admin preview.
- [src/components/sections/](../src/components/sections/) — 24 Astro components, one per kind (except `legacy-html` which delegates to the existing `ContentRenderer`). Scoped CSS per component, with `bg.ts` helper for shared background tones.

### Integration

- [src/pages/[...slug].astro](../src/pages/[...slug].astro) — when `template === 'legacy'`, routes through the existing WordPress HTML path. Otherwise, uses `PageRenderer` on the stored `sections[]`.
- [src/pages/cpadmin/preview/[...key].astro](../src/pages/cpadmin/preview/[...key].astro) — same dual-path logic.
- Admin editor — template dropdown sourced from registry; sections JSON textarea hint lists preferred + universal + other kinds.

### Seed data

- `scripts/seed-template-demos.mjs` — writes 5 demo pages to D1 as structured sections:
  - `/templates` — template chooser index (pillar template)
  - `/templates/pillar-page` — "Charitable Giving at THCF" (pillar)
  - `/templates/program-page` — "Youth Leadership Program" (program, with sidebar)
  - `/templates/landing-page` — "Toast to Our Towns" gala (landing)
  - `/templates/image-sections` — pattern showcase (image-sections)
- Removed 5 hardcoded `src/pages/templates/*.astro` files (~2500 lines). They now live in D1.

## Key design decisions

**Two universal escape hatches.** `legacy-html` keeps the 109 WordPress-imported pages rendering without conversion. `custom-block` is specifically for the AI — when it can't fit a request into an existing kind, it can output arbitrary HTML tagged as AI custom. Admin preview shows a yellow badge on custom blocks; the client can review and request a proper structured version if needed.

**Templates declare preferences, not restrictions.** A page in the `landing` template defaults to hero + stats + pricing etc., but can include any section kind. The chatbot will prefer the template's `preferredSections` but is free to pick from the full list if the user asks for something outside the template.

**Sidebar layout wraps other sections.** The `sidebar-layout` kind embeds a `main` array of other sections. This is the only recursive case. Component handles the sticky positioning + nested rendering.

**Per-component scoped CSS.** Each section component owns its CSS via Astro's scoped `<style>`. Shared design tokens (colors, spacing, typography) come from the existing global CSS — not duplicated per component.

## Gotchas worth remembering

- **Sidebar-layout nesting.** The `sidebar-layout` component embeds PageRenderer; stripping the inner sections' padding / background keeps them visually coherent inside the sidebar column. The `:global()` selectors in `SidebarLayout.astro` handle this.
- **StatCounter animation hook.** The existing `.counter` JS that animates numbers on scroll picks up `<StatCounter>` instances automatically via its `data-target` attribute; no changes needed.
- **FAQ accordion.** Uses native `<details>` + CSS `::after` toggle for `+/−`. No JS required.
- **The homepage (`/`) stayed hand-authored.** The seeded D1 homepage entry exists but isn't served (the static `index.astro` takes precedence). If the client wants to edit the homepage via chatbot in the future, we'll delete `index.astro` and let the catch-all serve the D1 row.

## Stress tests

- ✅ Build succeeds, 402 HTML pages.
- ✅ Legacy pages render identically (byte-match after normalising CSS hashes).
- ✅ All 5 template demos render with expected sections.
- ✅ Admin editor dropdown shows all 5 templates + descriptions.
- ✅ Admin preview renders structured pages live from D1.
- ✅ Nested slug editing still works for `/templates/program-page` etc.

## Intentionally deferred

- **Per-section-kind rich forms in admin.** Today the editor is a JSON textarea. Phase 4 wraps this in a chatbot, which is the real editing UX. Phase 4.5 can add structured forms if needed.
- **Visual section picker thumbnails.** Would be nice; not on the critical path.
- **Image upload inside sections.** Images are still URL references to blob storage. Phase 2.5 adds an R2 upload endpoint.
