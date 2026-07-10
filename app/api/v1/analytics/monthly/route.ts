import { and, eq, gte, inArray, lt } from "drizzle-orm";

import { computeBalancesFromRows, sumBalances } from "@/lib/server/account-balance";
import { db } from "@/lib/server/db";
import { requireUser } from "@/lib/server/route-helpers";
import { accounts, categories, transactions } from "@/lib/server/schema";

export const runtime = "nodejs";

function getMonthRange(input: string | null) {
  const base = input ?? new Date().toISOString().slice(0, 7);
  const [yearString, monthString] = base.split("-");
  const year = Number(yearString);
  const month = Number(monthString);

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    month < 1 ||
    month > 12
  ) {
    throw new Error("month invalido");
  }

  const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
  const end = new Date(Date.UTC(year, month, 1, 0, 0, 0));

  return {
    key: `${yearString}-${monthString.padStart(2, "0")}`,
    start,
    end,
  };
}

function addMonths(date: Date, offset: number) {
  const copy = new Date(date);
  copy.setUTCMonth(copy.getUTCMonth() + offset);
  return copy;
}

function monthKey(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(
    2,
    "0"
  )}`;
}

function dayKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function dayEndExclusive(day: string) {
  return new Date(Date.parse(`${day}T00:00:00.000Z`) + 24 * 60 * 60 * 1000);
}

export async function GET(request: Request) {
  const user = await requireUser();
  if (user instanceof Response) return user;

  const { searchParams } = new URL(request.url);

  let period;
  try {
    period = getMonthRange(searchParams.get("month"));
  } catch {
    return Response.json(
      { error: "month invalido. Usa formato YYYY-MM" },
      { status: 400 }
    );
  }

  // --- Cumulative balance machinery -----------------------------------
  // Account balance = openingBalance + signed net of every transaction to
  // date. The actual arithmetic lives in computeBalancesFromRows
  // (lib/server/account-balance.ts) — the same function backing
  // /api/v1/accounts — so a transfer between two of the user's own
  // accounts can't be handled differently here than there again.
  const accountRows = await db
    .select({ id: accounts.id, name: accounts.name, openingBalance: accounts.openingBalance })
    .from(accounts)
    .where(eq(accounts.userId, user.id));
  const openingBalances = new Map(
    accountRows.map((row) => [row.id, Number(row.openingBalance)])
  );

  const balanceAffectingRows = await db
    .select({
      kind: transactions.kind,
      direction: transactions.direction,
      amount: transactions.amount,
      occurredAt: transactions.occurredAt,
      accountId: transactions.accountId,
      transferAccountId: transactions.transferAccountId,
    })
    .from(transactions)
    .where(and(eq(transactions.userId, user.id), lt(transactions.occurredAt, period.end)));

  function balancesAsOf(cutoffExclusive: Date) {
    return computeBalancesFromRows(openingBalances, balanceAffectingRows, cutoffExclusive);
  }

  // --- This-month income/expense/category breakdown -------------------
  // includeInTotals gates only the income/expense/category picture (it's
  // always true for standard rows, always false for transfers, and
  // user-controlled for adjustments) — never the balance picture above.
  const monthlyRows = await db
    .select({
      direction: transactions.direction,
      amount: transactions.amount,
      occurredAt: transactions.occurredAt,
      categoryId: transactions.categoryId,
      accountId: transactions.accountId,
      includeInTotals: transactions.includeInTotals,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, user.id),
        gte(transactions.occurredAt, period.start),
        lt(transactions.occurredAt, period.end)
      )
    );

  let income = 0;
  let expense = 0;
  const expenseByCategoryMap = new Map<string, number>();
  const dailyMap = new Map<string, { income: number; expense: number }>();
  const accountTotalsMap = new Map<string, { income: number; expense: number }>();

  for (const row of monthlyRows) {
    if (!row.includeInTotals) continue;

    const amount = Number(row.amount);
    const dateKey = dayKey(row.occurredAt);
    const dayBucket = dailyMap.get(dateKey) ?? { income: 0, expense: 0 };
    const accountBucket = row.accountId ? accountTotalsMap.get(row.accountId) ?? { income: 0, expense: 0 } : null;

    if (row.direction === "income") {
      income += amount;
      dayBucket.income += amount;
      if (accountBucket) accountBucket.income += amount;
    } else {
      expense += amount;
      dayBucket.expense += amount;
      if (accountBucket) accountBucket.expense += amount;
      const categoryBucket = row.categoryId ?? "uncategorized";
      expenseByCategoryMap.set(
        categoryBucket,
        (expenseByCategoryMap.get(categoryBucket) ?? 0) + amount
      );
    }
    dailyMap.set(dateKey, dayBucket);
    if (row.accountId && accountBucket) accountTotalsMap.set(row.accountId, accountBucket);
  }

  const periodEndBalances = balancesAsOf(period.end);
  const byAccount = accountRows
    .map((account) => {
      const totals = accountTotalsMap.get(account.id) ?? { income: 0, expense: 0 };
      return {
        accountId: account.id,
        accountName: account.name,
        income: totals.income,
        expense: totals.expense,
        balance: periodEndBalances.get(account.id) ?? Number(account.openingBalance),
      };
    })
    .sort((a, b) => a.accountName.localeCompare(b.accountName));

  const usedCategoryIds = Array.from(expenseByCategoryMap.keys()).filter(
    (value) => value !== "uncategorized"
  );

  const categoryRows =
    usedCategoryIds.length > 0
      ? await db
          .select({
            id: categories.id,
            name: categories.name,
            includeInAnalysis: categories.includeInAnalysis,
          })
          .from(categories)
          .where(
            and(eq(categories.userId, user.id), inArray(categories.id, usedCategoryIds))
          )
      : [];

  const categoryInfoMap = new Map(
    categoryRows.map((row) => [row.id, { name: row.name, includeInAnalysis: row.includeInAnalysis }])
  );

  const expenseByCategory = Array.from(expenseByCategoryMap.entries())
    .filter(([key]) => key === "uncategorized" || categoryInfoMap.get(key)?.includeInAnalysis !== false)
    .map(([key, total]) => ({
      category: key === "uncategorized" ? "Sin categoria" : categoryInfoMap.get(key)?.name ?? "Sin categoria",
      total,
    }))
    .sort((a, b) => b.total - a.total);

  const dailyCashflow = Array.from(dailyMap.entries())
    .map(([day, values]) => ({
      day,
      income: values.income,
      expense: values.expense,
      balance: sumBalances(balancesAsOf(dayEndExclusive(day))),
    }))
    .sort((a, b) => a.day.localeCompare(b.day));

  // --- 6-month trend ----------------------------------------------------
  const trendStart = addMonths(period.start, -5);
  const trendRows = await db
    .select({
      direction: transactions.direction,
      amount: transactions.amount,
      occurredAt: transactions.occurredAt,
      includeInTotals: transactions.includeInTotals,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, user.id),
        gte(transactions.occurredAt, trendStart),
        lt(transactions.occurredAt, period.end)
      )
    );

  const trendMap = new Map<string, { income: number; expense: number }>();

  for (const row of trendRows) {
    if (!row.includeInTotals) continue;

    const key = monthKey(row.occurredAt);
    const bucket = trendMap.get(key) ?? { income: 0, expense: 0 };
    const amount = Number(row.amount);

    if (row.direction === "income") {
      bucket.income += amount;
    } else {
      bucket.expense += amount;
    }
    trendMap.set(key, bucket);
  }

  const monthTrend = Array.from({ length: 6 }).map((_, index) => {
    const bucketDate = addMonths(period.start, index - 5);
    const key = monthKey(bucketDate);
    const values = trendMap.get(key) ?? { income: 0, expense: 0 };
    const monthEndExclusive = addMonths(bucketDate, 1);
    return {
      month: key,
      income: values.income,
      expense: values.expense,
      balance: sumBalances(balancesAsOf(monthEndExclusive)),
    };
  });

  return Response.json({
    month: period.key,
    totals: {
      income,
      expense,
      // Cumulative running balance across all accounts as of the end of
      // the queried month (opening balances carried forward + all-time
      // net), not an isolated `income - expense` for this month alone.
      balance: sumBalances(balancesAsOf(period.end)),
      savingsRate: income > 0 ? Number((((income - expense) / income) * 100).toFixed(2)) : 0,
    },
    expenseByCategory,
    dailyCashflow,
    monthTrend,
    byAccount,
  });
}
