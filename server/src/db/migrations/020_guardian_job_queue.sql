-- Guardian event queue for worker-based processing
-- When GUARDIAN_WORKER_MODE=queue, the receiver stores raw payloads here
-- instead of parsing inline. Workers claim batches, parse, and return results.

CREATE TABLE IF NOT EXISTS guardian_event_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id TEXT NOT NULL UNIQUE,
  raw_payload TEXT NOT NULL,
  source_protocol TEXT NOT NULL DEFAULT 'elasticsearch',
  event_count_estimate INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'claimed', 'completed', 'failed')),
  claimed_by TEXT,
  claimed_at INTEGER,
  completed_at INTEGER,
  events_processed INTEGER,
  error_message TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_gq_status ON guardian_event_queue(status, created_at);
