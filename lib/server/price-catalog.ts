import { z } from "zod";

// Cliente del catálogo de precios online (opcional). La app consume una API
// externa de comparación de precios de supermercados cuya URL base se define
// por entorno (PRICE_CATALOG_BASE_URL). Si la variable no está configurada,
// la búsqueda online queda deshabilitada y los productos se cargan a mano —
// nada más de la app depende de este servicio.
//
// Contrato esperado de la API:
//   GET {BASE_URL}/api/products/search?q=<texto>&offset=<n>&limit=<n>
//     -> { products: [{ id, name, brand?, category?, ean?, imageUrl?,
//          minPrice?, minPriceStore?: { name, slug }, minPriceListPrice?,
//          minPricePromoLabel?, priceCount?,
//          otherPrices?: [{ store: { name, slug }, price }] }], total? }
//   GET {BASE_URL}/api/products/{id}/prices
//     -> { id, name, prices: [{ price, listPrice?, promoLabel?,
//          recordedAt?, store: { name, slug } }] }

const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX_ENTRIES = 300;

const cache = new Map<string, { expiresAt: number; data: unknown }>();

// Leída en cada request (no a nivel de módulo) para que el build de Next —
// que importa todas las rutas con un entorno placeholder — no congele un
// valor vacío.
function getBaseUrl(): string | null {
  const raw = process.env.PRICE_CATALOG_BASE_URL?.trim();
  if (!raw) {
    return null;
  }
  return raw.replace(/\/+$/, "");
}

export function isPriceCatalogConfigured(): boolean {
  return getBaseUrl() !== null;
}

export class PriceCatalogError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PriceCatalogError";
  }
}

const storeRefSchema = z
  .object({
    name: z.string(),
    slug: z.string(),
  })
  .loose();

const searchProductSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    brand: z.string().nullish(),
    category: z.string().nullish(),
    ean: z.string().nullish(),
    imageUrl: z.string().nullish(),
    minPrice: z.coerce.number().nullish(),
    minPriceStore: storeRefSchema.nullish(),
    minPriceListPrice: z.coerce.number().nullish(),
    minPricePromoLabel: z.string().nullish(),
    priceCount: z.coerce.number().nullish(),
    otherPrices: z
      .array(
        z
          .object({
            store: storeRefSchema,
            price: z.coerce.number(),
          })
          .loose()
      )
      .nullish(),
  })
  .loose();

const searchResponseSchema = z
  .object({
    products: z.array(searchProductSchema),
    total: z.coerce.number().nullish(),
  })
  .loose();

const productPriceSchema = z
  .object({
    price: z.coerce.number(),
    listPrice: z.coerce.number().nullish(),
    promoLabel: z.string().nullish(),
    recordedAt: z.string().nullish(),
    store: storeRefSchema,
  })
  .loose();

const pricesResponseSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    prices: z.array(productPriceSchema),
  })
  .loose();

export type CatalogStoreRef = z.infer<typeof storeRefSchema>;
export type CatalogSearchProduct = z.infer<typeof searchProductSchema>;
export type CatalogSearchResult = z.infer<typeof searchResponseSchema>;
export type CatalogProductPrice = z.infer<typeof productPriceSchema>;
export type CatalogPricesResult = z.infer<typeof pricesResponseSchema>;

function readCache(key: string): unknown | null {
  const entry = cache.get(key);
  if (!entry) {
    return null;
  }
  if (entry.expiresAt < Date.now()) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function writeCache(key: string, data: unknown) {
  if (cache.size >= CACHE_MAX_ENTRIES) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey !== undefined) {
      cache.delete(oldestKey);
    }
  }
  cache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, data });
}

async function fetchJson(path: string): Promise<unknown> {
  const baseUrl = getBaseUrl();
  if (!baseUrl) {
    throw new PriceCatalogError("El catálogo de precios online no está configurado");
  }

  const cached = readCache(path);
  if (cached !== null) {
    return cached;
  }

  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      headers: {
        accept: "application/json, text/plain, */*",
        "accept-language": "es-AR,es;q=0.9,en;q=0.8",
        referer: `${baseUrl}/`,
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36",
      },
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
  } catch {
    throw new PriceCatalogError("El servicio de precios no respondió");
  }

  if (!response.ok) {
    throw new PriceCatalogError(
      `El servicio de precios devolvió un error (${response.status})`
    );
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new PriceCatalogError("El servicio de precios devolvió una respuesta inválida");
  }

  writeCache(path, data);
  return data;
}

export async function searchProducts(
  query: string,
  offset = 0,
  limit = 20
): Promise<CatalogSearchResult> {
  const params = new URLSearchParams({
    q: query,
    offset: String(offset),
    limit: String(limit),
  });
  const data = await fetchJson(`/api/products/search?${params.toString()}`);
  const parsed = searchResponseSchema.safeParse(data);
  if (!parsed.success) {
    throw new PriceCatalogError(
      "El servicio de precios devolvió un formato inesperado"
    );
  }
  return parsed.data;
}

export async function getProductPrices(externalId: string): Promise<CatalogPricesResult> {
  const data = await fetchJson(
    `/api/products/${encodeURIComponent(externalId)}/prices`
  );
  const parsed = pricesResponseSchema.safeParse(data);
  if (!parsed.success) {
    throw new PriceCatalogError(
      "El servicio de precios devolvió un formato inesperado"
    );
  }
  return parsed.data;
}
