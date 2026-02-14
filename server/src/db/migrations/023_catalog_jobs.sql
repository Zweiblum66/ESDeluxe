-- Catalog job queue for proxy/thumbnail generation
-- Workers claim jobs from this queue and report results back to the server

CREATE TABLE IF NOT EXISTS catalog_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  asset_id INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  space_name TEXT NOT NULL,
  primary_file_path TEXT NOT NULL,
  asset_type TEXT NOT NULL,
  job_type TEXT NOT NULL DEFAULT 'full'
    CHECK (job_type IN ('full', 'proxy', 'metadata')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'claimed', 'processing', 'completed', 'failed')),
  worker_id TEXT,
  stage TEXT,
  error_message TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  claimed_at INTEGER,
  completed_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_catalog_jobs_status ON catalog_jobs(status);
CREATE INDEX IF NOT EXISTS idx_catalog_jobs_asset ON catalog_jobs(asset_id);

-- Track proxy jobs queued per scan
ALTER TABLE asset_scan_log ADD COLUMN jobs_queued INTEGER NOT NULL DEFAULT 0;
