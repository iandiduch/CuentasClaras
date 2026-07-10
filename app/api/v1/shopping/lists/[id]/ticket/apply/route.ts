import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/lib/server/db";
import { parseOrRespond, requireUser } from "@/lib/server/route-helpers";
import { documents, shoppingListItems, shoppingLists } from "@/lib/server/schema";
import { getShoppingListForUser, upsertManualProduct } from "@/lib/server/shopping";

export const runtime = "nodejs";

const idSchema = z.string().uuid();

const applySchema = z.object({
  documentId: z.string().uuid(),
  assignments: z
    .array(
      z.object({
        itemId: z.string().uuid(),
        unitPrice: z.coerce.number().nonnegative(),
        quantity: z.coerce.number().positive().max(999).optional(),
      })
    )
    .default([]),
  newItems: z
    .array(
      z.object({
        label: z.string().trim().min(1).max(200),
        quantity: z.coerce.number().positive().max(999).default(1),
        unitPrice: z.coerce.number().nonnegative(),
      })
    )
    .default([]),
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

  const payload = parseOrRespond(applySchema, await request.json());
  if (payload instanceof Response) return payload;

  const list = await getShoppingListForUser(id, user.id);
  if (!list) {
    return Response.json({ error: "Lista no encontrada" }, { status: 404 });
  }
  if (list.status !== "active") {
    return Response.json({ error: "La lista ya está cerrada" }, { status: 409 });
  }

  const [document] = await db
    .select({ id: documents.id })
    .from(documents)
    .where(and(eq(documents.id, payload.documentId), eq(documents.userId, user.id)))
    .limit(1);

  if (!document) {
    return Response.json(
      { error: "El ticket no existe o no pertenece al usuario" },
      { status: 400 }
    );
  }

  const now = new Date();

  if (payload.assignments.length > 0) {
    const itemIds = payload.assignments.map((assignment) => assignment.itemId);
    const ownedItems = await db
      .select({ id: shoppingListItems.id })
      .from(shoppingListItems)
      .where(
        and(
          eq(shoppingListItems.listId, list.id),
          inArray(shoppingListItems.id, itemIds)
        )
      );

    if (ownedItems.length !== itemIds.length) {
      return Response.json(
        { error: "Algún ítem no existe o no pertenece a la lista" },
        { status: 400 }
      );
    }

    for (const assignment of payload.assignments) {
      await db
        .update(shoppingListItems)
        .set({
          checked: true,
          paidUnitPrice: assignment.unitPrice.toFixed(2),
          ...(assignment.quantity !== undefined
            ? { quantity: assignment.quantity.toString() }
            : {}),
          updatedAt: now,
        })
        .where(eq(shoppingListItems.id, assignment.itemId));
    }
  }

  if (payload.newItems.length > 0) {
    const [{ nextSortOrder }] = await db
      .select({
        nextSortOrder: sql<number>`coalesce(max(${shoppingListItems.sortOrder}), 0) + 1`,
      })
      .from(shoppingListItems)
      .where(eq(shoppingListItems.listId, list.id));

    let sortOrder = nextSortOrder;
    for (const newItem of payload.newItems) {
      const product = await upsertManualProduct(user.id, newItem.label);
      if (!product) {
        return Response.json(
          { error: `No se pudo guardar el producto "${newItem.label}"` },
          { status: 500 }
        );
      }

      await db.insert(shoppingListItems).values({
        userId: user.id,
        listId: list.id,
        productId: product.id,
        label: newItem.label,
        quantity: newItem.quantity.toString(),
        checked: true,
        paidUnitPrice: newItem.unitPrice.toFixed(2),
        sortOrder,
        createdAt: now,
        updatedAt: now,
      });
      sortOrder += 1;
    }
  }

  await db
    .update(shoppingLists)
    .set({ ticketDocumentId: document.id, updatedAt: now })
    .where(eq(shoppingLists.id, list.id));

  return Response.json({ ok: true, documentId: document.id });
}
