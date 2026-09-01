-- Migration 004: Comment Replies
ALTER TABLE post_comments ADD COLUMN IF NOT EXISTS parent_comment_id UUID REFERENCES post_comments(id) ON DELETE CASCADE;
ALTER TABLE post_comments ADD COLUMN IF NOT EXISTS reply_to_user_id UUID REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_post_comments_parent ON post_comments(parent_comment_id);
