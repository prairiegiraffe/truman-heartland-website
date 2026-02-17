#!/usr/bin/env node

/**
 * prepare-content.mjs
 *
 * Reads scraped JSON data from scraped-data/ and generates clean JSON content
 * files for Astro to consume at build time. Outputs to src/data/.
 *
 * Usage:  node scripts/prepare-content.mjs
 */

import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import * as cheerio from 'cheerio';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SCRAPED = path.join(ROOT, 'scraped-data');
const OUTPUT = path.join(ROOT, 'src', 'data');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Read all JSON files from a directory and return parsed objects.
 */
async function readJsonDir(dirPath) {
  const exists = await fs.pathExists(dirPath);
  if (!exists) {
    console.warn(`  Warning: directory not found: ${dirPath}`);
    return [];
  }
  const files = (await fs.readdir(dirPath)).filter(f => f.endsWith('.json'));
  const results = [];
  for (const file of files) {
    try {
      const data = await fs.readJson(path.join(dirPath, file));
      results.push(data);
    } catch (err) {
      console.warn(`  Warning: could not parse ${file}: ${err.message}`);
    }
  }
  return results;
}

/**
 * Extract the URL path from a full thcf.org URL.
 * "https://www.thcf.org/about/contact-us" -> "/about/contact-us"
 */
function urlToPath(href) {
  if (!href) return '/';
  try {
    const u = new URL(href);
    if (u.hostname.includes('thcf.org')) {
      return u.pathname || '/';
    }
  } catch {
    // not a valid URL, maybe already relative
  }
  // If it already starts with /, return as-is
  if (href.startsWith('/')) return href;
  return href;
}

/**
 * Derive a slug from a URL.
 * "https://www.thcf.org/news/2024-annual-report" -> "2024-annual-report"
 */
function slugFromUrl(url) {
  const p = urlToPath(url);
  const segments = p.split('/').filter(Boolean);
  return segments[segments.length - 1] || '';
}

/**
 * Clean the meta.title by stripping the site suffix.
 */
function cleanMetaTitle(metaTitle) {
  if (!metaTitle) return '';
  return metaTitle
    .replace(/\s*\|?\s*Truman Heartland Community Foundation\s*$/i, '')
    .replace(/\u2026$/, '') // trailing ellipsis from truncation
    .trim();
}

/**
 * Extract the real title from the body HTML using the <h1> tag,
 * falling back to the cleaned meta.title.
 */
function extractTitle(body, metaTitle) {
  if (body) {
    const $ = cheerio.load(body);
    const h1 = $('h1').first().text().trim();
    if (h1 && h1 !== 'Site Navigation') {
      return h1;
    }
  }
  return cleanMetaTitle(metaTitle);
}

/**
 * Extract the category label from the body HTML (the <p class="section"> text
 * inside the text-banner section).
 */
function extractCategory(body) {
  if (!body) return '';
  const $ = cheerio.load(body);
  const section = $('section.text-banner p.section').first().text().trim();
  return section || '';
}

/**
 * Clean the author string (remove newlines and extra whitespace from
 * multi-line scraping artifacts).
 */
function cleanAuthor(author) {
  if (!author) return '';
  // The author field often has the title on the next line
  // e.g. "Melanie Adkins\n            Director of Marketing & Communications"
  // We only want the name.
  const lines = author.split('\n').map(l => l.trim()).filter(Boolean);
  return lines[0] || '';
}

// ---------------------------------------------------------------------------
// HTML Cleaning: strip navigation, sidebars, share buttons, etc.
// ---------------------------------------------------------------------------

/**
 * For news articles: extract just the main article content from the body HTML.
 *
 * The body contains:
 *  - <section class="text-banner"> (title banner - we extract title from here but don't need it in body)
 *  - <section class="main-content"> (THE ACTUAL CONTENT)
 *  - <section class="sub-content"> (sidebar callouts - sometimes useful, keep these)
 *  - <section class="article-info"> (author + share buttons - strip)
 *  - <section class="related"> (related articles - strip)
 */
function cleanNewsBody(rawBody) {
  if (!rawBody) return '';
  const $ = cheerio.load(rawBody);

  // Remove sections we don't want
  $('section.article-info').remove();
  $('section.related').remove();
  $('section.text-banner').remove();

  // Remove share buttons anywhere
  $('div.share').remove();
  $('.a2a_kit').remove();

  // Remove addtoany scripts
  $('script[src*="addtoany"]').remove();
  $('script').remove();

  // Remove Constant Contact forms
  $('[class*="ctct"]').remove();

  // Get the main-content section innerHTML
  const mainContent = $('section.main-content').html();
  const subContent = $('section.sub-content').html();

  let body = '';
  if (mainContent) {
    const $main = cheerio.load(mainContent);
    // Remove the thumbnail image at the very top (it's the featured image, redundant)
    $main('p:first-child > img.thumbnail').closest('p').remove();
    // Remove largetext paragraph if it's just repeating the meta description
    body = $main.html() || '';
  }

  // Include sub-content callouts if present (they often have useful CTAs)
  if (subContent) {
    body += subContent;
  }

  return body.trim();
}

