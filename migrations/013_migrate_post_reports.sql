DO $$
BEGIN
  IF to_regclass('public.post_reports') IS NOT NULL THEN
    INSERT INTO reports (
      reporter_user_id, reported_user_id, reason, category, target_type, target_id, created_at
    )
    SELECT pr.user_id, p.user_id, COALESCE(pr.reason, 'Inappropriate content'),
           'Inappropriate Content', 'post', p.id::text, COALESCE(pr.created_at, NOW())
    FROM post_reports pr
    JOIN posts p ON p.id = pr.post_id
    WHERE NOT EXISTS (
      SELECT 1
      FROM reports r
      WHERE r.reporter_user_id = pr.user_id
        AND r.target_type = 'post'
        AND r.target_id = pr.post_id::text
        AND r.created_at = pr.created_at
    );
  END IF;
END $$;