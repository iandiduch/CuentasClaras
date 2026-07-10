import { db } from "@/lib/server/db";

// Derived from db.transaction's own signature (not drizzle's internal HKT
// types) so it stays correct across drizzle-orm versions.
type DbTransaction = Parameters<typeof db.transaction>[0] extends (
  tx: infer T
) => unknown
  ? T
  : never;

class RollbackSignal extends Error {}

/**
 * Runs `run` inside a real Postgres transaction against the app's actual
 * database, then always rolls it back — so integration tests can exercise
 * real queries (real schema, real constraints, real drizzle query builder)
 * without leaving any row behind, and without needing a separate test
 * database. Any error thrown by `run` (including a failed `expect()`)
 * propagates normally; only the internal rollback signal is swallowed.
 */
export async function withRollback<T>(run: (tx: DbTransaction) => Promise<T>): Promise<T> {
  let result: T | undefined;

  try {
    await db.transaction(async (tx) => {
      result = await run(tx);
      throw new RollbackSignal();
    });
  } catch (error) {
    if (!(error instanceof RollbackSignal)) {
      throw error;
    }
  }

  return result as T;
}
