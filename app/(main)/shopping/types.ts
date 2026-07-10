export type ShoppingListSummary = {
  id: string;
  name: string;
  status: "active" | "closed";
  storeId: string | null;
  storeName: string | null;
  purchasedAt: string | null;
  total: number | null;
  currency: string;
  registeredTransactionId: string | null;
  closedAt: string | null;
  createdAt: string;
  itemCount: number;
  checkedCount: number;
  estimatedTotal: number | null;
  paidTotal: number | null;
};

export type ShoppingItemProduct = {
  id: string;
  source: "catalog" | "manual";
  externalId: string | null;
  imageUrl: string | null;
  brand: string | null;
};

export type ShoppingListItemDto = {
  id: string;
  label: string;
  quantity: number;
  refPrice: number | null;
  refStoreName: string | null;
  refStoreSlug: string | null;
  refCapturedAt: string | null;
  checked: boolean;
  paidUnitPrice: number | null;
  sortOrder: number;
  product: ShoppingItemProduct;
};

export type ShoppingListDetail = {
  id: string;
  name: string;
  status: "active" | "closed";
  storeId: string | null;
  storeName: string | null;
  purchasedAt: string | null;
  total: number | null;
  currency: string;
  registeredTransactionId: string | null;
  ticketDocumentId: string | null;
  closedAt: string | null;
  createdAt: string;
  store: { id: string; name: string; slug: string | null } | null;
};

export type CatalogSearchProductDto = {
  externalId: string;
  name: string;
  brand: string | null;
  category: string | null;
  ean: string | null;
  imageUrl: string | null;
  minPrice: number | null;
  minPriceStore: { name: string; slug: string } | null;
  minPriceListPrice: number | null;
  minPricePromoLabel: string | null;
  priceCount: number | null;
  otherPrices: Array<{ store: { name: string; slug: string }; price: number }>;
};

export type ShoppingStoreDto = {
  id: string;
  name: string;
  slug: string | null;
};

export type TicketLineDto = {
  name: string;
  quantity: number;
  unitPrice: number | null;
  lineTotal: number | null;
  ean: string | null;
};

export type TicketJobResponse = {
  jobId: string;
  status: "pending" | "processing" | "completed" | "failed" | "retry";
  attempts: number;
  maxAttempts: number;
  lastError: string | null;
  documentId: string;
  ticket?: {
    storeName: string | null;
    total: number | null;
    purchasedAt: string | null;
    items: TicketLineDto[];
  } | null;
  proposals?: Array<{ lineIndex: number; itemId: string | null; score: number }>;
};

// Accepts both "1.234,56" (coma decimal argentina) and "1234.56".
export function parsePriceInput(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const cleaned = trimmed.includes(",")
    ? trimmed.replace(/\./g, "").replace(",", ".")
    : trimmed;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}
