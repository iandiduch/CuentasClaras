import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/lib/server/db";
import { parseOrRespond, requireUser } from "@/lib/server/route-helpers";
import { shoppingListItems } from "@/lib/server/schema";
import { getShoppingListForUser } from "@/lib/server/shopping";

export const runtime = "nodejs";

const idSchema = z.string().uuid();

const patchSchema = z
  .object({
    label: z.string().trim().min(1).max(200).optional(),
    quantity: z.coerce.number().positive().max(999).optional(),
    checked: z.boolean().optional(),
    paidUnitPrice: z.coerce.number().nonnegative().nullable().optional(),
    sortOrder: z.coerce.number().int().min(0).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "Nada para actualizar",
  });

type RouteParams = {
  params: Promise<{ id: string; itemId: string }>;
};

async function loadContext(params: RouteParams["params"], userId: string) {
  const { id, itemId } = await params;
  if (!idSchema.safeParse(id).success || !idSchema.safeParse(itemId).success) {
    return { error: Response.json({ error: "Identificador inválido" }, { status: 400 }) };
  }

  const list = await getShoppingListForUser(id, userId);
  if (!list) {
    return { error: Response.json({ error: "Lista no encontrada" }, { status: 404 }) };
  }
  if (list.status !== "active") {
    return {
      error: Response.json(
        { error: "La lista está cerrada y no se puede modificar" },
        { status: 409 }
      ),
    };
  }

  const [item] = await db
    .select()
    .from(shoppingListItems)
    .where(
      and(eq(shoppingListItems.id, itemId), eq(shoppingListItems.listId, list.id))
    )
    .limit(1);

  if (!item) {
    return { error: Response.json({ error: "Ítem no encontrado" }, { status: 404 }) };
  }

  return { list, item };
}

export async function PATCH(request: Request, { params }: RouteParams) {
  const user = await requireUser();
  if (user instanceof Response) return user;

  const payload = parseOrRespond(patchSchema, await request.json());
  if (payload instanceof Response) return payload;

  const context = await loadContext(params, user.id);
  if ("error" in context) {
    return context.error;
  }

  const updates: Partial<typeof shoppingListItems.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (payload.label !== undefined) {
    updates.label = payload.label;
  }
  if (payload.quantity !== undefined) {
    updates.quantity = payload.quantity.toString();
  }
  if (payload.checked !== undefined) {
    updates.checked = payload.checked;
  }
  if (payload.paidUnitPrice !== undefined) {
    updates.paidUnitPrice =
      payload.paidUnitPrice != null ? payload.paidUnitPrice.toFixed(2) : null;
  }
  if (payload.sortOrder !== undefined) {
    updates.sortOrder = payload.sortOrder;
  }

  const [updated] = await db
    .update(shoppingListItems)
    .set(updates)
    .where(eq(shoppingListItems.id, context.item.id))
    .returning();

  if (!updated) {
    return Response.json({ error: "No se pudo actualizar el ítem" }, { status: 500 });
  }

  return Response.json({
    item: {
      id: updated.id,
      label: updated.label,
      quantity: Number(updated.quantity),
      refPrice: updated.refPrice != null ? Number(updated.refPrice) : null,
      refStoreName: updated.refStoreName,
      refStoreSlug: updated.refStoreSlug,
      checked: updated.checked,
      paidUnitPrice: updated.paidUnitPrice != null ? Number(updated.paidUnitPrice) : null,
      sortOrder: updated.sortOrder,
    },
  });
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  const user = await requireUser();
  if (user instanceof Response) return user;

  const context = await loadContext(params, user.id);
  if ("error" in context) {
    return context.error;
  }

  await db.delete(shoppingListItems).where(eq(shoppingListItems.id, context.item.id));

  return Response.json({ deleted: true });
}
