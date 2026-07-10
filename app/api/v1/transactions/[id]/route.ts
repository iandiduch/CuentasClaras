import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { upsertCounterpartyByName } from "@/lib/server/counterparties";
import { db } from "@/lib/server/db";
import { normalizeCurrency } from "@/lib/server/normalize";
import { parseOrRespond, requireUser } from "@/lib/server/route-helpers";
import { accounts, categories, transactions } from "@/lib/server/schema";

export const runtime = "nodejs";

const routeIdSchema = z.string().uuid();

const updateTransactionSchema = z
  .object({
    direction: z.enum(["income", "expense"]).optional(),
    amount: z.coerce.number().positive().optional(),
    currency: z.string().trim().length(3).optional(),
    occurredAt: z.string().trim().optional(),
    categoryId: z.string().uuid().optional().nullable(),
    accountId: z.string().uuid().optional().nullable(),
    counterpartyName: z.string().trim().min(2).max(140).optional().nullable(),
    concept: z.string().trim().max(280).optional().nullable(),
    notes: z.string().trim().max(600).optional().nullable(),
  })
  .refine((payload) => Object.keys(payload).length > 0, {
    message: "Debes enviar al menos un campo para actualizar",
  });

type RouteParams = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, { params }: RouteParams) {
  const user = await requireUser();
  if (user instanceof Response) return user;

  const { id } = await params;

  const parseId = routeIdSchema.safeParse(id);
  if (!parseId.success) {
    return Response.json({ error: "transactionId invalido" }, { status: 400 });
  }

  const payload = parseOrRespond(updateTransactionSchema, await request.json());
  if (payload instanceof Response) return payload;

  const transactionId = parseId.data;
  const now = new Date();

  const [existing] = await db
    .select({
      id: transactions.id,
      direction: transactions.direction,
      categoryId: transactions.categoryId,
      currency: transactions.currency,
      status: transactions.status,
    })
    .from(transactions)
    .where(and(eq(transactions.id, transactionId), eq(transactions.userId, user.id)))
    .limit(1);

  if (!existing) {
    return Response.json({ error: "Movimiento no encontrado" }, { status: 404 });
  }

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

  const nextDirection = payload.direction ?? existing.direction;
  const nextCategoryId = payload.categoryId === undefined ? existing.categoryId : payload.categoryId;

  if (nextCategoryId) {
    const [category] = await db
      .select({
        direction: categories.direction,
      })
      .from(categories)
      .where(and(eq(categories.id, nextCategoryId), eq(categories.userId, user.id)))
      .limit(1);

    if (!category) {
      return Response.json(
        { error: "La categoria no existe o no pertenece al usuario" },
        { status: 400 }
      );
    }

    if (category.direction !== "both" && category.direction !== nextDirection) {
      return Response.json(
        { error: "La categoria no coincide con el tipo de movimiento" },
        { status: 400 }
      );
    }
  }

  const occurredAt =
    payload.occurredAt !== undefined ? new Date(payload.occurredAt) : undefined;
  if (occurredAt && Number.isNaN(occurredAt.getTime())) {
    return Response.json({ error: "occurredAt invalido" }, { status: 400 });
  }

  const currency =
    payload.currency !== undefined
      ? normalizeCurrency(payload.currency)
      : existing.currency;
  if (!/^[A-Z]{3}$/.test(currency)) {
    return Response.json(
      { error: "Moneda invalida. Usa formato ISO-4217 (ej: ARS)" },
      { status: 400 }
    );
  }

  let counterpartyId: string | null | undefined = undefined;
  if (payload.counterpartyName !== undefined) {
    counterpartyId = payload.counterpartyName
      ? await upsertCounterpartyByName(user.id, payload.counterpartyName)
      : null;
  }

  const status = nextCategoryId
    ? "manually_confirmed"
    : existing.status === "rejected"
      ? "rejected"
      : "pending_review";

  const [updated] = await db
    .update(transactions)
    .set({
      direction: nextDirection,
      amount: payload.amount !== undefined ? payload.amount.toFixed(2) : undefined,
      currency,
      occurredAt,
      categoryId: nextCategoryId,
      accountId: payload.accountId === undefined ? undefined : payload.accountId,
      counterpartyId,
      concept: payload.concept === undefined ? undefined : payload.concept,
      notes: payload.notes === undefined ? undefined : payload.notes,
      status,
      manualOverride: true,
      updatedAt: now,
    })
    .where(and(eq(transactions.id, transactionId), eq(transactions.userId, user.id)))
    .returning({
      id: transactions.id,
      direction: transactions.direction,
      amount: transactions.amount,
      currency: transactions.currency,
      occurredAt: transactions.occurredAt,
      concept: transactions.concept,
      notes: transactions.notes,
      status: transactions.status,
      categoryId: transactions.categoryId,
      accountId: transactions.accountId,
      counterpartyId: transactions.counterpartyId,
      updatedAt: transactions.updatedAt,
    });

  if (!updated) {
    return Response.json({ error: "Movimiento no encontrado" }, { status: 404 });
  }

  return Response.json({
    transaction: {
      ...updated,
      amount: Number(updated.amount),
    },
  });
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  const user = await requireUser();
  if (user instanceof Response) return user;

  const { id } = await params;

  const parseId = routeIdSchema.safeParse(id);
  if (!parseId.success) {
    return Response.json({ error: "transactionId invalido" }, { status: 400 });
  }

  const [deleted] = await db
    .delete(transactions)
    .where(and(eq(transactions.id, parseId.data), eq(transactions.userId, user.id)))
    .returning({
      id: transactions.id,
    });

  if (!deleted) {
    return Response.json({ error: "Movimiento no encontrado" }, { status: 404 });
  }

  return Response.json({ ok: true });
}
