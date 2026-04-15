import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { buildSessionCookie, createSessionToken, verifyPassword } from '../../lib/auth';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const cfg = env as {
    ADMIN_PASSWORD_HASH?: string;
    ADMIN_PASSWORD_SALT?: string;
    ADMIN_SESSION_SECRET?: string;
  };
  if (!cfg.ADMIN_PASSWORD_HASH || !cfg.ADMIN_PASSWORD_SALT || !cfg.ADMIN_SESSION_SECRET) {
    return new Response(JSON.stringify({ error: 'admin not configured' }), {
      status: 503,
      headers: { 'content-type': 'application/json' },
    });
  }

  let password: string | undefined;
  const ct = request.headers.get('content-type') ?? '';
  if (ct.includes('application/json')) {
    const body = (await request.json().catch(() => ({}))) as { password?: string };
    password = body.password;
  } else {
    const form = await request.formData();
    const v = form.get('password');
    password = typeof v === 'string' ? v : undefined;
  }
  if (!password) {
    return new Response(JSON.stringify({ error: 'password required' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }

  const ok = await verifyPassword(password, cfg.ADMIN_PASSWORD_HASH, cfg.ADMIN_PASSWORD_SALT);
  if (!ok) {
    return new Response(JSON.stringify({ error: 'invalid password' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    });
  }

  const token = await createSessionToken(cfg.ADMIN_SESSION_SECRET);
  const cookie = buildSessionCookie(token);

  if (ct.includes('application/json')) {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'content-type': 'application/json', 'set-cookie': cookie },
    });
  }
  // Form submission → redirect back to /cpadmin
  return new Response(null, {
    status: 303,
    headers: { location: '/cpadmin', 'set-cookie': cookie },
  });
};
