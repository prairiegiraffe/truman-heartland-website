/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

import type { D1Database, R2Bucket } from '@cloudflare/workers-types';

type Runtime = import('@astrojs/cloudflare').Runtime<{
  thcf_content: D1Database;
  ASSETS_BUCKET: R2Bucket;
  ADMIN_PASSWORD_HASH?: string;
  ADMIN_PASSWORD_SALT?: string;
  ADMIN_SESSION_SECRET?: string;
  ANTHROPIC_API_KEY?: string;
}>;

declare namespace App {
  interface Locals extends Runtime {
    session?: { authed: boolean; issuedAt: number };
  }
}
