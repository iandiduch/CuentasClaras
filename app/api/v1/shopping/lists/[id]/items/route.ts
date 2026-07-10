import { eq, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/lib/server/db";
import { parseOrRespond, requireUser } from "@/lib/server/route-helpers";
import { shoppingListItems } from "@/lib/server/schema";
import {
  getShoppingListForUser,
  insertSnapshotsFromSearchProduct,
  upsertCatalogProduct,
  upsertManualProduct,
} from "@/lib/server/shopping";

export const runtime = "nodejs";

const idSchema = z.string().uuid();

const catalogProductSchema = z.object({
  externalId: z.string().trim().min(1).max(80),
  ean: z.string().trim().max(40).nullish(),
  name: z.string().trim().min(1).max(200),
  brand: z.string().trim().max(140).nullish(),
  category: z.string().trim().max(140).nullish(),
  imageUrl: z.string().trim().max(600).nullish(),
  minPrice: z.coerce.number().nonnegative().nullish(),
  minPriceStore: z
    .object({ name: z.string().trim().min(1), slug: z.string().trim().min(1) })
    .nullish(),
  otherPrices: z
    .array(
      z.object({
        store: z.object({ name: z.string().trim().min(1), slug: z.string().trim().min(1) }),
        price: z.coerce.number().nonnegative(),
      })
    )
    .optional(),
});

const createItemSchema = z.object({
  label: z.string().trim().min(1).max(200),
  quantity: z.coerce.number().positive().max(999).default(1),
  product: catalogProductSchema.nullish(),
});

type RouteParams = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, { params }: RouteParams) {
  const user = await requireUser();
  if (user instanceof Response) return user;

  const { id } = await params;
  if (!idSchema.safeParse(id).success) {
    return Response.json({ error: "Lista inválida" }, { status: 400 });
  }

  const payload = parseOrRespond(createItemSchema, await request.json());
  if (payload instanceof Response) return payload;

  const list = await getShoppingListForUser(id, user.id);
  if (!list) {
    return Response.json({ error: "Lista no encontrada" }, { status: 404 });
  }
  if (list.status !== "active") {
    return Response.json(
      { error: "La lista está cerrada y no se puede modificar" },
      { status: 409 }
    );
  }

  const now = new Date();

  const product = payload.product
    ? await upsertCatalogProduct(user.id, payload.product)
    : await upsertManualProduct(user.id, payload.label);

  if (!product) {
    return Response.json({ error: "No se pudo guardar el producto" }, { status: 500 });
  }

  if (payload.product) {
    await insertSnapshotsFromSearchProduct({
      userId: user.id,
      productId: product.id,
      product: payload.product,
    });
  }

  const [{ nextSortOrder }] = await db
    .select({
      nextSortOrder: sql<number>`coalesce(max(${shoppingListItems.sortOrder}), 0) + 1`,
    })
    .from(shoppingListItems)
    .where(eq(shoppingListItems.listId, list.id));

  const [item] = await db
    .insert(shoppingListItems)
    .values({
      userId: user.id,
      listId: list.id,
      productId: product.id,
      label: payload.label,
      quantity: payload.quantity.toString(),
      refPrice:
        payload.product?.minPrice != null ? payload.product.minPrice.toFixed(2) : null,
      refStoreName: payload.product?.minPriceStore?.name ?? null,
      refStoreSlug: payload.product?.minPriceStore?.slug ?? null,
      refPricesJson: payload.product?.otherPrices ?? null,
      refCapturedAt: payload.product ? now : null,
      sortOrder: nextSortOrder,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  if (!item) {
    return Response.json({ error: "No se pudo agregar el ítem" }, { status: 500 });
  }

  return Response.json(
    {
      item: {
        id: item.id,
        label: item.label,
        quantity: Number(item.quantity),
        refPrice: item.refPrice != null ? Number(item.refPrice) : null,
        refStoreName: item.refStoreName,
        refStoreSlug: item.refStoreSlug,
        checked: item.checked,
        paidUnitPrice: null,
        sortOrder: item.sortOrder,
        product: {
          id: product.id,
          source: product.source,
          externalId: product.externalId,
          imageUrl: product.imageUrl,
          brand: product.brand,
        },
      },
    },
    { status: 201 }
  );
}
