// D1 helpers for /api and /cpadmin routes. Only callable at request time (from
// a prerender=false route) since the D1 binding lives on Astro.locals.runtime.
//
// D1 bindings are added via wrangler.jsonc (binding: thcf_content).

import type { D1Database } from '@cloudflare/workers-types';

// ---------------------------------------------------------------------------
// Types that mirror the pages table + the in-memory shape the editor expects.
// ---------------------------------------------------------------------------

export type Section = Record<string, unknown> & { kind: string };

export interface PageRow {
  slug: string;
  path: string;
  type: string;
  template: string;
  title: string;
  subtitle: string | null;
  meta: unknown;
  legacyBody: string;
  sections: Section[];
  updatedAt: number;
  createdAt: number;
}

export interface PageSummary {
  slug: string;
  path: string;
  type: string;
  template: string;
  title: string;
  updatedAt: number;
}

export interface VersionRow {
  id: number;
  slug: string;
  template: string | null;
  title: string | null;
  subtitle: string | null;
  meta: unknown;
  sections: Section[];
  legacyBody: string | null;
  author: string | null;
  chatTurn: unknown;
  createdAt: number;
}

// ---------------------------------------------------------------------------
// Accessor: extract the D1 binding from Astro.locals.runtime
// ---------------------------------------------------------------------------

export function getDB(locals: App.Locals): D1Database {
  const env = locals.runtime?.env as { thcf_content?: D1Database } | undefined;
  if (!env?.thcf_content) {
    throw new Error('D1 binding `thcf_content` not available on locals.runtime.env');
  }
  return env.thcf_content;
}

// ---------------------------------------------------------------------------
// JSON helpers
// ---------------------------------------------------------------------------

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (raw === null || raw === undefined || raw === '') return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

// ---------------------------------------------------------------------------
// Pages
// ---------------------------------------------------------------------------

export async function listPages(db: D1Database, search?: string): Promise<PageSummary[]> {
  const hasSearch = typeof search === 'string' && search.trim().length > 0;
  const stmt = hasSearch
    ? db
        .prepare(
          'SELECT slug, path, type, template, title, updated_at FROM pages WHERE deleted_at IS NULL AND (title LIKE ?1 OR path LIKE ?1) ORDER BY path ASC'
        )
        .bind(`%${search!.trim()}%`)
    : db.prepare(
        'SELECT slug, path, type, template, title, updated_at FROM pages WHERE deleted_at IS NULL ORDER BY path ASC'
      );
  const { results } = await stmt.all<{
    slug: string;
    path: string;
    type: string;
    template: string;
    title: string;
    updated_at: number;
  }>();
  return (results ?? []).map((r) => ({
    slug: r.slug ?? '',
    path: r.path,
    type: r.type,
    template: r.template,
    title: r.title,
    updatedAt: r.updated_at,
  }));
}

export async function getPage(db: D1Database, slug: string): Promise<PageRow | null> {
  const row = await db
    .prepare(
      'SELECT slug, path, type, template, title, subtitle, meta, legacy_body, sections, updated_at, created_at FROM pages WHERE slug = ?1 AND deleted_at IS NULL'
    )
    .bind(slug)
    .first<{
      slug: string;
      path: string;
      type: string;
      template: string;
      title: string;
      subtitle: string | null;
      meta: string | null;
      legacy_body: string | null;
      sections: string;
      updated_at: number;
      created_at: number;
    }>();
  if (!row) return null;
  return {
    slug: row.slug ?? '',
    path: row.path,
    type: row.type,
    template: row.template,
    title: row.title,
    subtitle: row.subtitle,
    meta: parseJson(row.meta, null),
    legacyBody: row.legacy_body ?? '',
    sections: parseJson<Section[]>(row.sections, []),
    updatedAt: row.updated_at,
    createdAt: row.created_at,
  };
}

export interface PageUpdate {
  template?: string;
  title?: string;
  subtitle?: string | null;
  meta?: unknown;
  sections?: Section[];
  legacyBody?: string;
}

/**
 * Apply an update to a page and append a version snapshot in the same batch.
 * Returns the new updated_at timestamp.
 */
