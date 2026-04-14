// Password verification + signed session cookies using Web Crypto only.
// No external dependencies — Workers runtime has `crypto.subtle`.
//
// Password: PBKDF2-SHA256, 100k iterations. Stored as base64(hash) with a
// separate base64(salt). Generate via scripts/generate-password-hash.mjs.
//
// Session cookie: base64(payload).base64(hmac). Payload is JSON
// `{ sub: 'admin', iat: <ms>, exp: <ms> }`. HMAC-SHA256 over the payload.

const PBKDF2_ITERATIONS = 100_000;
const PBKDF2_HASH = 'SHA-256';
const PBKDF2_KEYLEN_BITS = 256;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// ---------------------------------------------------------------------------
// Encoding helpers
// ---------------------------------------------------------------------------

function toBase64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function fromBase64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function toBase64Url(buf: ArrayBuffer | Uint8Array): string {
  return toBase64(buf).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  return fromBase64(s.replace(/-/g, '+').replace(/_/g, '/') + pad);
}

// Constant-time equality for strings of equal length.
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ---------------------------------------------------------------------------
// Password hashing
// ---------------------------------------------------------------------------

export async function hashPassword(password: string, saltB64?: string): Promise<{ hash: string; salt: string }> {
  const salt = saltB64 ? fromBase64(saltB64) : crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: PBKDF2_HASH },
    keyMaterial,
    PBKDF2_KEYLEN_BITS
  );
  return { hash: toBase64(bits), salt: toBase64(salt) };
}

export async function verifyPassword(password: string, hashB64: string, saltB64: string): Promise<boolean> {
  const { hash } = await hashPassword(password, saltB64);
  return timingSafeEqual(hash, hashB64);
}

// ---------------------------------------------------------------------------
// Signed session cookies
// ---------------------------------------------------------------------------

interface SessionPayload {
  sub: 'admin';
  iat: number;
  exp: number;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

export async function createSessionToken(secret: string): Promise<string> {
  const payload: SessionPayload = { sub: 'admin', iat: Date.now(), exp: Date.now() + SESSION_TTL_MS };
  const payloadB64 = toBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payloadB64));
  return `${payloadB64}.${toBase64Url(sig)}`;
}

export async function verifySessionToken(
  token: string,
  secret: string
): Promise<SessionPayload | null> {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payloadB64, sigB64] = parts;
  try {
    const key = await hmacKey(secret);
    const ok = await crypto.subtle.verify(
      'HMAC',
      key,
      fromBase64Url(sigB64),
      new TextEncoder().encode(payloadB64)
    );
    if (!ok) return null;
    const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(payloadB64))) as SessionPayload;
    if (payload.sub !== 'admin') return null;
    if (!payload.exp || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Cookie helpers (no external cookie lib)
// ---------------------------------------------------------------------------

export const SESSION_COOKIE = 'cpadmin_auth';

export function buildSessionCookie(token: string): string {
  const maxAgeSec = Math.floor(SESSION_TTL_MS / 1000);
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAgeSec}`;
}

export function buildClearCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}

export function readSessionCookie(cookieHeader: string | null | undefined): string | null {
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(';');
  for (const raw of parts) {
    const [name, ...rest] = raw.trim().split('=');
    if (name === SESSION_COOKIE) return rest.join('=');
  }
  return null;
}
