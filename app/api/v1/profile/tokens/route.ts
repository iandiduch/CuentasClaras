import { z } from "zod";

import { generateApiToken, listApiTokens } from "@/lib/server/auth/api-tokens";
import { parseOrRespond, requireUser } from "@/lib/server/route-helpers";

export const runtime = "nodejs";

const createTokenSchema = z.object({
  label: z.string().trim().min(1).max(60),
});

export async function GET() {
  const user = await requireUser();
  if (user instanceof Response) return user;

  const tokens = await listApiTokens(user.id);
  return Response.json({ tokens });
}

export async function POST(request: Request) {
  const user = await requireUser();
  if (user instanceof Response) return user;

  const payload = parseOrRespond(createTokenSchema, await request.json());
  if (payload instanceof Response) return payload;

  const { id, label, token } = await generateApiToken(user.id, payload.label);
  return Response.json({ id, label, token }, { status: 201 });
}
