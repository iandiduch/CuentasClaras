import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/lib/server/db";
import { parseOrRespond, requireUser } from "@/lib/server/route-helpers";
import { debts } from "@/lib/server/schema";

export const runtime = "nodejs";

const routeIdSchema = z.string().uuid();

const updateDebtSchema = z
  .object({
    amount: z.coerce.number().positive().optional(),
    concept: z.string().trim().max(280).optional().nullable(),
    reminderDate: z.string().trim().optional().nullable(),
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
    return Response.json({ error: "debtId invalido" }, { status: 400 });
  }

  const payload = parseOrRespond(updateDebtSchema, await request.json());
  if (payload instanceof Response) return payload;

  const now = new Date();

  const reminderDate =
    payload.reminderDate === undefined
      ? undefined
      : payload.reminderDate === null
        ? null
        : new Date(payload.reminderDate);

  if (reminderDate && Number.isNaN(reminderDate.getTime())) {
    return Response.json({ error: "reminderDate invalido" }, { status: 400 });
  }

  const [updated] = await db
    .update(debts)
    .set({
      amount: payload.amount === undefined ? undefined : payload.amount.toFixed(2),
      concept: payload.concept,
      reminderDate,
      updatedAt: now,
    })
    .where(and(eq(debts.id, id), eq(debts.userId, user.id), eq(debts.status, "open")))
    .returning({ id: debts.id });

  if (!updated) {
    return Response.json({ error: "Deuda no encontrada o ya saldada" }, { status: 404 });
  }

  return Response.json({ ok: true });
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  const user = await requireUser();
  if (user instanceof Response) return user;

  const { id } = await params;

  const parseId = routeIdSchema.safeParse(id);
  if (!parseId.success) {
    return Response.json({ error: "debtId invalido" }, { status: 400 });
  }

  const [deleted] = await db
    .delete(debts)
    .where(and(eq(debts.id, id), eq(debts.userId, user.id), eq(debts.status, "open")))
    .returning({ id: debts.id });

  if (!deleted) {
    return Response.json({ error: "Deuda no encontrada o ya saldada" }, { status: 404 });
  }

  return Response.json({ ok: true });
}