/**
 * For scholarship pages: extract just the scholarship description from the body.
 *
 * The body contains:
 *  - <section class="banner"> (page banner - strip)
 *  - <section class="main-content"> (THE ACTUAL CONTENT with eligibility, amount, etc.)
 *  - <section class="side-nav"> (navigation sidebar - strip)
 */
function cleanScholarshipBody(rawBody) {
  if (!rawBody) return '';
  const $ = cheerio.load(rawBody);

  // Remove sections we don't want
  $('section.banner').remove();
  $('section.side-nav').remove();

  // Remove share buttons
  $('div.share').remove();
  $('.a2a_kit').remove();
  $('script').remove();
  $('[class*="ctct"]').remove();

  // Get the main-content innerHTML
  const mainContent = $('section.main-content').html();
  if (!mainContent) return '';

  return mainContent.trim();
}

/**
 * For generic pages: extract just the page content from the body.
 *
 * The body contains:
 *  - <section class="banner"> (page banner - strip)
 *  - <section class="main-content"> (THE ACTUAL CONTENT)
 *  - <section class="side-nav"> (navigation sidebar - strip)
 */
function cleanPageBody(rawBody) {
  if (!rawBody) return '';
  const $ = cheerio.load(rawBody);

  // Remove sections we don't want
  $('section.banner').remove();
  $('section.side-nav').remove();
  $('section.article-info').remove();
  $('section.related').remove();
  $('section.sub-content .side-block .sub-nav').remove();

  // Remove share buttons
  $('div.share').remove();
  $('.a2a_kit').remove();
  $('script').remove();
  $('[class*="ctct"]').remove();

  // Try to get main-content first
  let mainContent = $('section.main-content').html();

  // Some pages may also have sub-content with useful sidebar info
  const subContent = $('section.sub-content').html();

  let body = '';
  if (mainContent) {
    body = mainContent;
  }
  if (subContent) {
    body += subContent;
  }

  // If no sections matched, fall back to what remains
  if (!body) {
    body = $.html() || '';
  }

  return body.trim();
}

// ---------------------------------------------------------------------------
// Scholarship Field Parsing
// ---------------------------------------------------------------------------

/**
 * Parse structured scholarship data from the body HTML.
 * The body has patterns like:
 *   <strong>Eligibility:</strong>
 *   <ul><li>...</li></ul>  or  <ol><li>...</li></ol>
 *
 *   <strong>Amount:</strong>
 *   <p>Up to $1,500 per academic year.</p>
 *
 *   <strong>Renewable:</strong>
 *   <p>Yes, ...</p>
 *
 *   <strong>Deadline:</strong>
 *   <p>...</p>
 *
 *   <strong>Requirements:</strong>
 *   <ul><li>...</li></ul>
 */
