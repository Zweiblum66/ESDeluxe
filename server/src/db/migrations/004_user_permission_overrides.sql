-- Track user-level permission overrides
-- When a user has an explicit permission that differs from their group inheritance,
-- we track it here to distinguish between inherited and overridden permissions

CREATE TABLE IF NOT EXISTS user_permission_overrides (
  space_name TEXT NOT NULL,
  username TEXT NOT NULL,
  access_type TEXT NOT NULL CHECK (access_type IN ('readonly', 'readwrite', 'admin')),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (space_name, username)
);

CREATE INDEX idx_user_overrides_space ON user_permission_overrides(space_name);
CREATE INDEX idx_user_overrides_user ON user_permission_overrides(username);
