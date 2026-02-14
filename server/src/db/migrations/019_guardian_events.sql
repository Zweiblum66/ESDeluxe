-- EFS Guardian / Control log event ingestion
-- Stores events forwarded from the EditShare OpenSearch stack

CREATE TABLE IF NOT EXISTS guardian_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  received_at INTEGER NOT NULL DEFAULT (unixepoch()),
  event_type TEXT NOT NULL,         -- 'storage' | 'system' | 'file_audit'
  event_action TEXT,                -- e.g. 'read', 'write', 'delete', 'login', 'pool_change', ...
  timestamp TEXT,                   -- Original event timestamp from Guardian
  source_host TEXT,                 -- Host that generated the event
  username TEXT,                    -- User involved (if applicable)
  space_name TEXT,                  -- Media space (if applicable)
  pool_name TEXT,                   -- QoS pool (if applicable)
  storage_node_group TEXT,          -- Storage node group (if applicable)
  file_path TEXT,                   -- File path (for file audit events)
  bytes_transferred INTEGER,        -- Bytes involved (for storage events)
  client_ip TEXT,                   -- Client IP address
  details_json TEXT,                -- Full original event payload as JSON
  severity TEXT DEFAULT 'info'      -- 'debug' | 'info' | 'warn' | 'error'
);

CREATE INDEX IF NOT EXISTS idx_guardian_events_type_ts
  ON guardian_events(event_type, received_at);

CREATE INDEX IF NOT EXISTS idx_guardian_events_username
  ON guardian_events(username, received_at);

CREATE INDEX IF NOT EXISTS idx_guardian_events_space
  ON guardian_events(space_name, received_at);

CREATE INDEX IF NOT EXISTS idx_guardian_events_action
  ON guardian_events(event_action, received_at);
