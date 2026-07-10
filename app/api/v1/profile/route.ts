import { count, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/lib/server/db";
import { seedUserIdentities } from "@/lib/server/onboarding";
import { parseOrRespond, requireUser } from "@/lib/server/route-helpers";
import { userIdentities, users } from "@/lib/server/schema";

export const runtime = "nodejs";

const updateProfileSchema = z.object({
  fullName: z.string().trim().min(2).max(140).optional(),
  email: z.string().trim().email().optional().nullable(),
  defaultCurrency: z.string().trim().length(3).optional(),
  timezone: z.string().trim().min(1).max(80).optional(),
});

export async function GET() {
  const user = await requireUser();
  if (user instanceof Response) return user;

  return Response.json({
    profile: {
      username: user.username,
      fullName: user.fullName,
      email: user.email,
      defaultCurrency: user.defaultCurrency,
      timezone: user.timezone,
      onboardingCompletedAt: user.onboardingCompletedAt,
    },
  });
}

export async function PATCH(request: Request) {
  const user = await requireUser();
  if (user instanceof Response) return user;

  const payload = parseOrRespond(updateProfileSchema, await request.json());
  if (payload instanceof Response) return payload;

  const now = new Date();

  let updated;
  try {
    [updated] = await db
      .update(users)
      .set({
        fullName: payload.fullName ?? undefined,
        email: payload.email === undefined ? undefined : payload.email,
        defaultCurrency: payload.defaultCurrency ? payload.defaultCurrency.toUpperCase() : undefined,
        timezone: payload.timezone ?? undefined,
        onboardingCompletedAt: user.onboardingCompletedAt ?? now,
        updatedAt: now,
      })
      .where(eq(users.id, user.id))
      .returning({
        username: users.username,
        fullName: users.fullName,
        email: users.email,
        defaultCurrency: users.defaultCurrency,
        timezone: users.timezone,
        onboardingCompletedAt: users.onboardingCompletedAt,
      });
  } catch {
    return Response.json({ error: "Ese email ya esta en uso" }, { status: 409 });
  }

  if (!updated) {
    return Response.json({ error: "No se pudo actualizar el perfil" }, { status: 500 });
  }

  const [{ value: identityCount }] = await db
    .select({ value: count() })
    .from(userIdentities)
    .where(eq(userIdentities.userId, user.id));

  if (identityCount === 0) {
    await seedUserIdentities(user.id, updated.fullName ?? user.username, updated.email);
  }

  return Response.json({ profile: updated });
}
