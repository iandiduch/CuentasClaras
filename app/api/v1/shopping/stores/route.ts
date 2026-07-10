import { asc, eq } from "drizzle-orm";

import { db } from "@/lib/server/db";
import { requireUser } from "@/lib/server/route-helpers";
import { shoppingStores } from "@/lib/server/schema";

export const runtime = "nodejs";

export async function GET() {
  const user = await requireUser();
  if (user instanceof Response) return user;

  const stores = await db
    .select({
      id: shoppingStores.id,
      name: shoppingStores.name,
      slug: shoppingStores.slug,
    })
    .from(shoppingStores)
    .where(eq(shoppingStores.userId, user.id))
    .orderBy(asc(shoppingStores.name));

  return Response.json({ stores });
}
