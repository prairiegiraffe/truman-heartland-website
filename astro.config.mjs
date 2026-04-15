// @ts-check
import { defineConfig } from 'astro/config';

import cloudflare from '@astrojs/cloudflare';

// https://astro.build/config
// Hybrid: public site is prerendered at build time; API and /cpadmin routes
// opt in to SSR (via `export const prerender = false`) so they can read D1
// at request time.
export default defineConfig({
  output: 'server',
  adapter: cloudflare({
    platformProxy: {
      enabled: true,
    },
    imageService: 'passthrough',
  }),
});