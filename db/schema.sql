-- CuentasClaras - PostgreSQL schema (MVP + ingestion/review pipeline)
--
-- This is a cumulative, idempotent snapshot of the full schema — the
-- fastest way to bootstrap a brand-new database (fresh dev setup, CI):
--   psql "$DATABASE_URL" -f db/schema.sql
-- Several files under db/migrations/ ALTER tables that are only ever
-- CREATEd here, so `npm run db:migrate` alone cannot bootstrap an empty
-- database — it's for bringing an EXISTING database (one that already has
-- an older snapshot of this file applied) up to date incrementally.
--
-- Source of truth for the schema itself is lib/server/schema.ts (Drizzle).
-- Whenever a new db/migrations/NNNN_*.sql file ships, fold the same change
-- in here too, so this stays a readable one-shot snapshot instead of
-- quietly drifting out of date (that happened once already — the shopping
-- tables were missing from this file for a while).

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

DO $$
BEGIN
  CREATE TYPE txn_direction AS ENUM ('income', 'expense');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE txn_status AS ENUM ('auto_confirmed', 'pending_review', 'manually_confirmed', 'rejected');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE category_direction AS ENUM ('income', 'expense', 'both');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE document_status AS ENUM ('uploaded', 'processing', 'processed', 'failed', 'archived');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE document_source AS ENUM ('api', 'pwa_manual_upload', 'email_forward', 'other');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE review_status AS ENUM ('pending', 'in_progress', 'resolved', 'dismissed');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE review_reason AS ENUM (
    'unknown_category',
    'low_confidence',
    'missing_fields',
    'identity_ambiguous',
    'counterparty_ambiguous',
    'account_ambiguous',
    'other',
    'debt_match_ambiguous',
    'recurring_match_ambiguous'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE rule_match_type AS ENUM ('exact', 'contains', 'regex');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE rule_mode AS ENUM ('fixed_category', 'always_review');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE ingest_job_status AS ENUM ('pending', 'processing', 'completed', 'failed', 'retry');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE identity_kind AS ENUM ('person_name', 'phone', 'email', 'tax_id', 'bank_account', 'alias', 'cbu', 'cvu', 'other');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE transaction_kind AS ENUM ('standard', 'transfer', 'adjustment');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE installment_plan_status AS ENUM ('active', 'cancelled');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

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

DO $$
BEGIN
  CREATE TYPE ingest_job_kind AS ENUM ('document', 'shopping_ticket');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE shopping_list_status AS ENUM ('active', 'closed');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE shopping_product_source AS ENUM ('catalog', 'manual');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username CITEXT UNIQUE,
  password_hash TEXT,
  email CITEXT UNIQUE,
  full_name TEXT,
  default_currency CHAR(3) NOT NULL DEFAULT 'ARS' CHECK (default_currency ~ '^[A-Z]{3}$'),
  timezone TEXT NOT NULL DEFAULT 'America/Argentina/Buenos_Aires',
  onboarding_completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS user_identities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  identity_type identity_kind NOT NULL,
  identity_value TEXT NOT NULL,
  normalized_value TEXT NOT NULL,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, identity_type, normalized_value)
);

CREATE TABLE IF NOT EXISTS accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  account_type TEXT NOT NULL CHECK (account_type IN ('cash', 'bank', 'wallet', 'credit_card', 'debit_card', 'other')),
  currency CHAR(3) NOT NULL DEFAULT 'ARS' CHECK (currency ~ '^[A-Z]{3}$'),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  opening_balance NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, name)
);

CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  direction category_direction NOT NULL DEFAULT 'both',
  icon TEXT,
  color_hex VARCHAR(7) CHECK (color_hex ~ '^#[0-9A-Fa-f]{6}$'),
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  include_in_analysis BOOLEAN NOT NULL DEFAULT TRUE,
  monthly_budget NUMERIC(14,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, name, direction)
);

CREATE TABLE IF NOT EXISTS counterparties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, normalized_name)
);

