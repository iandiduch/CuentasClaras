import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { upsertCounterpartyByName } from "@/lib/server/counterparties";
import { db } from "@/lib/server/db";
import { normalizeCurrency } from "@/lib/server/normalize";
import { parseOrRespond, requireUser } from "@/lib/server/route-helpers";
import { accounts, categories, transactions } from "@/lib/server/schema";

export const runtime = "nodejs";

const manualTransactionSchema = z.object({
  direction: z.enum(["income", "expense"]),
  amount: z.coerce.number().positive(),
  currency: z.string().trim().length(3).optional(),
  occurredAt: z.string().trim().optional(),
  categoryId: z.string().uuid().optional().nullable(),
  accountId: z.string().uuid().optional().nullable(),
  counterpartyName: z.string().trim().min(2).max(140).optional().nullable(),
  concept: z.string().trim().max(280).optional().nullable(),
  notes: z.string().trim().max(600).optional().nullable(),
});

export async function POST(request: Request) {
  const payload = parseOrRespond(manualTransactionSchema, await request.json());
  if (payload instanceof Response) return payload;

  const user = await requireUser();
  if (user instanceof Response) return user;

  const occurredAt = payload.occurredAt ? new Date(payload.occurredAt) : new Date();
  const now = new Date();

  if (Number.isNaN(occurredAt.getTime())) {
    return Response.json({ error: "occurredAt invalido" }, { status: 400 });
  }

  const counterpartyId = payload.counterpartyName
    ? await upsertCounterpartyByName(user.id, payload.counterpartyName)
    : null;

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
      .select({
        direction: categories.direction,
      })
      .from(categories)
      .where(
        and(eq(categories.id, payload.categoryId), eq(categories.userId, user.id))
      )
      .limit(1);

    if (!category) {
      return Response.json(
        { error: "La categoria no existe o no pertenece al usuario" },
        { status: 400 }
      );
    }

    if (category.direction !== "both" && category.direction !== payload.direction) {
      return Response.json(
        { error: "La categoria no coincide con el tipo de movimiento" },
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

  const [transaction] = await db
    .insert(transactions)
    .values({
      userId: user.id,
      accountId: payload.accountId ?? null,
      direction: payload.direction,
      amount: payload.amount.toFixed(2),
      currency,
      occurredAt: occurredAt,
      counterpartyId,
      categoryId: payload.categoryId ?? null,
      concept: payload.concept ?? null,
      notes: payload.notes ?? null,
      status: payload.categoryId ? "manually_confirmed" : "pending_review",
      manualOverride: true,
      categorizationConfidence: payload.categoryId ? "1.0000" : null,
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
      concept: transactions.concept,
      status: transactions.status,
      createdAt: transactions.createdAt,
    });

  if (!transaction) {
    return Response.json(
      { error: "No se pudo guardar el movimiento" },
      { status: 500 }
    );
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
