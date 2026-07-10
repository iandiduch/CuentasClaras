import { and, asc, eq, gte, lt } from "drizzle-orm";
import { z } from "zod";

import { upsertCounterpartyByName } from "@/lib/server/counterparties";
import { db } from "@/lib/server/db";
import { normalizeCurrency } from "@/lib/server/normalize";
import { reconcileRecurringExpenses } from "@/lib/server/recurring-expenses";
import { parseOrRespond, requireUser } from "@/lib/server/route-helpers";
import {
  accounts,
  categories,
  counterparties,
  recurringExpenses,
  transactions,
} from "@/lib/server/schema";

export const runtime = "nodejs";

const createRecurringSchema = z.object({
  name: z.string().trim().min(2).max(140),
  expectedAmount: z.coerce.number().positive().optional().nullable(),
  currency: z.string().trim().length(3).optional(),
  categoryId: z.string().uuid().optional().nullable(),
  accountId: z.string().uuid().optional().nullable(),
  counterpartyName: z.string().trim().min(2).max(140).optional().nullable(),
  dayOfMonth: z.coerce.number().int().min(1).max(31),
});

function getCurrentMonthRange() {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { start, end };
}

export async function GET() {
  const user = await requireUser();
  if (user instanceof Response) return user;

  await reconcileRecurringExpenses(user.id);

  const rows = await db
    .select({
      id: recurringExpenses.id,
      name: recurringExpenses.name,
      expectedAmount: recurringExpenses.expectedAmount,
      currency: recurringExpenses.currency,
      categoryId: recurringExpenses.categoryId,
      categoryName: categories.name,
      accountId: recurringExpenses.accountId,
      accountName: accounts.name,
      counterpartyName: counterparties.displayName,
      dayOfMonth: recurringExpenses.dayOfMonth,
      isActive: recurringExpenses.isActive,
      createdAt: recurringExpenses.createdAt,
    })
    .from(recurringExpenses)
    .leftJoin(categories, eq(categories.id, recurringExpenses.categoryId))
    .leftJoin(accounts, eq(accounts.id, recurringExpenses.accountId))
    .leftJoin(counterparties, eq(counterparties.id, recurringExpenses.counterpartyId))
    .where(eq(recurringExpenses.userId, user.id))
    .orderBy(asc(recurringExpenses.name));

  const { start: monthStart, end: monthEnd } = getCurrentMonthRange();
  const now = new Date();

  const thisMonthRows = await db
    .select({ id: transactions.id, recurringExpenseId: transactions.recurringExpenseId })
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, user.id),
        gte(transactions.occurredAt, monthStart),
        lt(transactions.occurredAt, monthEnd)
      )
    );

  const transactionByRecurringId = new Map<string, string>();
  for (const row of thisMonthRows) {
    if (row.recurringExpenseId) {
      transactionByRecurringId.set(row.recurringExpenseId, row.id);
    }
  }

  return Response.json({
    recurringExpenses: rows.map((row) => {
      const daysInMonth = Math.round((monthEnd.getTime() - monthStart.getTime()) / 86400000);
      const dueDate = new Date(
        Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth(), Math.min(row.dayOfMonth, daysInMonth))
      );
      const thisMonthTransactionId = transactionByRecurringId.get(row.id) ?? null;

      let thisMonthStatus: "not_due_yet" | "generated" | "awaiting_manual" = "not_due_yet";
      if (thisMonthTransactionId) {
        thisMonthStatus = "generated";
      } else if (now.getTime() >= dueDate.getTime()) {
        thisMonthStatus = "awaiting_manual";
      }

      return {
        ...row,
        expectedAmount: row.expectedAmount ? Number(row.expectedAmount) : null,
        thisMonthStatus,
        thisMonthTransactionId,
      };
    }),
  });
}

export async function POST(request: Request) {
  const payload = parseOrRespond(createRecurringSchema, await request.json());
  if (payload instanceof Response) return payload;

  const user = await requireUser();
  if (user instanceof Response) return user;

  const now = new Date();

  if (payload.accountId) {
    const [account] = await db
      .select({ id: accounts.id })
      .from(accounts)
      .where(and(eq(accounts.id, payload.accountId), eq(accounts.userId, user.id)))
      .limit(1);

    if (!account) {
      return Response.json(
        { error: "La cuenta no existe o no pertenece al usuario" },
        { status: 400 }
      );
    }
  }

  if (payload.categoryId) {
    const [category] = await db
      .select({ direction: categories.direction })
      .from(categories)
      .where(and(eq(categories.id, payload.categoryId), eq(categories.userId, user.id)))
      .limit(1);

    if (!category) {
      return Response.json(
        { error: "La categoria no existe o no pertenece al usuario" },
        { status: 400 }
      );
    }

    if (category.direction !== "both" && category.direction !== "expense") {
      return Response.json(
        { error: "La categoria no coincide con un gasto" },
        { status: 400 }
      );
    }
  }

  const currency = normalizeCurrency(payload.currency ?? user.defaultCurrency);
  if (!/^[A-Z]{3}$/.test(currency)) {
    return Response.json(
      { error: "Moneda invalida. Usa formato ISO-4217 (ej: ARS)" },
      { status: 400 }
    );
  }

  const counterpartyId = payload.counterpartyName
    ? await upsertCounterpartyByName(user.id, payload.counterpartyName)
    : null;

  const [recurring] = await db
    .insert(recurringExpenses)
    .values({
      userId: user.id,
      name: payload.name,
      expectedAmount: payload.expectedAmount ? payload.expectedAmount.toFixed(2) : null,
      currency,
      categoryId: payload.categoryId ?? null,
      accountId: payload.accountId ?? null,
      counterpartyId,
      dayOfMonth: payload.dayOfMonth,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: recurringExpenses.id });

  return Response.json({ recurringExpense: { id: recurring.id } }, { status: 201 });
}
