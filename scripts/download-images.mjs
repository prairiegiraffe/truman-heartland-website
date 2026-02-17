#!/usr/bin/env node
/**
 * THCF Image Downloader
 *
 * Reads the image manifest from the scraper output and downloads
 * all images to scraped-data/images/. Maintains a mapping file
 * for later R2 upload.
 *
 * Usage: node scripts/download-images.mjs [--concurrency 3]
 */

import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import https from 'https';
import http from 'http';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'scraped-data');
const IMAGES_DIR = path.join(OUTPUT_DIR, 'images');
const MANIFEST_PATH = path.join(OUTPUT_DIR, 'image-manifest.json');
const MAP_PATH = path.join(OUTPUT_DIR, 'image-map.json');

const args = process.argv.slice(2);
const concIdx = args.indexOf('--concurrency');
const CONCURRENCY = concIdx !== -1 ? parseInt(args[concIdx + 1], 10) : 3;

function sanitizeFilename(url) {
  try {
    const parsed = new URL(url);
    let name = parsed.pathname.replace(/^\//, '').replace(/\//g, '__');
    // Keep it reasonable length
    if (name.length > 200) {
      const ext = path.extname(name);
      name = name.slice(0, 190) + ext;
    }
    return name || 'unknown';
  } catch {
    return 'unknown';
  }
}

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const request = client.get(url, { timeout: 30000 }, response => {
      // Follow redirects
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        const redirectUrl = new URL(response.headers.location, url).href;
        downloadFile(redirectUrl, destPath).then(resolve).catch(reject);
        return;
      }

      if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode} for ${url}`));
        return;
      }

      const file = fs.createWriteStream(destPath);
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve();
      });
      file.on('error', err => {
        fs.unlink(destPath).catch(() => {});
        reject(err);
      });
    });

    request.on('error', reject);
    request.on('timeout', () => {
      request.destroy();
      reject(new Error(`Timeout downloading ${url}`));
    });
  });
}

async function run() {
  console.log('=== THCF Image Downloader ===');

  if (!await fs.pathExists(MANIFEST_PATH)) {
    console.error('No image-manifest.json found. Run the scraper first.');
    process.exit(1);
  }

  await fs.ensureDir(IMAGES_DIR);

  const manifest = await fs.readJson(MANIFEST_PATH);
  console.log(`Found ${manifest.length} images in manifest.`);

  // Load existing map for resume support
  let imageMap = {};
  if (await fs.pathExists(MAP_PATH)) {
    imageMap = await fs.readJson(MAP_PATH);
    console.log(`Resuming: ${Object.keys(imageMap).length} already downloaded.`);
  }

  // Filter to only image URLs (skip data URIs, SVG inlines, etc.)
  const toDownload = manifest.filter(url => {
    if (imageMap[url]) return false; // already downloaded
    if (url.startsWith('data:')) return false;
    if (!url.startsWith('http')) return false;
    return true;
  });

  console.log(`Downloading ${toDownload.length} images (concurrency: ${CONCURRENCY})...\n`);

  let completed = 0;
  let failed = 0;

  // Process in batches
  for (let i = 0; i < toDownload.length; i += CONCURRENCY) {
    const batch = toDownload.slice(i, i + CONCURRENCY);
    const promises = batch.map(async url => {
      const filename = sanitizeFilename(url);
      const destPath = path.join(IMAGES_DIR, filename);

      // Handle duplicate filenames
      let finalPath = destPath;
      let counter = 1;
      while (await fs.pathExists(finalPath)) {
        const ext = path.extname(filename);
        const base = path.basename(filename, ext);
        finalPath = path.join(IMAGES_DIR, `${base}_${counter}${ext}`);
        counter++;
      }

      try {
        await downloadFile(url, finalPath);
        imageMap[url] = path.relative(OUTPUT_DIR, finalPath);
        completed++;
        if (completed % 10 === 0 || completed === toDownload.length) {
          console.log(`  [${completed}/${toDownload.length}] Downloaded (${failed} failed)`);
        }
      } catch (err) {
        failed++;
        console.log(`  FAILED: ${url} — ${err.message}`);
      }
    });

    await Promise.all(promises);

    // Save progress periodically
    if (i % (CONCURRENCY * 10) === 0) {
      await fs.writeJson(MAP_PATH, imageMap, { spaces: 2 });
    }
  }

  // Final save
  await fs.writeJson(MAP_PATH, imageMap, { spaces: 2 });

  console.log('\n=== Download Complete ===');
  console.log(`Downloaded: ${completed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total mapped: ${Object.keys(imageMap).length}`);
  console.log(`Image map: ${MAP_PATH}`);
}

run().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
