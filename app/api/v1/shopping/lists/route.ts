import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/lib/server/db";
import { parseOrRespond, requireUser } from "@/lib/server/route-helpers";
import { shoppingListItems, shoppingLists } from "@/lib/server/schema";

export const runtime = "nodejs";

const querySchema = z.object({
  status: z.enum(["active", "closed"]).default("active"),
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
});

export async function GET(request: Request) {
  const user = await requireUser();
  if (user instanceof Response) return user;

  const url = new URL(request.url);
  const parseResult = querySchema.safeParse({
    status: url.searchParams.get("status") ?? undefined,
    month: url.searchParams.get("month") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
  });

  if (!parseResult.success) {
    return Response.json(
      { error: "Parámetros inválidos", details: parseResult.error.flatten() },
      { status: 400 }
    );
  }

  const { status, month, limit } = parseResult.data;

  const conditions = [
    eq(shoppingLists.userId, user.id),
    eq(shoppingLists.status, status),
  ];

  if (month) {
    conditions.push(
      sql`to_char(${shoppingLists.purchasedAt} AT TIME ZONE ${user.timezone}, 'YYYY-MM') = ${month}`
    );
  }

  const rows = await db
    .select({
      id: shoppingLists.id,
      name: shoppingLists.name,
      status: shoppingLists.status,
      storeId: shoppingLists.storeId,
      storeName: shoppingLists.storeName,
      purchasedAt: shoppingLists.purchasedAt,
      total: shoppingLists.total,
      currency: shoppingLists.currency,
      registeredTransactionId: shoppingLists.registeredTransactionId,
      closedAt: shoppingLists.closedAt,
      createdAt: shoppingLists.createdAt,
      updatedAt: shoppingLists.updatedAt,
      itemCount: sql<number>`count(${shoppingListItems.id})::int`,
      checkedCount: sql<number>`count(${shoppingListItems.id}) filter (where ${shoppingListItems.checked})::int`,
      estimatedTotal: sql<string | null>`sum(${shoppingListItems.refPrice} * ${shoppingListItems.quantity})`,
      paidTotal: sql<string | null>`sum(${shoppingListItems.paidUnitPrice} * ${shoppingListItems.quantity}) filter (where ${shoppingListItems.checked})`,
    })
    .from(shoppingLists)
    .leftJoin(shoppingListItems, eq(shoppingListItems.listId, shoppingLists.id))
    .where(and(...conditions))
    .groupBy(shoppingLists.id)
    .orderBy(
      status === "closed" ? desc(shoppingLists.purchasedAt) : desc(shoppingLists.createdAt)
    )
    .limit(limit);

  return Response.json({
    lists: rows.map((row) => ({
      ...row,
      total: row.total != null ? Number(row.total) : null,
      estimatedTotal: row.estimatedTotal != null ? Number(row.estimatedTotal) : null,
      paidTotal: row.paidTotal != null ? Number(row.paidTotal) : null,
    })),
  });
}

export async function POST(request: Request) {
  const payload = parseOrRespond(createSchema, await request.json());
  if (payload instanceof Response) return payload;

  const user = await requireUser();
  if (user instanceof Response) return user;

  const now = new Date();
  const [list] = await db
    .insert(shoppingLists)
    .values({
      userId: user.id,
      name: payload.name,
      createdAt: now,
      updatedAt: now,
    })
    .returning({
      id: shoppingLists.id,
      name: shoppingLists.name,
      status: shoppingLists.status,
      createdAt: shoppingLists.createdAt,
    });

  if (!list) {
    return Response.json({ error: "No se pudo crear la lista" }, { status: 500 });
  }

  return Response.json({ list }, { status: 201 });
}
