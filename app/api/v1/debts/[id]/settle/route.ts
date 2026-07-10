import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/lib/server/db";
import { parseOrRespond, requireUser } from "@/lib/server/route-helpers";
import { accounts, debts, transactions } from "@/lib/server/schema";

export const runtime = "nodejs";

const routeIdSchema = z.string().uuid();

const settleSchema = z.object({
  accountId: z.string().uuid(),
  countAsIncomeExpense: z.boolean().default(false),
  notes: z.string().trim().max(600).optional().nullable(),
  occurredAt: z.string().trim().optional(),
});

type RouteParams = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, { params }: RouteParams) {
  const user = await requireUser();
  if (user instanceof Response) return user;

  const { id } = await params;

  const parseId = routeIdSchema.safeParse(id);
  if (!parseId.success) {
    return Response.json({ error: "debtId invalido" }, { status: 400 });
  }

  const payload = parseOrRespond(settleSchema, await request.json());
  if (payload instanceof Response) return payload;

  const occurredAt = payload.occurredAt ? new Date(payload.occurredAt) : new Date();
  if (Number.isNaN(occurredAt.getTime())) {
    return Response.json({ error: "occurredAt invalido" }, { status: 400 });
  }

  const [debt] = await db
    .select({ id: debts.id, direction: debts.direction, amount: debts.amount, concept: debts.concept })
    .from(debts)
    .where(and(eq(debts.id, id), eq(debts.userId, user.id), eq(debts.status, "open")))
    .limit(1);

  if (!debt) {
    return Response.json({ error: "Deuda no encontrada o ya saldada" }, { status: 404 });
  }

  const [account] = await db
    .select({ id: accounts.id, currency: accounts.currency })
    .from(accounts)
    .where(and(eq(accounts.id, payload.accountId), eq(accounts.userId, user.id)))
    .limit(1);

  if (!account) {
    return Response.json(
      { error: "La cuenta no existe o no pertenece al usuario" },
      { status: 400 }
    );
  }

  const now = new Date();

  const settledDebt = await db.transaction(async (tx) => {
    const [transaction] = await tx
      .insert(transactions)
      .values({
        userId: user.id,
        accountId: account.id,
        direction: debt.direction === "receivable" ? "income" : "expense",
        kind: "adjustment",
        includeInTotals: payload.countAsIncomeExpense,
        amount: debt.amount,
        currency: account.currency,
        occurredAt,
        categoryId: null,
        concept: debt.concept,
        notes: payload.notes ?? null,
        status: "manually_confirmed",
        manualOverride: true,
        createdBy: "user",
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: transactions.id });

    const [updated] = await tx
      .update(debts)
      .set({
        status: "settled",
        settledAt: now,
        settledAccountId: account.id,
        settledTransactionId: transaction.id,
        updatedAt: now,
      })
      .where(eq(debts.id, id))
      .returning({ id: debts.id });

    return updated;
  });

  return Response.json({ debt: { id: settledDebt.id } });
}
