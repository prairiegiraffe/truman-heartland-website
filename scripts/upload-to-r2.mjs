#!/usr/bin/env node
/**
 * THCF R2 Image Uploader
 *
 * Uploads downloaded images to a Cloudflare R2 bucket and updates
 * the image map with public R2 URLs.
 *
 * Prerequisites:
 *   1. Create R2 bucket in Cloudflare dashboard (name: thcf-assets)
 *   2. Enable public access on the bucket (or use custom domain)
 *   3. Have wrangler authenticated (npx wrangler login)
 *
 * Usage: node scripts/upload-to-r2.mjs [--bucket thcf-assets]
 */

import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'scraped-data');
const IMAGES_DIR = path.join(OUTPUT_DIR, 'images');
const MAP_PATH = path.join(OUTPUT_DIR, 'image-map.json');
const R2_MAP_PATH = path.join(OUTPUT_DIR, 'image-map-r2.json');

const args = process.argv.slice(2);
const bucketIdx = args.indexOf('--bucket');
const BUCKET_NAME = bucketIdx !== -1 ? args[bucketIdx + 1] : 'thcf-assets';

// Mime type mapping
const MIME_TYPES = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.avif': 'image/avif',
};

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_TYPES[ext] || 'application/octet-stream';
}

async function run() {
  console.log('=== THCF R2 Image Uploader ===');
  console.log(`Bucket: ${BUCKET_NAME}`);

  if (!await fs.pathExists(MAP_PATH)) {
    console.error('No image-map.json found. Run the image downloader first.');
    process.exit(1);
  }

  const imageMap = await fs.readJson(MAP_PATH);
  const entries = Object.entries(imageMap);
  console.log(`Found ${entries.length} images to upload.\n`);

  // Load existing R2 map for resume
  let r2Map = {};
  if (await fs.pathExists(R2_MAP_PATH)) {
    r2Map = await fs.readJson(R2_MAP_PATH);
    console.log(`Resuming: ${Object.keys(r2Map).length} already uploaded.`);
  }

  let uploaded = 0;
  let skipped = 0;
  let failed = 0;

  for (const [originalUrl, localPath] of entries) {
    if (r2Map[originalUrl]) {
      skipped++;
      continue;
    }

    const fullLocalPath = path.join(OUTPUT_DIR, localPath);
    if (!await fs.pathExists(fullLocalPath)) {
      console.log(`  MISSING: ${localPath}`);
      failed++;
      continue;
    }

    // R2 key: images/filename
    const r2Key = `images/${path.basename(localPath)}`;
    const contentType = getMimeType(localPath);

    try {
      execSync(
        `npx wrangler r2 object put "${BUCKET_NAME}/${r2Key}" --file="${fullLocalPath}" --content-type="${contentType}"`,
        { cwd: PROJECT_ROOT, stdio: 'pipe', timeout: 30000 }
      );

      r2Map[originalUrl] = r2Key;
      uploaded++;

      if (uploaded % 10 === 0) {
        console.log(`  [${uploaded}] Uploaded (${skipped} skipped, ${failed} failed)`);
        await fs.writeJson(R2_MAP_PATH, r2Map, { spaces: 2 });
      }
    } catch (err) {
      console.log(`  FAILED: ${r2Key} — ${err.message?.slice(0, 100)}`);
      failed++;
    }
  }

  await fs.writeJson(R2_MAP_PATH, r2Map, { spaces: 2 });

  console.log('\n=== Upload Complete ===');
  console.log(`Uploaded: ${uploaded}`);
  console.log(`Skipped (already done): ${skipped}`);
  console.log(`Failed: ${failed}`);
  console.log(`R2 map: ${R2_MAP_PATH}`);
  console.log(`\nTo use these images, reference them via your R2 public URL or custom domain.`);
  console.log(`Example: https://<your-r2-domain>/${Object.values(r2Map)[0] || 'images/example.jpg'}`);
}

run().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
