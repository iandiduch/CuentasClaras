import { eq } from "drizzle-orm";
import { z } from "zod";

import { verifyPassword } from "@/lib/server/auth/password";
import { createSession, setSessionCookie } from "@/lib/server/auth/session";
import { db } from "@/lib/server/db";
import {
  clearAttempts,
  getClientIp,
  isRateLimited,
  recordFailedAttempt,
} from "@/lib/server/rate-limit";
import { users } from "@/lib/server/schema";

const loginSchema = z.object({
  username: z.string().trim().toLowerCase().min(1),
  password: z.string().min(1),
});

const INVALID_CREDENTIALS_MESSAGE = "Usuario o contrasena incorrectos";
const RATE_LIMITED_MESSAGE = "Demasiados intentos. Espera unos minutos e intenta de nuevo.";
const LOGIN_RATE_LIMIT = { maxAttempts: 5, windowMs: 15 * 60 * 1000, lockoutMs: 15 * 60 * 1000 };

function tooManyAttempts(retryAfterSeconds: number) {
  return Response.json(
    { error: RATE_LIMITED_MESSAGE },
    { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
  );
}

export async function POST(request: Request) {
  const payloadRaw = await request.json().catch(() => null);
  const parsed = loginSchema.safeParse(payloadRaw);
  if (!parsed.success) {
    return Response.json({ error: INVALID_CREDENTIALS_MESSAGE }, { status: 401 });
  }

  const { username, password } = parsed.data;
  const ipKey = `login:ip:${getClientIp(request)}`;
  const userKey = `login:user:${username}`;

  const ipRetry = isRateLimited(ipKey);
  const userRetry = isRateLimited(userKey);
  if (ipRetry !== null || userRetry !== null) {
    return tooManyAttempts(Math.max(ipRetry ?? 0, userRetry ?? 0));
  }

  const [user] = await db
    .select({ id: users.id, passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.username, username))
    .limit(1);

  if (!user || !user.passwordHash) {
    recordFailedAttempt(ipKey, LOGIN_RATE_LIMIT);
    recordFailedAttempt(userKey, LOGIN_RATE_LIMIT);
    return Response.json({ error: INVALID_CREDENTIALS_MESSAGE }, { status: 401 });
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    recordFailedAttempt(ipKey, LOGIN_RATE_LIMIT);
    recordFailedAttempt(userKey, LOGIN_RATE_LIMIT);
    return Response.json({ error: INVALID_CREDENTIALS_MESSAGE }, { status: 401 });
  }

  clearAttempts(ipKey);
  clearAttempts(userKey);

  const { token, expiresAt } = await createSession(user.id);
  await setSessionCookie(token, expiresAt);

  return Response.json({ ok: true });
}
