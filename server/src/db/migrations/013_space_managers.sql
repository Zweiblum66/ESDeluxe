-- Group-level space management delegation.
-- When a group is assigned as space manager, all members of that group
-- become space managers for the specified space.
-- User-level space managers are tracked via user_permission_overrides with access_type = 'admin'.

CREATE TABLE IF NOT EXISTS space_manager_groups (
  space_name TEXT NOT NULL,
  group_name TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  created_by TEXT,
  PRIMARY KEY (space_name, group_name)
);

CREATE INDEX idx_smg_space ON space_manager_groups(space_name);
CREATE INDEX idx_smg_group ON space_manager_groups(group_name);
