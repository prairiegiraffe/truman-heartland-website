// Template registry. A template is a named set of conventions about which
// section kinds are preferred for a page. It's not strict — pages can include
// any valid section — but the registry drives:
//   1. The admin editor's "template" dropdown + section picker.
//   2. The chatbot prompt ("this page uses the 'landing' template; prefer
//      hero-banner, stat-grid, pricing-tiers, ... but legacy-html and
//      custom-block are always valid").
//   3. The PageRenderer's layout wrapping (container width, sidebar).

import type { Section, SectionKind } from './sections';

export interface TemplateDef {
  id: string;
  label: string;
  description: string;
  /**
   * Section kinds this template is designed around. The admin + chatbot
   * surface these first. `legacy-html` and `custom-block` are always valid
   * in every template and intentionally excluded from this list.
   */
  preferredSections: SectionKind[];
  /**
   * Default starting sections when a new page is created under this template.
   */
  defaultSections: Section[];
  layout: {
    /**
     * 'full' = edge-to-edge sections with their own internal containers.
     * 'sidebar' = sidebar-layout should be present (programs).
     * 'article' = narrow-width prose flow (news, scholarships).
     */
    mode: 'full' | 'sidebar' | 'article';
  };
}

// ---------------------------------------------------------------------------
// Legacy template (everything we scraped from WordPress lives here).
// Only surfaces `legacy-html`; effectively "pass the raw body through the
// content parser".
// ---------------------------------------------------------------------------

const legacyTemplate: TemplateDef = {
  id: 'legacy',
  label: 'Legacy (WordPress content)',
  description:
    'Raw HTML from the imported WordPress content. The existing content parser segments it into sections automatically at render time. Use this while you wait to re-layout a page with a richer template.',
  preferredSections: ['legacy-html'],
  defaultSections: [{ kind: 'legacy-html', html: '' }],
  layout: { mode: 'full' },
};

// ---------------------------------------------------------------------------
// Pillar page: content-rich "about"-style page with alternating splits,
// stat counters, story spotlight, and CTA.
// ---------------------------------------------------------------------------

const pillarTemplate: TemplateDef = {
  id: 'pillar',
  label: 'Pillar page',
  description:
    'Long-form anchor page with alternating image/text splits, stat counters, story spotlight, and a closing CTA. Good for About, Impact, and program overviews.',
  preferredSections: [
    'page-banner',
    'split',
    'stat-grid',
    'icon-cards',
    'story-spotlight',
    'bordered-cards',
    'cta-band',
  ],
  defaultSections: [
    { kind: 'page-banner', title: 'New page', subtitle: 'Short subtitle' },
    {
      kind: 'split',
      title: 'Opening story',
      bodyHtml: '<p>Tell the reader what this page is about.</p>',
      image: { src: '', alt: '' },
      reverse: false,
    },
    {
      kind: 'cta-band',
      title: 'Ready to learn more?',
      cta: { label: 'Get in touch', href: '/contact', variant: 'primary' },
    },
  ],
  layout: { mode: 'full' },
};

// ---------------------------------------------------------------------------
// Program page: sticky sidebar (Quick Facts, Nav, Contact) with rich body
// content, timeline, testimonials.
// ---------------------------------------------------------------------------

const programTemplate: TemplateDef = {
  id: 'program',
  label: 'Program page',
  description:
    'Program or service page with a sticky sidebar (quick facts, in-page nav, contact) and a rich main column (intro, highlight box, feature grid, timeline, testimonials, steps, CTA).',
  preferredSections: [
    'page-banner',
    'sidebar-layout',
    'highlight-box',
    'feature-grid',
    'timeline',
    'testimonials',
    'steps-numbered',
    'cta-band',
  ],
  defaultSections: [
    { kind: 'page-banner', title: 'Program name', subtitle: 'What this program does' },
    {
      kind: 'sidebar-layout',
      sidebarPosition: 'right',
      sidebar: [
        {
          cardKind: 'quick-facts',
          title: 'Quick facts',
          items: [
            { label: 'Duration', value: '12 weeks' },
            { label: 'Starts', value: 'Fall 2026' },
          ],
        },
      ],
      main: [
        {
          kind: 'highlight-box',
          title: 'Who this is for',
          body: '<p>A one-sentence statement of who benefits.</p>',
        },
      ],
    },
    {
      kind: 'cta-band',
      title: 'Interested in this program?',
      cta: { label: 'Apply', href: '/apply', variant: 'primary' },
    },
  ],
  layout: { mode: 'sidebar' },
};

// ---------------------------------------------------------------------------
// Landing page: campaign page with big hero, stats, splits, pricing ladder,
// FAQs, CTA.
// ---------------------------------------------------------------------------

const landingTemplate: TemplateDef = {
  id: 'landing',
  label: 'Landing page',
  description:
    'Campaign or fundraising landing page with full-bleed hero, stats, alternating splits, pricing/sponsorship tiers, story spotlight, details grid, FAQs, and a closing CTA. No sidebar.',
  preferredSections: [
    'hero-banner',
    'stat-grid',
    'split',
    'pricing-tiers',
    'story-spotlight',
    'details-grid',
    'faq-accordion',
    'cta-band',
  ],
  defaultSections: [
    {
      kind: 'hero-banner',
      title: 'Campaign title',
      subtitle: 'One-sentence reason to keep reading.',
      overlayColor: 'dark',
      minHeight: 'tall',
      alignment: 'center',
      parallax: false,
      buttons: [
        { label: 'Primary action', href: '#', variant: 'primary' },
        { label: 'Secondary action', href: '#', variant: 'outline-white' },
      ],
    },
    {
      kind: 'cta-band',
      title: 'Ready to join?',
      cta: { label: 'Get involved', href: '#', variant: 'primary' },
    },
  ],
  layout: { mode: 'full' },
};

// ---------------------------------------------------------------------------
// Image-sections template: showcase of image-heavy patterns.
// ---------------------------------------------------------------------------

const imageSectionsTemplate: TemplateDef = {
  id: 'image-sections',
  label: 'Image-driven page',
  description:
    'Image-forward layout showcasing full-bleed heroes, parallax, image splits, quote overlays, floating cards, dual panels, image-fade, and mosaic grids.',
  preferredSections: [
    'hero-banner',
    'image-split',
    'image-quote',
    'floating-cards',
    'dual-panels',
    'image-fade',
    'image-mosaic',
    'stat-grid',
    'cta-band',
  ],
  defaultSections: [
    {
      kind: 'hero-banner',
      title: 'Image-driven page',
      overlayColor: 'dark',
      minHeight: 'tall',
      alignment: 'center',
      parallax: false,
      buttons: [],
    },
  ],
  layout: { mode: 'full' },
};

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export const TEMPLATES: TemplateDef[] = [
  legacyTemplate,
  pillarTemplate,
  programTemplate,
  landingTemplate,
  imageSectionsTemplate,
];

const BY_ID = new Map(TEMPLATES.map((t) => [t.id, t]));

export function getTemplate(id: string): TemplateDef | undefined {
  return BY_ID.get(id);
}

/**
 * Universal escape hatches — always valid in every template.
 */
export const UNIVERSAL_SECTIONS: SectionKind[] = ['legacy-html', 'custom-block'];
