import { and, eq, gte, lt } from "drizzle-orm";

import { db } from "@/lib/server/db";
import { recurringExpenses, transactions } from "@/lib/server/schema";

function getCurrentMonthRange(now: Date) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { start, end };
}

function dueDateForMonth(dayOfMonth: number, monthStart: Date, monthEnd: Date) {
  const daysInMonth = Math.round((monthEnd.getTime() - monthStart.getTime()) / 86400000);
  const clampedDay = Math.min(dayOfMonth, daysInMonth);
  return new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth(), clampedDay));
}

export async function reconcileRecurringExpenses(userId: string): Promise<void> {
  const now = new Date();
  const { start: monthStart, end: monthEnd } = getCurrentMonthRange(now);

  const active = await db
    .select({
      id: recurringExpenses.id,
      name: recurringExpenses.name,
      expectedAmount: recurringExpenses.expectedAmount,
      currency: recurringExpenses.currency,
      categoryId: recurringExpenses.categoryId,
      accountId: recurringExpenses.accountId,
      counterpartyId: recurringExpenses.counterpartyId,
      dayOfMonth: recurringExpenses.dayOfMonth,
    })
    .from(recurringExpenses)
    .where(and(eq(recurringExpenses.userId, userId), eq(recurringExpenses.isActive, true)));

  for (const recurring of active) {
    if (!recurring.expectedAmount) continue;

    const dueDate = dueDateForMonth(recurring.dayOfMonth, monthStart, monthEnd);
    if (now.getTime() < dueDate.getTime()) continue;

    const [existing] = await db
      .select({ id: transactions.id })
      .from(transactions)
      .where(
        and(
          eq(transactions.recurringExpenseId, recurring.id),
          gte(transactions.occurredAt, monthStart),
          lt(transactions.occurredAt, monthEnd)
        )
      )
      .limit(1);

    if (existing) continue;

    await db.insert(transactions).values({
      userId,
      accountId: recurring.accountId,
      direction: "expense",
      kind: "standard",
      includeInTotals: true,
      amount: recurring.expectedAmount,
      currency: recurring.currency,
      occurredAt: dueDate,
      counterpartyId: recurring.counterpartyId,
      categoryId: recurring.categoryId,
      recurringExpenseId: recurring.id,
      concept: recurring.name,
      status: "auto_confirmed",
      createdBy: "system",
      createdAt: now,
      updatedAt: now,
    });
  }
}

type RecurringMatchInput = {
  userId: string;
  counterpartyId: string;
  amount: number;
  currency: string;
  occurredAt: Date;
};

type RecurringMatchResult = {
  matchedRecurringExpenseId: string | null;
  ambiguous: boolean;
};

const AMOUNT_TOLERANCE_RATIO = 0.02;

export async function findRecurringMatch({
  userId,
  counterpartyId,
  amount,
  currency,
  occurredAt,
}: RecurringMatchInput): Promise<RecurringMatchResult> {
  const candidates = await db
    .select({
      id: recurringExpenses.id,
      expectedAmount: recurringExpenses.expectedAmount,
      currency: recurringExpenses.currency,
    })
    .from(recurringExpenses)
    .where(
      and(
        eq(recurringExpenses.userId, userId),
        eq(recurringExpenses.isActive, true),
        eq(recurringExpenses.counterpartyId, counterpartyId)
      )
    );

  if (candidates.length === 0) {
    return { matchedRecurringExpenseId: null, ambiguous: false };
  }

  if (candidates.length > 1) {
    return { matchedRecurringExpenseId: null, ambiguous: true };
  }

  const candidate = candidates[0];
  const { start: monthStart, end: monthEnd } = getCurrentMonthRange(occurredAt);

  const [existing] = await db
    .select({ id: transactions.id })
    .from(transactions)
    .where(
      and(
        eq(transactions.recurringExpenseId, candidate.id),
        gte(transactions.occurredAt, monthStart),
        lt(transactions.occurredAt, monthEnd)
      )
    )
    .limit(1);

  if (existing) {
    // Already generated or matched once this month — a second match is a
    // possible duplicate, not a confident auto-link.
    return { matchedRecurringExpenseId: null, ambiguous: true };
  }

  if (!candidate.expectedAmount) {
    return { matchedRecurringExpenseId: candidate.id, ambiguous: false };
  }

  const expected = Number(candidate.expectedAmount);
  const withinTolerance = Math.abs(amount - expected) / expected <= AMOUNT_TOLERANCE_RATIO;

  if (withinTolerance && candidate.currency === currency) {
    return { matchedRecurringExpenseId: candidate.id, ambiguous: false };
  }

  return { matchedRecurringExpenseId: null, ambiguous: true };
}
