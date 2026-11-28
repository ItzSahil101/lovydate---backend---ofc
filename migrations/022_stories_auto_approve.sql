-- Automatically approve existing pending stories.
UPDATE stories
SET moderation_status = 'approved'
WHERE moderation_status = 'pending';
