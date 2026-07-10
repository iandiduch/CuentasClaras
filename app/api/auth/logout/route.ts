import { clearSessionCookie, destroySession, SESSION_COOKIE_NAME } from "@/lib/server/auth/session";
import { cookies } from "next/headers";

export async function POST() {
  const cookieStore = await cookies();
  const rawToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (rawToken) {
    await destroySession(rawToken);
  }
  await clearSessionCookie();

  return Response.json({ ok: true });
}
