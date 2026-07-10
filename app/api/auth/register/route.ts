import { z } from "zod";

import { hashPassword } from "@/lib/server/auth/password";
import { createSession, setSessionCookie } from "@/lib/server/auth/session";
import { db } from "@/lib/server/db";
import {
  getClientIp,
  isRateLimited,
  recordFailedAttempt,
} from "@/lib/server/rate-limit";
import { users } from "@/lib/server/schema";

const registerSchema = z.object({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, "El usuario debe tener al menos 3 caracteres")
    .max(32, "El usuario debe tener como maximo 32 caracteres")
    .regex(/^[a-z0-9._-]+$/, "Usa solo letras, numeros, punto, guion o guion bajo"),
  password: z.string().min(8, "La contrasena debe tener al menos 8 caracteres"),
});

// Off by default only if explicitly disabled — keeps today's behavior
// (open registration) unchanged, but gives a lever to close signups once
// the intended user(s) already have accounts.
const REGISTRATION_ENABLED = (process.env.REGISTRATION_ENABLED ?? "true").toLowerCase() !== "false";
const REGISTER_RATE_LIMIT = { maxAttempts: 10, windowMs: 60 * 60 * 1000, lockoutMs: 60 * 60 * 1000 };

export async function POST(request: Request) {
  if (!REGISTRATION_ENABLED) {
    return Response.json({ error: "El registro esta deshabilitado" }, { status: 403 });
  }

  const ipKey = `register:ip:${getClientIp(request)}`;
  const retryAfterSeconds = isRateLimited(ipKey);
  if (retryAfterSeconds !== null) {
    return Response.json(
      { error: "Demasiados intentos. Espera unos minutos e intenta de nuevo." },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
    );
  }

  // Every attempt counts against the IP budget here (not just failures) —
  // unlike login, the thing we're limiting is signup *volume* (spam
  // accounts), not specifically wrong-credential guessing.
  recordFailedAttempt(ipKey, REGISTER_RATE_LIMIT);

  const payloadRaw = await request.json().catch(() => null);
  const parsed = registerSchema.safeParse(payloadRaw);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Datos invalidos" },
      { status: 400 }
    );
  }

  const { username, password } = parsed.data;
  const now = new Date();
  const passwordHash = await hashPassword(password);

  const [user] = await db
    .insert(users)
    .values({
      username,
      passwordHash,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing({ target: users.username })
    .returning({ id: users.id });

  if (!user) {
    return Response.json({ error: "Ese usuario ya existe" }, { status: 409 });
  }

  const { token, expiresAt } = await createSession(user.id);
  await setSessionCookie(token, expiresAt);

  return Response.json({ ok: true }, { status: 201 });
}
