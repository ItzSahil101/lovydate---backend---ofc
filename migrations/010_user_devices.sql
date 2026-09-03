-- Migration 010: Ensure user_devices table exists for FCM push notifications
CREATE TABLE IF NOT EXISTS user_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_token TEXT NOT NULL,
  platform VARCHAR(32) DEFAULT 'android',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, device_token)
);

CREATE INDEX IF NOT EXISTS idx_user_devices_user_id ON user_devices(user_id);
CREATE INDEX IF NOT EXISTS idx_user_devices_device_token ON user_devices(device_token);

-- Migrate any tokens from push_devices if push_devices table exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'push_devices') THEN
    INSERT INTO user_devices (user_id, device_token, platform, updated_at)
    SELECT user_id, fcm_token, platform, COALESCE(last_active_at, created_at, NOW())
    FROM push_devices
    ON CONFLICT (user_id, device_token) DO NOTHING;
  END IF;
END $$;
