-- Add priority column to archive_locations for restore ordering.
-- Lower number = higher priority (tried first during restore).
ALTER TABLE archive_locations ADD COLUMN priority INTEGER NOT NULL DEFAULT 50;
