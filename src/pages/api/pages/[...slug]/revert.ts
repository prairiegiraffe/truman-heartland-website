import type { APIRoute } from 'astro';
import { getDB, revertToVersion } from '../../../../lib/d1';

export const prerender = false;

export const POST: APIRoute = async ({ locals, params, request }) => {
  const db = getDB(locals);
  const raw = (params.slug as string) ?? '';
  const slug = raw === '__home__' ? '' : raw;
  const body = (await request.json().catch(() => null)) as { versionId?: number } | null;
  if (!body || typeof body.versionId !== 'number') {
    return new Response(JSON.stringify({ error: 'versionId required' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }
  try {
    const updatedAt = await revertToVersion(db, slug, body.versionId);
    return new Response(JSON.stringify({ ok: true, updatedAt }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'revert failed';
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }
};
