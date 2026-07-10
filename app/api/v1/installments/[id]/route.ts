import { and, eq, gt } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/lib/server/db";
import { parseOrRespond, requireUser } from "@/lib/server/route-helpers";
import { installmentPlans, transactions } from "@/lib/server/schema";

export const runtime = "nodejs";

const routeIdSchema = z.string().uuid();

const cancelSchema = z.object({
  action: z.literal("cancel"),
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
    return Response.json({ error: "planId invalido" }, { status: 400 });
  }

  const body = parseOrRespond(cancelSchema, await request.json());
  if (body instanceof Response) return body;

  const [plan] = await db
    .select({ id: installmentPlans.id })
    .from(installmentPlans)
    .where(and(eq(installmentPlans.id, id), eq(installmentPlans.userId, user.id)))
    .limit(1);

  if (!plan) {
    return Response.json({ error: "Plan no encontrado" }, { status: 404 });
  }

  const now = new Date();

  await db.transaction(async (tx) => {
    await tx
      .delete(transactions)
      .where(and(eq(transactions.installmentPlanId, id), gt(transactions.occurredAt, now)));

    await tx
      .update(installmentPlans)
      .set({ status: "cancelled", updatedAt: now })
      .where(eq(installmentPlans.id, id));
  });

  return Response.json({ ok: true });
}
