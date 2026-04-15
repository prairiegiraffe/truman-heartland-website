# Phase 4 — AI chatbot editor

**Goal:** a chat assistant inside the editor that understands templates, section kinds, and page context. The non-developer editor types plain-language requests; the bot edits D1 via a fixed tool schema.

**Status:** shipped and deployed at `https://truman-heartland-website.kellee.workers.dev/cpadmin/`. Chatbot UI lives in [public/cpadmin/editor.js](../public/cpadmin/editor.js).

## Architecture note

During Phase 4 deployment we hit an Astro + Cloudflare runtime bug where SSR-rendered `.astro` pages returned `[object Object]` in production. Rather than keep fighting the adapter, we pivoted:

- **Admin UI** is now pure static HTML + client-side JavaScript, served from `public/cpadmin/`.
- **APIs stay as SSR endpoints** under `src/pages/api/*.ts` — they return explicit `Response` objects which work reliably on the Worker runtime.
- The Astro adapter major-version upgrade (5 → 6, adapter 12 → 13) also forced a switch from Cloudflare Pages to Cloudflare Workers with bundled static assets. We're on Workers now.

Net effect for the editor: same UX, but all HTML rendering happens in the browser. Every admin action still goes through the server-side API tool layer + D1.

## Architecture

```
Browser                    Worker                     Claude
──────                     ──────                     ──────
ChatPanel.astro  ──POST──▶ /api/chat                  
  messages[]               buildSystemPrompt(page)
                           TOOLS → tool definitions
                           for round in 1..8:         messages.create
                              └───────────────────────▶ (with tools)
                              ◀───────────────────────   tool_use[]
                              run tool → D1
                              push tool_result
                           return { messages, activity, proposals }
  update history ◀──────── 
  render activity log
  render Apply/Undo buttons
```

The server holds no chat state. The browser is the source of truth for conversation history; it echoes the full `messages[]` array on each turn.

## Tool schema

Defined in [src/lib/ai/tools.ts](../src/lib/ai/tools.ts).

### Read tools (no side effects)
- `get_page(slug?)` — current page state including section ids
- `list_pages(search?)` — find other pages
- `list_templates()` — see available templates + preferred sections

### Small-write tools (commit immediately)
- `set_page_meta(title?, subtitle?)` — update title / subtitle
- `rewrite_section(section_id, section)` — replace one section
- `add_section(after_section_id?, section)` — insert section
- `remove_section(section_id)` — remove a section
- `reorder_sections(ordered_ids)` — rearrange
- `create_page(slug, title, template_id)` — new empty page

These commit directly because their blast radius is small and version history provides undo.

### Big-write tools (propose, user confirms)
- `apply_template(template_id)` — switch a page's template. Keeps sections compatible with the new template; archives incompatible ones into a recoverable `custom-block` so no content is lost.
- `propose_sections(sections, summary)` — replace the whole sections array. Used for "merge three pages into one landing page" type requests.

These return a **proposal** object. The UI renders the summary + **Apply** / **Cancel** buttons. Nothing is written to D1 until the user clicks Apply, which POSTs the proposal to [/api/pages/[...slug]/apply-proposal](../src/pages/api/pages/[...slug]/apply-proposal.ts) where it's re-validated against the Zod schema and committed.

## Safety

- **All writes snapshot to `page_versions`** with `author='bot'` and `chat_turn` = the user message + tool calls that produced the version. You can always answer "what did the bot do" by looking at the page_versions row.
- **Every AI-generated section is re-validated server-side** via Zod before it's written. If the model invents a new `kind` or a malformed shape, the tool returns an error and the model tries again.
- **500KB sections-JSON ceiling** — the same guard that applies to admin PUT applies to bot edits.
- **Max 8 tool-use rounds per turn** — prevents pathological loops.
- **Templates declare `preferredSections` but allow anything.** The system prompt tells the model to prefer those sections, with `legacy-html` and `custom-block` as universal escape hatches. `custom-block` renders with a yellow "AI custom" badge in the admin preview so editors can review AI improvisations.
- **No page deletion from the bot.** Explicitly blocked in the system prompt.

## UX details worth remembering

- **Empty state = context-aware suggestions.** The chat panel renders 3–4 buttons tailored to the current template (e.g. "Add a pricing-tiers section" on landing pages, "Add a timeline to the main column" on program pages). Removes the "what can this thing do?" dead zone.
- **Activity log per assistant turn.** Every tool call shows up as a line item with `✓` (ok), `◦` (proposed), or `✕` (error) and the detail field from the tool. Editors see exactly what the bot did.
- **Inline undo.** Any message that committed a small write shows "Undo this" — one click reverts to the prior version.
- **Apply/Cancel on proposals.** Big writes never apply without explicit user action.
- **Preview iframe auto-refreshes** after any committed write so the client sees their change immediately.

## Known gaps (for Phase 4.5+)

- **Not streaming.** Responses are one-shot JSON right now — the assistant spinner runs while the tool loop completes server-side. Good enough for small edits (2-3 seconds); longer thinking feels slow. Upgrading to streaming requires the UI to handle a `text_delta` event stream + out-of-band tool results.
- **Undo is "revert latest version".** If the bot made 3 tool calls in one turn, "Undo this" reverts the most recent one. The user has to click Undo multiple times for multi-step changes. Proper turn-level undo is a UI polish item.
- **No cost / token counter in the UI.** `usage` is returned in the response body but not displayed. Add once real usage accumulates.
- **No in-chat image upload.** `searchAssets` exists but has nothing to search yet (R2 is seeded but the assets table is empty). Wire R2 upload + asset indexing as part of Phase 2.5.
- **Conversation is session-only.** Reload clears history. If we decide editors want persistent conversation state, a `chat_sessions` table in D1 gets it back.

## Configuration required to run

Production (Cloudflare Pages):

```bash
npx wrangler pages secret put ANTHROPIC_API_KEY --project-name truman-heartland-website
```

Local dev:

```
# .dev.vars
ANTHROPIC_API_KEY="sk-ant-..."
```

Model: `claude-sonnet-4-6`. Swap in [src/pages/api/chat.ts](../src/pages/api/chat.ts).

## Testing the bot

Once a real API key is set, suggestions to exercise each tool class:

1. **Read only** — "What does this page look like right now?"
2. **Small writes** — "Rewrite the page title to be more compelling" → should hit `set_page_meta` and apply immediately; undo should appear.
3. **Multiple small writes in one turn** — "Add a cta-band at the end and change the title to 'New title'" → should hit `set_page_meta` + `add_section`.
4. **Big write with proposal** — "Convert this page to the landing template" → should hit `apply_template` and return a proposal with Apply/Cancel.
5. **Wholesale rewrite** — "Replace all sections with a simpler layout: just a hero, a stat-grid, and a CTA band" → should hit `propose_sections`.

Each of these should leave clean versions in `page_versions` and leave undo available.
