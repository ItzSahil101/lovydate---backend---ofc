-- Privacy Settings: Incognito Mode, Online Status, Distance Visibility
ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS is_incognito BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS show_online BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS show_distance BOOLEAN NOT NULL DEFAULT TRUE;
