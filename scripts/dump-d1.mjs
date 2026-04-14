#!/usr/bin/env node

/**
 * dump-d1.mjs
 *
 * Pulls the current state of content from D1 and writes it to src/data/*.json
 * so that `astro build` (running in plain Node) can render from it. D1 remains
 * the source of truth; these JSON files are a build cache.
 *
 * Usage:  node scripts/dump-d1.mjs
 *
 * Output:
 *   src/data/pages.json         — [{ slug, path, type, template, title, subtitle, meta, body (legacy_body), sections }]
 *   src/data/news.json          — [{ slug, title, date, author, category, featuredImage, body, excerpt }]
 *   src/data/scholarships.json  — [{ slug, name, description, eligibility[], amount, renewable{}, deadline, requirements[] }]
 *
 * The output shapes match the current JSON files the Astro pages already
 * consume, with one addition: pages now include a pre-parsed `sections` array.
 */

import fs from 'fs-extra';
import os from 'node:os';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DATA = path.join(ROOT, 'src', 'data');
const DB_NAME = 'thcf-content';

/**
 * Run a SELECT via wrangler, routing the --json stdout to a tmp file
 * rather than a buffered pipe. Necessary for multi-MB payloads; spawnSync's
 * default maxBuffer truncates long stdout and corrupts the JSON.
 */
function runSelect(sql) {
  const tmp = path.join(os.tmpdir(), `d1-dump-${process.pid}-${Date.now()}.json`);
  // Use shell so we can redirect stdout — much simpler than streaming
  // stdout ourselves, and the JSON is already what we want on disk.
  const cmd = `npx wrangler d1 execute ${DB_NAME} --remote --json --command=${JSON.stringify(sql)} > ${JSON.stringify(tmp)}`;
  const res = spawnSync('sh', ['-c', cmd], { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'] });
  if (res.status !== 0) {
    throw new Error(`wrangler query failed (exit ${res.status})`);
  }
  const raw = fs.readFileSync(tmp, 'utf-8');
  fs.removeSync(tmp);
  const firstBracket = raw.indexOf('[');
  if (firstBracket === -1) throw new Error(`no JSON in wrangler output (first 200 chars): ${raw.slice(0, 200)}`);
  const parsed = JSON.parse(raw.slice(firstBracket));
  if (!Array.isArray(parsed) || !parsed[0] || !parsed[0].results) {
    throw new Error(`unexpected wrangler json shape: ${raw.slice(0, 200)}`);
  }
  return parsed[0].results;
}

function parseJson(value, fallback) {
  if (value === null || value === undefined || value === '') return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

async function dumpPages() {
  const rows = runSelect(
    'SELECT slug, path, type, template, title, subtitle, meta, legacy_body, sections FROM pages WHERE deleted_at IS NULL;'
  );
  const pages = rows.map((r) => ({
    slug: r.slug || '',
    path: r.path,
    type: r.type,
    template: r.template,
    title: r.title,
    subtitle: r.subtitle || '',
    meta: parseJson(r.meta, null),
    body: r.legacy_body || '',
    sections: parseJson(r.sections, []),
  }));
  // Match prepare-content.mjs: JS localeCompare (handles - vs _ differently than SQL binary).
  pages.sort((a, b) => a.path.localeCompare(b.path));
  await fs.writeJson(path.join(DATA, 'pages.json'), pages, { spaces: 2 });
  return pages.length;
}

async function dumpNews() {
  // Don't sort in SQL — `date` is a human-readable string like "February 04, 2026"
  // which sorts alphabetically wrong. Sort as Date() in JS to match prepare-content.mjs.
  const rows = runSelect(
    'SELECT slug, title, date, author, category, featured_image, body, excerpt FROM news WHERE deleted_at IS NULL;'
  );
  const news = rows.map((r) => ({
    slug: r.slug,
    title: r.title,
    date: r.date || '',
    author: r.author || '',
    category: r.category || '',
    featuredImage: r.featured_image || '',
    body: r.body,
    excerpt: r.excerpt || '',
  }));
  news.sort((a, b) => {
    const da = a.date ? new Date(a.date).getTime() : 0;
    const db = b.date ? new Date(b.date).getTime() : 0;
    return db - da;
  });
  await fs.writeJson(path.join(DATA, 'news.json'), news, { spaces: 2 });
  return news.length;
}

async function dumpScholarships() {
  const rows = runSelect(
    'SELECT slug, name, description, eligibility, amount, renewable, deadline, requirements FROM scholarships WHERE deleted_at IS NULL;'
  );
  const scholarships = rows.map((r) => ({
    slug: r.slug,
    name: r.name,
    description: r.description || '',
    eligibility: parseJson(r.eligibility, []),
    amount: r.amount || '',
    renewable: parseJson(r.renewable, { isRenewable: false, details: '' }),
    deadline: r.deadline || '',
    requirements: parseJson(r.requirements, []),
  }));
  scholarships.sort((a, b) => a.name.localeCompare(b.name));
  await fs.writeJson(path.join(DATA, 'scholarships.json'), scholarships, { spaces: 2 });
  return scholarships.length;
}

async function main() {
  console.log('=== Dump D1 → src/data ===');
  console.log(`Source:  ${DB_NAME} (remote)`);
  console.log(`Target:  ${path.relative(ROOT, DATA)}`);
  console.log('');

  const pages = await dumpPages();
  console.log(`  pages.json         ${pages} rows`);
  const news = await dumpNews();
  console.log(`  news.json          ${news} rows`);
  const scholarships = await dumpScholarships();
  console.log(`  scholarships.json  ${scholarships} rows`);

  console.log('\nDone.');
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
