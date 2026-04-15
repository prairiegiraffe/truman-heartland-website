import type { APIRoute } from 'astro';
import { getDB, listVersions } from '../../../../lib/d1';

export const prerender = false;

export const GET: APIRoute = async ({ locals, params }) => {
  const db = getDB(locals);
  const raw = (params.slug as string) ?? '';
  const slug = raw === '__home__' ? '' : raw;
  const versions = await listVersions(db, slug, 50);
  return new Response(JSON.stringify({ versions }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
};
