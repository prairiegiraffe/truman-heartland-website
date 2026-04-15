import type { APIRoute } from 'astro';
import { getDB, getPage, updatePage, type PageUpdate, type Section } from '../../../lib/d1';

export const prerender = false;

// Client URLs use `__home__` as a stand-in for the empty-string slug (the
// homepage), because `/api/pages/` with trailing slash would collide with
// the LIST route. Translate it back here.
function normalizeSlug(raw: string): string {
  return raw === '__home__' ? '' : raw;
}

export const GET: APIRoute = async ({ locals, params }) => {
  const db = getDB(locals);
  const slug = normalizeSlug((params.slug as string) ?? '');
  const page = await getPage(db, slug);
  if (!page) {
    return new Response(JSON.stringify({ error: 'not found' }), {
      status: 404,
      headers: { 'content-type': 'application/json' },
    });
  }
  return new Response(JSON.stringify({ page }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
};

export const PUT: APIRoute = async ({ locals, params, request }) => {
  const db = getDB(locals);
  const slug = normalizeSlug((params.slug as string) ?? '');
  const body = (await request.json().catch(() => null)) as
    | {
        template?: string;
        title?: string;
        subtitle?: string | null;
        meta?: unknown;
        sections?: Section[];
        legacyBody?: string;
      }
    | null;
  if (!body) {
    return new Response(JSON.stringify({ error: 'invalid json' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }

  const update: PageUpdate = {};
  if (typeof body.template === 'string') update.template = body.template;
  if (typeof body.title === 'string') update.title = body.title;
  if (body.subtitle !== undefined) update.subtitle = body.subtitle;
  if (body.meta !== undefined) update.meta = body.meta;
  if (Array.isArray(body.sections)) update.sections = body.sections;
  if (typeof body.legacyBody === 'string') update.legacyBody = body.legacyBody;

  try {
    const updatedAt = await updatePage(db, slug, update, 'admin');
    return new Response(JSON.stringify({ ok: true, updatedAt }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'update failed';
    const status = message.includes('not found') ? 404 : 400;
    return new Response(JSON.stringify({ error: message }), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  }
};
