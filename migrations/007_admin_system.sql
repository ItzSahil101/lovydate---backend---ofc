-- Migration 007: LovyDate Admin System, RBAC, Moderation, Campaigns, App Config, Feature Flags, Support & Audit

-- 1. Admin RBAC & Identity
CREATE TABLE IF NOT EXISTS admin_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  display_name VARCHAR(100) NOT NULL,
  avatar_url TEXT,
  status VARCHAR(32) NOT NULL DEFAULT 'active', -- 'active', 'disabled'
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS admin_roles (
  id VARCHAR(64) PRIMARY KEY, -- 'SUPER_ADMIN', 'ADMIN', 'MODERATOR', 'CONTENT_MODERATOR', 'SUPPORT', 'MARKETING', 'ANALYST', 'READ_ONLY'
  name VARCHAR(100) NOT NULL,
  description TEXT,
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS admin_permissions (
  id VARCHAR(64) PRIMARY KEY, -- e.g. 'users.read', 'users.suspend', etc.
  category VARCHAR(64) NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS admin_role_permissions (
  role_id VARCHAR(64) REFERENCES admin_roles(id) ON DELETE CASCADE,
  permission_id VARCHAR(64) REFERENCES admin_permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS admin_user_roles (
  admin_id UUID REFERENCES admin_users(id) ON DELETE CASCADE,
  role_id VARCHAR(64) REFERENCES admin_roles(id) ON DELETE CASCADE,
  assigned_by UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (admin_id, role_id)
);

CREATE TABLE IF NOT EXISTS admin_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID REFERENCES admin_users(id) ON DELETE CASCADE,
  token_hash VARCHAR(255) NOT NULL UNIQUE,
  ip_address VARCHAR(45),
  user_agent TEXT,
  last_active_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS admin_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  admin_email VARCHAR(255),
  action VARCHAR(100) NOT NULL,
  target_type VARCHAR(64),
  target_id VARCHAR(128),
  reason TEXT,
  details JSONB DEFAULT '{}',
  ip_address VARCHAR(45),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Enhanced Moderation & User Restrictions
CREATE TABLE IF NOT EXISTS user_restrictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  restriction_type VARCHAR(64) NOT NULL, -- 'ACCOUNT_SUSPENSION', 'MESSAGING_DISABLED', 'FEED_POSTING_DISABLED', 'PROFILE_REVIEW_REQUIRED'
  reason VARCHAR(255) NOT NULL,
  internal_note TEXT,
  admin_id UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  expires_at TIMESTAMPTZ, -- null = permanent
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_warnings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  reason VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  admin_id UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  is_acknowledged BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS moderation_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type VARCHAR(64) NOT NULL, -- 'user', 'report', 'post', 'appeal', 'case'
  entity_id VARCHAR(128) NOT NULL,
  admin_id UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  note TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS moderation_appeals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  restriction_id UUID REFERENCES user_restrictions(id) ON DELETE SET NULL,
  appeal_type VARCHAR(64) NOT NULL, -- 'suspension', 'content_removal', 'restriction'
  reason TEXT NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'pending', -- 'pending', 'in_review', 'approved', 'rejected'
  assigned_admin_id UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  resolution_note TEXT,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enhance reports table with priority, status, category, assigned moderator, resolution fields
ALTER TABLE reports ADD COLUMN IF NOT EXISTS priority VARCHAR(32) NOT NULL DEFAULT 'medium'; -- 'critical', 'high', 'medium', 'low'
ALTER TABLE reports ADD COLUMN IF NOT EXISTS status VARCHAR(32) NOT NULL DEFAULT 'open'; -- 'open', 'in_review', 'resolved', 'dismissed'
ALTER TABLE reports ADD COLUMN IF NOT EXISTS category VARCHAR(64) DEFAULT 'Harassment';
ALTER TABLE reports ADD COLUMN IF NOT EXISTS target_type VARCHAR(64) DEFAULT 'user'; -- 'user', 'profile_photo', 'post', 'comment', 'chat'
ALTER TABLE reports ADD COLUMN IF NOT EXISTS target_id VARCHAR(128);
ALTER TABLE reports ADD COLUMN IF NOT EXISTS assigned_admin_id UUID REFERENCES admin_users(id) ON DELETE SET NULL;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS resolution_type VARCHAR(64);
ALTER TABLE reports ADD COLUMN IF NOT EXISTS resolution_note TEXT;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;

-- Enhance posts, comments, profile_photos with moderation status
ALTER TABLE posts ADD COLUMN IF NOT EXISTS moderation_status VARCHAR(32) NOT NULL DEFAULT 'approved'; -- 'approved', 'pending_review', 'removed'
ALTER TABLE posts ADD COLUMN IF NOT EXISTS is_comments_disabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE post_comments ADD COLUMN IF NOT EXISTS moderation_status VARCHAR(32) NOT NULL DEFAULT 'approved';
ALTER TABLE profile_photos ADD COLUMN IF NOT EXISTS moderation_status VARCHAR(32) NOT NULL DEFAULT 'approved'; -- 'approved', 'pending_review', 'rejected'

-- 3. Notification Campaigns, Audiences, Templates, Announcements & Segments
CREATE TABLE IF NOT EXISTS notification_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  title VARCHAR(255) NOT NULL,
  body TEXT NOT NULL,
  destination_type VARCHAR(64) NOT NULL DEFAULT 'open_app',
  destination_data JSONB DEFAULT '{}',
  created_by UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS admin_segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  description TEXT,
  filters JSONB NOT NULL DEFAULT '{}',
  estimated_count INT NOT NULL DEFAULT 0,
  created_by UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notification_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(150) NOT NULL,
  title VARCHAR(255) NOT NULL,
  body TEXT NOT NULL,
  image_key TEXT,
  destination_type VARCHAR(64) NOT NULL DEFAULT 'open_app', -- 'open_app', 'discovery', 'matches', 'chat', 'feed', 'profile', 'deep_link'
  destination_data JSONB DEFAULT '{}',
  audience_type VARCHAR(64) NOT NULL DEFAULT 'everyone', -- 'everyone', 'segment', 'custom', 'selected'
  audience_filters JSONB DEFAULT '{}',
  segment_id UUID REFERENCES admin_segments(id) ON DELETE SET NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'DRAFT', -- 'DRAFT', 'SCHEDULED', 'SENDING', 'SENT', 'CANCELLED', 'FAILED'
  scheduled_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  audience_count INT NOT NULL DEFAULT 0,
  sent_count INT NOT NULL DEFAULT 0,
  delivered_count INT NOT NULL DEFAULT 0,
  opened_count INT NOT NULL DEFAULT 0,
  failed_count INT NOT NULL DEFAULT 0,
  created_by UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notification_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES notification_campaigns(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(32) NOT NULL DEFAULT 'pending', -- 'pending', 'sent', 'delivered', 'failed', 'opened'
  error_message TEXT,
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS push_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  fcm_token TEXT NOT NULL UNIQUE,
  platform VARCHAR(32) NOT NULL DEFAULT 'android', -- 'android', 'ios', 'web'
  app_version VARCHAR(32),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_active_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  type VARCHAR(32) NOT NULL DEFAULT 'INFO', -- 'INFO', 'FEATURE', 'WARNING', 'MAINTENANCE'
  image_url TEXT,
  cta_label VARCHAR(100),
  cta_destination VARCHAR(255),
  cta_data JSONB DEFAULT '{}',
  audience_type VARCHAR(64) NOT NULL DEFAULT 'everyone',
  audience_filters JSONB DEFAULT '{}',
  priority INT NOT NULL DEFAULT 1,
  dismissible BOOLEAN NOT NULL DEFAULT TRUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  start_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  end_date TIMESTAMPTZ,
  created_by UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. App Configuration, Feature Flags, Support Desk & Daily Analytics Aggregates
CREATE TABLE IF NOT EXISTS app_config (
  key VARCHAR(100) PRIMARY KEY,
  value JSONB NOT NULL,
  description TEXT,
  is_public BOOLEAN NOT NULL DEFAULT FALSE,
  category VARCHAR(64) NOT NULL DEFAULT 'general',
  updated_by UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS feature_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key VARCHAR(100) UNIQUE NOT NULL,
  name VARCHAR(150) NOT NULL,
  description TEXT,
  is_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  rollout_percentage INT NOT NULL DEFAULT 100 CHECK (rollout_percentage >= 0 AND rollout_percentage <= 100),
  platforms TEXT[] DEFAULT ARRAY['android', 'ios', 'web'],
  min_app_version VARCHAR(32),
  updated_by UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS support_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  subject VARCHAR(255) NOT NULL,
  category VARCHAR(64) NOT NULL DEFAULT 'General',
  priority VARCHAR(32) NOT NULL DEFAULT 'medium',
  status VARCHAR(32) NOT NULL DEFAULT 'open', -- 'open', 'waiting', 'resolved'
  assigned_admin_id UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  resolution_summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS support_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID REFERENCES support_cases(id) ON DELETE CASCADE,
  sender_type VARCHAR(32) NOT NULL, -- 'user', 'admin'
  sender_id UUID NOT NULL,
  message TEXT NOT NULL,
  attachments JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS support_internal_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID REFERENCES support_cases(id) ON DELETE CASCADE,
  admin_id UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  note TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS analytics_daily (
  date DATE PRIMARY KEY,
  total_users INT NOT NULL DEFAULT 0,
  new_users INT NOT NULL DEFAULT 0,
  active_users INT NOT NULL DEFAULT 0,
  verified_users INT NOT NULL DEFAULT 0,
  likes INT NOT NULL DEFAULT 0,
  matches INT NOT NULL DEFAULT 0,
  messages INT NOT NULL DEFAULT 0,
  feed_posts INT NOT NULL DEFAULT 0,
  feed_views INT NOT NULL DEFAULT 0,
  reports INT NOT NULL DEFAULT 0,
  suspensions INT NOT NULL DEFAULT 0,
  notifications_sent INT NOT NULL DEFAULT 0,
  metrics_json JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Indexes for fast operational querying & search
CREATE INDEX IF NOT EXISTS idx_admin_sessions_token ON admin_sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_admin ON admin_sessions(admin_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_created ON admin_audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_admin_created ON admin_audit_logs(admin_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_action ON admin_audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_user_restrictions_active ON user_restrictions(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_reports_status_created ON reports(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_priority_created ON reports(priority, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_reported_user ON reports(reported_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notification_campaigns_status ON notification_campaigns(status, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_support_cases_status_created ON support_cases(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_messages_case ON support_messages(case_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_moderation_appeals_status ON moderation_appeals(status, created_at DESC);

-- 6. Seed Permissions
INSERT INTO admin_permissions (id, category, description) VALUES
  ('dashboard.read', 'dashboard', 'View operational dashboard and live statistics'),
  ('users.read', 'users', 'View user accounts, profiles, and activity timeline'),
  ('users.warn', 'users', 'Issue official warnings to users'),
  ('users.restrict', 'users', 'Apply or modify account restrictions'),
  ('users.suspend', 'users', 'Suspend or unsuspend user accounts'),
  ('users.delete', 'users', 'Deactivate or delete user accounts'),
  ('reports.read', 'reports', 'View user reports and moderation queue'),
  ('reports.assign', 'reports', 'Assign reports to moderators'),
  ('reports.resolve', 'reports', 'Resolve, dismiss, or escalate reports'),
  ('content.read', 'content', 'Inspect feed posts, photos, comments, and profile content'),
  ('content.remove', 'content', 'Remove violating content'),
  ('content.restore', 'content', 'Restore previously removed content'),
  ('appeals.read', 'appeals', 'View suspension and content appeals'),
  ('appeals.resolve', 'appeals', 'Approve or reject user appeals'),
  ('notifications.read', 'notifications', 'View notification delivery logs and campaign stats'),
  ('notifications.send', 'notifications', 'Send direct and test push notifications'),
  ('campaigns.read', 'campaigns', 'View notification campaigns'),
  ('campaigns.create', 'campaigns', 'Create notification campaigns'),
  ('campaigns.send', 'campaigns', 'Send or schedule mass notification campaigns'),
  ('campaigns.cancel', 'campaigns', 'Cancel scheduled campaigns'),
  ('announcements.read', 'announcements', 'View in-app announcements'),
  ('announcements.manage', 'announcements', 'Create, edit, or delete in-app announcements'),
  ('segments.read', 'segments', 'View saved audience segments'),
  ('segments.manage', 'segments', 'Create and modify audience segments'),
  ('feed.read', 'feed', 'View and search feed posts'),
  ('feed.moderate', 'feed', 'Manage, remove, and moderate feed content'),
  ('interests.read', 'interests', 'View available interests list'),
  ('interests.manage', 'interests', 'Add, edit, enable, disable, and reorder interests'),
  ('analytics.read', 'analytics', 'View platform growth, funnel, retention, and engagement analytics'),
  ('config.read', 'config', 'View app runtime configuration'),
  ('config.write', 'config', 'Update remote app configuration'),
  ('feature_flags.read', 'feature_flags', 'View feature flags and rollout percentages'),
  ('feature_flags.write', 'feature_flags', 'Create and toggle feature flags'),
  ('system.read', 'system', 'View system health, database metrics, and Redis metrics'),
  ('jobs.read', 'jobs', 'Inspect BullMQ background queues and jobs'),
  ('jobs.retry', 'jobs', 'Retry or discard failed background jobs'),
  ('audit.read', 'audit', 'View administrative audit logs'),
  ('admins.read', 'admins', 'View staff admin accounts and sessions'),
  ('admins.manage', 'admins', 'Create, edit, disable admin accounts and revoke sessions'),
  ('roles.read', 'roles', 'View RBAC roles and permissions'),
  ('roles.manage', 'roles', 'Create and modify RBAC roles and permission assignments'),
  ('support.read', 'support', 'View customer support tickets and user inquiries'),
  ('support.manage', 'support', 'Reply to support tickets, add internal notes, and resolve cases')
ON CONFLICT (id) DO NOTHING;

-- 7. Seed System Roles
INSERT INTO admin_roles (id, name, description, is_system) VALUES
  ('SUPER_ADMIN', 'Super Administrator', 'Full unrestricted control over all LovyDate systems, staff, and configurations', TRUE),
  ('ADMIN', 'Administrator', 'Full administrative access across operations, moderation, content, and analytics', TRUE),
  ('MODERATOR', 'Lead Moderator', 'Moderation lead with authority to review reports, suspend accounts, and handle appeals', TRUE),
  ('CONTENT_MODERATOR', 'Content Moderator', 'Content review specialist handling feed, photos, and comment moderation', TRUE),
  ('SUPPORT', 'Support Agent', 'Customer support specialist handling tickets and inquiries', TRUE),
  ('MARKETING', 'Marketing Manager', 'Audience segmentation, push campaigns, and announcement management', TRUE),
  ('ANALYST', 'Data Analyst', 'Read-only analytics, reporting, and dashboard insights access', TRUE),
  ('READ_ONLY', 'Read Only Staff', 'Read-only inspection access across safe platform areas', TRUE)
ON CONFLICT (id) DO NOTHING;

-- Assign all permissions to SUPER_ADMIN
INSERT INTO admin_role_permissions (role_id, permission_id)
SELECT 'SUPER_ADMIN', id FROM admin_permissions
ON CONFLICT DO NOTHING;

-- Assign ADMIN permissions (all except admin/role management)
INSERT INTO admin_role_permissions (role_id, permission_id)
SELECT 'ADMIN', id FROM admin_permissions
WHERE id NOT IN ('admins.manage', 'roles.manage')
ON CONFLICT DO NOTHING;

-- Assign MODERATOR permissions
INSERT INTO admin_role_permissions (role_id, permission_id) VALUES
  ('MODERATOR', 'dashboard.read'),
  ('MODERATOR', 'users.read'),
  ('MODERATOR', 'users.warn'),
  ('MODERATOR', 'users.restrict'),
  ('MODERATOR', 'users.suspend'),
  ('MODERATOR', 'reports.read'),
  ('MODERATOR', 'reports.assign'),
  ('MODERATOR', 'reports.resolve'),
  ('MODERATOR', 'content.read'),
  ('MODERATOR', 'content.remove'),
  ('MODERATOR', 'content.restore'),
  ('MODERATOR', 'appeals.read'),
  ('MODERATOR', 'appeals.resolve'),
  ('MODERATOR', 'feed.read'),
  ('MODERATOR', 'feed.moderate'),
  ('MODERATOR', 'support.read')
ON CONFLICT DO NOTHING;

-- Assign CONTENT_MODERATOR permissions
INSERT INTO admin_role_permissions (role_id, permission_id) VALUES
  ('CONTENT_MODERATOR', 'dashboard.read'),
  ('CONTENT_MODERATOR', 'reports.read'),
  ('CONTENT_MODERATOR', 'reports.resolve'),
  ('CONTENT_MODERATOR', 'content.read'),
  ('CONTENT_MODERATOR', 'content.remove'),
  ('CONTENT_MODERATOR', 'content.restore'),
  ('CONTENT_MODERATOR', 'feed.read'),
  ('CONTENT_MODERATOR', 'feed.moderate')
ON CONFLICT DO NOTHING;

-- Assign SUPPORT permissions
INSERT INTO admin_role_permissions (role_id, permission_id) VALUES
  ('SUPPORT', 'dashboard.read'),
  ('SUPPORT', 'users.read'),
  ('SUPPORT', 'support.read'),
  ('SUPPORT', 'support.manage'),
  ('SUPPORT', 'reports.read'),
  ('SUPPORT', 'appeals.read')
ON CONFLICT DO NOTHING;

-- Assign MARKETING permissions
INSERT INTO admin_role_permissions (role_id, permission_id) VALUES
  ('MARKETING', 'dashboard.read'),
  ('MARKETING', 'notifications.read'),
  ('MARKETING', 'notifications.send'),
  ('MARKETING', 'campaigns.read'),
  ('MARKETING', 'campaigns.create'),
  ('MARKETING', 'campaigns.send'),
  ('MARKETING', 'campaigns.cancel'),
  ('MARKETING', 'announcements.read'),
  ('MARKETING', 'announcements.manage'),
  ('MARKETING', 'segments.read'),
  ('MARKETING', 'segments.manage'),
  ('MARKETING', 'analytics.read')
ON CONFLICT DO NOTHING;

-- Assign ANALYST permissions
INSERT INTO admin_role_permissions (role_id, permission_id) VALUES
  ('ANALYST', 'dashboard.read'),
  ('ANALYST', 'analytics.read'),
  ('ANALYST', 'campaigns.read'),
  ('ANALYST', 'feed.read'),
  ('ANALYST', 'system.read')
ON CONFLICT DO NOTHING;

-- Assign READ_ONLY permissions
INSERT INTO admin_role_permissions (role_id, permission_id) VALUES
  ('READ_ONLY', 'dashboard.read'),
  ('READ_ONLY', 'users.read'),
  ('READ_ONLY', 'reports.read'),
  ('READ_ONLY', 'content.read'),
  ('READ_ONLY', 'feed.read'),
  ('READ_ONLY', 'interests.read'),
  ('READ_ONLY', 'campaigns.read'),
  ('READ_ONLY', 'announcements.read'),
  ('READ_ONLY', 'segments.read'),
  ('READ_ONLY', 'config.read'),
  ('READ_ONLY', 'feature_flags.read'),
  ('READ_ONLY', 'system.read'),
  ('READ_ONLY', 'audit.read'),
  ('READ_ONLY', 'support.read')
ON CONFLICT DO NOTHING;

-- 8. Seed Default Super Admin Account
INSERT INTO admin_users (id, email, password_hash, display_name, status)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'sameerlamichhane00@gmail.com',
  '$2a$12$NqLsp.n8mFh71bH5Lgq5/ecF/o4jA1GgG7YI0W7Jv9pB9P5P5rKye',
  'Sameer Lamichhane',
  'active'
)
ON CONFLICT (email) DO NOTHING;

INSERT INTO admin_user_roles (admin_id, role_id)
VALUES ('00000000-0000-0000-0000-000000000001', 'SUPER_ADMIN')
ON CONFLICT DO NOTHING;

-- 9. Seed Default App Config
INSERT INTO app_config (key, value, description, is_public, category) VALUES
  ('registration_enabled', 'true'::jsonb, 'Allow new user registrations', TRUE, 'auth'),
  ('discovery_enabled', 'true'::jsonb, 'Enable discovery matching feed', TRUE, 'discovery'),
  ('feed_enabled', 'true'::jsonb, 'Enable public community feed', TRUE, 'feed'),
  ('chat_enabled', 'true'::jsonb, 'Enable direct messaging between matches', TRUE, 'chat'),
  ('maintenance_banner', '{"enabled": false, "message": "Scheduled maintenance in progress"}'::jsonb, 'System maintenance broadcast', TRUE, 'system'),
  ('min_supported_app_version', '"1.0.0"'::jsonb, 'Minimum client app version allowed', TRUE, 'app'),
  ('latest_app_version', '"1.2.0"'::jsonb, 'Current latest app store version', TRUE, 'app'),
  ('force_update', 'false'::jsonb, 'Force users on older versions to update', TRUE, 'app'),
  ('max_profile_photos', '6'::jsonb, 'Maximum number of photos per profile', TRUE, 'profile'),
  ('min_required_photos', '1'::jsonb, 'Minimum photos required to complete onboarding', TRUE, 'profile'),
  ('min_interests', '3'::jsonb, 'Minimum number of interests required', TRUE, 'profile'),
  ('max_interests', '10'::jsonb, 'Maximum number of interests selectable', TRUE, 'profile'),
  ('discovery_min_distance', '1'::jsonb, 'Minimum discovery distance slider value in km', TRUE, 'discovery'),
  ('discovery_max_distance', '100'::jsonb, 'Maximum discovery distance slider value in km', TRUE, 'discovery')
ON CONFLICT (key) DO NOTHING;

-- 10. Seed Default Feature Flags
INSERT INTO feature_flags (key, name, description, is_enabled, rollout_percentage, platforms) VALUES
  ('feed_v2', 'Feed V2 Experience', 'Modernized feed layout with interactive poll support', TRUE, 100, ARRAY['android', 'ios', 'web']),
  ('new_discovery_ui', 'Revamped Discovery Cards', 'High visual fidelity card stack and interactive gestures', TRUE, 100, ARRAY['android', 'ios']),
  ('profile_verification', 'Selfie Photo Verification', 'AI & manual selfie face verification badge system', TRUE, 100, ARRAY['android', 'ios']),
  ('experimental_matching', 'AI Smart Matching Algorithm', 'Interest graph and compatibility clustering recommendation', FALSE, 25, ARRAY['android', 'ios'])
ON CONFLICT (key) DO NOTHING;

-- 11. Seed Notification Templates
INSERT INTO notification_templates (name, title, body, destination_type) VALUES
  ('Come Back Reminder', 'Someone might be waiting for you 💕', 'Jump back into LovyDate and see who liked your profile today!', 'discovery'),
  ('Weekend Matches', 'It''s Match Weekend! ✨', 'Activity is peaking right now. Swipe now to find your vibe for the weekend.', 'discovery'),
  ('Profile Polish Reminder', 'Make your profile stand out 🌟', 'Profiles with 4+ photos and 5 interests get 3.2x more matches.', 'profile'),
  ('Community Feed Spotlight', 'New stories shared near you 📸', 'Explore the community feed to see real moments and spark conversations.', 'feed'),
  ('Safety Reminder', 'Your safety is our top priority 🛡️', 'Remember to never share financial information and report suspicious profiles.', 'open_app')
ON CONFLICT DO NOTHING;

-- 12. Seed Reusable Audience Segments
INSERT INTO admin_segments (name, description, filters, estimated_count) VALUES
  ('All Active Users', 'Users active within the last 7 days', '{"status": "active", "active_within_days": 7}'::jsonb, 3420),
  ('New Signups (Last 48h)', 'Users registered in the past 48 hours', '{"created_within_hours": 48}'::jsonb, 240),
  ('Incomplete Onboarding', 'Users who registered but did not finish profile setup', '{"onboarding_completed": false}'::jsonb, 115),
  ('Zero Matches', 'Users who have sent likes but have not matched yet', '{"has_matches": false}'::jsonb, 480),
  ('Active Feed Posters', 'Users who have posted in the community feed', '{"has_feed_posts": true}'::jsonb, 890)
ON CONFLICT DO NOTHING;