export async function updatePage(
  db: D1Database,
  slug: string,
  update: PageUpdate,
  author: 'admin' | 'bot' | 'migration',
  chatTurn?: unknown
): Promise<number> {
  const current = await getPage(db, slug);
  if (!current) throw new Error(`page not found: ${slug}`);

  const next = {
    template: update.template ?? current.template,
    title: update.title ?? current.title,
    subtitle: update.subtitle !== undefined ? update.subtitle : current.subtitle,
    meta: update.meta !== undefined ? update.meta : current.meta,
    sections: update.sections ?? current.sections,
    legacyBody: update.legacyBody ?? current.legacyBody,
  };
  const ts = Date.now();

  // Guard: reject payloads > 500KB (D1 row size cap is 1MB; stay well under it).
  const sectionsJson = JSON.stringify(next.sections);
  if (sectionsJson.length > 500_000) {
    throw new Error('sections payload exceeds 500KB; split the page');
  }

  await db.batch([
    db
      .prepare(
        'INSERT INTO page_versions (slug, template, title, subtitle, meta, sections, legacy_body, author, chat_turn, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)'
      )
      .bind(
        slug,
        current.template,
        current.title,
        current.subtitle,
        current.meta === null || current.meta === undefined ? null : JSON.stringify(current.meta),
        JSON.stringify(current.sections),
        current.legacyBody,
        author,
        chatTurn === undefined ? null : JSON.stringify(chatTurn),
        ts
      ),
    db
      .prepare(
        'UPDATE pages SET template = ?1, title = ?2, subtitle = ?3, meta = ?4, sections = ?5, legacy_body = ?6, updated_at = ?7 WHERE slug = ?8'
      )
      .bind(
        next.template,
        next.title,
        next.subtitle,
        next.meta === null || next.meta === undefined ? null : JSON.stringify(next.meta),
        sectionsJson,
        next.legacyBody,
        ts,
        slug
      ),
  ]);

  return ts;
}

// ---------------------------------------------------------------------------
// Versions
// ---------------------------------------------------------------------------

export async function listVersions(db: D1Database, slug: string, limit = 50): Promise<VersionRow[]> {
  const { results } = await db
    .prepare(
      'SELECT id, slug, template, title, subtitle, meta, sections, legacy_body, author, chat_turn, created_at FROM page_versions WHERE slug = ?1 ORDER BY created_at DESC LIMIT ?2'
    )
    .bind(slug, limit)
    .all<{
      id: number;
      slug: string;
      template: string | null;
      title: string | null;
      subtitle: string | null;
      meta: string | null;
      sections: string;
      legacy_body: string | null;
      author: string | null;
      chat_turn: string | null;
      created_at: number;
    }>();
  return (results ?? []).map((r) => ({
    id: r.id,
    slug: r.slug,
    template: r.template,
    title: r.title,
    subtitle: r.subtitle,
    meta: parseJson(r.meta, null),
    sections: parseJson<Section[]>(r.sections, []),
    legacyBody: r.legacy_body,
    author: r.author,
    chatTurn: parseJson(r.chat_turn, null),
    createdAt: r.created_at,
  }));
}

export async function revertToVersion(db: D1Database, slug: string, versionId: number): Promise<number> {
  const v = await db
    .prepare(
      'SELECT template, title, subtitle, meta, sections, legacy_body FROM page_versions WHERE id = ?1 AND slug = ?2'
    )
    .bind(versionId, slug)
    .first<{
      template: string | null;
      title: string | null;
      subtitle: string | null;
      meta: string | null;
      sections: string;
      legacy_body: string | null;
    }>();
  if (!v) throw new Error(`version ${versionId} not found for slug ${slug}`);

  return updatePage(
    db,
    slug,
    {
      template: v.template ?? undefined,
      title: v.title ?? undefined,
      subtitle: v.subtitle,
      meta: parseJson(v.meta, null),
      sections: parseJson<Section[]>(v.sections, []),
      legacyBody: v.legacy_body ?? '',
    },
    'admin'
  );
}
