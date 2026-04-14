// Tool schemas + implementations for the admin chatbot.
//
// Each tool has:
//   - `definition`: the Anthropic-format schema Claude sees
//   - `run(input, ctx)`: the server-side implementation that talks to D1
//
// Tools are split into two categories by blast radius:
//
//   small-writes  (rewriteSection, addSection, removeSection, reorderSections,
//                  setPageMeta, createPage) apply to D1 immediately. Version
//                  history gives us undo.
//
//   big-writes    (applyTemplate, proposeSections) don't apply directly;
//                 they return a Proposal object that the UI renders with
//                 "Apply" / "Cancel" buttons. The user confirms before D1
//                 is touched.

import type { D1Database } from '@cloudflare/workers-types';
import Anthropic from '@anthropic-ai/sdk';

import {
  getPage,
  listPages,
  updatePage,
  type PageUpdate,
} from '../d1';
import { sectionSchema, type Section, type SectionKind } from '../sections';
import { TEMPLATES, getTemplate, UNIVERSAL_SECTIONS } from '../templates';

// ---------------------------------------------------------------------------
// Proposal type — emitted by big-write tools, consumed by the UI
// ---------------------------------------------------------------------------

export type Proposal =
  | {
      kind: 'apply-template';
      slug: string;
      fromTemplate: string;
      toTemplate: string;
      sections: Section[];
      summary: string;
    }
  | {
      kind: 'propose-sections';
      slug: string;
      sections: Section[];
      summary: string;
    };

// ---------------------------------------------------------------------------
// Tool context passed to each implementation
// ---------------------------------------------------------------------------

export interface ToolCtx {
  db: D1Database;
  /**
   * Current page slug the chat is about. Used so tools can default to the
   * active page when the model doesn't specify one.
   */
  activeSlug: string;
  /**
   * Chat turn metadata recorded on every version row. The user message is
   * the plain-text message that triggered the chat turn.
   */
  chatTurn: {
    userMessage: string;
    toolCalls: Array<{ name: string; input: unknown }>;
  };
  /**
   * Collector for proposals returned by big-write tools. The /api/chat
   * handler reads this after the Claude loop ends and forwards to the UI.
   */
  pendingProposals: Proposal[];
}

export interface ToolResult {
  // Freeform JSON payload Claude reads from `tool_result.content`
  result: unknown;
  // Optional structured event the UI renders in its activity log
  activity?: {
    label: string;
    detail?: string;
    status: 'ok' | 'proposed' | 'error';
  };
}

