import { and, eq, lt } from "drizzle-orm";

import { db as defaultDb } from "@/lib/server/db";
import { accounts, transactions } from "@/lib/server/schema";
import type { TransactionKind, TxnDirection } from "@/lib/server/schema";

// Accepts either the module-level `db` singleton or a `db.transaction(tx =>
// ...)` callback's `tx` — derived from `db.transaction`'s own signature
// rather than importing drizzle's internal HKT types, so it stays correct
// across drizzle-orm versions. This lets tests run the exact same function
// inside a transaction that gets rolled back at the end.
type DbTransaction = Parameters<typeof defaultDb.transaction>[0] extends (
  tx: infer T
) => unknown
  ? T
  : never;
export type DbClient = typeof defaultDb | DbTransaction;

export type BalanceLedgerRow = {
  accountId: string | null;
  transferAccountId: string | null;
  kind: TransactionKind;
  direction: TxnDirection;
  amount: string | number;
  occurredAt: Date;
};

/**
 * Pure signed-sum arithmetic: openingBalance + every row affecting the
 * account up to (but excluding) `cutoffExclusive`. This is the single rule
 * shared by computeAccountBalances (below, used by /api/v1/accounts) and
 * the analytics/monthly route's day-by-day and month-by-month balance
 * history — standard/adjustment use `direction`, transfer is always
 * -amount on `accountId` (the outflow leg) plus +amount on
 * `transferAccountId` (the implicit inflow leg). No DB access, so it's
 * unit-testable on its own.
 */
export function computeBalancesFromRows(
  openingBalances: Map<string, number>,
  rows: BalanceLedgerRow[],
  cutoffExclusive?: Date
): Map<string, number> {
  const balances = new Map(openingBalances);

  for (const row of rows) {
    if (cutoffExclusive && row.occurredAt.getTime() >= cutoffExclusive.getTime()) {
      continue;
    }
    const amount = Number(row.amount);
    const sign = row.kind === "transfer" ? -1 : row.direction === "income" ? 1 : -1;

    if (row.accountId && balances.has(row.accountId)) {
      balances.set(row.accountId, balances.get(row.accountId)! + sign * amount);
    }
    if (row.kind === "transfer" && row.transferAccountId && balances.has(row.transferAccountId)) {
      balances.set(row.transferAccountId, balances.get(row.transferAccountId)! + amount);
    }
  }

  return balances;
}

export function sumBalances(balances: Map<string, number>): number {
  let total = 0;
  for (const value of balances.values()) {
    total += value;
  }
  return total;
}

/**
 * Cumulative balance per account: openingBalance + signed sum of every
 * transaction affecting the account to date (or up to `asOf`, exclusive).
 */
export async function computeAccountBalances(
  userId: string,
  asOf?: Date,
  client: DbClient = defaultDb
): Promise<Map<string, number>> {
  const accountRows = await client
    .select({ id: accounts.id, openingBalance: accounts.openingBalance })
    .from(accounts)
    .where(eq(accounts.userId, userId));

  const openingBalances = new Map<string, number>();
  for (const account of accountRows) {
    openingBalances.set(account.id, Number(account.openingBalance));
  }

  const filters = [eq(transactions.userId, userId)];
  if (asOf) {
    filters.push(lt(transactions.occurredAt, asOf));
  }

  const rows = await client
    .select({
      accountId: transactions.accountId,
      transferAccountId: transactions.transferAccountId,
      kind: transactions.kind,
      direction: transactions.direction,
      amount: transactions.amount,
      occurredAt: transactions.occurredAt,
    })
    .from(transactions)
    .where(and(...filters));

  // Rows are already filtered to `< asOf` in SQL above, so no further
  // cutoff filtering is needed here.
  return computeBalancesFromRows(openingBalances, rows);
}

export async function computeAccountBalance(
  userId: string,
  accountId: string,
  asOf?: Date,
  client: DbClient = defaultDb
): Promise<number> {
  const balances = await computeAccountBalances(userId, asOf, client);
  return balances.get(accountId) ?? 0;
}
