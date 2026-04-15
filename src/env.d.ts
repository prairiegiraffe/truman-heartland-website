/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

import type { D1Database, R2Bucket, KVNamespace, Fetcher } from '@cloudflare/workers-types';

/**
 * Astro 6 / adapter 13: env is imported via `import { env } from "cloudflare:workers"`.
 * The type of that env is declared via the global `Cloudflare.Env` interface.
 */
declare global {
  namespace Cloudflare {
    interface Env {
      thcf_content: D1Database;
      ASSETS_BUCKET: R2Bucket;
      ASSETS: Fetcher;
      SESSION?: KVNamespace;
      ADMIN_PASSWORD_HASH?: string;
      ADMIN_PASSWORD_SALT?: string;
      ADMIN_SESSION_SECRET?: string;
      ANTHROPIC_API_KEY?: string;
    }
  }
}

declare namespace App {
  interface Locals {
    session?: { authed: boolean; issuedAt: number };
  }
}

export {};
