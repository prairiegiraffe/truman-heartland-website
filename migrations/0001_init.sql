-- D1 schema for Truman Heartland content
-- Applies to the `thcf-content` D1 database (binding: thcf_content).

CREATE TABLE pages (
  slug          TEXT PRIMARY KEY,        -- URL path without leading slash; "" is homepage
  path          TEXT NOT NULL,           -- "/", "/about", "/about/board", etc.
  type          TEXT NOT NULL,           -- legacy type: page | about | donors | fundholders | advisors | grants | students | gala
  template      TEXT NOT NULL DEFAULT 'legacy',  -- legacy | pillar | program | landing | future
  title         TEXT NOT NULL,
  subtitle      TEXT,
  meta          TEXT,                    -- JSON blob (seo, og, custom)
  legacy_body   TEXT,                    -- original WordPress HTML (kept for re-parsing / rollback)
  sections      TEXT NOT NULL,           -- JSON Section[] (parser output for legacy template)
  deleted_at    INTEGER,
  updated_at    INTEGER NOT NULL,
  created_at    INTEGER NOT NULL
);

CREATE INDEX idx_pages_path ON pages(path);
CREATE INDEX idx_pages_updated ON pages(updated_at) WHERE deleted_at IS NULL;

CREATE TABLE news (
  slug           TEXT PRIMARY KEY,
  title          TEXT NOT NULL,
  date           TEXT,                   -- raw date string from scrape
  author         TEXT,
  category       TEXT,
  featured_image TEXT,
  body           TEXT NOT NULL,          -- cleaned HTML (news volume too high to structure in phase 1)
  excerpt        TEXT,
  deleted_at     INTEGER,
  updated_at     INTEGER NOT NULL,
  created_at     INTEGER NOT NULL
);

CREATE INDEX idx_news_date ON news(date DESC) WHERE deleted_at IS NULL;

CREATE TABLE scholarships (
  slug         TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  description  TEXT,                     -- HTML narrative before the structured fields
  eligibility  TEXT,                     -- JSON string[]
  amount       TEXT,
  renewable    TEXT,                     -- JSON { isRenewable: bool, details: string }
  deadline     TEXT,
  requirements TEXT,                     -- JSON string[]
  deleted_at   INTEGER,
  updated_at   INTEGER NOT NULL,
  created_at   INTEGER NOT NULL
);

CREATE TABLE page_versions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  slug        TEXT NOT NULL,
  template    TEXT,
  title       TEXT,
  subtitle    TEXT,
  meta        TEXT,
  sections    TEXT NOT NULL,
  legacy_body TEXT,
  author      TEXT,                      -- 'bot' | 'admin' | 'migration'
  chat_turn   TEXT,                      -- JSON: user message + tool calls (null for non-bot edits)
  created_at  INTEGER NOT NULL
);

CREATE INDEX idx_page_versions_slug ON page_versions(slug, created_at DESC);

CREATE TABLE assets (
  id           TEXT PRIMARY KEY,         -- stable hash id
  r2_key       TEXT NOT NULL,            -- object key within the R2 bucket
  alt          TEXT,
  original_url TEXT,                     -- source URL at time of import (blob/cloudfront/etc.)
  width        INTEGER,
  height       INTEGER,
  mime_type    TEXT,
  size_bytes   INTEGER,
  created_at   INTEGER NOT NULL
);

CREATE INDEX idx_assets_original_url ON assets(original_url);

-- Rebuild log for Phase 2 (records rebuild trigger attempts from admin writes).
-- Pre-created here so Phase 2 only has to start writing to it.
CREATE TABLE rebuild_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  slug       TEXT,
  status     TEXT NOT NULL,              -- triggered | succeeded | failed
  detail     TEXT,
  created_at INTEGER NOT NULL
);
