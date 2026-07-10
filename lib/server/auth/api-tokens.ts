import { createHash, randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";

import { db } from "@/lib/server/db";
import { apiKeys, users } from "@/lib/server/schema";
import type { CurrentUser } from "@/lib/server/auth/session";

const TOKEN_PREFIX = "cc_";

function hashToken(rawToken: string) {
  return createHash("sha256").update(rawToken).digest("hex");
}

export async function generateApiToken(userId: string, label: string) {
  const raw = TOKEN_PREFIX + randomBytes(24).toString("base64url");
  const now = new Date();

  const [created] = await db
    .insert(apiKeys)
    .values({
      userId,
      label,
      keyHash: hashToken(raw),
      isActive: true,
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: apiKeys.id, label: apiKeys.label });

  return { id: created.id, label: created.label, token: raw };
}

export async function listApiTokens(userId: string) {
  const rows = await db
    .select({
      id: apiKeys.id,
      label: apiKeys.label,
      isActive: apiKeys.isActive,
      lastUsedAt: apiKeys.lastUsedAt,
      createdAt: apiKeys.createdAt,
    })
    .from(apiKeys)
    .where(eq(apiKeys.userId, userId));

  return rows;
}

export async function revokeApiToken(userId: string, id: string) {
  const [updated] = await db
    .update(apiKeys)
    .set({ isActive: false, updatedAt: new Date() })
    .where(and(eq(apiKeys.id, id), eq(apiKeys.userId, userId)))
    .returning({ id: apiKeys.id });

  return Boolean(updated);
}

export async function resolveApiToken(rawToken: string): Promise<CurrentUser | null> {
  const tokenHash = hashToken(rawToken);

  const [row] = await db
    .select({ user: users, apiKeyId: apiKeys.id })
    .from(apiKeys)
    .innerJoin(users, eq(apiKeys.userId, users.id))
    .where(and(eq(apiKeys.keyHash, tokenHash), eq(apiKeys.isActive, true)))
    .limit(1);

  if (!row) {
    return null;
  }

  void db
    .update(apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKeys.id, row.apiKeyId))
    .catch(() => {});

  return {
    id: row.user.id,
    username: row.user.username ?? "",
    email: row.user.email,
    fullName: row.user.fullName ?? row.user.username ?? "",
    defaultCurrency: row.user.defaultCurrency,
    timezone: row.user.timezone,
    onboardingCompletedAt: row.user.onboardingCompletedAt,
  };
}
