CREATE TABLE IF NOT EXISTS bug_reports (
  bug_id TEXT PRIMARY KEY,
  summary TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  record_json TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS bug_reports_created_at
  ON bug_reports(created_at DESC);

CREATE TABLE IF NOT EXISTS bug_evidence (
  bug_id TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  data_url TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (bug_id, file_name)
);

CREATE INDEX IF NOT EXISTS bug_evidence_bug_id
  ON bug_evidence(bug_id);

CREATE TABLE IF NOT EXISTS shared_state (
  state_id TEXT PRIMARY KEY,
  updated_at TEXT NOT NULL,
  state_json TEXT NOT NULL
);