export interface ToolDef {
  definition: Anthropic.Tool;
  run: (input: any, ctx: ToolCtx) => Promise<ToolResult>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveSlug(ctx: ToolCtx, slug?: string): string {
  if (typeof slug === 'string' && slug.length > 0) return slug;
  return ctx.activeSlug;
}

function validateSection(section: unknown): Section {
  return sectionSchema.parse(section);
}

function validateSections(sections: unknown[]): Section[] {
  return sections.map((s) => validateSection(s));
}

function makeSectionId(): string {
  // Short readable id for referencing sections in tool calls.
  return 'sec_' + Math.random().toString(36).slice(2, 10);
}

/**
 * Attach stable ids to sections. The admin + chat reference sections by id
 * so a rewrite / remove / reorder doesn't depend on array indexes.
 */
function assignIds(sections: Section[]): (Section & { id: string })[] {
  return sections.map((s) => ({ ...s, id: (s as any).id ?? makeSectionId() })) as (Section & { id: string })[];
}

// ---------------------------------------------------------------------------
// Read tools
// ---------------------------------------------------------------------------

const getPageTool: ToolDef = {
  definition: {
    name: 'get_page',
    description:
      'Fetch the current state of a page: title, subtitle, template, and ordered sections (each with a stable id). Defaults to the active page if slug is omitted.',
    input_schema: {
      type: 'object',
      properties: {
        slug: {
          type: 'string',
          description: 'Page slug, e.g. "about" or "about/board". Omit for the active page.',
        },
      },
    },
  },
  async run(input, ctx) {
    const slug = resolveSlug(ctx, input.slug);
    const page = await getPage(ctx.db, slug);
    if (!page) {
      return {
        result: { error: `page not found: ${slug}` },
        activity: { label: 'get_page', detail: slug, status: 'error' },
      };
    }
    const sections = assignIds(page.sections as Section[]);
    return {
      result: {
        slug: page.slug,
        path: page.path,
        title: page.title,
        subtitle: page.subtitle,
        template: page.template,
        sections,
      },
      activity: { label: 'get_page', detail: slug || '(home)', status: 'ok' },
    };
  },
};

const listPagesTool: ToolDef = {
  definition: {
    name: 'list_pages',
    description:
      'List pages in the site. Optionally filter by a substring on the title or path.',
    input_schema: {
      type: 'object',
      properties: {
        search: { type: 'string', description: 'Substring filter' },
      },
    },
  },
  async run(input, ctx) {
    const pages = await listPages(ctx.db, input.search);
    return {
      result: pages.map((p) => ({
        slug: p.slug,
        path: p.path,
        title: p.title,
        template: p.template,
      })),
      activity: { label: 'list_pages', detail: input.search ? `"${input.search}"` : 'all', status: 'ok' },
    };
  },
};

const listTemplatesTool: ToolDef = {
  definition: {
    name: 'list_templates',
    description:
      'List available templates. Each template has a preferred set of section kinds but every template can include any section kind — legacy-html and custom-block are the universal escape hatches.',
    input_schema: { type: 'object', properties: {} },
  },
  async run() {
    return {
      result: TEMPLATES.map((t) => ({
        id: t.id,
        label: t.label,
        description: t.description,
        preferredSections: t.preferredSections,
      })),
      activity: { label: 'list_templates', status: 'ok' },
    };
  },
};

// ---------------------------------------------------------------------------
// Small-write tools (commit immediately)
// ---------------------------------------------------------------------------

const setPageMetaTool: ToolDef = {
  definition: {
    name: 'set_page_meta',
    description: 'Update the page title and/or subtitle.',
    input_schema: {
      type: 'object',
      properties: {
        slug: { type: 'string' },
        title: { type: 'string' },
        subtitle: { type: ['string', 'null'] },
      },
    },
  },
  async run(input, ctx) {
    const slug = resolveSlug(ctx, input.slug);
    const update: PageUpdate = {};
    if (typeof input.title === 'string') update.title = input.title;
    if (input.subtitle !== undefined) update.subtitle = input.subtitle;
    const ts = await updatePage(ctx.db, slug, update, 'bot', ctx.chatTurn);
    return {
      result: { ok: true, updatedAt: ts },
      activity: {
        label: 'set_page_meta',
        detail: [input.title && `title → "${input.title}"`, input.subtitle && `subtitle → "${input.subtitle}"`]
          .filter(Boolean).join(', '),
        status: 'ok',
      },
    };
  },
};

const rewriteSectionTool: ToolDef = {
  definition: {
    name: 'rewrite_section',
    description:
      'Replace a single section in place. Provide the section id and a complete replacement section object (validated against the section schema for its kind).',
    input_schema: {
      type: 'object',
      properties: {
        slug: { type: 'string' },
        section_id: { type: 'string', description: 'The `id` of the section to replace.' },
        section: { type: 'object', description: 'The new section object.' },
      },
      required: ['section_id', 'section'],
    },
  },
  async run(input, ctx) {
    const slug = resolveSlug(ctx, input.slug);
    const page = await getPage(ctx.db, slug);
    if (!page) return { result: { error: `page not found: ${slug}` }, activity: { label: 'rewrite_section', status: 'error' } };
    const sections = assignIds(page.sections as Section[]);
    const idx = sections.findIndex((s) => s.id === input.section_id);
    if (idx === -1) return { result: { error: `section not found: ${input.section_id}` }, activity: { label: 'rewrite_section', status: 'error' } };
    let next: Section;
    try {
      next = validateSection(input.section);
    } catch (err) {
      return {
        result: { error: `invalid section: ${(err as Error).message}` },
        activity: { label: 'rewrite_section', detail: input.section_id, status: 'error' },
      };
    }
    const withId = { ...next, id: input.section_id } as Section & { id: string };
    sections[idx] = withId;
    const ts = await updatePage(ctx.db, slug, { sections: stripIds(sections) }, 'bot', ctx.chatTurn);
    return {
      result: { ok: true, updatedAt: ts },
      activity: { label: 'rewrite_section', detail: `${next.kind} · ${input.section_id}`, status: 'ok' },
    };
  },
};

const addSectionTool: ToolDef = {
  definition: {
    name: 'add_section',
    description:
      'Insert a new section. Either append by default, or after a specific section by id.',
    input_schema: {
      type: 'object',
      properties: {
        slug: { type: 'string' },
        after_section_id: { type: 'string', description: 'If provided, insert immediately after this section. Otherwise append to the end.' },
        section: { type: 'object', description: 'The new section object (will be validated against the schema).' },
      },
      required: ['section'],
    },
  },
  async run(input, ctx) {
    const slug = resolveSlug(ctx, input.slug);
    const page = await getPage(ctx.db, slug);
    if (!page) return { result: { error: `page not found: ${slug}` }, activity: { label: 'add_section', status: 'error' } };
    const sections = assignIds(page.sections as Section[]);
    let next: Section;
    try {
      next = validateSection(input.section);
    } catch (err) {
      return { result: { error: `invalid section: ${(err as Error).message}` }, activity: { label: 'add_section', status: 'error' } };
    }
    const newId = makeSectionId();
    const withId = { ...next, id: newId } as Section & { id: string };
    if (input.after_section_id) {
      const idx = sections.findIndex((s) => s.id === input.after_section_id);
      if (idx === -1) return { result: { error: `after_section_id not found` }, activity: { label: 'add_section', status: 'error' } };
      sections.splice(idx + 1, 0, withId);
    } else {
      sections.push(withId);
    }
    const ts = await updatePage(ctx.db, slug, { sections: stripIds(sections) }, 'bot', ctx.chatTurn);
    return {
      result: { ok: true, updatedAt: ts, sectionId: newId },
      activity: { label: 'add_section', detail: `${next.kind}`, status: 'ok' },
    };
  },
};

const removeSectionTool: ToolDef = {
  definition: {
    name: 'remove_section',
    description: 'Remove a section by id.',
    input_schema: {
      type: 'object',
      properties: {
        slug: { type: 'string' },
        section_id: { type: 'string' },
      },
      required: ['section_id'],
    },
  },
  async run(input, ctx) {
    const slug = resolveSlug(ctx, input.slug);
    const page = await getPage(ctx.db, slug);
    if (!page) return { result: { error: `page not found: ${slug}` }, activity: { label: 'remove_section', status: 'error' } };
    const sections = assignIds(page.sections as Section[]);
    const filtered = sections.filter((s) => s.id !== input.section_id);
    if (filtered.length === sections.length) {
      return { result: { error: `section not found: ${input.section_id}` }, activity: { label: 'remove_section', status: 'error' } };
    }
    const ts = await updatePage(ctx.db, slug, { sections: stripIds(filtered) }, 'bot', ctx.chatTurn);
    return {
      result: { ok: true, updatedAt: ts },
      activity: { label: 'remove_section', detail: input.section_id, status: 'ok' },
    };
  },
};

const reorderSectionsTool: ToolDef = {
  definition: {
    name: 'reorder_sections',
    description:
      'Reorder the page\'s sections. Provide an array of section ids in the new order. Ids not in the list are kept at their existing position after the reordered set.',
    input_schema: {
      type: 'object',
      properties: {
        slug: { type: 'string' },
        ordered_ids: { type: 'array', items: { type: 'string' } },
      },
      required: ['ordered_ids'],
    },
  },
  async run(input, ctx) {
    const slug = resolveSlug(ctx, input.slug);
    const page = await getPage(ctx.db, slug);
    if (!page) return { result: { error: `page not found: ${slug}` }, activity: { label: 'reorder_sections', status: 'error' } };
    const sections = assignIds(page.sections as Section[]);
    const byId = new Map(sections.map((s) => [s.id, s]));
    const ordered: (Section & { id: string })[] = [];
    for (const id of input.ordered_ids as string[]) {
      const s = byId.get(id);
      if (s) { ordered.push(s); byId.delete(id); }
    }
    // Append leftovers (preserves any section not referenced by the bot).
    for (const s of byId.values()) ordered.push(s);
    const ts = await updatePage(ctx.db, slug, { sections: stripIds(ordered) }, 'bot', ctx.chatTurn);
    return {
      result: { ok: true, updatedAt: ts },
      activity: { label: 'reorder_sections', detail: `${input.ordered_ids.length} ids`, status: 'ok' },
    };
  },
};

const createPageTool: ToolDef = {
  definition: {
    name: 'create_page',
    description:
      'Create a new empty page with a template and default sections. Slug must be unique and URL-safe (letters, numbers, dashes, slashes).',
    input_schema: {
      type: 'object',
      properties: {
        slug: { type: 'string' },
        title: { type: 'string' },
        template_id: { type: 'string', description: 'One of: legacy, pillar, program, landing, image-sections' },
      },
      required: ['slug', 'title', 'template_id'],
    },
  },
  async run(input, ctx) {
    const slug = String(input.slug).replace(/^\//, '');
    if (!/^[a-z0-9]+(?:[-/][a-z0-9]+)*$/.test(slug)) {
      return { result: { error: 'invalid slug; use lowercase letters, numbers, dashes, slashes' }, activity: { label: 'create_page', status: 'error' } };
    }
    const existing = await getPage(ctx.db, slug);
    if (existing) {
      return { result: { error: `page already exists: ${slug}` }, activity: { label: 'create_page', status: 'error' } };
    }
    const template = getTemplate(input.template_id);
    if (!template) {
      return { result: { error: `unknown template: ${input.template_id}` }, activity: { label: 'create_page', status: 'error' } };
    }
    const now = Date.now();
    await ctx.db
      .prepare(
        'INSERT INTO pages (slug, path, type, template, title, subtitle, meta, legacy_body, sections, updated_at, created_at) VALUES (?1, ?2, ?3, ?4, ?5, NULL, NULL, \'\', ?6, ?7, ?8)'
      )
      .bind(
        slug,
        '/' + slug,
        'page',
        template.id,
        input.title,
        JSON.stringify(template.defaultSections),
        now,
        now
      )
      .run();
    return {
      result: { ok: true, slug, path: '/' + slug },
      activity: { label: 'create_page', detail: `/${slug} (${template.id})`, status: 'ok' },
    };
  },
};

// ---------------------------------------------------------------------------
// Big-write tools (return proposals; UI confirms)
// ---------------------------------------------------------------------------

const applyTemplateTool: ToolDef = {
  definition: {
    name: 'apply_template',
    description:
      'Propose switching a page to a different template. Sections that aren\'t allowed by the new template are moved to a `custom-block` archive at the end so no content is lost. Returns a proposal the user must confirm before the switch happens.',
    input_schema: {
      type: 'object',
      properties: {
        slug: { type: 'string' },
        template_id: { type: 'string' },
      },
      required: ['template_id'],
    },
  },
  async run(input, ctx) {
    const slug = resolveSlug(ctx, input.slug);
    const page = await getPage(ctx.db, slug);
    if (!page) return { result: { error: `page not found: ${slug}` }, activity: { label: 'apply_template', status: 'error' } };
    const template = getTemplate(input.template_id);
    if (!template) return { result: { error: `unknown template: ${input.template_id}` }, activity: { label: 'apply_template', status: 'error' } };

    // Keep sections whose kind is universal OR listed in the template's preferences.
    // Push the rest into a custom-block with the legacy content preserved as JSON.
    const allowedKinds = new Set<SectionKind>([...UNIVERSAL_SECTIONS, ...template.preferredSections]);
    const keep: Section[] = [];
    const archived: Section[] = [];
    for (const s of page.sections as Section[]) {
      if (allowedKinds.has(s.kind)) keep.push(s);
      else archived.push(s);
    }
    const nextSections: Section[] = [...keep];
    if (archived.length > 0) {
      nextSections.push({
        kind: 'custom-block',
        label: `${archived.length} section(s) archived from previous template`,
        html: `<details><summary>${archived.length} archived sections</summary><pre style="white-space:pre-wrap;font-size:0.8em;">${escapeHtml(JSON.stringify(archived, null, 2))}</pre></details>`,
        bg: 'light',
      });
    }

    const summary = [
      `Switch /${slug} from **${page.template}** to **${template.id}**.`,
      `Keeping ${keep.length} compatible sections.`,
      archived.length > 0 ? `Archiving ${archived.length} incompatible sections into a recoverable custom-block.` : null,
    ].filter(Boolean).join(' ');

    ctx.pendingProposals.push({
      kind: 'apply-template',
      slug,
      fromTemplate: page.template,
      toTemplate: template.id,
      sections: nextSections,
      summary,
    });

    return {
      result: {
        proposal: true,
        summary,
        keeping: keep.map((s) => s.kind),
        archiving: archived.map((s) => s.kind),
      },
      activity: { label: 'apply_template (proposed)', detail: `${page.template} → ${template.id}`, status: 'proposed' },
    };
  },
};

const proposeSectionsTool: ToolDef = {
  definition: {
    name: 'propose_sections',
    description:
      'Propose replacing the entire sections array for a page. Use for major rewrites or page merges. Returns a proposal the user must confirm before the replacement happens. Validate every section against the section schema before calling this.',
    input_schema: {
      type: 'object',
      properties: {
        slug: { type: 'string' },
        sections: { type: 'array', items: { type: 'object' } },
        summary: { type: 'string', description: 'One-sentence explanation of what changed and why.' },
      },
      required: ['sections', 'summary'],
    },
  },
  async run(input, ctx) {
    const slug = resolveSlug(ctx, input.slug);
    const page = await getPage(ctx.db, slug);
    if (!page) return { result: { error: `page not found: ${slug}` }, activity: { label: 'propose_sections', status: 'error' } };
    let sections: Section[];
    try {
      sections = validateSections(input.sections as unknown[]);
    } catch (err) {
      return { result: { error: `invalid sections: ${(err as Error).message}` }, activity: { label: 'propose_sections', status: 'error' } };
    }
    ctx.pendingProposals.push({
      kind: 'propose-sections',
      slug,
      sections,
      summary: input.summary,
    });
    return {
      result: {
        proposal: true,
        slug,
        summary: input.summary,
        beforeKinds: (page.sections as Section[]).map((s) => s.kind),
        afterKinds: sections.map((s) => s.kind),
      },
      activity: { label: 'propose_sections', detail: `${sections.length} sections`, status: 'proposed' },
    };
  },
};

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export const TOOLS: Record<string, ToolDef> = {
  get_page: getPageTool,
  list_pages: listPagesTool,
  list_templates: listTemplatesTool,
  set_page_meta: setPageMetaTool,
  rewrite_section: rewriteSectionTool,
  add_section: addSectionTool,
  remove_section: removeSectionTool,
  reorder_sections: reorderSectionsTool,
  create_page: createPageTool,
  apply_template: applyTemplateTool,
  propose_sections: proposeSectionsTool,
};

export const TOOL_DEFINITIONS: Anthropic.Tool[] = Object.values(TOOLS).map((t) => t.definition);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function stripIds(sections: (Section & { id?: string })[]): Section[] {
  // Ids are runtime-only helpers for tool calls; persist without them so the
  // JSON stays clean and compatible with the Zod schemas.
  return sections.map((s) => {
    const clone = { ...s } as Record<string, unknown>;
    delete clone.id;
    return clone as unknown as Section;
  });
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
