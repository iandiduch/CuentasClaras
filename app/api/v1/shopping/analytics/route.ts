import { and, eq, gte, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/lib/server/db";
import { requireUser } from "@/lib/server/route-helpers";
import {
  shoppingListItems,
  shoppingLists,
  shoppingProducts,
} from "@/lib/server/schema";

export const runtime = "nodejs";

const querySchema = z.object({
  months: z.coerce.number().int().min(1).max(24).default(6),
});

export async function GET(request: Request) {
  const user = await requireUser();
  if (user instanceof Response) return user;

  const url = new URL(request.url);
  const parseResult = querySchema.safeParse({
    months: url.searchParams.get("months") ?? undefined,
  });

  if (!parseResult.success) {
    return Response.json(
      { error: "Parámetros inválidos", details: parseResult.error.flatten() },
      { status: 400 }
    );
  }

  const { months } = parseResult.data;
  const since = new Date();
  since.setMonth(since.getMonth() - months);

  const monthExpr = sql<string>`to_char(date_trunc('month', ${shoppingLists.purchasedAt} AT TIME ZONE ${user.timezone}), 'YYYY-MM')`;

  const closedCondition = and(
    eq(shoppingLists.userId, user.id),
    eq(shoppingLists.status, "closed"),
    gte(shoppingLists.purchasedAt, since)
  );

  const monthlyTotals = await db
    .select({
      month: monthExpr,
      total: sql<string>`sum(${shoppingLists.total})`,
      purchaseCount: sql<number>`count(*)::int`,
    })
    .from(shoppingLists)
    .where(closedCondition)
    // Grouping/ordering by the same sql`` expression object renders
    // inconsistently qualified between clauses in this drizzle-orm version
    // (breaks "must appear in GROUP BY" in Postgres) — use the select-list
    // ordinal position instead, which Postgres resolves unambiguously.
    .groupBy(sql`1`)
    .orderBy(sql`1`);

  const byStore = await db
    .select({
      storeName: sql<string>`coalesce(${shoppingLists.storeName}, 'Sin súper')`,
      total: sql<string>`sum(${shoppingLists.total})`,
      purchaseCount: sql<number>`count(*)::int`,
    })
    .from(shoppingLists)
    .where(closedCondition)
    .groupBy(shoppingLists.storeName)
    .orderBy(sql`sum(${shoppingLists.total}) desc`);

  const productMonthly = await db
    .select({
      productId: shoppingProducts.id,
      label: shoppingProducts.name,
      month: monthExpr,
      avgUnitPrice: sql<string>`avg(${shoppingListItems.paidUnitPrice})`,
    })
    .from(shoppingListItems)
    .innerJoin(shoppingLists, eq(shoppingLists.id, shoppingListItems.listId))
    .innerJoin(shoppingProducts, eq(shoppingProducts.id, shoppingListItems.productId))
    .where(
      and(
        closedCondition,
        eq(shoppingListItems.checked, true),
        sql`${shoppingListItems.paidUnitPrice} IS NOT NULL`
      )
    )
    // Column 3 in the select list above is `month` — see the ordinal-position
    // note on the monthlyTotals query.
    .groupBy(shoppingProducts.id, shoppingProducts.name, sql`3`)
    .orderBy(shoppingProducts.name, sql`3`);

  const inflationMap = new Map<
    string,
    { productId: string; label: string; months: Array<{ month: string; avgUnitPrice: number }> }
  >();

  for (const row of productMonthly) {
    const entry = inflationMap.get(row.productId) ?? {
      productId: row.productId,
      label: row.label,
      months: [],
    };
    entry.months.push({ month: row.month, avgUnitPrice: Number(row.avgUnitPrice) });
    inflationMap.set(row.productId, entry);
  }

  return Response.json({
    monthlyTotals: monthlyTotals.map((row) => ({
      month: row.month,
      total: Number(row.total),
      purchaseCount: row.purchaseCount,
    })),
    byStore: byStore.map((row) => ({
      storeName: row.storeName,
      total: Number(row.total),
      purchaseCount: row.purchaseCount,
    })),
    productInflation: [...inflationMap.values()].filter(
      (entry) => entry.months.length >= 1
    ),
  });
}
