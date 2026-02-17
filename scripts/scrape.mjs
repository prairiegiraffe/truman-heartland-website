#!/usr/bin/env node
/**
 * THCF Website Scraper
 *
 * Crawls https://www.thcf.org, extracts all pages, classifies content,
 * and saves structured JSON output to scraped-data/.
 *
 * Usage: node scripts/scrape.mjs [--resume] [--max-pages 500]
 */

import { chromium } from 'playwright';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { classifyPage, getOutputDir } from './utils/classify-page.mjs';
import { getExtractor } from './utils/extract-fields.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'scraped-data');
const BASE_URL = 'https://www.thcf.org';
const DELAY_MS = 1500; // delay between page loads

// Parse CLI args
const args = process.argv.slice(2);
const RESUME = args.includes('--resume');
const maxIdx = args.indexOf('--max-pages');
const MAX_PAGES = maxIdx !== -1 ? parseInt(args[maxIdx + 1], 10) : 600;

// Track state
const visited = new Set();
const queue = [];
const allUrls = [];
const allImages = new Set();
let navStructure = null;

// Directories to create
const DIRS = ['pages', 'news', 'scholarships', 'grants', 'staff', 'board'];

async function setup() {
  for (const dir of DIRS) {
    await fs.ensureDir(path.join(OUTPUT_DIR, dir));
  }

  // Load resume state if requested
  if (RESUME) {
    const sitemapPath = path.join(OUTPUT_DIR, 'site-map.json');
    if (await fs.pathExists(sitemapPath)) {
      const existing = await fs.readJson(sitemapPath);
      for (const entry of existing) {
        visited.add(entry.url);
      }
      console.log(`Resuming: ${visited.size} pages already scraped.`);
    }
  }
}

function normalizeUrl(href) {
  try {
    const url = new URL(href, BASE_URL);
    // Only follow thcf.org links
    if (url.hostname !== 'www.thcf.org' && url.hostname !== 'thcf.org') return null;
    // Strip hash and trailing slash
    url.hash = '';
    let pathname = url.pathname.replace(/\/$/, '') || '/';
    // Skip file downloads
    if (/\.(pdf|xlsx?|docx?|zip|png|jpg|jpeg|gif|svg|webp|mp4|mp3)$/i.test(pathname)) return null;
    return `${url.origin}${pathname}`;
  } catch {
    return null;
  }
}

