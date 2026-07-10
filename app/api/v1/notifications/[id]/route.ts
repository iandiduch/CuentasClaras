import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/lib/server/db";
import { parseOrRespond, requireUser } from "@/lib/server/route-helpers";
import { notifications } from "@/lib/server/schema";

export const runtime = "nodejs";

const routeIdSchema = z.string().uuid();

const updateSchema = z.object({
  isRead: z.boolean(),
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
    return Response.json({ error: "notificationId invalido" }, { status: 400 });
  }

  const payload = parseOrRespond(updateSchema, await request.json());
  if (payload instanceof Response) return payload;

  const now = new Date();

  const [updated] = await db
    .update(notifications)
    .set({ isRead: payload.isRead, updatedAt: now })
    .where(and(eq(notifications.id, id), eq(notifications.userId, user.id)))
    .returning({ id: notifications.id });

  if (!updated) {
    return Response.json({ error: "Notificacion no encontrada" }, { status: 404 });
  }

  return Response.json({ ok: true });
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  const user = await requireUser();
  if (user instanceof Response) return user;

  const { id } = await params;

  const parseId = routeIdSchema.safeParse(id);
  if (!parseId.success) {
    return Response.json({ error: "notificationId invalido" }, { status: 400 });
  }

  const now = new Date();

  const [dismissed] = await db
    .update(notifications)
    .set({ dismissedAt: now, updatedAt: now })
    .where(and(eq(notifications.id, id), eq(notifications.userId, user.id)))
    .returning({ id: notifications.id });

  if (!dismissed) {
    return Response.json({ error: "Notificacion no encontrada" }, { status: 404 });
  }

  return Response.json({ ok: true });
}
