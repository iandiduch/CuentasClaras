import { and, eq, gte, isNotNull, lt } from "drizzle-orm";

import { db } from "@/lib/server/db";
import { requireUser } from "@/lib/server/route-helpers";
import { categories, transactions } from "@/lib/server/schema";

export const runtime = "nodejs";

function getMonthRange(input: string | null) {
  const base = input ?? new Date().toISOString().slice(0, 7);
  const [yearString, monthString] = base.split("-");
  const year = Number(yearString);
  const month = Number(monthString);

  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error("month invalido");
  }

  const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
  const end = new Date(Date.UTC(year, month, 1, 0, 0, 0));

  return { key: `${yearString}-${monthString.padStart(2, "0")}`, start, end };
}

export async function GET(request: Request) {
  const user = await requireUser();
  if (user instanceof Response) return user;

  const { searchParams } = new URL(request.url);

  let period;
  try {
    period = getMonthRange(searchParams.get("month"));
  } catch {
    return Response.json({ error: "month invalido. Usa formato YYYY-MM" }, { status: 400 });
  }

  const budgetedCategories = await db
    .select({
      id: categories.id,
      name: categories.name,
      icon: categories.icon,
      colorHex: categories.colorHex,
      monthlyBudget: categories.monthlyBudget,
    })
    .from(categories)
    .where(and(eq(categories.userId, user.id), isNotNull(categories.monthlyBudget)));

  if (!budgetedCategories.length) {
    return Response.json({ month: period.key, budgets: [] });
  }

  const spendingRows = await db
    .select({
      categoryId: transactions.categoryId,
      amount: transactions.amount,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, user.id),
        eq(transactions.direction, "expense"),
        eq(transactions.includeInTotals, true),
        gte(transactions.occurredAt, period.start),
        lt(transactions.occurredAt, period.end)
      )
    );

  const spentByCategory = new Map<string, number>();
  for (const row of spendingRows) {
    if (!row.categoryId) continue;
    spentByCategory.set(
      row.categoryId,
      (spentByCategory.get(row.categoryId) ?? 0) + Number(row.amount)
    );
  }

  // Compare month-to-date against the same clamped day of the previous
  // month, so a mid-month check isn't skewed by comparing to a full month.
  const now = new Date();
  const isCurrentRealMonth =
    period.key === `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const cutoffDay = isCurrentRealMonth
    ? now.getUTCDate()
    : new Date(Date.UTC(period.start.getUTCFullYear(), period.start.getUTCMonth() + 1, 0)).getUTCDate();

  const previousMonthStart = new Date(
    Date.UTC(period.start.getUTCFullYear(), period.start.getUTCMonth() - 1, 1)
  );
  const daysInPreviousMonth = new Date(
    Date.UTC(period.start.getUTCFullYear(), period.start.getUTCMonth(), 0)
  ).getUTCDate();
  const clampedCutoffDay = Math.min(cutoffDay, daysInPreviousMonth);
  const previousMonthCutoffExclusive = new Date(
    Date.UTC(previousMonthStart.getUTCFullYear(), previousMonthStart.getUTCMonth(), clampedCutoffDay + 1)
  );

  const previousSpendingRows = await db
    .select({
      categoryId: transactions.categoryId,
      amount: transactions.amount,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, user.id),
        eq(transactions.direction, "expense"),
        eq(transactions.includeInTotals, true),
        gte(transactions.occurredAt, previousMonthStart),
        lt(transactions.occurredAt, previousMonthCutoffExclusive)
      )
    );

  const spentByCategoryPrevious = new Map<string, number>();
  for (const row of previousSpendingRows) {
    if (!row.categoryId) continue;
    spentByCategoryPrevious.set(
      row.categoryId,
      (spentByCategoryPrevious.get(row.categoryId) ?? 0) + Number(row.amount)
    );
  }

  const budgets = budgetedCategories
    .map((category) => {
      const monthlyBudget = Number(category.monthlyBudget);
      const spent = spentByCategory.get(category.id) ?? 0;
      const spentSameDayLastMonth = spentByCategoryPrevious.get(category.id) ?? 0;
      const deltaVsLastMonth = spent - spentSameDayLastMonth;
      return {
        categoryId: category.id,
        categoryName: category.name,
        icon: category.icon,
        colorHex: category.colorHex,
        monthlyBudget,
        spent,
        remaining: monthlyBudget - spent,
        percent: monthlyBudget > 0 ? Math.round((spent / monthlyBudget) * 100) : 0,
        spentSameDayLastMonth,
        deltaVsLastMonth,
        deltaPercent:
          spentSameDayLastMonth > 0 ? Math.round((deltaVsLastMonth / spentSameDayLastMonth) * 100) : null,
      };
    })
    .sort((a, b) => b.percent - a.percent);

  return Response.json({ month: period.key, budgets });
}
