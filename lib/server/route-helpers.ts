import type { z } from "zod";

import { getCurrentUser, type CurrentUser } from "@/lib/server/current-user";

/**
 * Replaces the `const user = await getCurrentUser(); if (!user) return
 * Response.json(...)` block repeated in nearly every route. Callers check
 * `instanceof Response` and return it as-is:
 *
 *   const user = await requireUser();
 *   if (user instanceof Response) return user;
 */
export async function requireUser(): Promise<CurrentUser | Response> {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ error: "No autenticado" }, { status: 401 });
  }
  return user;
}

/**
 * Replaces the `schema.safeParse(...); if (!parsed.success) return
 * Response.json({error, details}, {status:400})` block repeated across
 * every route with a body/query payload:
 *
 *   const payload = parseOrRespond(createAccountSchema, await request.json());
 *   if (payload instanceof Response) return payload;
 */
export function parseOrRespond<T>(schema: z.ZodType<T>, data: unknown): T | Response {
  const result = schema.safeParse(data);
  if (!result.success) {
    return Response.json(
      { error: "Payload invalido", details: result.error.flatten() },
      { status: 400 }
    );
  }
  return result.data;
}

/**
 * Shared shape for the ~14 routes that already catch unexpected errors
 * explicitly, so a raised exception always comes back as the same JSON
 * shape instead of each route inventing its own.
 */
export function handleRouteError(
  error: unknown,
  fallbackMessage = "Ocurrio un error inesperado"
): Response {
  console.error(error);
  return Response.json({ error: fallbackMessage }, { status: 500 });
}
