-- Per-space, per-user capability flags for limited admins (space managers).
-- When a manager has no row here, they get full capabilities (backward-compatible).
CREATE TABLE IF NOT EXISTS manager_capabilities (
  space_name TEXT NOT NULL,
  username TEXT NOT NULL,
  can_manage_users INTEGER NOT NULL DEFAULT 1,
  can_manage_groups INTEGER NOT NULL DEFAULT 1,
  can_manage_quota INTEGER NOT NULL DEFAULT 1,
  max_quota_bytes INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (space_name, username)
);
