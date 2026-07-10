import { and, eq, gte, isNotNull, lt } from "drizzle-orm";

import { db } from "@/lib/server/db";
import { requireUser } from "@/lib/server/route-helpers";
import { recurringExpenses, transactions } from "@/lib/server/schema";

export const runtime = "nodejs";

function monthKey(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function addMonths(date: Date, offset: number) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + offset, 1));
}

export async function GET(request: Request) {
  const user = await requireUser();
  if (user instanceof Response) return user;

  const { searchParams } = new URL(request.url);

  const monthsParam = Number(searchParams.get("months") ?? "6");
  const months = Number.isFinite(monthsParam) ? Math.min(Math.max(Math.trunc(monthsParam), 1), 24) : 6;

  const now = new Date();
  const rangeStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const rangeEnd = addMonths(rangeStart, months);

  const installmentRows = await db
    .select({
      amount: transactions.amount,
      occurredAt: transactions.occurredAt,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, user.id),
        isNotNull(transactions.installmentPlanId),
        gte(transactions.occurredAt, rangeStart),
        lt(transactions.occurredAt, rangeEnd)
      )
    );

  const installmentsByMonth = new Map<string, number>();
  for (const row of installmentRows) {
    const key = monthKey(row.occurredAt);
    installmentsByMonth.set(key, (installmentsByMonth.get(key) ?? 0) + Number(row.amount));
  }

  const activeRecurring = await db
    .select({
      id: recurringExpenses.id,
      expectedAmount: recurringExpenses.expectedAmount,
    })
    .from(recurringExpenses)
    .where(and(eq(recurringExpenses.userId, user.id), eq(recurringExpenses.isActive, true)));

  const unknownRecurringCount = activeRecurring.filter((row) => !row.expectedAmount).length;
  const knownRecurring = activeRecurring.filter(
    (row): row is { id: string; expectedAmount: string } => Boolean(row.expectedAmount)
  );

  const recurringActualRows = knownRecurring.length
    ? await db
        .select({
          recurringExpenseId: transactions.recurringExpenseId,
          amount: transactions.amount,
          occurredAt: transactions.occurredAt,
        })
        .from(transactions)
        .where(
          and(
            eq(transactions.userId, user.id),
            isNotNull(transactions.recurringExpenseId),
            gte(transactions.occurredAt, rangeStart),
            lt(transactions.occurredAt, rangeEnd)
          )
        )
    : [];

  const actualByRecurringMonth = new Map<string, number>();
  for (const row of recurringActualRows) {
    if (!row.recurringExpenseId) continue;
    actualByRecurringMonth.set(`${row.recurringExpenseId}:${monthKey(row.occurredAt)}`, Number(row.amount));
  }

  const monthsList = Array.from({ length: months }, (_, index) => addMonths(rangeStart, index));

  const recurringByMonth = new Map<string, number>();
  for (const monthDate of monthsList) {
    const key = monthKey(monthDate);
    let total = 0;
    for (const recurring of knownRecurring) {
      const actual = actualByRecurringMonth.get(`${recurring.id}:${key}`);
      total += actual ?? Number(recurring.expectedAmount);
    }
    recurringByMonth.set(key, total);
  }

  const monthsPayload = monthsList.map((monthDate) => {
    const key = monthKey(monthDate);
    const installmentsTotal = installmentsByMonth.get(key) ?? 0;
    const recurringTotal = recurringByMonth.get(key) ?? 0;
    return {
      month: key,
      installmentsTotal,
      recurringTotal,
      total: installmentsTotal + recurringTotal,
    };
  });

  return Response.json({ months: monthsPayload, unknownRecurringCount });
}
