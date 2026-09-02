-- Migration 009: Public Support Tickets & Enhanced Staff Role Telemetry

ALTER TABLE support_cases ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE support_cases ADD COLUMN IF NOT EXISTS customer_name VARCHAR(120);
ALTER TABLE support_cases ADD COLUMN IF NOT EXISTS customer_email VARCHAR(255);

ALTER TABLE support_messages ALTER COLUMN sender_id DROP NOT NULL;
ALTER TABLE support_messages ADD COLUMN IF NOT EXISTS sender_name VARCHAR(120);
ALTER TABLE support_messages ADD COLUMN IF NOT EXISTS sender_role VARCHAR(64);

CREATE INDEX IF NOT EXISTS idx_support_cases_assigned ON support_cases(assigned_admin_id);
CREATE INDEX IF NOT EXISTS idx_support_cases_customer_email ON support_cases(customer_email);
