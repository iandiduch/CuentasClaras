import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/lib/server/db";
import { parseOrRespond, requireUser } from "@/lib/server/route-helpers";
import {
  shoppingListItems,
  shoppingLists,
  shoppingProducts,
  shoppingStores,
} from "@/lib/server/schema";
import { getShoppingListForUser, upsertShoppingStore } from "@/lib/server/shopping";

export const runtime = "nodejs";

const idSchema = z.string().uuid();

const patchSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    storeId: z.string().uuid().nullable().optional(),
    storeName: z.string().trim().min(1).max(140).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "Nada para actualizar",
  });

type RouteParams = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, { params }: RouteParams) {
  const user = await requireUser();
  if (user instanceof Response) return user;

  const { id } = await params;
  if (!idSchema.safeParse(id).success) {
    return Response.json({ error: "Lista inválida" }, { status: 400 });
  }

  const list = await getShoppingListForUser(id, user.id);
  if (!list) {
    return Response.json({ error: "Lista no encontrada" }, { status: 404 });
  }

  const [store] = list.storeId
    ? await db
        .select({
          id: shoppingStores.id,
          name: shoppingStores.name,
          slug: shoppingStores.slug,
        })
        .from(shoppingStores)
        .where(eq(shoppingStores.id, list.storeId))
        .limit(1)
    : [];

  const items = await db
    .select({
      id: shoppingListItems.id,
      label: shoppingListItems.label,
      quantity: shoppingListItems.quantity,
      refPrice: shoppingListItems.refPrice,
      refStoreName: shoppingListItems.refStoreName,
      refStoreSlug: shoppingListItems.refStoreSlug,
      refCapturedAt: shoppingListItems.refCapturedAt,
      checked: shoppingListItems.checked,
      paidUnitPrice: shoppingListItems.paidUnitPrice,
      sortOrder: shoppingListItems.sortOrder,
      productId: shoppingProducts.id,
      productSource: shoppingProducts.source,
      productExternalId: shoppingProducts.externalId,
      productImageUrl: shoppingProducts.imageUrl,
      productBrand: shoppingProducts.brand,
    })
    .from(shoppingListItems)
    .innerJoin(shoppingProducts, eq(shoppingProducts.id, shoppingListItems.productId))
    .where(eq(shoppingListItems.listId, list.id))
    .orderBy(asc(shoppingListItems.sortOrder), asc(shoppingListItems.createdAt));

  return Response.json({
    list: {
      id: list.id,
      name: list.name,
      status: list.status,
      storeId: list.storeId,
      storeName: list.storeName ?? store?.name ?? null,
      purchasedAt: list.purchasedAt,
      total: list.total != null ? Number(list.total) : null,
      currency: list.currency,
      registeredTransactionId: list.registeredTransactionId,
      ticketDocumentId: list.ticketDocumentId,
      closedAt: list.closedAt,
      createdAt: list.createdAt,
      store: store ?? null,
    },
    items: items.map((item) => ({
      id: item.id,
      label: item.label,
      quantity: Number(item.quantity),
      refPrice: item.refPrice != null ? Number(item.refPrice) : null,
      refStoreName: item.refStoreName,
      refStoreSlug: item.refStoreSlug,
      refCapturedAt: item.refCapturedAt,
      checked: item.checked,
      paidUnitPrice: item.paidUnitPrice != null ? Number(item.paidUnitPrice) : null,
      sortOrder: item.sortOrder,
      product: {
        id: item.productId,
        source: item.productSource,
        externalId: item.productExternalId,
        imageUrl: item.productImageUrl,
        brand: item.productBrand,
      },
    })),
  });
}

export async function PATCH(request: Request, { params }: RouteParams) {
  const user = await requireUser();
  if (user instanceof Response) return user;

  const { id } = await params;
  if (!idSchema.safeParse(id).success) {
    return Response.json({ error: "Lista inválida" }, { status: 400 });
  }

  const payload = parseOrRespond(patchSchema, await request.json());
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

  const updates: Partial<typeof shoppingLists.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (payload.name !== undefined) {
    updates.name = payload.name;
  }

  if (payload.storeName !== undefined) {
    const store = await upsertShoppingStore({ userId: user.id, name: payload.storeName });
    if (!store) {
      return Response.json({ error: "No se pudo guardar el súper" }, { status: 500 });
    }
    updates.storeId = store.id;
  } else if (payload.storeId !== undefined) {
    if (payload.storeId === null) {
      updates.storeId = null;
    } else {
      const [store] = await db
        .select({ id: shoppingStores.id })
        .from(shoppingStores)
        .where(
          and(eq(shoppingStores.id, payload.storeId), eq(shoppingStores.userId, user.id))
        )
        .limit(1);

      if (!store) {
        return Response.json(
          { error: "El súper no existe o no pertenece al usuario" },
          { status: 400 }
        );
      }
      updates.storeId = store.id;
    }
  }

  const [updated] = await db
    .update(shoppingLists)
    .set(updates)
    .where(eq(shoppingLists.id, list.id))
    .returning({
      id: shoppingLists.id,
      name: shoppingLists.name,
      status: shoppingLists.status,
      storeId: shoppingLists.storeId,
    });

  return Response.json({ list: updated });
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  const user = await requireUser();
  if (user instanceof Response) return user;

  const { id } = await params;
  if (!idSchema.safeParse(id).success) {
    return Response.json({ error: "Lista inválida" }, { status: 400 });
  }

  const list = await getShoppingListForUser(id, user.id);
  if (!list) {
    return Response.json({ error: "Lista no encontrada" }, { status: 404 });
  }

  await db.delete(shoppingLists).where(eq(shoppingLists.id, list.id));

  return Response.json({
    deleted: true,
    transactionKept: list.registeredTransactionId != null,
  });
}
