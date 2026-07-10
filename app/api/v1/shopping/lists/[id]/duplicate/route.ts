import { asc, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/lib/server/db";
import { parseOrRespond, requireUser } from "@/lib/server/route-helpers";
import { shoppingListItems, shoppingLists } from "@/lib/server/schema";
import { getShoppingListForUser } from "@/lib/server/shopping";

export const runtime = "nodejs";

const idSchema = z.string().uuid();

const duplicateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
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

  const body = await request.json().catch(() => ({}));
  const payload = parseOrRespond(duplicateSchema, body ?? {});
  if (payload instanceof Response) return payload;

  const source = await getShoppingListForUser(id, user.id);
  if (!source) {
    return Response.json({ error: "Lista no encontrada" }, { status: 404 });
  }

  const sourceItems = await db
    .select()
    .from(shoppingListItems)
    .where(eq(shoppingListItems.listId, source.id))
    .orderBy(asc(shoppingListItems.sortOrder), asc(shoppingListItems.createdAt));

  const now = new Date();
  const [newList] = await db
    .insert(shoppingLists)
    .values({
      userId: user.id,
      name: payload.name ?? source.name,
      createdAt: now,
      updatedAt: now,
    })
    .returning({
      id: shoppingLists.id,
      name: shoppingLists.name,
      status: shoppingLists.status,
    });

  if (!newList) {
    return Response.json({ error: "No se pudo crear la lista" }, { status: 500 });
  }

  if (sourceItems.length > 0) {
    await db.insert(shoppingListItems).values(
      sourceItems.map((item, index) => ({
        userId: user.id,
        listId: newList.id,
        productId: item.productId,
        label: item.label,
        quantity: item.quantity,
        refPrice: item.refPrice,
        refStoreName: item.refStoreName,
        refStoreSlug: item.refStoreSlug,
        refPricesJson: item.refPricesJson,
        refCapturedAt: item.refCapturedAt,
        checked: false,
        paidUnitPrice: null,
        sortOrder: index + 1,
        createdAt: now,
        updatedAt: now,
      }))
    );
  }

  return Response.json({ list: newList }, { status: 201 });
}
