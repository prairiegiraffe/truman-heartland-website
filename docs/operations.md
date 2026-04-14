# Operations

Runbook for routine tasks on the Truman Heartland site.

## Local dev setup

```bash
git clone <repo>
cd truman-heartland-website
npm install
```

Generate local admin credentials:

```bash
node scripts/generate-password-hash.mjs '<your-local-password>'
```

Copy the three lines (`ADMIN_PASSWORD_HASH`, `ADMIN_PASSWORD_SALT`, `ADMIN_SESSION_SECRET`) into a new file `.dev.vars` at the project root (already gitignored). Add `ANTHROPIC_API_KEY="sk-ant-..."` to the same file once you have one.

Seed the local D1 (wrangler creates a SQLite file in `.wrangler/state/v3/d1`):

```bash
npx wrangler d1 execute thcf-content --local --file=migrations/0001_init.sql
for f in migrations/_seed_*.sql; do
  npx wrangler d1 execute thcf-content --local --file="$f"
done
node scripts/seed-template-demos.mjs   # template demo pages
```

Note: seed files `migrations/_seed_*.sql` are gitignored (they're generated). Regenerate them with `npm run migrate-to-d1 -- --skip-apply` if you've never run migration before.

Start the dev server:

```bash
npm run dev
```

Visit `http://localhost:4321/cpadmin`.

## Production secrets

```bash
# Cloudflare Worker secrets (one-time setup)
npx wrangler secret put ADMIN_PASSWORD_HASH
npx wrangler secret put ADMIN_PASSWORD_SALT
npx wrangler secret put ADMIN_SESSION_SECRET
npx wrangler secret put ANTHROPIC_API_KEY
```

## Deploying

Phase 4 does not include auto-deploy. Until Phase 2.5:

```bash
npm run build:d1      # dumps remote D1 → src/data/*.json, runs astro build
npx wrangler deploy   # pushes dist/ to Cloudflare
```

Browse to the preview URL that `wrangler deploy` prints. Once you're happy, promote to production via the Cloudflare dashboard (or by setting up a production branch binding).

## Common tasks

### Change the admin password

There is no admin UI for password rotation yet (slated for Phase 4.5). For now, rotate from the CLI:

```bash
node scripts/generate-password-hash.mjs '<new-password>'
npx wrangler pages secret put ADMIN_PASSWORD_HASH --project-name truman-heartland-website
npx wrangler pages secret put ADMIN_PASSWORD_SALT --project-name truman-heartland-website
```

Existing sessions stay valid until their 30-day HMAC expires. To invalidate all sessions immediately, also rotate `ADMIN_SESSION_SECRET`:

```bash
npx wrangler pages secret put ADMIN_SESSION_SECRET --project-name truman-heartland-website
```

After rotating, trigger a redeploy (pushing any commit to `main`, or in the Cloudflare dashboard click "Retry deployment") so the new secrets take effect.

### Back up D1

D1 has point-in-time recovery built in (7 days). No explicit backup needed unless you want offline copies. To dump locally:

```bash
npm run dump-d1   # current state as JSON
```

Or export the schema + data:

```bash
npx wrangler d1 export thcf-content --remote --output=backups/$(date +%Y%m%d).sql
```

### Revert a page to an earlier version

In the admin UI, open the page, find the version in the history panel, click **Revert to this**. This creates a new version pointing back at the old state (non-destructive).

Manually from CLI:

```bash
npx wrangler d1 execute thcf-content --remote --command \
  "UPDATE pages SET title = ..., sections = '<old JSON>', updated_at = $(date +%s)000 WHERE slug = 'about';"
```

### Add a new page via CLI

```bash
SLUG="new-page"
npx wrangler d1 execute thcf-content --remote --command "
  INSERT INTO pages (slug, path, type, template, title, sections, updated_at, created_at)
  VALUES ('$SLUG', '/$SLUG', 'page', 'legacy', 'New page', '[]', $(date +%s)000, $(date +%s)000);
"
```

Or just use the admin UI's chat: "Create a new page at `/new-page` using the pillar template with a hero and CTA band."

### Rebuild seed SQL from pages.json (for a fresh D1)

```bash
npm run migrate-to-d1 -- --skip-apply    # writes migrations/_seed_*.sql without touching D1
```

Inspect the output, then apply:

```bash
for f in migrations/_seed_*.sql; do
  npx wrangler d1 execute thcf-content --remote --file="$f"
done
```

## Diagnosing issues

### Admin "admin disabled" error

One of `ADMIN_PASSWORD_HASH`, `ADMIN_PASSWORD_SALT`, `ADMIN_SESSION_SECRET` isn't set. Check `wrangler secret list`.

### Chatbot error "admin disabled (ANTHROPIC_API_KEY not set)"

`wrangler secret put ANTHROPIC_API_KEY`.

### D1 "no such table"

You're running against local D1 and haven't run the migration yet, or wrangler is targeting the wrong database. Confirm with `wrangler d1 list`. Re-run `migrations/0001_init.sql` against the right target.

### Public site isn't reflecting an admin edit

The admin edit hit D1 but a rebuild hasn't run. `npm run build:d1 && npx wrangler deploy`. Phase 2.5 will automate this.

### The preview in /cpadmin works but the public page is different

The public page is built from `src/data/*.json`. Run `npm run dump-d1` to refresh the cache.

### Wrangler claims "D1 database not found"

`npx wrangler d1 list` — confirm `thcf-content` exists. If the wrong Cloudflare account is selected, `npx wrangler logout && npx wrangler login`.

## Safety checks before launch

- [ ] Swap the dev admin password for a strong production one
- [ ] Set `ANTHROPIC_API_KEY` to a production key with usage limits in the Anthropic console
- [ ] Verify `wrangler secret list` shows all four admin secrets
- [ ] Run `npm run build:d1 && npx wrangler deploy --dry-run` to surface any build errors
- [ ] Confirm `/cpadmin` is noindex in robots.txt (it is by default, since the login page has `<meta name="robots" content="noindex,nofollow">`)
- [ ] Test an end-to-end edit loop against the preview deploy
- [ ] Ensure page_versions table is being written (not just pages) — see [phase-2-admin.md](phase-2-admin.md)
