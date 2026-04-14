// Section schemas for Truman Heartland pages.
//
// A page's `sections` column in D1 is an array of objects that each match one
// of these schemas. The PageRenderer switches on `kind` and renders the
// matching Astro component. The chatbot in Phase 4 generates objects that
// validate against these schemas.
//
// Design principles:
//   - Every schema has a `kind` discriminator. Nothing else.
//   - `legacy-html` is an explicit escape hatch that renders arbitrary HTML
//     through the existing ContentRenderer. Allowed in every template.
//   - `custom-block` is a second escape hatch the chatbot can reach for when
//     a section doesn't fit an existing kind. It renders with minimal styling
//     and is visually tagged as "AI custom" so editors can review.
//   - All image fields share the same shape ({ src, alt, caption? }) so the
//     chatbot has one thing to learn.

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

const imageSchema = z.object({
  src: z.string().min(1),
  alt: z.string().default(''),
  caption: z.string().optional(),
});

const ctaSchema = z.object({
  label: z.string().min(1),
  href: z.string().min(1),
  variant: z.enum(['primary', 'secondary', 'outline', 'outline-white', 'ghost']).default('primary'),
});

const overlayColor = z.enum(['none', 'dark', 'navy', 'green']).default('dark');
const bgTone = z.enum(['white', 'light', 'blue-light', 'navy', 'navy-dark', 'green']).default('white');

// ---------------------------------------------------------------------------
// Section schemas — each has `kind` as its discriminator
// ---------------------------------------------------------------------------

// `legacy-html`: raw HTML passed through ContentRenderer (WordPress-era content).
// Valid in every template. When present, renders via the existing parser path.
const legacyHtmlSchema = z.object({
  kind: z.literal('legacy-html'),
  html: z.string(),
  hoistLead: z.boolean().optional(),
});

// `custom-block`: escape hatch for AI-generated or one-off sections.
// Renders the HTML but tags it so editors can see what the bot improvised.
const customBlockSchema = z.object({
  kind: z.literal('custom-block'),
  label: z.string().optional(), // shown only in admin preview overlay
  html: z.string(),
  bg: bgTone.optional(),
});

// `hero-banner`: big marketing hero with background image + overlay.
const heroBannerSchema = z.object({
  kind: z.literal('hero-banner'),
  backgroundImage: imageSchema.optional(),
  overlayColor: overlayColor,
  minHeight: z.enum(['short', 'medium', 'tall']).default('tall'),
  eyebrow: z.string().optional(),
  title: z.string().min(1),
  subtitle: z.string().optional(),
  buttons: z.array(ctaSchema).default([]),
  alignment: z.enum(['left', 'center']).default('center'),
  parallax: z.boolean().default(false),
});

// `page-banner`: the lighter banner used at the top of non-hero pages.
const pageBannerSchema = z.object({
  kind: z.literal('page-banner'),
  category: z.string().optional(),
  title: z.string().min(1),
  subtitle: z.string().optional(),
});

// `split`: image + text side-by-side. Reusable across templates.
const splitSchema = z.object({
  kind: z.literal('split'),
  eyebrow: z.string().optional(),
  title: z.string().optional(),
  bodyHtml: z.string().default(''),
  image: imageSchema,
  reverse: z.boolean().default(false),
  bg: bgTone.optional(),
  ctas: z.array(ctaSchema).default([]),
});

// `image-split`: split where the image has an overlay stat/label inside it.
const imageSplitSchema = z.object({
  kind: z.literal('image-split'),
  eyebrow: z.string().optional(),
  title: z.string().optional(),
  bodyHtml: z.string().default(''),
  image: imageSchema,
  imageOverlayStat: z.string().optional(), // big number
  imageOverlayLabel: z.string().optional(),
  reverse: z.boolean().default(false),
  ctas: z.array(ctaSchema).default([]),
});

