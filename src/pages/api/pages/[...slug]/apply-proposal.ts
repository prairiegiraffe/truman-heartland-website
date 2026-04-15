import type { APIRoute } from 'astro';

import { getDB, updatePage } from '../../../../lib/d1';
import type { Proposal } from '../../../../lib/ai/tools';
import { getTemplate } from '../../../../lib/templates';
import { sectionSchema } from '../../../../lib/sections';

export const prerender = false;

/**
 * Commit a proposal that the chatbot generated. The client posts the proposal
 * object it received from /api/chat. We re-validate server-side before
 * writing — never trust client-supplied sections blindly.
 */
export const POST: APIRoute = async ({ locals, params, request }) => {
  const db = getDB(locals);
  const raw = (params.slug as string) ?? '';
  const slug = raw === '__home__' ? '' : raw;
  let body: { proposal?: Proposal; chatTurn?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid json' }, 400);
  }
  const p = body.proposal;
  if (!p || typeof p !== 'object') return json({ error: 'proposal required' }, 400);
  if (p.slug !== slug) return json({ error: 'proposal slug mismatch' }, 400);

  // Re-validate every section.
  let sections;
  try {
    sections = (p.sections as unknown[]).map((s) => sectionSchema.parse(s));
  } catch (err) {
    return json({ error: `invalid proposal sections: ${(err as Error).message}` }, 400);
  }

  let template: string | undefined;
  if (p.kind === 'apply-template') {
    if (!getTemplate(p.toTemplate)) return json({ error: `unknown template: ${p.toTemplate}` }, 400);
    template = p.toTemplate;
  }

  try {
    const updatedAt = await updatePage(db, slug, { template, sections }, 'bot', body.chatTurn);
    return json({ ok: true, updatedAt });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'apply failed';
    return json({ error: msg }, 400);
  }
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
