DO $$
BEGIN
  CREATE TYPE rule_mode AS ENUM ('fixed_category', 'always_review');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE IF EXISTS categorization_rules
  ADD COLUMN IF NOT EXISTS mode rule_mode NOT NULL DEFAULT 'fixed_category';

ALTER TABLE IF EXISTS categorization_rules
  ALTER COLUMN category_id DROP NOT NULL;

UPDATE categorization_rules
SET mode = 'fixed_category'
WHERE mode IS NULL;

