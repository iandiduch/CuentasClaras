import { asc, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/lib/server/db";
import {
  normalizeCuil,
  normalizeCvu,
  normalizeDigits,
  normalizeText,
} from "@/lib/server/normalize";
import { parseOrRespond, requireUser } from "@/lib/server/route-helpers";
import { userIdentities } from "@/lib/server/schema";

export const runtime = "nodejs";

const IDENTITY_TYPES = [
  "person_name",
  "phone",
  "email",
  "tax_id",
  "bank_account",
  "alias",
  "cbu",
  "cvu",
  "other",
] as const;

const createIdentitySchema = z.object({
  identityType: z.enum(IDENTITY_TYPES),
  identityValue: z.string().trim().min(1).max(140),
});

function normalizeByType(identityType: (typeof IDENTITY_TYPES)[number], value: string) {
  if (identityType === "tax_id") {
    return normalizeCuil(value);
  }
  if (identityType === "cbu" || identityType === "cvu") {
    return normalizeCvu(value);
  }
  if (identityType === "phone") {
    return normalizeDigits(value);
  }
  return normalizeText(value);
}

export async function GET() {
  const user = await requireUser();
  if (user instanceof Response) return user;

  const rows = await db
    .select({
      id: userIdentities.id,
      identityType: userIdentities.identityType,
      identityValue: userIdentities.identityValue,
      isPrimary: userIdentities.isPrimary,
      createdAt: userIdentities.createdAt,
    })
    .from(userIdentities)
    .where(eq(userIdentities.userId, user.id))
    .orderBy(asc(userIdentities.createdAt));

  return Response.json({ identities: rows });
}

export async function POST(request: Request) {
  const user = await requireUser();
  if (user instanceof Response) return user;

  const payload = parseOrRespond(createIdentitySchema, await request.json());
  if (payload instanceof Response) return payload;

  const { identityType, identityValue } = payload;
  const normalizedValue = normalizeByType(identityType, identityValue);

  if (!normalizedValue) {
    return Response.json(
      { error: `Valor invalido para el tipo ${identityType}` },
      { status: 400 }
    );
  }

  const now = new Date();

  const [identity] = await db
    .insert(userIdentities)
    .values({
      userId: user.id,
      identityType,
      identityValue,
      normalizedValue,
      isPrimary: false,
      createdAt: now,
    })
    .onConflictDoNothing({
      target: [userIdentities.userId, userIdentities.identityType, userIdentities.normalizedValue],
    })
    .returning({
      id: userIdentities.id,
      identityType: userIdentities.identityType,
      identityValue: userIdentities.identityValue,
      isPrimary: userIdentities.isPrimary,
      createdAt: userIdentities.createdAt,
    });

  if (!identity) {
    return Response.json({ error: "Ese dato ya esta cargado" }, { status: 409 });
  }

  return Response.json({ identity }, { status: 201 });
}
