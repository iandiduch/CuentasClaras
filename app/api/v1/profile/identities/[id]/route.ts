import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/lib/server/db";
import { requireUser } from "@/lib/server/route-helpers";
import { userIdentities } from "@/lib/server/schema";

export const runtime = "nodejs";

const routeIdSchema = z.string().uuid();

type RouteParams = {
  params: Promise<{ id: string }>;
};

export async function DELETE(_request: Request, { params }: RouteParams) {
  const user = await requireUser();
  if (user instanceof Response) return user;

  const { id } = await params;
  const parseId = routeIdSchema.safeParse(id);
  if (!parseId.success) {
    return Response.json({ error: "identityId invalido" }, { status: 400 });
  }

  const [deleted] = await db
    .delete(userIdentities)
    .where(and(eq(userIdentities.id, parseId.data), eq(userIdentities.userId, user.id)))
    .returning({ id: userIdentities.id });

  if (!deleted) {
    return Response.json({ error: "Dato no encontrado" }, { status: 404 });
  }

  return Response.json({ ok: true });
}
