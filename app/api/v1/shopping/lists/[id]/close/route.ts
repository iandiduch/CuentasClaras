import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { upsertCounterpartyByName } from "@/lib/server/counterparties";
import { db } from "@/lib/server/db";
import { normalizeCurrency } from "@/lib/server/normalize";
import { parseOrRespond, requireUser } from "@/lib/server/route-helpers";
import {
  accounts,
  categories,
  documents,
  shoppingListItems,
  shoppingLists,
  shoppingStores,
  transactions,
} from "@/lib/server/schema";
import { getShoppingListForUser, upsertShoppingStore } from "@/lib/server/shopping";

export const runtime = "nodejs";

const idSchema = z.string().uuid();

const closeSchema = z
  .object({
    storeId: z.string().uuid().optional(),
    storeName: z.string().trim().min(1).max(140).optional(),
    purchasedAt: z.string().trim().optional(),
    total: z.coerce.number().positive().optional(),
    registerTransaction: z.boolean(),
    categoryId: z.string().uuid().optional(),
    accountId: z.string().uuid().optional(),
    ticketDocumentId: z.string().uuid().optional(),
  })
  .refine((value) => value.storeId !== undefined || value.storeName !== undefined, {
    message: "Falta indicar el súper",
  })
  .refine((value) => !value.registerTransaction || value.categoryId !== undefined, {
    message: "Falta la categoría para registrar el gasto",
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

  const payload = parseOrRespond(closeSchema, await request.json());
  if (payload instanceof Response) return payload;

  const list = await getShoppingListForUser(id, user.id);
  if (!list) {
    return Response.json({ error: "Lista no encontrada" }, { status: 404 });
  }
  if (list.status !== "active") {
    return Response.json({ error: "La lista ya está cerrada" }, { status: 409 });
  }

  const now = new Date();
  const purchasedAt = payload.purchasedAt ? new Date(payload.purchasedAt) : now;
  if (Number.isNaN(purchasedAt.getTime())) {
    return Response.json({ error: "purchasedAt inválido" }, { status: 400 });
  }

  const checkedItems = await db
    .select({
      id: shoppingListItems.id,
      quantity: shoppingListItems.quantity,
      paidUnitPrice: shoppingListItems.paidUnitPrice,
    })
    .from(shoppingListItems)
    .where(
      and(eq(shoppingListItems.listId, list.id), eq(shoppingListItems.checked, true))
    );

  if (checkedItems.length === 0) {
    return Response.json(
      { error: "No hay ítems marcados como comprados" },
      { status: 400 }
    );
  }

  const itemsTotal = checkedItems.reduce((sum, item) => {
    if (item.paidUnitPrice == null) {
      return sum;
    }
    return sum + Number(item.paidUnitPrice) * Number(item.quantity);
  }, 0);

  const total = payload.total ?? itemsTotal;
  if (!(total > 0)) {
    return Response.json(
      { error: "El total debe ser mayor a cero (cargá precios o indicá el total)" },
      { status: 400 }
    );
  }

  let store;
  if (payload.storeId !== undefined) {
    const [existing] = await db
      .select()
      .from(shoppingStores)
      .where(
        and(eq(shoppingStores.id, payload.storeId), eq(shoppingStores.userId, user.id))
      )
      .limit(1);

    if (!existing) {
      return Response.json(
        { error: "El súper no existe o no pertenece al usuario" },
        { status: 400 }
      );
    }
    store = existing;
  } else {
    store = await upsertShoppingStore({ userId: user.id, name: payload.storeName! });
    if (!store) {
      return Response.json({ error: "No se pudo guardar el súper" }, { status: 500 });
    }
  }

  if (payload.ticketDocumentId) {
    const [document] = await db
      .select({ id: documents.id })
      .from(documents)
      .where(
        and(eq(documents.id, payload.ticketDocumentId), eq(documents.userId, user.id))
      )
      .limit(1);

    if (!document) {
      return Response.json(
        { error: "El ticket no existe o no pertenece al usuario" },
        { status: 400 }
      );
    }
  }

  let transactionId: string | null = null;

  if (payload.registerTransaction) {
    if (payload.accountId) {
      const [account] = await db
        .select({ id: accounts.id })
        .from(accounts)
        .where(and(eq(accounts.id, payload.accountId), eq(accounts.userId, user.id)))
        .limit(1);

      if (!account) {
        return Response.json(
          { error: "La cuenta no existe o no pertenece al usuario" },
          { status: 400 }
        );
      }
    }

    const [category] = await db
      .select({ direction: categories.direction })
      .from(categories)
      .where(
        and(eq(categories.id, payload.categoryId!), eq(categories.userId, user.id))
      )
      .limit(1);

    if (!category) {
      return Response.json(
        { error: "La categoría no existe o no pertenece al usuario" },
        { status: 400 }
      );
    }
    if (category.direction !== "both" && category.direction !== "expense") {
      return Response.json(
        { error: "La categoría no es de gastos" },
        { status: 400 }
      );
    }

    const counterpartyId = await upsertCounterpartyByName(user.id, store.name);

    const [transaction] = await db
      .insert(transactions)
      .values({
        userId: user.id,
        documentId: payload.ticketDocumentId ?? null,
        accountId: payload.accountId ?? null,
        direction: "expense",
        amount: total.toFixed(2),
        currency: normalizeCurrency(user.defaultCurrency),
        occurredAt: purchasedAt,
        counterpartyId,
        categoryId: payload.categoryId!,
        concept: `Súper: ${list.name}`,
        status: "manually_confirmed",
        manualOverride: true,
        categorizationConfidence: "1.0000",
        createdBy: "user",
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: transactions.id });

    if (!transaction) {
      return Response.json(
        { error: "No se pudo registrar el gasto" },
        { status: 500 }
      );
    }
    transactionId = transaction.id;

    if (store.counterpartyId !== counterpartyId) {
      await db
        .update(shoppingStores)
        .set({ counterpartyId, updatedAt: now })
        .where(eq(shoppingStores.id, store.id));
    }
  }

  const [closed] = await db
    .update(shoppingLists)
    .set({
      status: "closed",
      storeId: store.id,
      storeName: store.name,
      purchasedAt,
      total: total.toFixed(2),
      currency: normalizeCurrency(user.defaultCurrency),
      registeredTransactionId: transactionId,
      ticketDocumentId: payload.ticketDocumentId ?? list.ticketDocumentId ?? null,
      closedAt: now,
      updatedAt: now,
    })
    .where(eq(shoppingLists.id, list.id))
    .returning({
      id: shoppingLists.id,
      name: shoppingLists.name,
      status: shoppingLists.status,
      storeName: shoppingLists.storeName,
      purchasedAt: shoppingLists.purchasedAt,
      total: shoppingLists.total,
      registeredTransactionId: shoppingLists.registeredTransactionId,
    });

  if (!closed) {
    return Response.json({ error: "No se pudo cerrar la lista" }, { status: 500 });
  }

  return Response.json({
    list: {
      ...closed,
      total: closed.total != null ? Number(closed.total) : null,
    },
    transactionId,
  });
}