// `stat-grid`: 2–4 animated counters in a grid.
const statGridSchema = z.object({
  kind: z.literal('stat-grid'),
  eyebrow: z.string().optional(),
  title: z.string().optional(),
  bg: bgTone.default('navy'),
  items: z
    .array(
      z.object({
        target: z.number(),
        prefix: z.string().optional(),
        suffix: z.string().optional(),
        label: z.string(),
      })
    )
    .min(1),
});

// `icon-cards`: 2–4 small cards with an SVG icon, title, body, optional CTA.
const iconCardsSchema = z.object({
  kind: z.literal('icon-cards'),
  eyebrow: z.string().optional(),
  title: z.string().optional(),
  bodyHtml: z.string().optional(),
  columns: z.union([z.literal(2), z.literal(3), z.literal(4)]).default(3),
  bg: bgTone.default('light'),
  items: z
    .array(
      z.object({
        icon: z.string().optional(), // SVG markup OR an icon name the component maps
        title: z.string(),
        body: z.string().default(''),
        cta: ctaSchema.optional(),
      })
    )
    .min(1),
});

// `bordered-cards`: white cards with a left accent border (fund cards pattern).
const borderedCardsSchema = z.object({
  kind: z.literal('bordered-cards'),
  eyebrow: z.string().optional(),
  title: z.string().optional(),
  columns: z.union([z.literal(2), z.literal(3), z.literal(4)]).default(4),
  bg: bgTone.default('white'),
  items: z
    .array(
      z.object({
        title: z.string(),
        body: z.string().default(''),
      })
    )
    .min(1),
});

// `feature-grid`: numbered feature items in a 2×N grid.
const featureGridSchema = z.object({
  kind: z.literal('feature-grid'),
  eyebrow: z.string().optional(),
  title: z.string().optional(),
  bg: bgTone.default('white'),
  items: z
    .array(
      z.object({
        number: z.string().optional(),
        title: z.string(),
        body: z.string().default(''),
      })
    )
    .min(1),
});

// `timeline`: vertical list of milestones.
const timelineSchema = z.object({
  kind: z.literal('timeline'),
  eyebrow: z.string().optional(),
  title: z.string().optional(),
  bg: bgTone.default('white'),
  items: z
    .array(
      z.object({
        title: z.string(),
        body: z.string().default(''),
      })
    )
    .min(1),
});

// `steps-numbered`: linear 1-2-3 process.
const stepsNumberedSchema = z.object({
  kind: z.literal('steps-numbered'),
  eyebrow: z.string().optional(),
  title: z.string().optional(),
  bg: bgTone.default('white'),
  items: z
    .array(
      z.object({
        number: z.string().optional(),
        title: z.string(),
        body: z.string().default(''),
      })
    )
    .min(1),
});

// `story-spotlight`: hero testimonial / headline quote with a supporting image.
const storySpotlightSchema = z.object({
  kind: z.literal('story-spotlight'),
  image: imageSchema,
  reverse: z.boolean().default(false),
  eyebrow: z.string().optional(),
  quote: z.string().min(1),
  attribution: z.string().optional(),
  cta: ctaSchema.optional(),
  bg: bgTone.default('navy-dark'),
});

// `testimonials`: grid of smaller quote cards.
const testimonialsSchema = z.object({
  kind: z.literal('testimonials'),
  eyebrow: z.string().optional(),
  title: z.string().optional(),
  bg: bgTone.default('light'),
  items: z
    .array(
      z.object({
        quote: z.string(),
        author: z.string(),
        meta: z.string().optional(), // role, year, location, etc.
        avatar: imageSchema.optional(),
      })
    )
    .min(1),
});

// `pricing-tiers`: comparison / sponsorship ladder cards.
const pricingTiersSchema = z.object({
  kind: z.literal('pricing-tiers'),
  eyebrow: z.string().optional(),
  title: z.string().optional(),
  bodyHtml: z.string().optional(),
  bg: bgTone.default('light'),
  items: z
    .array(
      z.object({
        title: z.string(),
        price: z.string(),
        priceSuffix: z.string().optional(),
        features: z.array(z.string()).default([]),
        featured: z.boolean().default(false),
        featuredLabel: z.string().optional(), // e.g. "Most Popular"
        cta: ctaSchema.optional(),
      })
    )
    .min(1),
});

