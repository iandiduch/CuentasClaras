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

ALTER TABLE ingest_jobs
  ADD COLUMN IF NOT EXISTS kind ingest_job_kind NOT NULL DEFAULT 'document',
  ADD COLUMN IF NOT EXISTS payload JSONB;

CREATE TABLE IF NOT EXISTS shopping_stores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  slug TEXT,
  counterparty_id UUID REFERENCES counterparties(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS shopping_stores_user_id_normalized_name_key
  ON shopping_stores(user_id, normalized_name);

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
  total NUMERIC(14, 2),
  currency CHAR(3) NOT NULL DEFAULT 'ARS',
  registered_transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL,
  ticket_document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shopping_lists_user_status
  ON shopping_lists(user_id, status, purchased_at DESC);

CREATE TABLE IF NOT EXISTS shopping_list_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  list_id UUID NOT NULL REFERENCES shopping_lists(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES shopping_products(id) ON DELETE RESTRICT,
  label TEXT NOT NULL,
  quantity NUMERIC(10, 3) NOT NULL DEFAULT 1,
  ref_price NUMERIC(14, 2),
  ref_store_name TEXT,
  ref_store_slug TEXT,
  ref_prices_json JSONB,
  ref_captured_at TIMESTAMPTZ,
  checked BOOLEAN NOT NULL DEFAULT FALSE,
  paid_unit_price NUMERIC(14, 2),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shopping_list_items_list
  ON shopping_list_items(list_id, sort_order);

CREATE INDEX IF NOT EXISTS idx_shopping_list_items_product
  ON shopping_list_items(product_id);

CREATE TABLE IF NOT EXISTS shopping_price_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES shopping_products(id) ON DELETE CASCADE,
  store_slug TEXT NOT NULL,
  store_name TEXT NOT NULL,
  price NUMERIC(14, 2) NOT NULL,
  list_price NUMERIC(14, 2),
  promo_label TEXT,
  recorded_at TIMESTAMPTZ NOT NULL,
  captured_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS shopping_price_snapshots_dedupe_key
  ON shopping_price_snapshots(product_id, store_slug, recorded_at);
