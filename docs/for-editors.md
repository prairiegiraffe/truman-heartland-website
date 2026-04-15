# For editors

This is your guide to editing the Truman Heartland website. Written for content editors, not developers. No code required.

## Signing in

Go to **https://truman-heartland-website.kellee.workers.dev/cpadmin/** (this URL will change once we wire the custom domain). You'll see a password prompt. Your password was sent to you separately; keep it safe.

The current temporary password is `THCF-admin-2026-change-me`. **Change it as soon as possible** — see [operations.md](operations.md#change-the-admin-password) for how.

Stay signed in for 30 days; after that, the password prompt comes back.

## The home screen

After signing in you land on a list of every page on the site. Each row shows the page title, URL path, template, and when it was last edited. The search box filters by title or path.

Click **Edit** to open a page.

## The page editor

Three things live on the editor screen:

1. **Left column — the form.** Change the title, subtitle, template, and sections.
2. **Right column — live preview.** A rendering of the page as it would look right now. Refreshes automatically when you save.
3. **Version history panel.** Every save creates a version you can roll back to.

## Using the chat assistant

The floating chat panel in the corner is your content assistant. It's an AI that knows your page, knows the section types available in your template, and can rewrite, reorder, add, or remove sections based on what you ask.

### Things you can say

- **"Rewrite the intro to emphasize community impact."**
- **"Add a stat grid after the hero showing 4 numbers: 250 scholarships, $100M in assets, 40 years of service, 500 funds established."**
- **"Move the CTA band to the top of the page."**
- **"Remove the pricing tiers section."**
- **"Change the hero title to 'Toast to Our Towns 2026'."**
- **"Merge /giving and /ways-to-give into a single landing page at /giving and thin the content."**

### What the assistant does when you send a message

1. Reads the current state of the page from the database.
2. Plans the edits as a sequence of tool calls.
3. For **small edits** (rewriting a section, adding one section, changing the title) it applies them immediately and refreshes your preview.
4. For **big edits** (swapping templates, replacing all sections, merging pages) it proposes a plan and shows you a summary. You click **Apply** or **Cancel**.

### When the assistant is unsure

If the assistant can't figure out how something fits one of your template's section kinds, it has two escape hatches:

- **`legacy-html`** — raw HTML passed through the content renderer. Good for "I have a block of content from elsewhere; just put it here."
- **`custom-block`** — a section the AI improvised. These show up with a yellow "AI custom" badge in the admin preview so you can see what the bot made up.

You can always ask "why did you use a custom-block here — can we make this a proper split section instead?" and the bot will try again.

### Undoing a change

Every change the assistant makes creates a **version** in your version history. Three ways to undo:

1. **In the chat** — each assistant message has an **Undo** button right below it. One click.
2. **In the version history panel** — click **Revert to this** next to any prior version.
3. **Start over** — tell the assistant "revert this page to yesterday's version" and it'll find the right one.

## Templates

A template is a starting layout. Your page picks one. The assistant knows which **section kinds** work best for that template and suggests those first. But you can always use sections from other templates too — the assistant won't block you.

- **Legacy** — the default for imported WordPress pages. Keeps the raw HTML working. Use while you're waiting to re-layout a page.
- **Pillar page** — long-form content pages with alternating image/text splits, stat counters, and a story spotlight. Good for About, Impact, program overviews.
- **Program page** — pages with a sticky sidebar (quick facts, in-page nav, contact). Good for scholarship programs, youth programs, workshops.
- **Landing page** — campaign pages with a big hero, stats, sponsorship tiers, FAQ. Good for the annual gala, capital campaigns, time-limited pushes.
- **Image-driven page** — image-heavy patterns (parallax heroes, quote overlays, floating cards, mosaics). Good for storytelling features.

## Section kinds in plain language

These are the building blocks the assistant works with. The name is the "type" the assistant will use when it talks about what it's adding or removing.

- **page-banner** — title and subtitle bar at the top of the page
- **hero-banner** — full-bleed image with overlay and big headline
- **split** — image on one side, text on the other
- **image-split** — split with an overlay stat (like "$5.9M Awarded in 2024") on top of the image
- **stat-grid** — row of big numbers with labels
- **icon-cards** — grid of cards with an icon, title, and short text
- **bordered-cards** — simple cards with a green left accent border
- **feature-grid** — numbered grid of features (01, 02, 03, 04)
- **timeline** — vertical list of milestones with marker dots
- **steps-numbered** — 1-2-3 process with circular number badges
- **story-spotlight** — big image + quote + attribution with a dark background
- **testimonials** — grid of quote cards with avatars
- **pricing-tiers** — comparison cards like sponsorship levels
- **details-grid** — row of icon + label + value cards (date, venue, dress, tickets)
- **faq-accordion** — expandable Q&A list
- **highlight-box** — callout with an icon and accent border
- **cta-band** — green footer banner with headline + button
- **image-mosaic** — grid of images that reveal overlay text on hover
- **dual-panels** — two side-by-side image panels with hover zoom
- **image-quote** — full-bleed image with a centered quote over it
- **floating-cards** — dark image background with translucent cards floating on top
- **image-fade** — wide image that fades into a solid color
- **sidebar-layout** — splits the main column from a sticky sidebar
- **legacy-html** — raw HTML (escape hatch)
- **custom-block** — AI improvised content (shows a yellow badge in admin)

## Publishing

Your edits save to the database immediately. They show up in your admin preview right away. But the **live public site** is built from the database — the build runs when someone triggers it.

Today, that means asking the developer to run `npm run build:d1`. Phase 2.5 will add a **Publish** button that fires the build automatically. Timeline on that: soon.

## If something breaks

- **The preview went blank.** Look at the JSON section editor — a section with a malformed shape can hide the preview. The AI chat is good at "fix the last section I edited — it's broken."
- **The assistant isn't responding.** The API key might have expired, or the server is rate-limited. Sign out, sign back in, try again. If it persists, reach out to your developer.
- **You see sections you don't recognize.** Someone else might be editing at the same time. Right now we don't block simultaneous edits; last save wins. If you see something unexpected, check the version history.

## Things to expect in the next phases

- **Image upload** — upload an image from your phone in the chat, the assistant puts it where you want.
- **One-click publish** — "Publish to live site" button.
- **Token/cost meter** — see how much each chat conversation costs in API credits.
- **Section preview cards** — visual thumbnails of each section kind so you don't need to memorize the list above.
