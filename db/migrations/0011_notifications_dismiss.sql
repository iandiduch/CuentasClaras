ALTER TABLE IF EXISTS notifications ADD COLUMN IF NOT EXISTS dismissed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_notifications_active ON notifications(user_id, created_at DESC) WHERE dismissed_at IS NULL;
