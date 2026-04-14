import type { APIRoute } from 'astro';
import { buildClearCookie } from '../../lib/auth';

export const prerender = false;

export const POST: APIRoute = async () => {
  return new Response(null, {
    status: 303,
    headers: { location: '/cpadmin/login', 'set-cookie': buildClearCookie() },
  });
};
