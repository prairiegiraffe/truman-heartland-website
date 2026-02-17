/**
 * Classifies a URL into a content type based on path patterns.
 */

const PATTERNS = [
  { pattern: /^\/news\/[^/]+$/, type: 'news' },
  { pattern: /^\/about\/news/, type: 'news-listing' },
  { pattern: /^\/scholarships\/[^/]+$/, type: 'scholarship' },
  { pattern: /^\/students\/scholarships\/scholarship-directory/, type: 'scholarship-listing' },
  { pattern: /^\/students\/scholarships/, type: 'page' },
  { pattern: /^\/students/, type: 'page' },
  { pattern: /^\/grants\/[^/]+$/, type: 'grant' },
  { pattern: /^\/grant-seekers\/past-recipients/, type: 'grant-listing' },
  { pattern: /^\/about\/staff$/, type: 'staff-listing' },
  { pattern: /^\/about\/board$/, type: 'board-listing' },
];

export function classifyPage(url) {
  let pathname;
  try {
    pathname = new URL(url).pathname.replace(/\/$/, '') || '/';
  } catch {
    pathname = url.replace(/\/$/, '') || '/';
  }

  for (const { pattern, type } of PATTERNS) {
    if (pattern.test(pathname)) return type;
  }

  return 'page';
}

export function getOutputDir(type) {
  const map = {
    'news': 'news',
    'news-listing': 'pages',
    'scholarship': 'scholarships',
    'scholarship-listing': 'pages',
    'grant': 'grants',
    'grant-listing': 'pages',
    'staff-listing': 'pages',
    'board-listing': 'pages',
    'page': 'pages',
  };
  return map[type] || 'pages';
}
