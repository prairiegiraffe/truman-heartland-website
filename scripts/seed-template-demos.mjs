#!/usr/bin/env node

/**
 * seed-template-demos.mjs
 *
 * Seeds D1 with the four "template demo" pages as structured section arrays.
 * These replace the hardcoded Astro pages under src/pages/templates/*.astro
 * and prove the PageRenderer pipeline end-to-end.
 *
 * Pages seeded:
 *   /templates                  - Template index (pillar template)
 *   /templates/pillar-page      - Pillar template demo
 *   /templates/program-page     - Program template demo (sidebar)
 *   /templates/landing-page     - Landing template demo (hero + pricing)
 *   /templates/image-sections   - Image-driven template demo
 *
 * Usage: node scripts/seed-template-demos.mjs [--local | --remote]
 *   --local   (default) apply to .wrangler/state/v3/d1
 *   --remote  apply to the production D1
 */

import fs from 'fs-extra';
import path from 'path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DB_NAME = 'thcf-content';
const REMOTE = process.argv.includes('--remote');

// ---------------------------------------------------------------------------
// Shared asset URLs (blob storage)
// ---------------------------------------------------------------------------

const IMG = {
  community: 'https://stdidthcfprod.blob.core.windows.net/thcf/images/News/2025-Jan/_wide/Screenshot-2025-01-08-at-2.03.16-AM.png',
  grants: 'https://stdidthcfprod.blob.core.windows.net/thcf/images/Home/_square/Home_CommunityGrants.png',
  scholarship: 'https://stdidthcfprod.blob.core.windows.net/thcf/images/Home/_square/Scholarship-Program.png',
  snap: 'https://stdidthcfprod.blob.core.windows.net/thcf/images/SNAP/_square/SNAP_How-to-Help-1.png',
  jelley: 'https://stdidthcfprod.blob.core.windows.net/thcf/images/Home/_square/Jelley-Family-Foundation.png',
};

const ICON_HEART = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>';
const ICON_GRAD = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 12 3 12 0v-5"/></svg>';
const ICON_SMILE = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>';
const ICON_CAL = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>';
const ICON_MAP = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>';
const ICON_DRESS = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v20M5 9l7-7 7 7"/></svg>';
const ICON_TICK = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12V8a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v4c0 .55.45 1 1 1a2 2 0 0 1 0 4c-.55 0-1 .45-1 1v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4c0-.55-.45-1-1-1a2 2 0 0 1 0-4c.55 0 1-.45 1-1z"/></svg>';

// ---------------------------------------------------------------------------
// Template demo data
// ---------------------------------------------------------------------------