CREATE TABLE IF NOT EXISTS counterparty_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  counterparty_id UUID NOT NULL REFERENCES counterparties(id) ON DELETE CASCADE,
  alias TEXT NOT NULL,
  normalized_alias TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (counterparty_id, normalized_alias)
);

CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source document_source NOT NULL DEFAULT 'api',
  original_filename TEXT,
  mime_type TEXT NOT NULL,
  file_extension TEXT,
  storage_path TEXT NOT NULL,
  sha256 CHAR(64),
  file_size_bytes BIGINT CHECK (file_size_bytes >= 0),
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status document_status NOT NULL DEFAULT 'uploaded',
  processing_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, storage_path),
  UNIQUE (user_id, sha256)
);

CREATE TABLE IF NOT EXISTS document_extractions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  extractor TEXT NOT NULL DEFAULT 'mistral',
  model_name TEXT,
  prompt_version TEXT,
  raw_text TEXT,
  raw_json JSONB NOT NULL DEFAULT '{}'::JSONB,
  extracted_amount NUMERIC(14,2),
  extracted_currency CHAR(3) CHECK (extracted_currency IS NULL OR extracted_currency ~ '^[A-Z]{3}$'),
  extracted_occurred_at TIMESTAMPTZ,
  extracted_direction txn_direction,
  extracted_counterparty_name TEXT,
  extracted_concept TEXT,
  is_user_sender BOOLEAN,
  confidence_overall NUMERIC(5,4) CHECK (confidence_overall BETWEEN 0 AND 1),
  confidence_amount NUMERIC(5,4) CHECK (confidence_amount BETWEEN 0 AND 1),
  confidence_counterparty NUMERIC(5,4) CHECK (confidence_counterparty BETWEEN 0 AND 1),
  confidence_direction NUMERIC(5,4) CHECK (confidence_direction BETWEEN 0 AND 1),
  confidence_concept NUMERIC(5,4) CHECK (confidence_concept BETWEEN 0 AND 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ingest_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  status ingest_job_status NOT NULL DEFAULT 'pending',
  kind ingest_job_kind NOT NULL DEFAULT 'document',
  payload JSONB,
  forced_direction txn_direction,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts INTEGER NOT NULL DEFAULT 3 CHECK (max_attempts >= 1),
  priority SMALLINT NOT NULL DEFAULT 100,
  run_after TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  last_error TEXT,
  worker_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS installment_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  concept TEXT NOT NULL,
  total_amount NUMERIC(14,2) NOT NULL,
  installments_count SMALLINT NOT NULL,
  installment_amount NUMERIC(14,2) NOT NULL,
  start_date TIMESTAMPTZ NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'ARS' CHECK (currency ~ '^[A-Z]{3}$'),
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  counterparty_id UUID REFERENCES counterparties(id) ON DELETE SET NULL,
  status installment_plan_status NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS recurring_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  expected_amount NUMERIC(14,2),
  currency CHAR(3) NOT NULL DEFAULT 'ARS' CHECK (currency ~ '^[A-Z]{3}$'),
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  counterparty_id UUID REFERENCES counterparties(id) ON DELETE SET NULL,
  day_of_month SMALLINT NOT NULL CHECK (day_of_month BETWEEN 1 AND 31),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
  account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  direction txn_direction NOT NULL,
  kind transaction_kind NOT NULL DEFAULT 'standard',
  include_in_totals BOOLEAN NOT NULL DEFAULT TRUE,
  transfer_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  currency CHAR(3) NOT NULL DEFAULT 'ARS' CHECK (currency ~ '^[A-Z]{3}$'),
  occurred_at TIMESTAMPTZ NOT NULL,
  counterparty_id UUID REFERENCES counterparties(id) ON DELETE SET NULL,
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  installment_plan_id UUID REFERENCES installment_plans(id) ON DELETE SET NULL,
  installment_number SMALLINT,
  recurring_expense_id UUID REFERENCES recurring_expenses(id) ON DELETE SET NULL,
  concept TEXT,
  notes TEXT,
  status txn_status NOT NULL DEFAULT 'pending_review',
  manual_override BOOLEAN NOT NULL DEFAULT FALSE,
  extraction_confidence NUMERIC(5,4) CHECK (extraction_confidence BETWEEN 0 AND 1),
  categorization_confidence NUMERIC(5,4) CHECK (categorization_confidence BETWEEN 0 AND 1),
  created_by TEXT NOT NULL DEFAULT 'system' CHECK (created_by IN ('system', 'user', 'api', 'import')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS debts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  direction debt_direction NOT NULL,
  counterparty_id UUID NOT NULL REFERENCES counterparties(id) ON DELETE RESTRICT,
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  currency CHAR(3) NOT NULL DEFAULT 'ARS' CHECK (currency ~ '^[A-Z]{3}$'),
  concept TEXT,
  reminder_date TIMESTAMPTZ,
  status debt_status NOT NULL DEFAULT 'open',
  settled_at TIMESTAMPTZ,
  settled_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  settled_transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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
  dismissed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, type, related_entity_id, period_key)
);

