import type { APIRoute } from 'astro';
import { buildSessionCookie, createSessionToken, verifyPassword } from '../../lib/auth';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime?.env as
    | { ADMIN_PASSWORD_HASH?: string; ADMIN_PASSWORD_SALT?: string; ADMIN_SESSION_SECRET?: string }
    | undefined;
  if (!env?.ADMIN_PASSWORD_HASH || !env?.ADMIN_PASSWORD_SALT || !env?.ADMIN_SESSION_SECRET) {
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

  const ok = await verifyPassword(password, env.ADMIN_PASSWORD_HASH, env.ADMIN_PASSWORD_SALT);
  if (!ok) {
    return new Response(JSON.stringify({ error: 'invalid password' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    });
  }

  const token = await createSessionToken(env.ADMIN_SESSION_SECRET);
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
