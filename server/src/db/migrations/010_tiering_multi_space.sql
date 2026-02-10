-- Multi-space selector support for tiering rules
-- Adds a JSON column to store the space selector (explicit list, by_type, pattern, or all)

ALTER TABLE tiering_rules ADD COLUMN space_selector TEXT;

-- Migrate existing single-space rules to the new JSON format
UPDATE tiering_rules
SET space_selector = json_object('mode', 'explicit', 'spaceNames', json_array(space_name))
WHERE space_selector IS NULL;

-- Note: space_name column is kept as a denormalized value for backward compatibility
-- and efficient single-space lookups. For multi-space rules, space_name will be NULL.