CREATE TABLE IF NOT EXISTS review_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL,
  reason review_reason NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::JSONB,
  status review_status NOT NULL DEFAULT 'pending',
  resolved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT review_queue_resolution_consistency CHECK (
    (status IN ('resolved', 'dismissed') AND resolved_at IS NOT NULL)
    OR
    (status IN ('pending', 'in_progress') AND resolved_at IS NULL)
  )
);

CREATE TABLE IF NOT EXISTS categorization_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  counterparty_id UUID REFERENCES counterparties(id) ON DELETE SET NULL,
  counterparty_pattern TEXT NOT NULL,
  direction txn_direction NOT NULL,
  mode rule_mode NOT NULL DEFAULT 'fixed_category',
  category_id UUID REFERENCES categories(id) ON DELETE RESTRICT,
  match_type rule_match_type NOT NULL DEFAULT 'exact',
  priority SMALLINT NOT NULL DEFAULT 100,
  min_confidence NUMERIC(5,4) NOT NULL DEFAULT 0.7000 CHECK (min_confidence BETWEEN 0 AND 1),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  learned_from_review BOOLEAN NOT NULL DEFAULT TRUE,
  hits_count INTEGER NOT NULL DEFAULT 0 CHECK (hits_count >= 0),
  last_matched_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, counterparty_pattern, direction, match_type)
);

CREATE TABLE IF NOT EXISTS api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  action TEXT NOT NULL,
  before_data JSONB,
  after_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Shopping list tool: "lista de papel" model — a list is either active
-- (being built / in-store) or closed (frozen, the purchase itself lives on
-- the list row + its checked items; there is no separate purchases table).
CREATE TABLE IF NOT EXISTS shopping_stores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  slug TEXT,
  counterparty_id UUID REFERENCES counterparties(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, normalized_name)
);

CREATE TABLE IF NOT EXISTS shopping_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source shopping_product_source NOT NULL,
  external_id TEXT,
  ean TEXT,
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  brand TEXT,
  category TEXT,
  image_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS shopping_products_user_id_external_id_key
  ON shopping_products(user_id, external_id) WHERE external_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS shopping_products_user_id_manual_name_key
  ON shopping_products(user_id, normalized_name) WHERE source = 'manual';

