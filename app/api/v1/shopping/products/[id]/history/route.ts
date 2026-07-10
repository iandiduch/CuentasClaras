import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/lib/server/db";
import { requireUser } from "@/lib/server/route-helpers";
import {
  shoppingListItems,
  shoppingLists,
  shoppingPriceSnapshots,
  shoppingProducts,
} from "@/lib/server/schema";

export const runtime = "nodejs";

const idSchema = z.string().uuid();

type RouteParams = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, { params }: RouteParams) {
  const user = await requireUser();
  if (user instanceof Response) return user;

  const { id } = await params;
  if (!idSchema.safeParse(id).success) {
    return Response.json({ error: "Producto inválido" }, { status: 400 });
  }

  const [product] = await db
    .select({
      id: shoppingProducts.id,
      source: shoppingProducts.source,
      externalId: shoppingProducts.externalId,
      name: shoppingProducts.name,
      brand: shoppingProducts.brand,
      category: shoppingProducts.category,
      imageUrl: shoppingProducts.imageUrl,
      ean: shoppingProducts.ean,
    })
    .from(shoppingProducts)
    .where(and(eq(shoppingProducts.id, id), eq(shoppingProducts.userId, user.id)))
    .limit(1);

  if (!product) {
    return Response.json({ error: "Producto no encontrado" }, { status: 404 });
  }

  const paidRows = await db
    .select({
      purchasedAt: shoppingLists.purchasedAt,
      storeName: shoppingLists.storeName,
      listId: shoppingLists.id,
      listName: shoppingLists.name,
      unitPrice: shoppingListItems.paidUnitPrice,
      quantity: shoppingListItems.quantity,
    })
    .from(shoppingListItems)
    .innerJoin(shoppingLists, eq(shoppingLists.id, shoppingListItems.listId))
    .where(
      and(
        eq(shoppingListItems.productId, product.id),
        eq(shoppingListItems.checked, true),
        eq(shoppingLists.status, "closed")
      )
    )
    .orderBy(asc(shoppingLists.purchasedAt));

  const referenceRows = await db
    .select({
      capturedAt: shoppingPriceSnapshots.capturedAt,
      recordedAt: shoppingPriceSnapshots.recordedAt,
      storeSlug: shoppingPriceSnapshots.storeSlug,
      storeName: shoppingPriceSnapshots.storeName,
      price: shoppingPriceSnapshots.price,
      listPrice: shoppingPriceSnapshots.listPrice,
      promoLabel: shoppingPriceSnapshots.promoLabel,
    })
    .from(shoppingPriceSnapshots)
    .where(eq(shoppingPriceSnapshots.productId, product.id))
    .orderBy(asc(shoppingPriceSnapshots.capturedAt));

  return Response.json({
    product,
    paid: paidRows
      .filter((row) => row.unitPrice != null && row.purchasedAt != null)
      .map((row) => ({
        purchasedAt: row.purchasedAt,
        storeName: row.storeName,
        listId: row.listId,
        listName: row.listName,
        unitPrice: Number(row.unitPrice),
        quantity: Number(row.quantity),
      })),
    reference: referenceRows.map((row) => ({
      capturedAt: row.capturedAt,
      recordedAt: row.recordedAt,
      storeSlug: row.storeSlug,
      storeName: row.storeName,
      price: Number(row.price),
      listPrice: row.listPrice != null ? Number(row.listPrice) : null,
      promoLabel: row.promoLabel,
    })),
  });
}
