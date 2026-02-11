-- Tiering execution log
CREATE TABLE IF NOT EXISTS tiering_execution_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rule_id INTEGER NOT NULL REFERENCES tiering_rules(id) ON DELETE CASCADE,
  started_at INTEGER NOT NULL DEFAULT (unixepoch()),
  completed_at INTEGER,
  files_processed INTEGER DEFAULT 0,
  files_skipped INTEGER DEFAULT 0,
  files_failed INTEGER DEFAULT 0,
  bytes_processed INTEGER DEFAULT 0,
  errors TEXT,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed', 'cancelled'))
);

CREATE INDEX IF NOT EXISTS idx_tiering_log_rule ON tiering_execution_log(rule_id);
CREATE INDEX IF NOT EXISTS idx_tiering_log_started ON tiering_execution_log(started_at);
