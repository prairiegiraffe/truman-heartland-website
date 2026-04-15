import { defineMiddleware } from 'astro:middleware';
import { env } from 'cloudflare:workers';
import { readSessionCookie, verifySessionToken } from './lib/auth';

// /cpadmin/** is served as static HTML assets (see public/cpadmin/). They bypass
// middleware entirely because Cloudflare's ASSETS binding serves them before
// the Worker handler runs. Client-side JS calls /api/* which goes through this
// middleware and gets 401 if unauthenticated — the JS then redirects to the
// static login page.
//
// So middleware's job is narrow now: gate /api/* (except /api/login).
const ALLOWLIST = new Set(['/api/login']);

function isProtectedApi(pathname: string): boolean {
  if (ALLOWLIST.has(pathname)) return false;
  return pathname === '/api' || pathname.startsWith('/api/');
}

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;
  if (!isProtectedApi(pathname)) return next();

  const secret = (env as { ADMIN_SESSION_SECRET?: string }).ADMIN_SESSION_SECRET;
  if (!secret) {
    return new Response(JSON.stringify({ error: 'admin disabled (ADMIN_SESSION_SECRET not set)' }), {
      status: 503,
      headers: { 'content-type': 'application/json' },
    });
  }

  const token = readSessionCookie(context.request.headers.get('cookie'));
  const session = token ? await verifySessionToken(token, secret) : null;

  if (!session) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    });
  }

  context.locals.session = { authed: true, issuedAt: session.iat };
  return next();
});
