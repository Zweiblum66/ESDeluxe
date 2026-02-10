-- Extend tiering rules to support archive as a target action
ALTER TABLE tiering_rules ADD COLUMN target_type TEXT NOT NULL DEFAULT 'goal_change'
  CHECK (target_type IN ('goal_change', 'archive'));

ALTER TABLE tiering_rules ADD COLUMN archive_location_id INTEGER
  REFERENCES archive_locations(id) ON DELETE SET NULL;
