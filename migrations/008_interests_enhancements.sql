-- Migration 008: Add is_active and sort_order to interests table

ALTER TABLE interests ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
ALTER TABLE interests ADD COLUMN IF NOT EXISTS sort_order INT DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_interests_is_active ON interests(is_active);
CREATE INDEX IF NOT EXISTS idx_interests_sort_order ON interests(sort_order);