// `details-grid`: icon + short label/value cards (Date, Venue, Dress, etc.).
const detailsGridSchema = z.object({
  kind: z.literal('details-grid'),
  eyebrow: z.string().optional(),
  title: z.string().optional(),
  bg: bgTone.default('white'),
  columns: z.union([z.literal(2), z.literal(3), z.literal(4)]).default(4),
  items: z
    .array(
      z.object({
        icon: z.string().optional(),
        label: z.string(),
        value: z.string(),
        note: z.string().optional(),
      })
    )
    .min(1),
});

// `faq-accordion`: native <details> Q&A list.
const faqAccordionSchema = z.object({
  kind: z.literal('faq-accordion'),
  eyebrow: z.string().optional(),
  title: z.string().optional(),
  bg: bgTone.default('light'),
  items: z
    .array(
      z.object({
        question: z.string(),
        answer: z.string(), // HTML allowed
      })
    )
    .min(1),
});

// `highlight-box`: single callout block with an icon.
const highlightBoxSchema = z.object({
  kind: z.literal('highlight-box'),
  icon: z.string().optional(),
  title: z.string(),
  body: z.string().default(''),
  tone: z.enum(['info', 'success', 'warning']).default('info'),
});

// `cta-band`: green band with centered headline + single CTA.
const ctaBandSchema = z.object({
  kind: z.literal('cta-band'),
  title: z.string(),
  body: z.string().optional(),
  cta: ctaSchema,
});

// `image-mosaic`: grid of images that reveal an overlay on hover.
const imageMosaicSchema = z.object({
  kind: z.literal('image-mosaic'),
  eyebrow: z.string().optional(),
  title: z.string().optional(),
  items: z
    .array(
      z.object({
        image: imageSchema,
        title: z.string(),
        body: z.string().optional(),
        wide: z.boolean().default(false),
      })
    )
    .min(1),
});

// `dual-panels`: two image-bg panels side by side with hover zoom.
const dualPanelsSchema = z.object({
  kind: z.literal('dual-panels'),
  items: z
    .array(
      z.object({
        image: imageSchema,
        eyebrow: z.string().optional(),
        title: z.string(),
        body: z.string().optional(),
        cta: ctaSchema.optional(),
      })
    )
    .length(2),
});

// `image-quote`: full-bleed quote over background image.
const imageQuoteSchema = z.object({
  kind: z.literal('image-quote'),
  backgroundImage: imageSchema,
  overlayColor: overlayColor.default('navy'),
  quote: z.string(),
  attribution: z.string().optional(),
});

// `floating-cards`: dark image bg with translucent blur cards floating on top.
const floatingCardsSchema = z.object({
  kind: z.literal('floating-cards'),
  backgroundImage: imageSchema,
  eyebrow: z.string().optional(),
  title: z.string(),
  body: z.string().optional(),
  items: z
    .array(
      z.object({
        icon: z.string().optional(),
        title: z.string(),
        body: z.string().default(''),
        cta: ctaSchema.optional(),
      })
    )
    .min(1),
});

// `image-fade`: image fading to a solid color (navy) via gradient.
const imageFadeSchema = z.object({
  kind: z.literal('image-fade'),
  image: imageSchema,
  fadeColor: z.enum(['navy', 'navy-dark', 'green']).default('navy'),
  eyebrow: z.string().optional(),
  title: z.string(),
  body: z.string().optional(),
  cta: ctaSchema.optional(),
});

