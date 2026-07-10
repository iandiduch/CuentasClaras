DO $$
BEGIN
  CREATE TYPE ingest_job_status AS ENUM ('pending', 'processing', 'completed', 'failed', 'retry');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS ingest_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  status ingest_job_status NOT NULL DEFAULT 'pending',
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

CREATE INDEX IF NOT EXISTS idx_ingest_jobs_status_run_after_priority
  ON ingest_jobs(status, run_after, priority, created_at);

CREATE INDEX IF NOT EXISTS idx_ingest_jobs_document
  ON ingest_jobs(document_id);

