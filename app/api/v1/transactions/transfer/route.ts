import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/lib/server/db";
import { parseOrRespond, requireUser } from "@/lib/server/route-helpers";
import { accounts, transactions } from "@/lib/server/schema";

export const runtime = "nodejs";

const transferSchema = z
  .object({
    fromAccountId: z.string().uuid(),
    toAccountId: z.string().uuid(),
    amount: z.coerce.number().positive(),
    occurredAt: z.string().trim().optional(),
    notes: z.string().trim().max(600).optional().nullable(),
  })
  .refine((payload) => payload.fromAccountId !== payload.toAccountId, {
    message: "Las cuentas de origen y destino deben ser distintas",
    path: ["toAccountId"],
  });

export async function POST(request: Request) {
  const payload = parseOrRespond(transferSchema, await request.json());
  if (payload instanceof Response) return payload;

  const user = await requireUser();
  if (user instanceof Response) return user;

  const occurredAt = payload.occurredAt ? new Date(payload.occurredAt) : new Date();
  const now = new Date();

  if (Number.isNaN(occurredAt.getTime())) {
    return Response.json({ error: "occurredAt invalido" }, { status: 400 });
  }

  const accountRows = await db
    .select({ id: accounts.id, currency: accounts.currency })
    .from(accounts)
    .where(
      and(
        eq(accounts.userId, user.id)
      )
    );

  const fromAccount = accountRows.find((row) => row.id === payload.fromAccountId);
  const toAccount = accountRows.find((row) => row.id === payload.toAccountId);

  if (!fromAccount) {
    return Response.json(
      { error: "La cuenta de origen no existe o no pertenece al usuario" },
      { status: 400 }
    );
  }

  if (!toAccount) {
    return Response.json(
      { error: "La cuenta de destino no existe o no pertenece al usuario" },
      { status: 400 }
    );
  }

  const [transaction] = await db
    .insert(transactions)
    .values({
      userId: user.id,
      accountId: fromAccount.id,
      transferAccountId: toAccount.id,
      direction: "expense",
      kind: "transfer",
      includeInTotals: false,
      amount: payload.amount.toFixed(2),
      currency: fromAccount.currency,
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
      amount: transactions.amount,
      currency: transactions.currency,
      occurredAt: transactions.occurredAt,
      createdAt: transactions.createdAt,
    });

  if (!transaction) {
    return Response.json({ error: "No se pudo guardar la transferencia" }, { status: 500 });
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
