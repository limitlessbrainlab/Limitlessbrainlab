-- Migration: Add role_category column to coaches table
-- Required by CoachManagement admin panel and BrainCoach patient page

ALTER TABLE coaches ADD COLUMN IF NOT EXISTS role_category VARCHAR(100);

-- Index for filtering by role category
CREATE INDEX IF NOT EXISTS idx_coaches_role_category ON coaches(role_category);
