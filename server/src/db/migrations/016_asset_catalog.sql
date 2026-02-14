-- Asset Catalog: logical grouping of related files into assets
-- Supports media workflows where video + audio tracks + sidecars = one asset

-- Assets: logical groupings of related files
CREATE TABLE IF NOT EXISTS assets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  space_name TEXT NOT NULL,
  directory_path TEXT NOT NULL,
  name TEXT NOT NULL,
  asset_type TEXT NOT NULL DEFAULT 'generic'
    CHECK (asset_type IN ('generic', 'video', 'audio', 'image', 'avid_mxf', 'sequence')),
  file_count INTEGER NOT NULL DEFAULT 0,
  total_size INTEGER NOT NULL DEFAULT 0,
  primary_file_id INTEGER,
  thumbnail_path TEXT,
  proxy_path TEXT,
  proxy_status TEXT NOT NULL DEFAULT 'none'
    CHECK (proxy_status IN ('none', 'queued', 'generating', 'ready', 'failed', 'unsupported')),
  metadata TEXT,
  first_seen_at INTEGER NOT NULL DEFAULT (unixepoch()),
  last_scanned_at INTEGER NOT NULL DEFAULT (unixepoch()),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_assets_space ON assets(space_name);
CREATE INDEX IF NOT EXISTS idx_assets_space_dir ON assets(space_name, directory_path);
CREATE INDEX IF NOT EXISTS idx_assets_name ON assets(name);
CREATE INDEX IF NOT EXISTS idx_assets_proxy_status ON assets(proxy_status);

-- Individual files belonging to an asset
CREATE TABLE IF NOT EXISTS asset_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  asset_id INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  space_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  file_mtime INTEGER NOT NULL,
  file_type TEXT NOT NULL DEFAULT 'unknown'
    CHECK (file_type IN ('video', 'audio', 'image', 'sidecar', 'metadata', 'unknown')),
  role TEXT NOT NULL DEFAULT 'component'
    CHECK (role IN ('primary', 'component', 'sidecar')),
  checksum TEXT,
  checksum_computed_at INTEGER,
  is_archive_stub INTEGER NOT NULL DEFAULT 0,
  inode INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(space_name, file_path)
);

CREATE INDEX IF NOT EXISTS idx_asset_files_asset ON asset_files(asset_id);
CREATE INDEX IF NOT EXISTS idx_asset_files_space_path ON asset_files(space_name, file_path);
CREATE INDEX IF NOT EXISTS idx_asset_files_checksum ON asset_files(checksum);

-- Scan history log
CREATE TABLE IF NOT EXISTS asset_scan_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  space_name TEXT NOT NULL,
  scan_type TEXT NOT NULL DEFAULT 'manual'
    CHECK (scan_type IN ('manual', 'scheduled')),
  status TEXT NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'completed', 'failed', 'cancelled')),
  files_discovered INTEGER NOT NULL DEFAULT 0,
  files_new INTEGER NOT NULL DEFAULT 0,
  files_updated INTEGER NOT NULL DEFAULT 0,
  files_removed INTEGER NOT NULL DEFAULT 0,
  assets_created INTEGER NOT NULL DEFAULT 0,
  assets_updated INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  started_at INTEGER NOT NULL DEFAULT (unixepoch()),
  completed_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_asset_scan_log_space ON asset_scan_log(space_name);

-- Per-space scan schedule configuration
CREATE TABLE IF NOT EXISTS asset_scan_config (
  space_name TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 0,
  interval_hours INTEGER NOT NULL DEFAULT 24,
  last_scan_at INTEGER,
  next_scan_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
