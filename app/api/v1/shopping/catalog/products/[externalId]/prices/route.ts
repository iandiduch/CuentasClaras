import { and, eq } from "drizzle-orm";
import { z } from "zod";

import {
  getProductPrices,
  isPriceCatalogConfigured,
  PriceCatalogError,
} from "@/lib/server/price-catalog";
import { db } from "@/lib/server/db";
import { requireUser } from "@/lib/server/route-helpers";
import { shoppingPriceSnapshots, shoppingProducts } from "@/lib/server/schema";

export const runtime = "nodejs";

const externalIdSchema = z.string().trim().min(1).max(80);

type GetParams = {
  params: Promise<{ externalId: string }>;
};

export async function GET(_request: Request, { params }: GetParams) {
  const user = await requireUser();
  if (user instanceof Response) return user;

  const { externalId } = await params;
  const parseResult = externalIdSchema.safeParse(externalId);
  if (!parseResult.success) {
    return Response.json({ error: "Producto inválido" }, { status: 400 });
  }

  if (!isPriceCatalogConfigured()) {
    return Response.json(
      { error: "El catálogo de precios online no está configurado" },
      { status: 503 }
    );
  }

  let result;
  try {
    result = await getProductPrices(parseResult.data);
  } catch (error) {
    if (error instanceof PriceCatalogError) {
      return Response.json({ error: error.message }, { status: 502 });
    }
    throw error;
  }

  const prices = result.prices.map((entry) => ({
    storeSlug: entry.store.slug,
    storeName: entry.store.name,
    price: entry.price,
    listPrice: entry.listPrice ?? null,
    promoLabel: entry.promoLabel ?? null,
    recordedAt: entry.recordedAt ?? null,
  }));

  const [product] = await db
    .select({ id: shoppingProducts.id })
    .from(shoppingProducts)
    .where(
      and(
        eq(shoppingProducts.userId, user.id),
        eq(shoppingProducts.externalId, parseResult.data)
      )
    )
    .limit(1);

  if (product && prices.length > 0) {
    const now = new Date();
    await db
      .insert(shoppingPriceSnapshots)
      .values(
        prices.map((entry) => {
          const recorded = entry.recordedAt ? new Date(entry.recordedAt) : now;
          return {
            userId: user.id,
            productId: product.id,
            storeSlug: entry.storeSlug,
            storeName: entry.storeName,
            price: entry.price.toFixed(2),
            listPrice: entry.listPrice != null ? entry.listPrice.toFixed(2) : null,
            promoLabel: entry.promoLabel,
            recordedAt: Number.isNaN(recorded.getTime()) ? now : recorded,
            capturedAt: now,
            createdAt: now,
          };
        })
      )
      .onConflictDoNothing();
  }

  return Response.json({
    externalId: result.id,
    name: result.name,
    prices,
  });
}