// `sidebar-layout`: container that hosts a sticky sidebar + main content flow.
// Sidebar is itself an array of "sidebar cards" (nav, contact, quick facts).
// Main content is an array of nested sections (limited subset to avoid nested
// sidebars / nested heroes).
const sidebarCardSchema = z.discriminatedUnion('cardKind', [
  z.object({
    cardKind: z.literal('quick-facts'),
    title: z.string(),
    items: z.array(z.object({ label: z.string(), value: z.string() })),
    cta: ctaSchema.optional(),
  }),
  z.object({
    cardKind: z.literal('nav'),
    title: z.string(),
    items: z.array(z.object({ label: z.string(), href: z.string() })),
  }),
  z.object({
    cardKind: z.literal('contact'),
    title: z.string(),
    name: z.string().optional(),
    role: z.string().optional(),
    email: z.string().optional(),
    phone: z.string().optional(),
  }),
]);

// A sidebar layout embeds other sections in its main column.
// Referenced via z.lazy since it recursively references the section union.
export type SectionUnionInput = z.input<typeof sectionSchemaBeforeSidebar>;

const sidebarLayoutSchema = z.object({
  kind: z.literal('sidebar-layout'),
  sidebarPosition: z.enum(['left', 'right']).default('right'),
  sidebar: z.array(sidebarCardSchema).min(1),
  main: z.array(z.lazy((): z.ZodTypeAny => sectionSchemaBeforeSidebar)).min(1),
});

// ---------------------------------------------------------------------------
// Discriminated union
//
// `sectionSchemaBeforeSidebar` is the union without sidebar-layout (to avoid
// infinite recursion inside sidebar's `main` field). `sectionSchema` is the
// full union. The chatbot and API use `sectionSchema` — validators recurse
// through sidebars correctly.
// ---------------------------------------------------------------------------

const sectionSchemaBeforeSidebar = z.discriminatedUnion('kind', [
  legacyHtmlSchema,
  customBlockSchema,
  heroBannerSchema,
  pageBannerSchema,
  splitSchema,
  imageSplitSchema,
  statGridSchema,
  iconCardsSchema,
  borderedCardsSchema,
  featureGridSchema,
  timelineSchema,
  stepsNumberedSchema,
  storySpotlightSchema,
  testimonialsSchema,
  pricingTiersSchema,
  detailsGridSchema,
  faqAccordionSchema,
  highlightBoxSchema,
  ctaBandSchema,
  imageMosaicSchema,
  dualPanelsSchema,
  imageQuoteSchema,
  floatingCardsSchema,
  imageFadeSchema,
]);

export const sectionSchema = z.discriminatedUnion('kind', [
  ...sectionSchemaBeforeSidebar.options,
  sidebarLayoutSchema,
]);

export type Section = z.infer<typeof sectionSchema>;
export type SectionKind = Section['kind'];

// ---------------------------------------------------------------------------
// Registry: the ordered list of kinds (used by the admin UI + chatbot prompt)
// ---------------------------------------------------------------------------

export const SECTION_KINDS: SectionKind[] = [
  'legacy-html',
  'custom-block',
  'hero-banner',
  'page-banner',
  'split',
  'image-split',
  'stat-grid',
  'icon-cards',
  'bordered-cards',
  'feature-grid',
  'timeline',
  'steps-numbered',
  'story-spotlight',
  'testimonials',
  'pricing-tiers',
  'details-grid',
  'faq-accordion',
  'highlight-box',
  'cta-band',
  'image-mosaic',
  'dual-panels',
  'image-quote',
  'floating-cards',
  'image-fade',
  'sidebar-layout',
];

/**
 * Parse an unknown value into a validated Section. Used by PageRenderer and
 * the admin API. Throws on validation failure.
 */
export function parseSection(input: unknown): Section {
  return sectionSchema.parse(input);
}

/**
 * Safer variant: returns `{ ok, section }` or `{ ok: false, error }`.
 * Used by the renderer so a malformed section falls back to legacy-html
 * rather than breaking the whole page.
 */
export function safeParseSection(input: unknown):
  | { ok: true; section: Section }
  | { ok: false; error: string } {
  const result = sectionSchema.safeParse(input);
  if (result.success) return { ok: true, section: result.data };
  return { ok: false, error: result.error.message };
}
