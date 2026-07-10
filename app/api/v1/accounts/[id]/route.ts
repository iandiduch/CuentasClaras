import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { computeAccountBalance } from "@/lib/server/account-balance";
import { db } from "@/lib/server/db";
import { parseOrRespond, requireUser } from "@/lib/server/route-helpers";
import { accounts } from "@/lib/server/schema";

export const runtime = "nodejs";

const ACCOUNT_TYPES = ["cash", "bank", "wallet", "credit_card", "debit_card", "other"] as const;

const routeIdSchema = z.string().uuid();

const updateAccountSchema = z
  .object({
    name: z.string().trim().min(2).max(60).optional(),
    accountType: z.enum(ACCOUNT_TYPES).optional(),
    currency: z.string().trim().length(3).optional(),
    openingBalance: z.coerce.number().optional(),
    isActive: z.boolean().optional(),
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
    return Response.json({ error: "accountId invalido" }, { status: 400 });
  }

  const payload = parseOrRespond(updateAccountSchema, await request.json());
  if (payload instanceof Response) return payload;

  const accountId = parseId.data;
  const now = new Date();

  const [account] = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.id, accountId), eq(accounts.userId, user.id)))
    .limit(1);

  if (!account) {
    return Response.json({ error: "Cuenta no encontrada" }, { status: 404 });
  }

  try {
    const [updated] = await db
      .update(accounts)
      .set({
        name: payload.name ?? undefined,
        accountType: payload.accountType ?? undefined,
        currency: payload.currency ? payload.currency.toUpperCase() : undefined,
        openingBalance:
          payload.openingBalance === undefined ? undefined : payload.openingBalance.toFixed(2),
        isActive: payload.isActive ?? undefined,
        updatedAt: now,
      })
      .where(and(eq(accounts.id, accountId), eq(accounts.userId, user.id)))
      .returning({
        id: accounts.id,
        name: accounts.name,
        accountType: accounts.accountType,
        currency: accounts.currency,
        isActive: accounts.isActive,
        openingBalance: accounts.openingBalance,
      });

    if (!updated) {
      return Response.json({ error: "Cuenta no encontrada" }, { status: 404 });
    }

    const currentBalance = await computeAccountBalance(user.id, updated.id, new Date());

    return Response.json({
      account: {
        ...updated,
        openingBalance: Number(updated.openingBalance),
        currentBalance,
      },
    });
  } catch {
    return Response.json(
      { error: "No se pudo actualizar la cuenta. Revisa duplicados de nombre." },
      { status: 409 }
    );
  }
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  const user = await requireUser();
  if (user instanceof Response) return user;

  const { id } = await params;

  const parseId = routeIdSchema.safeParse(id);
  if (!parseId.success) {
    return Response.json({ error: "accountId invalido" }, { status: 400 });
  }

  const accountId = parseId.data;
  const now = new Date();

  const [account] = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.id, accountId), eq(accounts.userId, user.id)))
    .limit(1);

  if (!account) {
    return Response.json({ error: "Cuenta no encontrada" }, { status: 404 });
  }

  // Soft-delete: transactions.accountId is ON DELETE SET NULL, so a hard
  // delete would silently strip the account reference from historic
  // transactions. Deactivating preserves history and hides the account from
  // new-transaction selectors.
  await db
    .update(accounts)
    .set({ isActive: false, updatedAt: now })
    .where(and(eq(accounts.id, accountId), eq(accounts.userId, user.id)));

  return Response.json({ ok: true });
}
