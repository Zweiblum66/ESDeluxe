-- Archive storage locations (pluggable backends)
CREATE TABLE IF NOT EXISTS archive_locations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL DEFAULT 'local' CHECK (type IN ('local', 's3', 'tape')),
  config TEXT NOT NULL,              -- JSON: e.g. {"basePath": "/mnt/archive"}
  description TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  total_size INTEGER NOT NULL DEFAULT 0,
  file_count INTEGER NOT NULL DEFAULT 0,
  last_activity_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
