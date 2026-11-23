CREATE TABLE IF NOT EXISTS user_daily_activity (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  activity_date DATE NOT NULL DEFAULT CURRENT_DATE,
  PRIMARY KEY (user_id, activity_date)
);

CREATE INDEX IF NOT EXISTS idx_user_daily_activity_date
  ON user_daily_activity (activity_date);
