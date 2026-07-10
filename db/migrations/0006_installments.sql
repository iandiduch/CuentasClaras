DO $$
BEGIN
  CREATE TYPE installment_plan_status AS ENUM ('active', 'cancelled');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS installment_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  concept TEXT NOT NULL,
  total_amount NUMERIC(14,2) NOT NULL,
  installments_count SMALLINT NOT NULL,
  installment_amount NUMERIC(14,2) NOT NULL,
  start_date TIMESTAMPTZ NOT NULL,
  currency CHAR(3) NOT NULL,
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  counterparty_id UUID REFERENCES counterparties(id) ON DELETE SET NULL,
  status installment_plan_status NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE IF EXISTS transactions
  ADD COLUMN IF NOT EXISTS installment_plan_id UUID REFERENCES installment_plans(id) ON DELETE SET NULL;

ALTER TABLE IF EXISTS transactions
  ADD COLUMN IF NOT EXISTS installment_number SMALLINT;

CREATE INDEX IF NOT EXISTS idx_installment_plans_user_status ON installment_plans(user_id, status);

CREATE INDEX IF NOT EXISTS idx_transactions_installment_plan ON transactions(installment_plan_id);

CREATE UNIQUE INDEX IF NOT EXISTS installment_plan_number_unique_idx
  ON transactions(installment_plan_id, installment_number)
  WHERE installment_plan_id IS NOT NULL;