function parseScholarshipFields(rawBody) {
  if (!rawBody) return {};
  const $ = cheerio.load(rawBody);

  // Get the main-content section
  const mainSection = $('section.main-content');
  if (!mainSection.length) return {};

  const html = mainSection.html() || '';
  const $content = cheerio.load(html);

  const result = {
    eligibility: [],
    amount: '',
    renewable: { isRenewable: false, details: '' },
    deadline: '',
    requirements: [],
    description: ''
  };

  // Strategy: walk through the content and identify sections by their <strong> labels
  // First, collect the descriptive text before the Eligibility section
  const descParts = [];
  const allChildren = $content('body').children().toArray();
  let reachedFields = false;

  for (const el of allChildren) {
    const $el = $content(el);
    const text = $el.text().trim();

    // Check if this element or its children contain a field label
    const hasFieldLabel = /^(Eligibility|Amount|Renewable|Deadline|Requirements|Apply):/i.test(text) ||
      $el.find('strong').toArray().some(s =>
        /^(Eligibility|Amount|Renewable|Deadline|Requirements|Apply):?$/i.test($content(s).text().trim())
      );

    if (hasFieldLabel && !reachedFields) {
      reachedFields = true;
      // Check if the Eligibility label is INSIDE a paragraph with preceding description text
      // e.g. "...workforce continues to be available.<br><br><strong>Eligibility:</strong>"
      const elHtml = $content.html(el);
      const eligMatch = elHtml.match(/^([\s\S]+?)(<strong>\s*Eligibility:\s*<\/strong>[\s\S]*)$/i);
      if (eligMatch) {
        // The part before <strong>Eligibility:</strong> is description
        let descBefore = eligMatch[1].replace(/<br\s*\/?>\s*$/gi, '').trim();
        if (descBefore) {
          // If the captured text starts with <p> (from outer HTML), close it properly
          if (descBefore.startsWith('<p>') || descBefore.startsWith('<p ')) {
            descParts.push(`${descBefore}</p>`);
          } else {
            descParts.push(descBefore);
          }
        }
      }
    }

    if (!reachedFields) {
      // Skip the accordion script
      if (el.tagName === 'script') continue;
      descParts.push($content.html(el));
    }
  }

  result.description = descParts.join('').trim();

  // Now parse the field sections
  // Find all <strong> tags that match our field labels
  const strongTags = $content('strong').toArray();

  for (let i = 0; i < strongTags.length; i++) {
    const $strong = $content(strongTags[i]);
    const label = $strong.text().trim().replace(/:$/, '').toLowerCase();

    if (label === 'eligibility') {
      // Look for the next <ul> or <ol> after this strong's parent
      const parent = $strong.closest('p, li, div');
      let nextList = parent.length ? parent.nextAll('ul, ol').first() : $strong.closest('p').nextAll('ul, ol').first();
      if (!nextList.length) {
        // Sometimes the list is the next sibling of the paragraph
        nextList = $strong.parent().nextAll('ul, ol').first();
      }
      if (nextList.length) {
        result.eligibility = nextList.find('li').toArray().map(li => $content(li).text().trim());
      }
    } else if (label === 'amount') {
      // The amount is usually in the next <p> or in the same element after the <strong>
      const parent = $strong.closest('p');
      if (parent.length) {
        // Check if there's text after the strong in the same paragraph
        const fullText = parent.text().trim();
        const afterLabel = fullText.replace(/^Amount:\s*/i, '').trim();
        if (afterLabel && !afterLabel.startsWith('Renewable') && !afterLabel.startsWith('Deadline')) {
          result.amount = afterLabel;
        } else {
          // Look at next <p>
          const nextP = parent.nextAll('p').first();
          if (nextP.length) {
            const nextText = nextP.text().trim();
            // Make sure we didn't land on another field label
            if (!/^(Renewable|Deadline|Requirements|Apply|Eligibility):/i.test(nextText)) {
              result.amount = nextText;
            }
          }
        }
      }
    } else if (label === 'renewable') {
      const parent = $strong.closest('p');
      if (parent.length) {
        const fullText = parent.text().trim();
        const afterLabel = fullText.replace(/^Renewable:\s*/i, '').trim();
        let renewText = afterLabel;

        // If the text continues in the next paragraph
        if (!renewText || renewText === '') {
          const nextP = parent.nextAll('p').first();
          if (nextP.length) {
            const nextText = nextP.text().trim();
            if (!/^(Deadline|Requirements|Apply|Amount|Eligibility):/i.test(nextText)) {
              renewText = nextText;
            }
          }
        }

        // Strip any trailing field labels that leaked in (e.g. "...GPA of 2.5.Deadline:")
        renewText = renewText.replace(/\s*(Deadline|Requirements|Apply|Amount|Eligibility):?\s*$/i, '').trim();

        if (renewText) {
          result.renewable.isRenewable = /^yes/i.test(renewText);
          result.renewable.details = renewText;
        }
      }
    } else if (label === 'deadline') {
      const parent = $strong.closest('p');
      if (parent.length) {
        const fullText = parent.text().trim();
        // The text of the <p> might start with a renewable section before "Deadline:"
        // Extract only the part after the last occurrence of "Deadline:"
        let afterLabel = fullText;
        const deadlineIdx = afterLabel.lastIndexOf('Deadline:');
        if (deadlineIdx !== -1) {
          afterLabel = afterLabel.substring(deadlineIdx + 'Deadline:'.length).trim();
        } else {
          afterLabel = afterLabel.replace(/^Deadline:\s*/i, '').trim();
        }

        // Strip any trailing field labels
        afterLabel = afterLabel.replace(/\s*(Requirements|Apply|Amount|Renewable|Eligibility):?\s*$/i, '').trim();

        if (afterLabel && !/^(Requirements|Apply):/i.test(afterLabel)) {
          result.deadline = afterLabel;
        } else {
          const nextP = parent.nextAll('p').first();
          if (nextP.length) {
            const nextText = nextP.text().trim();
            if (!/^(Requirements|Apply|Amount|Renewable|Eligibility):/i.test(nextText)) {
              result.deadline = nextText;
            }
          }
        }
      }
    } else if (label === 'requirements') {
      const parent = $strong.closest('p');
      let nextList = parent.length ? parent.nextAll('ul, ol').first() : $strong.parent().nextAll('ul, ol').first();
      if (nextList.length) {
        result.requirements = nextList.find('li').toArray().map(li => $content(li).text().trim());
      }
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Navigation Cleaning
// ---------------------------------------------------------------------------

/**
 * Recursively convert absolute thcf.org URLs to relative paths in the nav tree.
 */
function cleanNavItem(item) {
  const cleaned = {
    label: item.label,
    href: urlToPath(item.href),
  };
  if (item.children && item.children.length > 0) {
    cleaned.children = item.children.map(cleanNavItem);
  }
  return cleaned;
}

// ---------------------------------------------------------------------------
// Main Processing
// ---------------------------------------------------------------------------

async function processNews() {
  console.log('Processing news articles...');
  const files = await readJsonDir(path.join(SCRAPED, 'news'));
  console.log(`  Found ${files.length} news files`);

  const articles = files.map(file => {
    const { url, meta, data } = file;
    const slug = slugFromUrl(url);
    const title = extractTitle(data.body, meta?.title);
    const category = extractCategory(data.body) || data.category || '';
    const body = cleanNewsBody(data.body);
    const author = cleanAuthor(data.author);
    const date = data.date || '';
    const featuredImage = data.featuredImage || meta?.ogImage || '';

    // Generate excerpt from bodyText - get the meaningful content
    let excerpt = '';
    if (data.bodyText) {
      // The bodyText starts with the category + title + date, then the actual content
      // We want to skip past that preamble to get real content
      const lines = data.bodyText.split('\n').map(l => l.trim()).filter(Boolean);
      // Find the first substantial line (>40 chars) after skipping the title/date preamble
      let foundContent = false;
      const contentLines = [];
      for (const line of lines) {
        // Skip lines that are the title, date, or category
        if (!foundContent) {
          if (line === title || line === date || line === category) continue;
          if (line.length < 20) continue;
          foundContent = true;
        }
        if (foundContent) {
          // Stop at "Share this page", "More articles like this", author section, navigation, etc.
          if (/^(Share this page|More articles like this|Back to all posts|Facebook|LinkedIn|Email$)/.test(line)) break;
          if (/^(Students|Donors|Fundholders|Grant Seekers|Professional Advisors|About Us|Annual Gala)$/.test(line)) break;
          contentLines.push(line);
        }
      }
      const fullText = contentLines.join(' ');
      excerpt = fullText.substring(0, 200).trim();
      // Don't cut in the middle of a word
      if (fullText.length > 200) {
        const lastSpace = excerpt.lastIndexOf(' ');
        if (lastSpace > 150) {
          excerpt = excerpt.substring(0, lastSpace);
        }
        excerpt += '...';
      }
    }

    return {
      slug,
      title,
      date,
      author,
      category,
      featuredImage,
      body,
      excerpt
    };
  });

  // Sort by date (newest first)
  articles.sort((a, b) => {
    const da = a.date ? new Date(a.date) : new Date(0);
    const db = b.date ? new Date(b.date) : new Date(0);
    return db - da;
  });

  console.log(`  Processed ${articles.length} articles`);
  return articles;
}

async function processScholarships() {
  console.log('Processing scholarships...');
  const files = await readJsonDir(path.join(SCRAPED, 'scholarships'));
  console.log(`  Found ${files.length} scholarship files`);

  const scholarships = files.map(file => {
    const { url, meta, data } = file;
    const slug = slugFromUrl(url);
    const name = extractTitle(data.body, meta?.title);

    // Parse structured fields from the body HTML
    const parsed = parseScholarshipFields(data.body);

    // Clean the body to just the main content (no nav, sidebar)
    const cleanedBody = cleanScholarshipBody(data.body);

    // Use parsed fields, falling back to the scraper's fields object
    const fields = data.fields || {};

    // Eligibility: prefer parsed list, fall back to fields string split by semicolons
    let eligibility = parsed.eligibility;
    if ((!eligibility || eligibility.length === 0) && fields.eligibility) {
      eligibility = fields.eligibility.split(';').map(s => s.trim()).filter(Boolean);
    }

    // Amount
    let amount = parsed.amount;
    if (!amount && fields.amount && !/^(Renewable|Deadline):/i.test(fields.amount)) {
      amount = fields.amount.replace(/\s*(Renewable|Deadline|Requirements|Apply):?\s*$/i, '').trim();
    }

    // Renewable
    let renewable = parsed.renewable;
    if (!renewable.details && fields.renewable && !/^(Deadline):/i.test(fields.renewable)) {
      // Clean trailing field labels that leaked in from scraper
      const cleanedRenewable = fields.renewable.replace(/\s*(Deadline|Requirements|Apply):?\s*$/i, '').trim();
      renewable = {
        isRenewable: /^yes/i.test(cleanedRenewable),
        details: cleanedRenewable
      };
    }

    // Deadline
    let deadline = parsed.deadline;
    if (!deadline && fields.deadline) {
      deadline = fields.deadline;
    }

    // Requirements: prefer parsed list, fall back to fields string split by periods
    let requirements = parsed.requirements;
    if ((!requirements || requirements.length === 0) && fields.requirements) {
      requirements = fields.requirements
        .split(/\.(?=[A-Z])/)
        .map(s => s.trim().replace(/\.$/, ''))
        .filter(Boolean);
    }

    // Description is the narrative part before the structured fields
    const description = parsed.description || cleanedBody;

    return {
      slug,
      name,
      eligibility: eligibility || [],
      amount: amount || '',
      renewable,
      deadline: deadline || '',
      requirements: requirements || [],
      description
    };
  });

  // Sort alphabetically by name
  scholarships.sort((a, b) => a.name.localeCompare(b.name));

  console.log(`  Processed ${scholarships.length} scholarships`);
  return scholarships;
}

async function processPages() {
  console.log('Processing pages...');
  const files = await readJsonDir(path.join(SCRAPED, 'pages'));
  console.log(`  Found ${files.length} page files`);

  const pages = files.map(file => {
    const { url, type, meta, data } = file;
    const slug = slugFromUrl(url);
    const urlPath = urlToPath(url);
    const title = extractTitle(data.body, meta?.title);
    const body = cleanPageBody(data.body);

    // Determine page type from URL path
    let pageType = 'page';
    if (urlPath.startsWith('/donors')) pageType = 'donors';
    else if (urlPath.startsWith('/fundholder')) pageType = 'fundholders';
    else if (urlPath.startsWith('/professional-advisors')) pageType = 'advisors';
    else if (urlPath.startsWith('/grant-seekers')) pageType = 'grants';
    else if (urlPath.startsWith('/students')) pageType = 'students';
    else if (urlPath.startsWith('/gala')) pageType = 'gala';
    else if (urlPath.startsWith('/about')) pageType = 'about';

    return {
      slug,
      path: urlPath,
      title,
      body,
      type: pageType
    };
  });

  // Sort by path
  pages.sort((a, b) => a.path.localeCompare(b.path));

  console.log(`  Processed ${pages.length} pages`);
  return pages;
}

async function processNav() {
  console.log('Processing navigation...');
  const navPath = path.join(SCRAPED, 'nav-structure.json');
  const exists = await fs.pathExists(navPath);
  if (!exists) {
    console.warn('  Warning: nav-structure.json not found');
    return [];
  }
  const nav = await fs.readJson(navPath);
  const cleaned = nav.map(cleanNavItem);
  console.log(`  Processed ${cleaned.length} top-level nav items`);
  return cleaned;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('=== Prepare Content ===');
  console.log(`Source: ${SCRAPED}`);
  console.log(`Output: ${OUTPUT}`);
  console.log('');

  // Ensure output directory exists
  await fs.ensureDir(OUTPUT);

  // Process all content types in parallel
  const [news, scholarships, pages, nav] = await Promise.all([
    processNews(),
    processScholarships(),
    processPages(),
    processNav(),
  ]);

  // Write output files
  await Promise.all([
    fs.writeJson(path.join(OUTPUT, 'news.json'), news, { spaces: 2 }),
    fs.writeJson(path.join(OUTPUT, 'scholarships.json'), scholarships, { spaces: 2 }),
    fs.writeJson(path.join(OUTPUT, 'pages.json'), pages, { spaces: 2 }),
    fs.writeJson(path.join(OUTPUT, 'nav.json'), nav, { spaces: 2 }),
  ]);

  console.log('');
  console.log('Output files written:');
  console.log(`  src/data/news.json          - ${news.length} articles`);
  console.log(`  src/data/scholarships.json   - ${scholarships.length} scholarships`);
  console.log(`  src/data/pages.json          - ${pages.length} pages`);
  console.log(`  src/data/nav.json            - ${nav.length} nav items`);
  console.log('');
  console.log('Done!');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
