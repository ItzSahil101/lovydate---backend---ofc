ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS message_type VARCHAR(16) NOT NULL DEFAULT 'text',
  ADD COLUMN IF NOT EXISTS media_url TEXT,
  ADD COLUMN IF NOT EXISTS media_mime_type VARCHAR(100),
  ADD COLUMN IF NOT EXISTS media_size_bytes BIGINT,
  ADD COLUMN IF NOT EXISTS media_duration_seconds INT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'messages_message_type_check'
  ) THEN
    ALTER TABLE messages
      ADD CONSTRAINT messages_message_type_check
      CHECK (message_type IN ('text', 'image', 'audio', 'video'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_messages_conversation_created_desc
  ON messages (conversation_id, created_at DESC, id DESC);
