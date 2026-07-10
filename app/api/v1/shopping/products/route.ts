import { and, desc, eq, ilike, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/lib/server/db";
import { normalizeText } from "@/lib/server/normalize";
import { requireUser } from "@/lib/server/route-helpers";
import {
  shoppingListItems,
  shoppingLists,
  shoppingProducts,
} from "@/lib/server/schema";

export const runtime = "nodejs";

const querySchema = z.object({
  q: z.string().trim().max(120).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

export async function GET(request: Request) {
  const user = await requireUser();
  if (user instanceof Response) return user;

  const url = new URL(request.url);
  const parseResult = querySchema.safeParse({
    q: url.searchParams.get("q") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
  });

  if (!parseResult.success) {
    return Response.json(
      { error: "Parámetros inválidos", details: parseResult.error.flatten() },
      { status: 400 }
    );
  }

  const { q, limit } = parseResult.data;

  const conditions = [eq(shoppingProducts.userId, user.id)];
  if (q) {
    conditions.push(ilike(shoppingProducts.normalizedName, `%${normalizeText(q)}%`));
  }

  const rows = await db
    .select({
      id: shoppingProducts.id,
      source: shoppingProducts.source,
      externalId: shoppingProducts.externalId,
      name: shoppingProducts.name,
      brand: shoppingProducts.brand,
      category: shoppingProducts.category,
      imageUrl: shoppingProducts.imageUrl,
      purchaseCount: sql<number>`count(${shoppingListItems.id}) filter (where ${shoppingListItems.checked} and ${shoppingLists.status} = 'closed')::int`,
      lastPaidPrice: sql<string | null>`(array_agg(${shoppingListItems.paidUnitPrice} order by ${shoppingLists.purchasedAt} desc) filter (where ${shoppingListItems.checked} and ${shoppingLists.status} = 'closed' and ${shoppingListItems.paidUnitPrice} is not null))[1]`,
      lastPurchasedAt: sql<string | null>`max(${shoppingLists.purchasedAt}) filter (where ${shoppingListItems.checked} and ${shoppingLists.status} = 'closed')`,
    })
    .from(shoppingProducts)
    .leftJoin(
      shoppingListItems,
      eq(shoppingListItems.productId, shoppingProducts.id)
    )
    .leftJoin(shoppingLists, eq(shoppingLists.id, shoppingListItems.listId))
    .where(and(...conditions))
    .groupBy(shoppingProducts.id)
    .orderBy(
      desc(sql`max(${shoppingLists.purchasedAt})`),
      desc(shoppingProducts.createdAt)
    )
    .limit(limit);

  return Response.json({
    products: rows.map((row) => ({
      ...row,
      lastPaidPrice: row.lastPaidPrice != null ? Number(row.lastPaidPrice) : null,
    })),
  });
}
