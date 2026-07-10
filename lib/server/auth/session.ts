import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { and, eq, gt } from "drizzle-orm";

import { db } from "@/lib/server/db";
import { sessions, users } from "@/lib/server/schema";

export const SESSION_COOKIE_NAME = "cc_session";
const SESSION_TTL_DAYS = 30;

export type CurrentUser = {
  id: string;
  username: string;
  email: string | null;
  fullName: string;
  defaultCurrency: string;
  timezone: string;
  onboardingCompletedAt: Date | null;
};

function hashToken(rawToken: string) {
  return createHash("sha256").update(rawToken).digest("hex");
}

function toCurrentUser(user: typeof users.$inferSelect): CurrentUser {
  return {
    id: user.id,
    username: user.username ?? "",
    email: user.email,
    fullName: user.fullName ?? user.username ?? "",
    defaultCurrency: user.defaultCurrency,
    timezone: user.timezone,
    onboardingCompletedAt: user.onboardingCompletedAt,
  };
}

export async function createSession(userId: string) {
  const rawToken = randomBytes(32).toString("base64url");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);

  await db.insert(sessions).values({
    userId,
    tokenHash: hashToken(rawToken),
    createdAt: now,
    lastUsedAt: now,
    expiresAt,
  });

  return { token: rawToken, expiresAt };
}

// `NODE_ENV` is forced to "production" by `next start` regardless of what's
// in `.env`, so it can't tell us whether the request is actually over TLS.
// This app is commonly self-hosted on a local network over plain HTTP (see
// `allowedDevOrigins` in next.config.ts) — marking the cookie `Secure` there
// would make the browser silently drop it, breaking login with no error.
// Derive it from APP_URL instead, which reflects the real deployment.
const IS_HTTPS = (process.env.APP_URL ?? "").startsWith("https://");

export async function setSessionCookie(rawToken: string, expiresAt: Date) {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, rawToken, {
    httpOnly: true,
    secure: IS_HTTPS,
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}

export async function destroySession(rawToken: string) {
  await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(rawToken)));
}

export async function getSessionUser(): Promise<CurrentUser | null> {
  const cookieStore = await cookies();
  const rawToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!rawToken) {
    return null;
  }

  const tokenHash = hashToken(rawToken);
  const now = new Date();

  const [row] = await db
    .select({ user: users })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, now)))
    .limit(1);

  if (!row) {
    return null;
  }

  void db
    .update(sessions)
    .set({ lastUsedAt: now })
    .where(eq(sessions.tokenHash, tokenHash))
    .catch(() => {});

  return toCurrentUser(row.user);
}
