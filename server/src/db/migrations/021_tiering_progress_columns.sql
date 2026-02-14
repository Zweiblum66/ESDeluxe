-- Add progress tracking columns to tiering_execution_log
ALTER TABLE tiering_execution_log ADD COLUMN total_files INTEGER DEFAULT 0;
ALTER TABLE tiering_execution_log ADD COLUMN current_file TEXT;
ALTER TABLE tiering_execution_log ADD COLUMN updated_at INTEGER;
