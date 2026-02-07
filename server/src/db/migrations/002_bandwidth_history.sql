CREATE TABLE IF NOT EXISTS bandwidth_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp INTEGER NOT NULL DEFAULT (unixepoch()),
  pool_name TEXT NOT NULL,
  bytes_per_sec INTEGER NOT NULL,
  storage_node_group TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_bw_timestamp ON bandwidth_history(timestamp);
CREATE INDEX IF NOT EXISTS idx_bw_pool ON bandwidth_history(pool_name);
