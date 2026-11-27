-- Reliable cleanup tracking for deleted and expired story media.

ALTER TABLE stories
    ADD COLUMN IF NOT EXISTS media_deleted_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS cleanup_attempts INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS cleanup_last_error TEXT,
    ADD COLUMN IF NOT EXISTS cleanup_next_attempt_at TIMESTAMPTZ;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'stories_cleanup_attempts_check'
          AND conrelid = 'stories'::regclass
    ) THEN
        ALTER TABLE stories
            ADD CONSTRAINT stories_cleanup_attempts_check
            CHECK (cleanup_attempts >= 0);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_stories_pending_media_cleanup
    ON stories(cleanup_next_attempt_at, expires_at)
    WHERE media_deleted_at IS NULL;

