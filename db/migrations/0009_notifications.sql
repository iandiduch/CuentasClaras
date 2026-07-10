DO $$
BEGIN
  CREATE TYPE notification_type AS ENUM (
    'review_pending',
    'debt_reminder',
    'installment_due',
    'recurring_due',
    'budget_threshold'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type notification_type NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  link_href TEXT,
  related_entity_id UUID NOT NULL,
  period_key TEXT NOT NULL DEFAULT '',
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id, is_read, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS notifications_dedupe_idx
  ON notifications(user_id, type, related_entity_id, period_key);
