-- Trash management: stores metadata about files/directories moved to trash via EFS snapshots
CREATE TABLE IF NOT EXISTS trash_entries (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  space_name      TEXT    NOT NULL,
  original_path   TEXT    NOT NULL,
  original_name   TEXT    NOT NULL,
  entry_type      TEXT    NOT NULL CHECK (entry_type IN ('file', 'directory')),
  size_bytes      INTEGER NOT NULL DEFAULT 0,
  trash_path      TEXT    NOT NULL,
  deleted_at      INTEGER NOT NULL DEFAULT (unixepoch()),
  deleted_by      TEXT    NOT NULL DEFAULT 'system',
  expires_at      INTEGER NOT NULL,
  status          TEXT    NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'restoring', 'purging'))
);

-- Index for efficient queries by space, status, and expiry
CREATE INDEX IF NOT EXISTS idx_trash_space_status ON trash_entries (space_name, status);
CREATE INDEX IF NOT EXISTS idx_trash_expires ON trash_entries (expires_at) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_trash_deleted_at ON trash_entries (deleted_at);

-- App config entries for trash settings (uses existing app_config table)
INSERT OR IGNORE INTO app_config (key, value) VALUES ('trash.enabled', 'true');
INSERT OR IGNORE INTO app_config (key, value) VALUES ('trash.retention_days', '30');
INSERT OR IGNORE INTO app_config (key, value) VALUES ('trash.purge_interval_minutes', '60');
INSERT OR IGNORE INTO app_config (key, value) VALUES ('trash.max_size_bytes', '0');
