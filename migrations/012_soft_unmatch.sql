ALTER TABLE matches
  ADD COLUMN IF NOT EXISTS unmatched_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_matches_active_pair
  ON matches(user_one_id, user_two_id)
  WHERE unmatched_at IS NULL;