import { and, eq, sql } from "drizzle-orm";

import { db } from "@/lib/server/db";
import { normalizeText } from "@/lib/server/normalize";
import {
  shoppingLists,
  shoppingPriceSnapshots,
  shoppingProducts,
  shoppingStores,
} from "@/lib/server/schema";

const sqlExternalIdNotNull = sql`${shoppingProducts.externalId} IS NOT NULL`;
const sqlSourceManual = sql`${shoppingProducts.source} = 'manual'`;

export async function getShoppingListForUser(listId: string, userId: string) {
  const [list] = await db
    .select()
    .from(shoppingLists)
    .where(and(eq(shoppingLists.id, listId), eq(shoppingLists.userId, userId)))
    .limit(1);

  return list ?? null;
}

export async function upsertShoppingStore(params: {
  userId: string;
  name: string;
  slug?: string | null;
}) {
  const now = new Date();
  const [store] = await db
    .insert(shoppingStores)
    .values({
      userId: params.userId,
      name: params.name,
      normalizedName: normalizeText(params.name),
      slug: params.slug ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [shoppingStores.userId, shoppingStores.normalizedName],
      set: {
        name: params.name,
        ...(params.slug ? { slug: params.slug } : {}),
        updatedAt: now,
      },
    })
    .returning();

  return store ?? null;
}

export type CatalogProductInput = {
  externalId: string;
  ean?: string | null;
  name: string;
  brand?: string | null;
  category?: string | null;
  imageUrl?: string | null;
  minPrice?: number | null;
  minPriceStore?: { name: string; slug: string } | null;
  otherPrices?: Array<{ store: { name: string; slug: string }; price: number }>;
};

export async function upsertCatalogProduct(userId: string, product: CatalogProductInput) {
  const now = new Date();
  const [row] = await db
    .insert(shoppingProducts)
    .values({
      userId,
      source: "catalog",
      externalId: product.externalId,
      ean: product.ean ?? null,
      name: product.name,
      normalizedName: normalizeText(product.name),
      brand: product.brand ?? null,
      category: product.category ?? null,
      imageUrl: product.imageUrl ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [shoppingProducts.userId, shoppingProducts.externalId],
      targetWhere: sqlExternalIdNotNull,
      set: {
        ean: product.ean ?? null,
        name: product.name,
        normalizedName: normalizeText(product.name),
        brand: product.brand ?? null,
        category: product.category ?? null,
        imageUrl: product.imageUrl ?? null,
        updatedAt: now,
      },
    })
    .returning();

  return row ?? null;
}

export async function upsertManualProduct(userId: string, label: string) {
  const now = new Date();
  const [row] = await db
    .insert(shoppingProducts)
    .values({
      userId,
      source: "manual",
      name: label,
      normalizedName: normalizeText(label),
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [shoppingProducts.userId, shoppingProducts.normalizedName],
      targetWhere: sqlSourceManual,
      set: {
        name: label,
        updatedAt: now,
      },
    })
    .returning();

  return row ?? null;
}

export async function insertSnapshotsFromSearchProduct(params: {
  userId: string;
  productId: string;
  product: CatalogProductInput;
}) {
  const now = new Date();
  const entries: Array<{ storeSlug: string; storeName: string; price: number }> = [];

  if (params.product.minPrice != null && params.product.minPriceStore) {
    entries.push({
      storeSlug: params.product.minPriceStore.slug,
      storeName: params.product.minPriceStore.name,
      price: params.product.minPrice,
    });
  }

  for (const other of params.product.otherPrices ?? []) {
    entries.push({
      storeSlug: other.store.slug,
      storeName: other.store.name,
      price: other.price,
    });
  }

  if (entries.length === 0) {
    return;
  }

  await db
    .insert(shoppingPriceSnapshots)
    .values(
      entries.map((entry) => ({
        userId: params.userId,
        productId: params.productId,
        storeSlug: entry.storeSlug,
        storeName: entry.storeName,
        price: entry.price.toFixed(2),
        recordedAt: now,
        capturedAt: now,
        createdAt: now,
      }))
    )
    .onConflictDoNothing();
}
