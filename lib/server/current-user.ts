import { getSessionUser, type CurrentUser } from "@/lib/server/auth/session";

export type { CurrentUser };

export async function getCurrentUser(): Promise<CurrentUser | null> {
  return getSessionUser();
}
