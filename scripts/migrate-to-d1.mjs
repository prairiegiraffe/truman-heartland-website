#!/usr/bin/env node

/**
 * migrate-to-d1.mjs
 *
 * One-time migration: reads src/data/{pages,news,scholarships}.json,
 * parses pages through content-parser's segment(), and writes batched
 * INSERT statements into migrations/_seed_*.sql files. Then applies
 * them to the remote D1 database via `wrangler d1 execute --remote`.
 *
 * Usage:  node scripts/migrate-to-d1.mjs [--skip-apply]
 *
 * --skip-apply: generate the seed SQL but don't run wrangler. Lets you
 * inspect the output before hitting D1.
 */

import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'node:child_process';
import { segment } from '../src/lib/content-parser.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DATA = path.join(ROOT, 'src', 'data');
const OUT = path.join(ROOT, 'migrations');

const DB_NAME = 'thcf-content';
const BATCH_SIZE = 50;   // statements per file; D1 handles ~100 easily, 50 leaves headroom
const SKIP_APPLY = process.argv.includes('--skip-apply');

// ---------------------------------------------------------------------------
// SQL helpers
// ---------------------------------------------------------------------------

function sqlStr(v) {
  if (v === null || v === undefined) return 'NULL';
  return `'${String(v).replace(/'/g, "''")}'`;
}

function sqlNum(v) {
  if (v === null || v === undefined) return 'NULL';
  return String(v);
}

function now() {
  return Date.now();
}

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

function slugFromPath(p) {
  // "/" -> "" ; "/about" -> "about" ; "/about/board" -> "about/board"
  return (p || '/').replace(/^\//, '');
}

function buildPageInsert(page) {
  const body = page.body || '';
  let sections;
  try {
    sections = segment(body, { hoistLead: true });
  } catch (err) {
    console.warn(`  ! parser failed on ${page.path}: ${err.message} — storing as single legacy-html section`);
    sections = [{ kind: 'legacy-html', html: body }];
  }

  const slug = slugFromPath(page.path);
  const created = now();

  return `INSERT INTO pages (slug, path, type, template, title, subtitle, meta, legacy_body, sections, updated_at, created_at) VALUES (${sqlStr(slug)}, ${sqlStr(page.path || '/')}, ${sqlStr(page.type || 'page')}, 'legacy', ${sqlStr(page.title || '')}, NULL, NULL, ${sqlStr(body)}, ${sqlStr(JSON.stringify(sections))}, ${sqlNum(created)}, ${sqlNum(created)});`;
}

function buildNewsInsert(article) {
  const created = now();
  return `INSERT INTO news (slug, title, date, author, category, featured_image, body, excerpt, updated_at, created_at) VALUES (${sqlStr(article.slug)}, ${sqlStr(article.title || '')}, ${sqlStr(article.date || null)}, ${sqlStr(article.author || null)}, ${sqlStr(article.category || null)}, ${sqlStr(article.featuredImage || null)}, ${sqlStr(article.body || '')}, ${sqlStr(article.excerpt || null)}, ${sqlNum(created)}, ${sqlNum(created)});`;
}

function buildScholarshipInsert(s) {
  const created = now();
  return `INSERT INTO scholarships (slug, name, description, eligibility, amount, renewable, deadline, requirements, updated_at, created_at) VALUES (${sqlStr(s.slug)}, ${sqlStr(s.name || '')}, ${sqlStr(s.description || null)}, ${sqlStr(JSON.stringify(s.eligibility || []))}, ${sqlStr(s.amount || null)}, ${sqlStr(JSON.stringify(s.renewable || { isRenewable: false, details: '' }))}, ${sqlStr(s.deadline || null)}, ${sqlStr(JSON.stringify(s.requirements || []))}, ${sqlNum(created)}, ${sqlNum(created)});`;
}

// ---------------------------------------------------------------------------
// Batched seed-file writing
// ---------------------------------------------------------------------------

async function writeBatches(label, statements) {
  const files = [];
  for (let i = 0; i < statements.length; i += BATCH_SIZE) {
    const slice = statements.slice(i, i + BATCH_SIZE);
    const batchIdx = String(Math.floor(i / BATCH_SIZE) + 1).padStart(3, '0');
    const file = path.join(OUT, `_seed_${label}_${batchIdx}.sql`);
    await fs.writeFile(file, slice.join('\n') + '\n');
    files.push(file);
  }
  console.log(`  Wrote ${files.length} batch file(s) for ${label} (${statements.length} rows)`);
  return files;
}

function applyFile(file) {
  const rel = path.relative(ROOT, file);
  console.log(`    -> wrangler d1 execute ${rel}`);
  const res = spawnSync(
    'npx',
    ['wrangler', 'd1', 'execute', DB_NAME, '--remote', `--file=${rel}`],
    { cwd: ROOT, stdio: 'inherit' }
  );
  if (res.status !== 0) {
    throw new Error(`wrangler failed on ${rel} (exit ${res.status})`);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('=== Migrate content to D1 ===');
  console.log(`Target:  ${DB_NAME} (remote)`);
  console.log(`Output:  ${path.relative(ROOT, OUT)}`);
  console.log('');

  // Clean any prior seed files
  const existing = (await fs.readdir(OUT)).filter((f) => f.startsWith('_seed_'));
  for (const f of existing) await fs.remove(path.join(OUT, f));

  // --- pages -------------------------------------------------------------
  console.log('Pages...');
  const pages = await fs.readJson(path.join(DATA, 'pages.json'));
  // Dedup by slug (pages.json uses path-derived slug — but path is the unique key).
  // Our schema uses slugFromPath(page.path) as PK, so dedup on that.
  const pageSeen = new Set();
  const pageStmts = [];
  for (const p of pages) {
    const slug = slugFromPath(p.path);
    if (pageSeen.has(slug)) {
      console.warn(`  ! duplicate slug "${slug}" for path ${p.path} — skipping`);
      continue;
    }
    pageSeen.add(slug);
    pageStmts.push(buildPageInsert(p));
  }
  console.log(`  Parsed ${pageStmts.length} unique pages`);
  const pageFiles = await writeBatches('pages', pageStmts);

  // --- news --------------------------------------------------------------
  console.log('News...');
  const news = await fs.readJson(path.join(DATA, 'news.json'));
  const newsSeen = new Set();
  const newsStmts = [];
  for (const a of news) {
    if (!a.slug || newsSeen.has(a.slug)) continue;
    newsSeen.add(a.slug);
    newsStmts.push(buildNewsInsert(a));
  }
  console.log(`  Prepared ${newsStmts.length} news rows`);
  const newsFiles = await writeBatches('news', newsStmts);

  // --- scholarships ------------------------------------------------------
  console.log('Scholarships...');
  const scholarships = await fs.readJson(path.join(DATA, 'scholarships.json'));
  const schoSeen = new Set();
  const schoStmts = [];
  for (const s of scholarships) {
    if (!s.slug || schoSeen.has(s.slug)) continue;
    schoSeen.add(s.slug);
    schoStmts.push(buildScholarshipInsert(s));
  }
  console.log(`  Prepared ${schoStmts.length} scholarship rows`);
  const schoFiles = await writeBatches('scholarships', schoStmts);

  if (SKIP_APPLY) {
    console.log('\n--skip-apply set; stopping before wrangler.');
    return;
  }

  // --- apply -------------------------------------------------------------
  console.log('\nApplying to remote D1...');
  for (const f of [...pageFiles, ...newsFiles, ...schoFiles]) {
    applyFile(f);
  }

  console.log('\nDone.');
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
