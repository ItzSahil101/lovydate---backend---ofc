-- LovyDate Stories
-- Story media is stored in S3; PostgreSQL stores metadata and relationships.

CREATE TABLE IF NOT EXISTS stories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    media_key TEXT NOT NULL UNIQUE,
    media_type VARCHAR(10) NOT NULL CHECK (media_type IN ('image', 'video')),
    mime_type VARCHAR(100) NOT NULL,
    media_size_bytes BIGINT NOT NULL CHECK (media_size_bytes > 0),
    duration_seconds NUMERIC(6,2),
    caption VARCHAR(500),
    visibility VARCHAR(20) NOT NULL DEFAULT 'everyone'
        CHECK (visibility IN ('everyone', 'matches', 'selected')),
    moderation_status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (moderation_status IN ('pending', 'approved', 'rejected')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours'),
    deleted_at TIMESTAMPTZ,
    CONSTRAINT stories_video_duration_check CHECK (
        (media_type = 'image' AND duration_seconds IS NULL)
        OR
        (media_type = 'video' AND duration_seconds IS NOT NULL
            AND duration_seconds > 0 AND duration_seconds <= 40)
    )
);

CREATE INDEX IF NOT EXISTS idx_stories_user_created
    ON stories(user_id, created_at DESC)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_stories_active_expiry
    ON stories(expires_at)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_stories_active_visibility
    ON stories(visibility, created_at DESC)
    WHERE deleted_at IS NULL AND moderation_status = 'approved';

CREATE TABLE IF NOT EXISTS story_privacy_settings (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    default_visibility VARCHAR(20) NOT NULL DEFAULT 'everyone'
        CHECK (default_visibility IN ('everyone', 'matches', 'selected')),
    allow_replies BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS story_allowed_viewers (
    story_id UUID NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
    viewer_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (story_id, viewer_user_id)
);

CREATE INDEX IF NOT EXISTS idx_story_allowed_viewers_user
    ON story_allowed_viewers(viewer_user_id, story_id);

CREATE TABLE IF NOT EXISTS story_views (
    story_id UUID NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
    viewer_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    viewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (story_id, viewer_user_id)
);

CREATE INDEX IF NOT EXISTS idx_story_views_story_time
    ON story_views(story_id, viewed_at DESC);

CREATE TABLE IF NOT EXISTS story_reactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    story_id UUID NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reaction VARCHAR(16) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (story_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_story_reactions_story
    ON story_reactions(story_id, created_at DESC);

CREATE TABLE IF NOT EXISTS story_replies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    story_id UUID NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
    sender_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    message VARCHAR(500) NOT NULL,
    moderation_status VARCHAR(20) NOT NULL DEFAULT 'approved'
        CHECK (moderation_status IN ('pending', 'approved', 'rejected')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_story_replies_story_time
    ON story_replies(story_id, created_at DESC);

CREATE TABLE IF NOT EXISTS story_highlights (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(40) NOT NULL,
    cover_story_id UUID REFERENCES stories(id) ON DELETE SET NULL,
    display_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_story_highlights_user_order
    ON story_highlights(user_id, display_order, created_at DESC);

CREATE TABLE IF NOT EXISTS story_highlight_items (
    highlight_id UUID NOT NULL REFERENCES story_highlights(id) ON DELETE CASCADE,
    story_id UUID NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
    display_order INTEGER NOT NULL DEFAULT 0,
    added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (highlight_id, story_id)
);

CREATE INDEX IF NOT EXISTS idx_story_highlight_items_story
    ON story_highlight_items(story_id);

