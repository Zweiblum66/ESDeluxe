-- Add 'smb' to archive_locations type CHECK constraint.
-- SQLite doesn't support ALTER CHECK, so we must recreate the table.

PRAGMA foreign_keys = OFF;

CREATE TABLE archive_locations_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL DEFAULT 'local' CHECK (type IN ('local', 'smb', 's3', 'tape')),
  config TEXT NOT NULL,
  description TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  total_size INTEGER NOT NULL DEFAULT 0,
  file_count INTEGER NOT NULL DEFAULT 0,
  last_activity_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

INSERT INTO archive_locations_new
  SELECT id, name, type, config, description, enabled, total_size, file_count, last_activity_at, created_at, updated_at
  FROM archive_locations;

DROP TABLE archive_locations;
ALTER TABLE archive_locations_new RENAME TO archive_locations;

PRAGMA foreign_keys = ON;
