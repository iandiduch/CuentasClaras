import { z } from "zod";

import { revokeApiToken } from "@/lib/server/auth/api-tokens";
import { requireUser } from "@/lib/server/route-helpers";

export const runtime = "nodejs";

const routeIdSchema = z.string().uuid();
const patchSchema = z.object({
  isActive: z.literal(false),
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
    return Response.json({ error: "tokenId invalido" }, { status: 400 });
  }

  const parseBody = patchSchema.safeParse(await request.json());
  if (!parseBody.success) {
    return Response.json({ error: "Solo se puede revocar (isActive: false)" }, { status: 400 });
  }

  const revoked = await revokeApiToken(user.id, parseId.data);
  if (!revoked) {
    return Response.json({ error: "Token no encontrado" }, { status: 404 });
  }

  return Response.json({ ok: true });
}