CREATE TABLE IF NOT EXISTS shopping_lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  status shopping_list_status NOT NULL DEFAULT 'active',
  store_id UUID REFERENCES shopping_stores(id) ON DELETE SET NULL,
  store_name TEXT,
  purchased_at TIMESTAMPTZ,
  total NUMERIC(14,2),
  currency CHAR(3) NOT NULL DEFAULT 'ARS' CHECK (currency ~ '^[A-Z]{3}$'),
  registered_transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL,
  ticket_document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS shopping_list_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  list_id UUID NOT NULL REFERENCES shopping_lists(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES shopping_products(id) ON DELETE RESTRICT,
  label TEXT NOT NULL,
  quantity NUMERIC(10,3) NOT NULL DEFAULT 1,
  ref_price NUMERIC(14,2),
  ref_store_name TEXT,
  ref_store_slug TEXT,
  ref_prices_json JSONB,
  ref_captured_at TIMESTAMPTZ,
  checked BOOLEAN NOT NULL DEFAULT FALSE,
  paid_unit_price NUMERIC(14,2),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS shopping_price_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES shopping_products(id) ON DELETE CASCADE,
  store_slug TEXT NOT NULL,
  store_name TEXT NOT NULL,
  price NUMERIC(14,2) NOT NULL,
  list_price NUMERIC(14,2),
  promo_label TEXT,
  recorded_at TIMESTAMPTZ NOT NULL,
  captured_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (product_id, store_slug, recorded_at)
);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'users',
    'accounts',
    'categories',
    'counterparties',
    'documents',
    'ingest_jobs',
    'installment_plans',
    'recurring_expenses',
    'transactions',
    'debts',
    'notifications',
    'review_queue',
    'categorization_rules',
    'api_keys',
    'shopping_stores',
    'shopping_products',
    'shopping_lists',
    'shopping_list_items'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_trigger
      WHERE tgname = 'trg_' || t || '_updated_at'
    ) THEN
      EXECUTE format(
        'CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()',
        'trg_' || t || '_updated_at',
        t
      );
    END IF;
  END LOOP;
END $$;

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_user_identities_user ON user_identities(user_id);
CREATE INDEX IF NOT EXISTS idx_accounts_user ON accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_categories_user_direction ON categories(user_id, direction);
CREATE INDEX IF NOT EXISTS idx_counterparties_user ON counterparties(user_id);
CREATE INDEX IF NOT EXISTS idx_counterparty_aliases_counterparty ON counterparty_aliases(counterparty_id);
CREATE INDEX IF NOT EXISTS idx_documents_user_status_uploaded_at ON documents(user_id, status, uploaded_at DESC);
CREATE INDEX IF NOT EXISTS idx_document_extractions_document_created_at ON document_extractions(document_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ingest_jobs_status_run_after_priority ON ingest_jobs(status, run_after, priority, created_at);
CREATE INDEX IF NOT EXISTS idx_ingest_jobs_document ON ingest_jobs(document_id);
CREATE INDEX IF NOT EXISTS idx_transactions_user_occurred_at ON transactions(user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_user_category_occurred_at ON transactions(user_id, category_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_user_direction_occurred_at ON transactions(user_id, direction, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_kind ON transactions(kind);
CREATE INDEX IF NOT EXISTS idx_installment_plans_user_status ON installment_plans(user_id, status);
CREATE INDEX IF NOT EXISTS idx_transactions_installment_plan ON transactions(installment_plan_id);
CREATE INDEX IF NOT EXISTS idx_debts_user_status ON debts(user_id, status);
CREATE INDEX IF NOT EXISTS idx_debts_reminder_date ON debts(user_id, reminder_date) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_debts_counterparty_open ON debts(counterparty_id) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_recurring_expenses_user_active ON recurring_expenses(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_transactions_recurring_expense ON transactions(recurring_expense_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_active ON notifications(user_id, created_at DESC) WHERE dismissed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_review_queue_user_status_created_at ON review_queue(user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_categorization_rules_lookup ON categorization_rules(user_id, direction, is_active, priority);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_created_at ON audit_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_shopping_lists_user_status ON shopping_lists(user_id, status, purchased_at DESC);
CREATE INDEX IF NOT EXISTS idx_shopping_list_items_list ON shopping_list_items(list_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_shopping_list_items_product ON shopping_list_items(product_id);

CREATE UNIQUE INDEX IF NOT EXISTS review_queue_one_open_per_document_idx
  ON review_queue(document_id)
  WHERE status IN ('pending', 'in_progress');

CREATE UNIQUE INDEX IF NOT EXISTS installment_plan_number_unique_idx
  ON transactions(installment_plan_id, installment_number)
  WHERE installment_plan_id IS NOT NULL;
