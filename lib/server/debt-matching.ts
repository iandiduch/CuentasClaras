import { and, eq } from "drizzle-orm";

import { db } from "@/lib/server/db";
import { debts } from "@/lib/server/schema";

type DebtMatchInput = {
  userId: string;
  counterpartyId: string;
  amount: number;
  currency: string;
};

type DebtMatchResult = {
  matchedDebtId: string | null;
  ambiguous: boolean;
};

export async function findDebtMatch({
  userId,
  counterpartyId,
  amount,
  currency,
}: DebtMatchInput): Promise<DebtMatchResult> {
  const candidates = await db
    .select({ id: debts.id, amount: debts.amount, currency: debts.currency })
    .from(debts)
    .where(
      and(
        eq(debts.userId, userId),
        eq(debts.status, "open"),
        eq(debts.direction, "receivable"),
        eq(debts.counterpartyId, counterpartyId)
      )
    );

  if (candidates.length === 0) {
    return { matchedDebtId: null, ambiguous: false };
  }

  if (candidates.length === 1) {
    const candidate = candidates[0];
    const matches = Number(candidate.amount) === amount && candidate.currency === currency;
    return matches
      ? { matchedDebtId: candidate.id, ambiguous: false }
      : { matchedDebtId: null, ambiguous: true };
  }

  return { matchedDebtId: null, ambiguous: true };
}

export async function settleDebtWithTransaction(debtId: string, transactionId: string, accountId: string | null) {
  const now = new Date();
  await db
    .update(debts)
    .set({
      status: "settled",
      settledAt: now,
      settledAccountId: accountId,
      settledTransactionId: transactionId,
      updatedAt: now,
    })
    .where(eq(debts.id, debtId));
}
