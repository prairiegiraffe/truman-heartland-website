import { defineMiddleware } from 'astro:middleware';
import { readSessionCookie, verifySessionToken } from './lib/auth';

const PROTECTED_PREFIXES = ['/cpadmin', '/api'];
// Login endpoints are the only ones reachable without a session.
const ALLOWLIST = new Set(['/api/login', '/cpadmin/login']);

function isProtected(pathname: string): boolean {
  if (ALLOWLIST.has(pathname)) return false;
  return PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'));
}

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;
  if (!isProtected(pathname)) return next();

  const env = context.locals.runtime?.env as { ADMIN_SESSION_SECRET?: string } | undefined;
  const secret = env?.ADMIN_SESSION_SECRET;
  if (!secret) {
    return new Response('admin disabled (ADMIN_SESSION_SECRET not set)', { status: 503 });
  }

  const token = readSessionCookie(context.request.headers.get('cookie'));
  const session = token ? await verifySessionToken(token, secret) : null;

  if (!session) {
    if (pathname.startsWith('/api/')) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      });
    }
    // cpadmin → bounce to login
    return context.redirect('/cpadmin/login');
  }

  context.locals.session = { authed: true, issuedAt: session.iat };
  return next();
});