function slugFromUrl(url) {
  const pathname = new URL(url).pathname.replace(/\/$/, '') || 'index';
  return pathname.replace(/^\//, '').replace(/\//g, '--') || 'index';
}

async function extractNavigation(page) {
  return page.evaluate(() => {
    const nav = [];
    // THCF uses a fullscreen modal nav: nav#fullScreenMenu > .mobile-menu > ul.root-group
    const rootList = document.querySelector('#fullScreenMenu .mobile-menu ul.root-group')
      || document.querySelector('nav ul.root-group')
      || document.querySelector('nav ul');
    if (!rootList) return nav;

    const topItems = rootList.querySelectorAll(':scope > li');
    topItems.forEach(li => {
      const link = li.querySelector(':scope > a');
      const item = {
        label: link?.textContent?.trim().replace(/\s+/g, ' ') || '',
        href: link?.href || '',
        children: [],
      };
      // Check for dropdown sub-menu
      const subList = li.querySelector('ul.dropdown-menu, ul');
      if (subList) {
        subList.querySelectorAll(':scope > li > a').forEach(sub => {
          item.children.push({
            label: sub.textContent?.trim().replace(/\s+/g, ' ') || '',
            href: sub.href || '',
          });
        });
      }
      if (item.label) nav.push(item);
    });
    return nav;
  });
}

async function extractPageLinks(page) {
  return page.evaluate(() => {
    return [...document.querySelectorAll('a[href]')].map(a => a.href);
  });
}

async function extractPageImages(page) {
  return page.evaluate(() => {
    const imgs = new Set();
    document.querySelectorAll('img[src]').forEach(img => imgs.add(img.src));
    // Also check background images in style attrs
    document.querySelectorAll('[style*="background"]').forEach(el => {
      const match = el.style.backgroundImage?.match(/url\(["']?(.+?)["']?\)/);
      if (match) imgs.add(match[1]);
    });
    // Also check srcset
    document.querySelectorAll('img[srcset], source[srcset]').forEach(el => {
      el.srcset.split(',').forEach(entry => {
        const src = entry.trim().split(/\s+/)[0];
        if (src) imgs.add(new URL(src, window.location.href).href);
      });
    });
    return [...imgs];
  });
}

async function scrapePage(page, url) {
  try {
    const response = await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    if (!response || response.status() >= 400) {
      console.log(`  SKIP (${response?.status() || 'no response'}): ${url}`);
      return null;
    }

    // Wait a moment for any HTMX/dynamic content
    await page.waitForTimeout(500);

    const type = classifyPage(url);
    const extractor = getExtractor(type);
    const data = await extractor(page);

    // Get meta info
    const meta = await page.evaluate(() => ({
      title: document.title,
      description: document.querySelector('meta[name="description"]')?.content || '',
      ogImage: document.querySelector('meta[property="og:image"]')?.content || '',
    }));

    // Collect all links for crawling
    const links = await extractPageLinks(page);

    // Collect all images
    const images = await extractPageImages(page);
    images.forEach(img => allImages.add(img));

    return {
      url,
      type,
      meta,
      data,
      images,
      links,
      scrapedAt: new Date().toISOString(),
    };
  } catch (err) {
    console.log(`  ERROR: ${url} — ${err.message}`);
    return null;
  }
}

async function run() {
  console.log('=== THCF Website Scraper ===');
  console.log(`Output: ${OUTPUT_DIR}`);
  console.log(`Max pages: ${MAX_PAGES}`);
  console.log(`Resume: ${RESUME}`);
  console.log('');

  await setup();

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (compatible; PrairieGiraffe-Scraper/1.0; +https://prairiegiraffe.com)',
  });
  const page = await context.newPage();
  const seenInQueue = new Set();

  // Seed the queue
  const seedUrls = [
    '/',
    '/donors',
    '/donors/make-a-gift',
    '/donors/planned-giving',
    '/fundholder-resources',
    '/professional-advisors',
    '/grant-seekers',
    '/grant-seekers/community-grants-program',
    '/grant-seekers/jelley-family-foundation-for-childrens-education',
    '/grant-seekers/past-recipients',
    '/students',
    '/students/scholarships',
    '/students/scholarships/scholarship-directory',
    '/students/youth-advisory-council',
    '/gala',
    '/about',
    '/about/news',
    '/about/staff',
    '/about/board',
  ];

  for (const seed of seedUrls) {
    const full = normalizeUrl(seed);
    if (full && !visited.has(full) && !seenInQueue.has(full)) {
      queue.push(full);
      seenInQueue.add(full);
    }
  }

  // Extract nav structure from homepage
  console.log('Extracting navigation structure...');
  await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 });
  navStructure = await extractNavigation(page);

  // Add nav links to queue
  for (const item of navStructure) {
    const href = normalizeUrl(item.href);
    if (href && !visited.has(href) && !seenInQueue.has(href)) { queue.push(href); seenInQueue.add(href); }
    for (const child of item.children) {
      const childHref = normalizeUrl(child.href);
      if (childHref && !visited.has(childHref) && !seenInQueue.has(childHref)) { queue.push(childHref); seenInQueue.add(childHref); }
    }
  }

  // Scrape HTMX-paginated listing pages to discover all item links.
  // These pages use JS pagination buttons with empty hrefs, so we need
  // to click through each page and extract the links.
  const paginatedSections = [
    { url: `${BASE_URL}/about/news`, label: 'News' },
    { url: `${BASE_URL}/students/scholarships/scholarship-directory`, label: 'Scholarship Directory' },
  ];

  for (const section of paginatedSections) {
    console.log(`\nDiscovering ${section.label} pages via pagination...`);
    try {
      await page.goto(section.url, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(1000);

      // Get links from page 1
      let pageLinks = await extractPageLinks(page);
      for (const link of pageLinks) {
        const n = normalizeUrl(link);
        if (n && !seenInQueue.has(n)) { queue.push(n); seenInQueue.add(n); }
      }

      // Find pagination buttons and click through them
      let pageNum = 2;
      while (pageNum <= 20) { // safety limit
        // Look for a button/link with just the page number text
        const btn = await page.$(`xpath=//nav//a[normalize-space()="${pageNum}"] | //div[contains(@class,"pag")]//a[normalize-space()="${pageNum}"] | //ul[contains(@class,"pag")]//a[normalize-space()="${pageNum}"] | //*[contains(@class,"pag")]//button[normalize-space()="${pageNum}"]`);
        if (!btn) {
          console.log(`  Found ${pageNum - 1} pages of ${section.label}.`);
          break;
        }

        await btn.click();
        // Wait for HTMX content swap
        await page.waitForTimeout(2000);

        pageLinks = await extractPageLinks(page);
        let newCount = 0;
        for (const link of pageLinks) {
          const n = normalizeUrl(link);
          if (n && !seenInQueue.has(n)) { queue.push(n); seenInQueue.add(n); newCount++; }
        }
        console.log(`  Page ${pageNum}: ${newCount} new links discovered`);
        pageNum++;
      }
    } catch (err) {
      console.log(`  Error paginating ${section.label}: ${err.message}`);
    }
  }

  console.log(`\nStarting crawl with ${queue.length} seed URLs...\n`);

  let count = 0;

  while (queue.length > 0 && count < MAX_PAGES) {
    const url = queue.shift();
    if (visited.has(url)) continue;
    visited.add(url);

    count++;
    const type = classifyPage(url);
    console.log(`[${count}/${MAX_PAGES}] ${type.padEnd(20)} ${url}`);

    const result = await scrapePage(page, url);

    if (result) {
      // Save the page data
      const outputDir = getOutputDir(result.type);
      const slug = slugFromUrl(url);
      const outputPath = path.join(OUTPUT_DIR, outputDir, `${slug}.json`);
      await fs.writeJson(outputPath, result, { spaces: 2 });

      // Add discovered links to queue
      for (const link of result.links) {
        const normalized = normalizeUrl(link);
        if (normalized && !visited.has(normalized) && !seenInQueue.has(normalized)) {
          queue.push(normalized);
          seenInQueue.add(normalized);
        }
      }

      allUrls.push({
        url: result.url,
        type: result.type,
        title: result.meta.title,
      });
    }

    // Rate limit
    await new Promise(resolve => setTimeout(resolve, DELAY_MS));
  }

  // Save site map
  await fs.writeJson(path.join(OUTPUT_DIR, 'site-map.json'), allUrls, { spaces: 2 });

  // Save nav structure
  if (navStructure) {
    await fs.writeJson(path.join(OUTPUT_DIR, 'nav-structure.json'), navStructure, { spaces: 2 });
  }

  // Save image manifest
  await fs.writeJson(path.join(OUTPUT_DIR, 'image-manifest.json'), [...allImages], { spaces: 2 });

  await browser.close();

  console.log('\n=== Scrape Complete ===');
  console.log(`Pages scraped: ${count}`);
  console.log(`Unique images found: ${allImages.size}`);
  console.log(`Output directory: ${OUTPUT_DIR}`);

  // Summary by type
  const typeCounts = {};
  for (const entry of allUrls) {
    typeCounts[entry.type] = (typeCounts[entry.type] || 0) + 1;
  }
  console.log('\nContent type breakdown:');
  for (const [type, c] of Object.entries(typeCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${type}: ${c}`);
  }
}

run().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
