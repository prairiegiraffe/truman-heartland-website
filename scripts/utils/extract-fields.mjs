/**
 * Extract structured fields from a page based on its content type.
 * Each extractor runs in the browser context via page.evaluate().
 */

export function getExtractor(type) {
  switch (type) {
    case 'news': return extractNews;
    case 'scholarship': return extractScholarship;
    case 'grant': return extractGrant;
    case 'staff-listing': return extractStaffListing;
    case 'board-listing': return extractBoardListing;
    default: return extractGenericPage;
  }
}

async function extractNews(page) {
  return page.evaluate(() => {
    const title = document.querySelector('h1')?.textContent?.trim() || '';
    const body = document.querySelector('article, .entry-content, .post-content, main .content, main')?.innerHTML || '';
    const bodyText = document.querySelector('article, .entry-content, .post-content, main .content, main')?.textContent?.trim() || '';

    // Look for metadata
    const dateEl = document.querySelector('time, .date, .post-date, [datetime]');
    const date = dateEl?.getAttribute('datetime') || dateEl?.textContent?.trim() || '';

    const authorEl = document.querySelector('.author, .byline, [rel="author"]');
    const author = authorEl?.textContent?.trim() || '';

    const categoryEl = document.querySelector('.category, .tag, .post-category');
    const category = categoryEl?.textContent?.trim() || '';

    const featuredImg = document.querySelector('article img, .post-content img, .hero img, main img');
    const featuredImage = featuredImg?.src || '';

    // Get all images in the content
    const images = [...document.querySelectorAll('article img, main img')].map(img => ({
      src: img.src,
      alt: img.alt || '',
    }));

    return { title, date, author, category, featuredImage, body, bodyText, images };
  });
}

async function extractScholarship(page) {
  return page.evaluate(() => {
    const title = document.querySelector('h1')?.textContent?.trim() || '';
    const content = document.querySelector('article, main .content, main');
    const body = content?.innerHTML || '';
    const bodyText = content?.textContent?.trim() || '';

    // Try to extract structured fields from the page
    // These are often in definition lists, tables, or labeled sections
    const fields = {};
    const allText = bodyText.toLowerCase();

    // Look for common scholarship fields in various formats
    document.querySelectorAll('dt, th, strong, b, label, .field-label').forEach(el => {
      const label = el.textContent.trim().toLowerCase().replace(/:$/, '');
      const value = el.nextElementSibling?.textContent?.trim()
        || el.parentElement?.nextElementSibling?.textContent?.trim()
        || '';
      if (value && label) {
        fields[label] = value;
      }
    });

    const images = [...document.querySelectorAll('article img, main img')].map(img => ({
      src: img.src,
      alt: img.alt || '',
    }));

    return { title, fields, body, bodyText, images };
  });
}

async function extractGrant(page) {
  return page.evaluate(() => {
    const title = document.querySelector('h1')?.textContent?.trim() || '';
    const content = document.querySelector('article, main .content, main');
    const body = content?.innerHTML || '';
    const bodyText = content?.textContent?.trim() || '';

    // Extract grant-specific fields
    const fields = {};
    document.querySelectorAll('dt, th, strong, b, label, .field-label').forEach(el => {
      const label = el.textContent.trim().toLowerCase().replace(/:$/, '');
      const value = el.nextElementSibling?.textContent?.trim()
        || el.parentElement?.nextElementSibling?.textContent?.trim()
        || '';
      if (value && label) {
        fields[label] = value;
      }
    });

    const images = [...document.querySelectorAll('article img, main img')].map(img => ({
      src: img.src,
      alt: img.alt || '',
    }));

    return { title, fields, body, bodyText, images };
  });
}

async function extractStaffListing(page) {
  return page.evaluate(() => {
    const members = [];
    // Staff are typically in cards or grid items
    const cards = document.querySelectorAll('.staff-card, .team-member, .card, [class*="staff"], [class*="team"]');

    if (cards.length > 0) {
      cards.forEach(card => {
        const name = card.querySelector('h2, h3, h4, .name')?.textContent?.trim() || '';
        const titleEl = card.querySelector('.title, .position, .role, p');
        const jobTitle = titleEl?.textContent?.trim() || '';
        const photo = card.querySelector('img')?.src || '';
        const email = card.querySelector('a[href^="mailto:"]')?.textContent?.trim() || '';
        const phone = card.querySelector('a[href^="tel:"]')?.textContent?.trim() || '';
        if (name) members.push({ name, jobTitle, photo, email, phone });
      });
    }

    // Fallback: just grab the whole page content
    const body = document.querySelector('main')?.innerHTML || '';
    return { members, body };
  });
}

async function extractBoardListing(page) {
  return page.evaluate(() => {
    const members = [];
    const cards = document.querySelectorAll('.board-card, .team-member, .card, [class*="board"], [class*="director"]');

    if (cards.length > 0) {
      cards.forEach(card => {
        const name = card.querySelector('h2, h3, h4, .name')?.textContent?.trim() || '';
        const titleEl = card.querySelector('.title, .position, .role, p');
        const role = titleEl?.textContent?.trim() || '';
        const photo = card.querySelector('img')?.src || '';
        if (name) members.push({ name, role, photo });
      });
    }

    const body = document.querySelector('main')?.innerHTML || '';
    return { members, body };
  });
}

async function extractGenericPage(page) {
  return page.evaluate(() => {
    const title = document.querySelector('h1')?.textContent?.trim() || '';
    const content = document.querySelector('article, main .content, .page-content, main');
    const body = content?.innerHTML || '';
    const bodyText = content?.textContent?.trim() || '';

    const images = [...document.querySelectorAll('article img, main img')].map(img => ({
      src: img.src,
      alt: img.alt || '',
    }));

    // Extract any sidebar content
    const sidebar = document.querySelector('aside, .sidebar')?.innerHTML || '';

    return { title, body, bodyText, images, sidebar };
  });
}
