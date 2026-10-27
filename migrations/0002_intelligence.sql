-- Phase 2: agency intelligence (BRD section 6). suggestions.source gains 'web'.

ALTER TABLE agencies ADD COLUMN pages_discovered_at TEXT;
ALTER TABLE agencies ADD COLUMN intel_stale INTEGER NOT NULL DEFAULT 1;

-- Pages watched per agency. content_text is the last cleaned snapshot used for comparison.
CREATE TABLE watched_pages (
  id INTEGER PRIMARY KEY,
  agency_id INTEGER NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,              -- home | services | work | news | careers
  url TEXT NOT NULL,
  last_checked_at TEXT,
  last_status TEXT,                -- ok | error
  last_error TEXT,
  content_hash TEXT,
  content_text TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (agency_id, url)
);
CREATE INDEX idx_watched_pages_checked ON watched_pages(last_checked_at);

CREATE TABLE agency_intel (
  agency_id INTEGER PRIMARY KEY REFERENCES agencies(id) ON DELETE CASCADE,
  summary TEXT,
  their_services TEXT,             -- JSON array of strings
  platforms TEXT,                  -- JSON array of strings
  gaps TEXT,                       -- JSON array of {service, pitch}
  upsell TEXT,                     -- JSON array of {finding, suggestion}
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE web_changes (
  id INTEGER PRIMARY KEY,
  agency_id INTEGER NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  page_id INTEGER REFERENCES watched_pages(id) ON DELETE SET NULL,
  page_kind TEXT NOT NULL,
  page_url TEXT NOT NULL,
  added_text TEXT NOT NULL,
  change_ratio REAL NOT NULL,      -- share of the page text that is new (0..1)
  label TEXT,                      -- NULL until the AI has looked at it
  title TEXT,
  summary TEXT,
  is_opportunity INTEGER NOT NULL DEFAULT 0,
  opportunity_reason TEXT,
  detected_at TEXT NOT NULL DEFAULT (datetime('now')),
  labeled_at TEXT
);
CREATE INDEX idx_web_changes_agency ON web_changes(agency_id, detected_at);
CREATE INDEX idx_web_changes_detected ON web_changes(detected_at);

-- Free-tier AI calls used per IST day.
CREATE TABLE ai_usage (
  day TEXT PRIMARY KEY,
  calls INTEGER NOT NULL DEFAULT 0
);

-- Keeps overnight ticks from overlapping when a slow site makes one run long.
CREATE TABLE job_locks (
  name TEXT PRIMARY KEY,
  until TEXT NOT NULL
);
