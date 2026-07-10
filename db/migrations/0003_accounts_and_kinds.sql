DO $$
BEGIN
  CREATE TYPE transaction_kind AS ENUM ('standard', 'transfer', 'adjustment');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE IF EXISTS categories
  ADD COLUMN IF NOT EXISTS include_in_analysis BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE IF EXISTS accounts
  ADD COLUMN IF NOT EXISTS opening_balance NUMERIC(14,2) NOT NULL DEFAULT 0;

ALTER TABLE IF EXISTS transactions
  ADD COLUMN IF NOT EXISTS kind transaction_kind NOT NULL DEFAULT 'standard';

ALTER TABLE IF EXISTS transactions
  ADD COLUMN IF NOT EXISTS include_in_totals BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE IF EXISTS transactions
  ADD COLUMN IF NOT EXISTS transfer_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_kind ON transactions(kind);

-- accounts already has UNIQUE (user_id, name) from the base schema
-- (auto-named accounts_user_id_name_key), so no new constraint is needed here.
