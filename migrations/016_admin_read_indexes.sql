-- Keep the most common management-console reads below the API statement
-- timeout as the user and notification tables grow.
CREATE INDEX IF NOT EXISTS idx_users_created_at_desc
  ON users (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_profiles_last_active_at_desc
  ON profiles (last_active_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_profile_photos_primary_user
  ON profile_photos (user_id)
  WHERE is_primary = true;

CREATE INDEX IF NOT EXISTS idx_notification_campaigns_recent_sent
  ON notification_campaigns (sent_at DESC NULLS LAST)
  WHERE status IN ('SENT', 'SENDING');

CREATE INDEX IF NOT EXISTS idx_notification_templates_name
  ON notification_templates (name);
