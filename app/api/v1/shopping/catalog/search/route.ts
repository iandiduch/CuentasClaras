import { z } from "zod";

import {
  isPriceCatalogConfigured,
  PriceCatalogError,
  searchProducts,
} from "@/lib/server/price-catalog";
import { requireUser } from "@/lib/server/route-helpers";

export const runtime = "nodejs";

const querySchema = z.object({
  q: z.string().trim().min(2).max(120),
  offset: z.coerce.number().int().min(0).max(500).default(0),
});

export async function GET(request: Request) {
  const user = await requireUser();
  if (user instanceof Response) return user;

  const url = new URL(request.url);
  const parseResult = querySchema.safeParse({
    q: url.searchParams.get("q") ?? "",
    offset: url.searchParams.get("offset") ?? undefined,
  });

  if (!parseResult.success) {
    return Response.json(
      { error: "Parámetros inválidos", details: parseResult.error.flatten() },
      { status: 400 }
    );
  }

  // Sin PRICE_CATALOG_BASE_URL la búsqueda online queda deshabilitada: se
  // responde vacío (no un error) para que la UI siga ofreciendo la carga
  // manual de ítems sin ruido.
  if (!isPriceCatalogConfigured()) {
    return Response.json({ products: [], total: 0, catalogEnabled: false });
  }

  try {
    const result = await searchProducts(parseResult.data.q, parseResult.data.offset);
    return Response.json({
      products: result.products.map((product) => ({
        externalId: product.id,
        name: product.name,
        brand: product.brand ?? null,
        category: product.category ?? null,
        ean: product.ean ?? null,
        imageUrl: product.imageUrl ?? null,
        minPrice: product.minPrice ?? null,
        minPriceStore: product.minPriceStore
          ? { name: product.minPriceStore.name, slug: product.minPriceStore.slug }
          : null,
        minPriceListPrice: product.minPriceListPrice ?? null,
        minPricePromoLabel: product.minPricePromoLabel ?? null,
        priceCount: product.priceCount ?? null,
        otherPrices: (product.otherPrices ?? []).map((entry) => ({
          store: { name: entry.store.name, slug: entry.store.slug },
          price: entry.price,
        })),
      })),
      total: result.total ?? result.products.length,
      catalogEnabled: true,
    });
  } catch (error) {
    if (error instanceof PriceCatalogError) {
      return Response.json({ error: error.message }, { status: 502 });
    }
    throw error;
  }
}