const DEMOS = [
  {
    path: '/templates',
    slug: 'templates',
    title: 'Page Templates',
    subtitle: 'Browse our reusable content patterns for building new pages.',
    type: 'page',
    template: 'pillar',
    sections: [
      {
        kind: 'page-banner',
        category: 'Design System',
        title: 'Page Templates',
        subtitle: 'Browse our reusable content patterns for building new pages.',
      },
      {
        kind: 'icon-cards',
        eyebrow: 'Templates',
        title: 'Pick a starting point',
        bodyHtml: '<p>Each template is a collection of section types you can mix, match, and reorder. Start with a template, then ask the content assistant to customize it to fit your page.</p>',
        columns: 2,
        bg: 'light',
        items: [
          { icon: ICON_HEART, title: 'Pillar page', body: 'Long-form anchor pages with alternating splits, stat counters, and a story spotlight.', cta: { label: 'View pillar demo', href: '/templates/pillar-page', variant: 'outline' } },
          { icon: ICON_GRAD, title: 'Program page', body: 'Program or service pages with a sticky sidebar (quick facts, nav, contact) alongside rich content.', cta: { label: 'View program demo', href: '/templates/program-page', variant: 'outline' } },
          { icon: ICON_SMILE, title: 'Landing page', body: 'Campaign pages with a big hero, stats, pricing tiers, FAQ, and a closing CTA.', cta: { label: 'View landing demo', href: '/templates/landing-page', variant: 'outline' } },
          { icon: ICON_MAP, title: 'Image-driven page', body: 'Image-heavy patterns: hero overlays, parallax, quote overlays, floating cards, mosaics.', cta: { label: 'View image demo', href: '/templates/image-sections', variant: 'outline' } },
        ],
      },
      {
        kind: 'cta-band',
        title: 'Ready to build a new page?',
        body: 'Open the content admin, create a page, pick a template, and the assistant will help you from there.',
        cta: { label: 'Open content admin', href: '/cpadmin', variant: 'primary' },
      },
    ],
  },

  {
    path: '/templates/pillar-page',
    slug: 'templates/pillar-page',
    title: 'Charitable Giving at THCF',
    subtitle: 'Template: Pillar page',
    type: 'page',
    template: 'pillar',
    sections: [
      {
        kind: 'page-banner',
        category: 'Template Example',
        title: 'Charitable Giving at THCF',
      },
      {
        kind: 'split',
        eyebrow: 'Why Give Through THCF?',
        title: 'Your Gift Does More When We Work Together',
        bodyHtml: '<p>When you give through Truman Heartland Community Foundation, your generosity is amplified by the collective power of our community. We provide the expertise, local knowledge, and financial stewardship to ensure every dollar makes the greatest possible impact.</p><p>Whether you\'re an individual donor, a family creating a legacy, or a business investing in your community — we have giving options designed for you.</p>',
        image: { src: IMG.community, alt: 'Community members gathering' },
        reverse: false,
        bg: 'white',
        ctas: [
          { label: 'Open a Fund', href: '/give-now', variant: 'primary' },
          { label: 'Planned Giving', href: '/donors/planned-giving', variant: 'outline' },
        ],
      },
      {
        kind: 'stat-grid',
        eyebrow: 'Our Impact',
        title: 'Making a Difference Since 1982',
        bg: 'navy',
        items: [
          { target: 250, suffix: '+', label: 'Scholarship Funds' },
          { target: 100, prefix: '$', suffix: 'M+', label: 'Assets Under Management' },
          { target: 40, suffix: '+', label: 'Years of Service' },
          { target: 500, suffix: '+', label: 'Funds Established' },
        ],
      },
      {
        kind: 'icon-cards',
        eyebrow: 'Ways to Give',
        title: 'Choose the Approach That\'s Right for You',
        bodyHtml: '<p>Every donor is unique. We offer flexible giving options that match your goals, timeline, and financial situation.</p>',
        columns: 3,
        bg: 'light',
        items: [
          { icon: ICON_HEART, title: 'Donor Advised Fund', body: '<p>The most flexible way to give. Contribute cash, stock, or other assets, receive an immediate tax benefit, and recommend grants to your favorite causes over time.</p>', cta: { label: 'Learn More', href: '/donors', variant: 'outline' } },
          { icon: ICON_GRAD, title: 'Scholarship Fund', body: '<p>Create a lasting impact on education. Establish a named scholarship fund that awards students for generations to come, guided by criteria you choose.</p>', cta: { label: 'Learn More', href: '/students/scholarships', variant: 'outline' } },
          { icon: ICON_SMILE, title: 'Planned Giving', body: '<p>Build a legacy that lasts. Include THCF in your estate plans through a bequest, charitable trust, or beneficiary designation — and secure your community\'s future.</p>', cta: { label: 'Learn More', href: '/donors/planned-giving', variant: 'outline' } },
        ],
      },
      {
        kind: 'split',
        eyebrow: 'Community Grantmaking',
        title: 'Funding What Matters Most',
        bodyHtml: '<p>Our community grantmaking funds address the most pressing needs in Eastern Jackson County — from arts and education to health and human services. When you contribute, a team of local volunteers reviews applications and awards grants where they\'ll have the greatest impact.</p>',
        image: { src: IMG.grants, alt: 'Community grants program' },
        reverse: true,
        bg: 'white',
        ctas: [{ label: 'Explore Grants', href: '/grant-seekers/community-grants-program', variant: 'outline' }],
      },
      {
        kind: 'story-spotlight',
        image: { src: IMG.scholarship, alt: 'Scholarship recipients' },
        reverse: false,
        eyebrow: 'Donor Spotlight',
        quote: 'Establishing a scholarship fund through THCF was the most rewarding decision our family has made. Watching students achieve their dreams — that\'s our legacy.',
        attribution: 'The Johnson Family, Independence, MO',
        cta: { label: 'Read Donor Stories', href: '/about/news', variant: 'outline-white' },
        bg: 'navy-dark',
      },
      {
        kind: 'bordered-cards',
        eyebrow: 'Types of Funds',
        title: 'Find the Fund That Fits Your Vision',
        columns: 4,
        bg: 'blue-light',
        items: [
          { title: 'Donor Advised Fund', body: '<p>Maximum flexibility for your giving. You advise, we handle the administration. Contribute once or over time, and recommend grants whenever you\'re ready.</p>' },
          { title: 'Field of Interest Fund', body: '<p>Support a cause area you care about — arts, education, health — and let our team direct grants to the most effective organizations working in that space.</p>' },
          { title: 'Designated Fund', body: '<p>Direct your giving to a specific nonprofit organization. Your fund grows over time and provides reliable, ongoing support to the organization you love.</p>' },
          { title: 'Nonprofit Agency Fund', body: '<p>Nonprofits can establish an endowment with THCF to build long-term financial stability. We manage the investments while you focus on your mission.</p>' },
        ],
      },
      {
        kind: 'cta-band',
        title: 'Ready to Make a Difference?',
        body: 'Our team is here to help you find the perfect giving strategy. Schedule a conversation today.',
        cta: { label: 'Get in Touch', href: '/about/contact-us', variant: 'primary' },
      },
    ],
  },

  {
    path: '/templates/program-page',
    slug: 'templates/program-page',
    title: 'Youth Leadership Program',
    subtitle: 'Template: Program page',
    type: 'page',
    template: 'program',
    sections: [
      {
        kind: 'page-banner',
        category: 'Program',
        title: 'Youth Leadership Program',
        subtitle: 'A year-long experience for high school juniors and seniors in Eastern Jackson County.',
      },
      {
        kind: 'sidebar-layout',
        sidebarPosition: 'right',
        sidebar: [
          {
            cardKind: 'quick-facts',
            title: 'Quick facts',
            items: [
              { label: 'Duration', value: 'September – May' },
              { label: 'Grade', value: 'Juniors & seniors' },
              { label: 'Cost', value: 'Free' },
              { label: 'Cohort size', value: '24 students' },
            ],
            cta: { label: 'Apply now', href: '#apply', variant: 'primary' },
          },
          {
            cardKind: 'nav',
            title: 'In this page',
            items: [
              { label: 'Overview', href: '#overview' },
              { label: 'What you\'ll do', href: '#what' },
              { label: 'Timeline', href: '#timeline' },
              { label: 'Alumni voices', href: '#alumni' },
              { label: 'How to apply', href: '#apply' },
            ],
          },
          {
            cardKind: 'contact',
            title: 'Program contact',
            name: 'Melanie Adkins',
            role: 'Youth Programs Director',
            email: 'adkins@thcf.org',
            phone: '(816) 765-5300',
          },
        ],
        main: [
          {
            kind: 'highlight-box',
            title: 'Who this is for',
            body: '<p>Motivated high school juniors and seniors who want to lead in their schools and communities. No prior leadership experience required — curiosity and commitment are what we\'re looking for.</p>',
            tone: 'info',
          },
          {
            kind: 'feature-grid',
            eyebrow: 'What you\'ll do',
            title: 'Four pillars of the program',
            items: [
              { number: '01', title: 'Monthly workshops', body: '<p>Hands-on sessions on public speaking, project management, financial literacy, and civic engagement — led by local experts.</p>' },
              { number: '02', title: 'Community projects', body: '<p>Work in teams to design and deliver a community project. Past projects include a food drive, a public-art mural, and a local podcast.</p>' },
              { number: '03', title: 'Mentorship', body: '<p>Monthly one-on-one meetings with a professional mentor matched to your interests.</p>' },
              { number: '04', title: 'Scholarship', body: '<p>Every graduate earns a $1,000 scholarship for their college education.</p>' },
            ],
          },
          {
            kind: 'timeline',
            eyebrow: 'Timeline',
            title: 'Your year at a glance',
            items: [
              { title: 'September — Orientation', body: '<p>Kick off weekend retreat. Meet your cohort and mentors.</p>' },
              { title: 'October–December — Foundation', body: '<p>Monthly workshops on leadership, communication, and project planning.</p>' },
              { title: 'January — Community project launch', body: '<p>Teams choose a community issue and begin designing their project.</p>' },
              { title: 'February–April — Execution', body: '<p>Teams deliver their projects with coaching from mentors and THCF staff.</p>' },
              { title: 'May — Graduation', body: '<p>Celebrate with family, showcase your project, and receive your scholarship.</p>' },
            ],
          },
          {
            kind: 'testimonials',
            eyebrow: 'Alumni voices',
            title: 'What graduates say',
            items: [
              { quote: 'This program taught me how to show up for my community. I use what I learned every single week.', author: 'Priya S.', meta: 'Class of 2024 · Raytown High' },
              { quote: 'The mentor relationship changed how I think about my future. I\'m applying to colleges I never thought I\'d consider.', author: 'Darius W.', meta: 'Class of 2023 · Blue Springs South' },
            ],
          },
          {
            kind: 'steps-numbered',
            eyebrow: 'How to apply',
            title: 'Three steps',
            items: [
              { number: '1', title: 'Check eligibility', body: '<p>You must be a rising junior or senior attending a high school in Jackson, Cass, or Lafayette counties.</p>' },
              { number: '2', title: 'Submit application', body: '<p>Complete the online application by <strong>March 15</strong>. A teacher or community reference is required.</p>' },
              { number: '3', title: 'Interview', body: '<p>Selected applicants interview with our program committee in April. Decisions go out in early May.</p>' },
            ],
          },
        ],
      },
      {
        kind: 'cta-band',
        title: 'Ready to apply?',
        body: 'Applications for the 2026–2027 cohort open in January.',
        cta: { label: 'Start your application', href: '#', variant: 'primary' },
      },
    ],
  },

  {
    path: '/templates/landing-page',
    slug: 'templates/landing-page',
    title: 'Annual Gala 2026',
    subtitle: 'Template: Landing page',
    type: 'page',
    template: 'landing',
    sections: [
      {
        kind: 'hero-banner',
        backgroundImage: { src: IMG.scholarship, alt: '' },
        overlayColor: 'dark',
        minHeight: 'tall',
        alignment: 'center',
        parallax: false,
        eyebrow: 'Saturday, September 19, 2026',
        title: 'Toast to Our Towns',
        subtitle: 'THCF\'s 31st annual gala — an evening of connection, recognition, and community impact.',
        buttons: [
          { label: 'Buy tickets', href: '#tickets', variant: 'primary' },
          { label: 'Become a sponsor', href: '#sponsor', variant: 'outline-white' },
        ],
      },
      {
        kind: 'stat-grid',
        bg: 'navy',
        items: [
          { target: 600, suffix: '+', label: 'Guests each year' },
          { target: 1.2, prefix: '$', suffix: 'M', label: 'Raised in 2025' },
          { target: 24, label: 'Honorees recognized' },
          { target: 31, label: 'Years strong' },
        ],
      },
      {
        kind: 'split',
        eyebrow: 'Why we gather',
        title: 'Celebrating the people who build our community',
        bodyHtml: '<p>The Toast to Our Towns gala honors individuals and organizations making exceptional contributions across Eastern Jackson County. Proceeds support the THCF Community Endowment Fund — flexible grants that respond to the most pressing needs as they emerge.</p>',
        image: { src: IMG.community, alt: 'Gala attendees' },
        reverse: false,
        bg: 'white',
      },
      {
        kind: 'pricing-tiers',
        eyebrow: 'Sponsorships',
        title: 'Support the gala, amplify your impact',
        bodyHtml: '<p>Every sponsorship includes recognition and tickets. All levels directly support community grantmaking.</p>',
        bg: 'light',
        items: [
          { title: 'Community', price: '$2,500', features: ['4 gala tickets', 'Logo on program', 'Social recognition'], cta: { label: 'Select', href: '#', variant: 'outline' } },
          { title: 'Leadership', price: '$5,000', features: ['8 gala tickets', 'Reserved table', 'Logo on program & signage', 'Social recognition'], featured: true, featuredLabel: 'Most popular', cta: { label: 'Select', href: '#', variant: 'primary' } },
          { title: 'Legacy', price: '$10,000', features: ['Reserved table for 10', 'Full-page program ad', 'Stage recognition', 'Premium signage'], cta: { label: 'Select', href: '#', variant: 'outline' } },
          { title: 'Founders', price: '$25,000', features: ['Two reserved tables', 'Title sponsorship placement', 'Custom engagement with honorees', 'Year-round recognition'], cta: { label: 'Contact us', href: '/about/contact-us', variant: 'outline' } },
        ],
      },
      {
        kind: 'story-spotlight',
        image: { src: IMG.snap, alt: 'Community impact' },
        eyebrow: 'Impact',
        quote: 'Every dollar raised at the gala becomes a grant within 12 months. It\'s the most direct way I know to turn a great evening into a better year for our neighbors.',
        attribution: 'Phil Hanson · THCF President',
        bg: 'navy-dark',
      },
      {
        kind: 'details-grid',
        title: 'Event details',
        bg: 'white',
        columns: 4,
        items: [
          { icon: ICON_CAL, label: 'Date', value: 'Saturday, September 19, 2026' },
          { icon: ICON_MAP, label: 'Venue', value: 'Sheraton Crown Center', note: 'Kansas City, MO' },
          { icon: ICON_DRESS, label: 'Attire', value: 'Black tie optional' },
          { icon: ICON_TICK, label: 'Tickets', value: '$250 per guest' },
        ],
      },
      {
        kind: 'faq-accordion',
        eyebrow: 'Common questions',
        title: 'FAQ',
        bg: 'light',
        items: [
          { question: 'Can I buy a single ticket?', answer: '<p>Yes. Individual tickets are $250 and include dinner, program, and the silent auction.</p>' },
          { question: 'Is there a cocktail hour?', answer: '<p>Yes. Cocktails and networking from 6:00–7:00 PM, followed by dinner and program at 7:00 PM.</p>' },
          { question: 'How are honorees selected?', answer: '<p>Community members and past honorees nominate candidates. A selection committee reviews nominations against the gala\'s impact criteria.</p>' },
          { question: 'Is my ticket tax deductible?', answer: '<p>The portion of your ticket above the fair-market value of the event is tax deductible. We\'ll provide a written acknowledgement after the event.</p>' },
          { question: 'How can I volunteer?', answer: '<p>We welcome volunteers for the registration desk, silent auction support, and post-event follow-up. <a href="/about/contact-us">Email us</a> to get on the list.</p>' },
        ],
      },
      {
        kind: 'cta-band',
        title: 'Join us September 19',
        body: 'Reserve your seat or sponsor a table today.',
        cta: { label: 'Buy tickets', href: '#tickets', variant: 'primary' },
      },
    ],
  },

  {
    path: '/templates/image-sections',
    slug: 'templates/image-sections',
    title: 'Image-driven patterns',
    subtitle: 'Template: Image-driven',
    type: 'page',
    template: 'image-sections',
    sections: [
      {
        kind: 'hero-banner',
        backgroundImage: { src: IMG.community, alt: '' },
        overlayColor: 'dark',
        minHeight: 'tall',
        alignment: 'center',
        parallax: false,
        eyebrow: 'Showcase',
        title: 'Image-driven section patterns',
        subtitle: 'Full-bleed heroes, parallax, overlays, quote walls, floating cards, and mosaics.',
        buttons: [],
      },
      {
        kind: 'image-split',
        eyebrow: 'Program spotlight',
        title: 'Scholarships that change lives',
        bodyHtml: '<p>An image split with an overlay stat inside the image itself. Use this when the image carries a data point that reinforces the story beside it.</p>',
        image: { src: IMG.scholarship, alt: 'Scholarship recipient' },
        imageOverlayStat: '$5.9M',
        imageOverlayLabel: 'Awarded in 2024',
        reverse: false,
      },
      {
        kind: 'image-quote',
        backgroundImage: { src: IMG.grants, alt: '' },
        overlayColor: 'navy',
        quote: 'We don\'t chase the big national stories. We listen to our neighbors and build what they actually need.',
        attribution: 'Phil Hanson, THCF President',
      },
      {
        kind: 'floating-cards',
        backgroundImage: { src: IMG.community, alt: '' },
        eyebrow: 'Services',
        title: 'What we offer',
        body: 'Translucent cards over a full-bleed image — good for a summary of services or pillars.',
        items: [
          { icon: ICON_HEART, title: 'Fund administration', body: '<p>We handle the paperwork so you can focus on impact.</p>' },
          { icon: ICON_GRAD, title: 'Grantmaking', body: '<p>Our volunteer committees steward every grant.</p>' },
          { icon: ICON_SMILE, title: 'Advisor partnerships', body: '<p>We work hand-in-hand with financial advisors.</p>' },
        ],
      },
      {
        kind: 'dual-panels',
        items: [
          { image: { src: IMG.jelley, alt: '' }, eyebrow: 'For donors', title: 'Give with confidence', body: 'Flexible fund options for individuals and families.', cta: { label: 'Explore giving', href: '/donors', variant: 'outline-white' } },
          { image: { src: IMG.grants, alt: '' }, eyebrow: 'For nonprofits', title: 'Grants that respond', body: 'Community grants for organizations working the front lines.', cta: { label: 'Explore grants', href: '/grant-seekers', variant: 'outline-white' } },
        ],
      },
      {
        kind: 'image-fade',
        image: { src: IMG.snap, alt: '' },
        fadeColor: 'navy',
        eyebrow: 'Emergency response',
        title: 'SNAP & Community Relief',
        body: 'A wide image that fades into solid color so the headline has breathing room on the right.',
        cta: { label: 'Support the fund', href: '/donors/snap-resources', variant: 'primary' },
      },
      {
        kind: 'image-mosaic',
        eyebrow: 'Moments',
        title: 'From across our community',
        items: [
          { image: { src: IMG.community, alt: '' }, title: 'Senior picnic', body: 'Annual summer gathering', wide: true },
          { image: { src: IMG.scholarship, alt: '' }, title: 'Scholarship night', body: '2024 awards' },
          { image: { src: IMG.grants, alt: '' }, title: 'Grants workshop', body: 'Spring 2024' },
          { image: { src: IMG.jelley, alt: '' }, title: 'Jelley Foundation', body: 'Children\'s education' },
          { image: { src: IMG.snap, alt: '' }, title: 'SNAP response', body: 'Food security' },
        ],
      },
      {
        kind: 'cta-band',
        title: 'Want to try these patterns on your page?',
        body: 'Open the content admin and pick the image-driven template.',
        cta: { label: 'Open content admin', href: '/cpadmin', variant: 'primary' },
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// SQL generation
// ---------------------------------------------------------------------------

function sqlStr(v) {
  if (v === null || v === undefined) return 'NULL';
  return `'${String(v).replace(/'/g, "''")}'`;
}

function buildStatements() {
  const now = Date.now();
  const lines = [];
  for (const demo of DEMOS) {
    const sectionsJson = JSON.stringify(demo.sections);
    // UPSERT: delete existing then insert fresh. Simpler than ON CONFLICT clauses
    // and keeps the page_versions history clean on re-seeds.
    lines.push(`DELETE FROM pages WHERE slug = ${sqlStr(demo.slug)};`);
    lines.push(
      `INSERT INTO pages (slug, path, type, template, title, subtitle, meta, legacy_body, sections, updated_at, created_at) VALUES (` +
        `${sqlStr(demo.slug)}, ${sqlStr(demo.path)}, ${sqlStr(demo.type)}, ${sqlStr(demo.template)}, ${sqlStr(demo.title)}, ${sqlStr(demo.subtitle)}, NULL, '', ${sqlStr(sectionsJson)}, ${now}, ${now});`
    );
  }
  return lines.join('\n') + '\n';
}

function applySql(sql) {
  const tmp = `/tmp/seed-template-demos.${process.pid}.sql`;
  fs.writeFileSync(tmp, sql);
  const args = ['wrangler', 'd1', 'execute', DB_NAME, REMOTE ? '--remote' : '--local', `--file=${tmp}`];
  console.log('running', args.join(' '));
  const res = spawnSync('npx', args, { cwd: ROOT, stdio: 'inherit' });
  fs.removeSync(tmp);
  if (res.status !== 0) throw new Error(`wrangler failed (exit ${res.status})`);
}

function main() {
  console.log(`=== Seed template demos (${REMOTE ? 'remote' : 'local'}) ===`);
  console.log(`Target:  ${DB_NAME}`);
  console.log(`Demos:   ${DEMOS.map((d) => d.path).join(', ')}`);
  console.log('');
  const sql = buildStatements();
  applySql(sql);
  console.log('\nDone.');
}

main();
