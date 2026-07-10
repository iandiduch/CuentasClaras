import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/lib/server/db";
import { parseOrRespond, requireUser } from "@/lib/server/route-helpers";
import { accounts, transactions } from "@/lib/server/schema";

export const runtime = "nodejs";

const adjustmentSchema = z.object({
  accountId: z.string().uuid(),
  direction: z.enum(["income", "expense"]),
  amount: z.coerce.number().positive(),
  occurredAt: z.string().trim().optional(),
  notes: z.string().trim().max(600).optional().nullable(),
  countAsIncomeExpense: z.boolean().default(false),
});

export async function POST(request: Request) {
  const payload = parseOrRespond(adjustmentSchema, await request.json());
  if (payload instanceof Response) return payload;

  const user = await requireUser();
  if (user instanceof Response) return user;

  const occurredAt = payload.occurredAt ? new Date(payload.occurredAt) : new Date();
  const now = new Date();

  if (Number.isNaN(occurredAt.getTime())) {
    return Response.json({ error: "occurredAt invalido" }, { status: 400 });
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

  const [transaction] = await db
    .insert(transactions)
    .values({
      userId: user.id,
      accountId: account.id,
      direction: payload.direction,
      kind: "adjustment",
      includeInTotals: payload.countAsIncomeExpense,
      amount: payload.amount.toFixed(2),
      currency: account.currency,
      occurredAt,
      categoryId: null,
      notes: payload.notes ?? null,
      status: "manually_confirmed",
      manualOverride: true,
      createdBy: "user",
      createdAt: now,
      updatedAt: now,
    })
    .returning({
      id: transactions.id,
      direction: transactions.direction,
      amount: transactions.amount,
      currency: transactions.currency,
      occurredAt: transactions.occurredAt,
      includeInTotals: transactions.includeInTotals,
      createdAt: transactions.createdAt,
    });

  if (!transaction) {
    return Response.json({ error: "No se pudo guardar el ajuste" }, { status: 500 });
  }

  return Response.json(
    {
      transaction: {
        ...transaction,
        amount: Number(transaction.amount),
      },
    },
    { status: 201 }
  );
}
