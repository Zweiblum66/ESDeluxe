-- Relax constraints on tiering_rules:
-- 1. operator CHECK: add older_than_hours, older_than_weeks, older_than_months
-- 2. space_name: allow NULL (multi-space rules)
-- 3. source_goal / target_goal: allow NULL (archive rules don't need goals)
--
-- SQLite doesn't support ALTER COLUMN or DROP CONSTRAINT,
-- so we recreate the table preserving all data.

CREATE TABLE tiering_rules_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  space_name TEXT,
  space_selector TEXT,
  name TEXT NOT NULL,
  description TEXT,
  target_type TEXT NOT NULL DEFAULT 'goal_change'
    CHECK (target_type IN ('goal_change', 'archive')),
  source_goal TEXT,
  target_goal TEXT,
  archive_location_id INTEGER REFERENCES archive_locations(id) ON DELETE SET NULL,
  condition TEXT NOT NULL
    CHECK (condition IN ('last_access', 'last_modified', 'file_size', 'file_extension')),
  operator TEXT NOT NULL
    CHECK (operator IN (
      'older_than_hours', 'older_than_days', 'older_than_weeks', 'older_than_months',
      'larger_than_bytes', 'matches', 'not_matches'
    )),
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

INSERT INTO tiering_rules_new (
  id, space_name, space_selector, name, description,
  target_type, source_goal, target_goal, archive_location_id,
  condition, operator, value, recursive, path_pattern,
  status, last_run_at, last_run_files, last_run_errors, next_run_at,
  created_at, updated_at
)
SELECT
  id, space_name, space_selector, name, description,
  target_type, source_goal, target_goal, archive_location_id,
  condition, operator, value, recursive, path_pattern,
  status, last_run_at, last_run_files, last_run_errors, next_run_at,
  created_at, updated_at
FROM tiering_rules;

DROP TABLE tiering_rules;
ALTER TABLE tiering_rules_new RENAME TO tiering_rules;

-- Recreate indexes
CREATE INDEX IF NOT EXISTS idx_tiering_rules_space ON tiering_rules(space_name);
CREATE INDEX IF NOT EXISTS idx_tiering_rules_status ON tiering_rules(status);
CREATE INDEX IF NOT EXISTS idx_tiering_rules_next_run ON tiering_rules(next_run_at);
