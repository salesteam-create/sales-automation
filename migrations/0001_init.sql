-- Agency tracker schema. Dates are ISO strings: 'YYYY-MM-DD' (IST calendar day) or full ISO timestamps.

CREATE TABLE agencies (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  website TEXT,
  website_note TEXT,               -- e.g. 'Not found', 'LinkedIn only'
  country TEXT,
  status TEXT NOT NULL,
  lead_status TEXT NOT NULL,
  framework TEXT,                  -- 'Sent' | 'To send' | 'Not needed' | NULL
  deal_description TEXT,
  deal_value REAL,
  last_contact_date TEXT,
  next_followup_date TEXT,
  followup_step INTEGER NOT NULL DEFAULT 0,
  unanswered_count INTEGER NOT NULL DEFAULT 0,
  next_steps TEXT,                 -- JSON array of strings
  next_steps_updated_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_agencies_next_followup ON agencies(next_followup_date);
CREATE INDEX idx_agencies_status ON agencies(status);

CREATE TABLE contacts (
  id INTEGER PRIMARY KEY,
  agency_id INTEGER NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role TEXT,
  email TEXT,
  linkedin TEXT
);
CREATE INDEX idx_contacts_agency ON contacts(agency_id);

CREATE TABLE timeline (
  id INTEGER PRIMARY KEY,
  agency_id INTEGER NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  date TEXT,                       -- NULL when the source had no usable date
  type TEXT NOT NULL,              -- meeting | call | email | note | followup | status_change
  raw_notes TEXT,
  summary TEXT,
  key_points TEXT,                 -- JSON object from the AI
  next_step TEXT,
  source TEXT NOT NULL DEFAULT 'app',  -- app | import
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_timeline_agency ON timeline(agency_id, date);
CREATE INDEX idx_timeline_created ON timeline(created_at);

CREATE TABLE suggestions (
  id INTEGER PRIMARY KEY,
  agency_id INTEGER NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  from_status TEXT NOT NULL,
  from_lead_status TEXT NOT NULL,
  to_status TEXT NOT NULL,
  to_lead_status TEXT NOT NULL,
  reason TEXT NOT NULL,
  source TEXT NOT NULL,            -- ai_note | no_reply
  state TEXT NOT NULL DEFAULT 'pending',  -- pending | accepted | dismissed
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at TEXT
);
CREATE INDEX idx_suggestions_state ON suggestions(state);

CREATE TABLE import_issues (
  id INTEGER PRIMARY KEY,
  agency_id INTEGER REFERENCES agencies(id) ON DELETE CASCADE,
  row_number INTEGER,
  kind TEXT NOT NULL,              -- bad_combo | bad_date | future_date | duplicate | unknown_value
  detail TEXT NOT NULL,
  resolved INTEGER NOT NULL DEFAULT 0
);
