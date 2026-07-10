import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { pool } from "@/lib/server/db";

const MIGRATIONS_DIR = path.join(process.cwd(), "db", "migrations");

async function main() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const files = (await readdir(MIGRATIONS_DIR))
    .filter((name) => name.endsWith(".sql"))
    .sort();

  const { rows } = await pool.query<{ filename: string }>(
    "SELECT filename FROM schema_migrations"
  );
  const applied = new Set(rows.map((row) => row.filename));

  let appliedCount = 0;

  for (const file of files) {
    if (applied.has(file)) {
      console.info(`[migrate] skip  ${file} (already applied)`);
      continue;
    }

    const sql = await readFile(path.join(MIGRATIONS_DIR, file), "utf8");
    console.info(`[migrate] apply ${file}`);

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (filename) VALUES ($1)", [file]);
      await client.query("COMMIT");
      appliedCount += 1;
    } catch (error) {
      await client.query("ROLLBACK");
      // 23505 = unique_violation on schema_migrations' PK: another
      // container (app + worker both run this on start) raced us to the
      // same not-yet-applied file. The migration SQL itself is idempotent
      // (IF NOT EXISTS / duplicate_object guards), so whichever process
      // committed first already did the real work — this one just lost the
      // race to record it, which is fine, not a failure.
      if ((error as { code?: string }).code === "23505") {
        console.info(`[migrate] skip  ${file} (applied concurrently by another process)`);
      } else {
        console.error(`[migrate] FAILED on ${file}`);
        throw error;
      }
    } finally {
      client.release();
    }
  }

  console.info(
    appliedCount > 0
      ? `[migrate] done, applied ${appliedCount} new migration(s)`
      : "[migrate] done, nothing new to apply"
  );
}

main()
  .catch((error) => {
    console.error("[migrate] fatal error", error);
    process.exitCode = 1;
  })
  .finally(() => {
    void pool.end();
  });
