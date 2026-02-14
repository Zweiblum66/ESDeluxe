-- QoS Profiles & Alert Thresholds

-- Saved QoS configurations that can be applied on a schedule
CREATE TABLE IF NOT EXISTS qos_profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  storage_node_group TEXT NOT NULL,
  config_json TEXT NOT NULL,  -- JSON-serialized IQosConfig (pools + othersBandwidthLimit + qosEnabled)
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Scheduled profile activations (cron-based)
CREATE TABLE IF NOT EXISTS qos_schedules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_id INTEGER NOT NULL REFERENCES qos_profiles(id) ON DELETE CASCADE,
  cron_expression TEXT NOT NULL,  -- Standard 5-field cron expression
  enabled INTEGER NOT NULL DEFAULT 1,
  last_run_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Alert threshold definitions
CREATE TABLE IF NOT EXISTS qos_alert_thresholds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  storage_node_group TEXT NOT NULL,
  pool_name TEXT,  -- NULL = applies to 'others' / total
  threshold_bytes_per_sec INTEGER NOT NULL,
  direction TEXT NOT NULL DEFAULT 'above' CHECK(direction IN ('above', 'below')),
  enabled INTEGER NOT NULL DEFAULT 1,
  cooldown_minutes INTEGER NOT NULL DEFAULT 15,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Alert events log
CREATE TABLE IF NOT EXISTS qos_alert_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  threshold_id INTEGER NOT NULL REFERENCES qos_alert_thresholds(id) ON DELETE CASCADE,
  triggered_at INTEGER NOT NULL DEFAULT (unixepoch()),
  actual_bytes_per_sec INTEGER NOT NULL,
  acknowledged INTEGER NOT NULL DEFAULT 0,
  acknowledged_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_qos_alert_events_threshold
  ON qos_alert_events(threshold_id, triggered_at);

CREATE INDEX IF NOT EXISTS idx_qos_alert_events_unacked
  ON qos_alert_events(acknowledged, triggered_at);
