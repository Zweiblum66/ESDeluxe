-- Automated tiering rules
CREATE TABLE IF NOT EXISTS tiering_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  space_name TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  source_goal TEXT NOT NULL,
  target_goal TEXT NOT NULL,
  condition TEXT NOT NULL CHECK (condition IN ('last_access', 'last_modified', 'file_size', 'file_extension')),
  operator TEXT NOT NULL CHECK (operator IN ('older_than_days', 'larger_than_bytes', 'matches', 'not_matches')),
  value TEXT NOT NULL,
  recursive INTEGER NOT NULL DEFAULT 1,
  path_pattern TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'error')),
  last_run_at INTEGER,
  last_run_files INTEGER,
  last_run_errors INTEGER,
  next_run_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_tiering_rules_space ON tiering_rules(space_name);
CREATE INDEX IF NOT EXISTS idx_tiering_rules_status ON tiering_rules(status);
CREATE INDEX IF NOT EXISTS idx_tiering_rules_next_run ON tiering_rules(next_run_at);
