import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/lib/server/db";
import { parseOrRespond, requireUser } from "@/lib/server/route-helpers";
import { recurringExpenses } from "@/lib/server/schema";

export const runtime = "nodejs";

const routeIdSchema = z.string().uuid();

const updateRecurringSchema = z
  .object({
    name: z.string().trim().min(2).max(140).optional(),
    expectedAmount: z.coerce.number().positive().optional().nullable(),
    dayOfMonth: z.coerce.number().int().min(1).max(31).optional(),
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
    return Response.json({ error: "recurringExpenseId invalido" }, { status: 400 });
  }

  const payload = parseOrRespond(updateRecurringSchema, await request.json());
  if (payload instanceof Response) return payload;

  const now = new Date();

  const [updated] = await db
    .update(recurringExpenses)
    .set({
      name: payload.name,
      expectedAmount:
        payload.expectedAmount === undefined
          ? undefined
          : payload.expectedAmount === null
            ? null
            : payload.expectedAmount.toFixed(2),
      dayOfMonth: payload.dayOfMonth,
      isActive: payload.isActive,
      updatedAt: now,
    })
    .where(and(eq(recurringExpenses.id, id), eq(recurringExpenses.userId, user.id)))
    .returning({ id: recurringExpenses.id });

  if (!updated) {
    return Response.json({ error: "Gasto recurrente no encontrado" }, { status: 404 });
  }

  return Response.json({ ok: true });
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  const user = await requireUser();
  if (user instanceof Response) return user;

  const { id } = await params;

  const parseId = routeIdSchema.safeParse(id);
  if (!parseId.success) {
    return Response.json({ error: "recurringExpenseId invalido" }, { status: 400 });
  }

  const now = new Date();

  const [updated] = await db
    .update(recurringExpenses)
    .set({ isActive: false, updatedAt: now })
    .where(and(eq(recurringExpenses.id, id), eq(recurringExpenses.userId, user.id)))
    .returning({ id: recurringExpenses.id });

  if (!updated) {
    return Response.json({ error: "Gasto recurrente no encontrado" }, { status: 404 });
  }

  return Response.json({ ok: true });
}
