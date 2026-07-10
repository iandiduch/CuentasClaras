import { and, eq, ne, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/lib/server/db";
import { parseOrRespond, requireUser } from "@/lib/server/route-helpers";
import { categories, categorizationRules, transactions } from "@/lib/server/schema";

export const runtime = "nodejs";

const routeIdSchema = z.string().uuid();

const updateCategorySchema = z
  .object({
    name: z.string().trim().min(2).max(60).optional(),
    direction: z.enum(["income", "expense", "both"]).optional(),
    icon: z.string().trim().max(30).optional().nullable(),
    colorHex: z
      .string()
      .trim()
      .regex(/^#[0-9A-Fa-f]{6}$/)
      .optional()
      .nullable(),
    includeInAnalysis: z.boolean().optional(),
    monthlyBudget: z.coerce.number().positive().optional().nullable(),
  })
  .refine((payload) => Object.keys(payload).length > 0, {
    message: "Debes enviar al menos un campo para actualizar",
  });

type RouteParams = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, { params }: RouteParams) {
  const user = await requireUser();
  if (user instanceof Response) return user;

  const { id } = await params;

  const parseId = routeIdSchema.safeParse(id);
  if (!parseId.success) {
    return Response.json({ error: "categoryId invalido" }, { status: 400 });
  }

  const payload = parseOrRespond(updateCategorySchema, await request.json());
  if (payload instanceof Response) return payload;

  const categoryId = parseId.data;
  const now = new Date();

  const [category] = await db
    .select({
      id: categories.id,
      direction: categories.direction,
    })
    .from(categories)
    .where(and(eq(categories.id, categoryId), eq(categories.userId, user.id)))
    .limit(1);

  if (!category) {
    return Response.json({ error: "Categoria no encontrada" }, { status: 404 });
  }

  const nextDirection = payload.direction ?? category.direction;
  if (nextDirection !== "both") {
    const [usage] = await db
      .select({
        count: sql<number>`count(*)::int`,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, user.id),
          eq(transactions.categoryId, categoryId),
          ne(transactions.direction, nextDirection)
        )
      );

    if ((usage?.count ?? 0) > 0) {
      return Response.json(
        {
          error:
            "No se puede cambiar la direccion: hay movimientos existentes con direccion incompatible.",
        },
        { status: 409 }
      );
    }
  }

  try {
    const [updated] = await db
      .update(categories)
      .set({
        name: payload.name ?? undefined,
        direction: payload.direction ?? undefined,
        icon: payload.icon === undefined ? undefined : payload.icon,
        colorHex: payload.colorHex === undefined ? undefined : payload.colorHex,
        isSystem: false,
        includeInAnalysis: payload.includeInAnalysis ?? undefined,
        monthlyBudget:
          payload.monthlyBudget === undefined
            ? undefined
            : payload.monthlyBudget === null
              ? null
              : payload.monthlyBudget.toFixed(2),
        updatedAt: now,
      })
      .where(and(eq(categories.id, categoryId), eq(categories.userId, user.id)))
      .returning({
        id: categories.id,
        name: categories.name,
        direction: categories.direction,
        icon: categories.icon,
        colorHex: categories.colorHex,
        isSystem: categories.isSystem,
        includeInAnalysis: categories.includeInAnalysis,
        monthlyBudget: categories.monthlyBudget,
      });

    if (!updated) {
      return Response.json({ error: "Categoria no encontrada" }, { status: 404 });
    }

    return Response.json({
      category: {
        ...updated,
        monthlyBudget: updated.monthlyBudget === null ? null : Number(updated.monthlyBudget),
      },
    });
  } catch {
    return Response.json(
      { error: "No se pudo actualizar la categoria. Revisa duplicados de nombre/direccion." },
      { status: 409 }
    );
  }
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  const user = await requireUser();
  if (user instanceof Response) return user;

  const { id } = await params;

  const parseId = routeIdSchema.safeParse(id);
  if (!parseId.success) {
    return Response.json({ error: "categoryId invalido" }, { status: 400 });
  }

  const categoryId = parseId.data;
  const now = new Date();

  const [category] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.id, categoryId), eq(categories.userId, user.id)))
    .limit(1);

  if (!category) {
    return Response.json({ error: "Categoria no encontrada" }, { status: 404 });
  }

  await db.transaction(async (tx) => {
    await tx
      .update(categorizationRules)
      .set({
        mode: "always_review",
        categoryId: null,
        updatedAt: now,
      })
      .where(
        and(
          eq(categorizationRules.userId, user.id),
          eq(categorizationRules.categoryId, categoryId)
        )
      );

    await tx
      .delete(categories)
      .where(and(eq(categories.id, categoryId), eq(categories.userId, user.id)));
  });

  return Response.json({ ok: true });
}
