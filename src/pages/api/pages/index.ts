import type { APIRoute } from 'astro';
import { getDB, listPages } from '../../../lib/d1';

export const prerender = false;

export const GET: APIRoute = async ({ locals, url }) => {
  const db = getDB(locals);
  const search = url.searchParams.get('search') ?? undefined;
  const pages = await listPages(db, search);
  return new Response(JSON.stringify({ pages }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
};
