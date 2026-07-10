import { asc, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/lib/server/db";
import { parseOrRespond, requireUser } from "@/lib/server/route-helpers";
import { categories } from "@/lib/server/schema";

export const runtime = "nodejs";

const createCategorySchema = z.object({
  name: z.string().trim().min(2).max(60),
  direction: z.enum(["income", "expense", "both"]).default("both"),
  icon: z.string().trim().min(1).max(30).optional(),
  colorHex: z
    .string()
    .trim()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .optional(),
  includeInAnalysis: z.boolean().default(true),
  monthlyBudget: z.coerce.number().positive().optional().nullable(),
});

export async function GET() {
  const user = await requireUser();
  if (user instanceof Response) return user;

  const rows = await db
    .select({
      id: categories.id,
      name: categories.name,
      direction: categories.direction,
      icon: categories.icon,
      colorHex: categories.colorHex,
      isSystem: categories.isSystem,
      includeInAnalysis: categories.includeInAnalysis,
      monthlyBudget: categories.monthlyBudget,
    })
    .from(categories)
    .where(eq(categories.userId, user.id))
    .orderBy(asc(categories.name));

  return Response.json({
    categories: rows.map((row) => ({
      ...row,
      monthlyBudget: row.monthlyBudget === null ? null : Number(row.monthlyBudget),
    })),
  });
}

export async function POST(request: Request) {
  const payload = parseOrRespond(createCategorySchema, await request.json());
  if (payload instanceof Response) return payload;

  const user = await requireUser();
  if (user instanceof Response) return user;

  const now = new Date();

  const [category] = await db
    .insert(categories)
    .values({
      userId: user.id,
      name: payload.name,
      direction: payload.direction,
      icon: payload.icon ?? null,
      colorHex: payload.colorHex ?? null,
      isSystem: false,
      includeInAnalysis: payload.includeInAnalysis,
      monthlyBudget:
        payload.monthlyBudget === undefined || payload.monthlyBudget === null
          ? null
          : payload.monthlyBudget.toFixed(2),
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing({
      target: [categories.userId, categories.name, categories.direction],
    })
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

  if (!category) {
    return Response.json(
      { error: "Ya existe una categoria con ese nombre/direccion" },
      { status: 409 }
    );
  }

  return Response.json(
    {
      category: {
        ...category,
        monthlyBudget: category.monthlyBudget === null ? null : Number(category.monthlyBudget),
      },
    },
    { status: 201 }
  );
}
