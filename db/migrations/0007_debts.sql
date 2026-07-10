DO $$
BEGIN
  CREATE TYPE debt_direction AS ENUM ('receivable', 'payable');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE debt_status AS ENUM ('open', 'settled', 'cancelled');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS debts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  direction debt_direction NOT NULL,
  counterparty_id UUID NOT NULL REFERENCES counterparties(id) ON DELETE RESTRICT,
  amount NUMERIC(14,2) NOT NULL,
  currency CHAR(3) NOT NULL,
  concept TEXT,
  reminder_date TIMESTAMPTZ,
  status debt_status NOT NULL DEFAULT 'open',
  settled_at TIMESTAMPTZ,
  settled_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  settled_transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_debts_user_status ON debts(user_id, status);
CREATE INDEX IF NOT EXISTS idx_debts_reminder_date ON debts(user_id, reminder_date) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_debts_counterparty_open ON debts(counterparty_id) WHERE status = 'open';

ALTER TYPE review_reason ADD VALUE IF NOT EXISTS 'debt_match_ambiguous';
