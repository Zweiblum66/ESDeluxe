-- Archive catalog: every archived file is tracked here (DB is source of truth)
CREATE TABLE IF NOT EXISTS archive_catalog (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  original_space TEXT NOT NULL,
  original_path TEXT NOT NULL,
  original_size INTEGER NOT NULL,
  original_mtime INTEGER,
  checksum TEXT NOT NULL,
  archive_location_id INTEGER NOT NULL REFERENCES archive_locations(id),
  archive_path TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'archived'
    CHECK (status IN ('archiving', 'archived', 'restoring', 'restored', 'failed', 'deleted')),
  archived_at INTEGER NOT NULL DEFAULT (unixepoch()),
  archived_by TEXT,
  restored_at INTEGER,
  error_message TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_archive_catalog_space
  ON archive_catalog(original_space);

CREATE INDEX IF NOT EXISTS idx_archive_catalog_path
  ON archive_catalog(original_space, original_path);

CREATE INDEX IF NOT EXISTS idx_archive_catalog_location
  ON archive_catalog(archive_location_id);

CREATE INDEX IF NOT EXISTS idx_archive_catalog_status
  ON archive_catalog(status);

CREATE INDEX IF NOT EXISTS idx_archive_catalog_archived_at
  ON archive_catalog(archived_at);
