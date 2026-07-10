import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/lib/server/db";
import { normalizeText } from "@/lib/server/normalize";
import { parseOrRespond, requireUser } from "@/lib/server/route-helpers";
import {
  accounts,
  categories,
  categorizationRules,
  counterparties,
  reviewQueue,
  transactions,
} from "@/lib/server/schema";

export const runtime = "nodejs";

const resolveSchema = z.object({
  action: z.enum(["resolve", "dismiss"]).default("resolve"),
  categoryId: z.string().uuid().optional().nullable(),
  accountId: z.string().uuid().optional().nullable(),
  concept: z.string().trim().max(300).optional().nullable(),
  notes: z.string().trim().max(600).optional().nullable(),
  ruleMode: z.enum(["fixed_category", "always_review", "none"]).optional(),
});

type PatchParams = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, { params }: PatchParams) {
  const user = await requireUser();
  if (user instanceof Response) return user;

  const { id } = await params;
  const payload = parseOrRespond(resolveSchema, await request.json());
  if (payload instanceof Response) return payload;

  const now = new Date();

  const [review] = await db
    .select({
      id: reviewQueue.id,
      status: reviewQueue.status,
      transactionId: reviewQueue.transactionId,
    })
    .from(reviewQueue)
    .where(and(eq(reviewQueue.id, id), eq(reviewQueue.userId, user.id)))
    .limit(1);

  if (!review) {
    return Response.json({ error: "Revision no encontrada" }, { status: 404 });
  }

  if (payload.action === "dismiss") {
    await db
      .update(reviewQueue)
      .set({
        status: "dismissed",
        resolvedBy: user.id,
        resolvedAt: now,
        updatedAt: now,
      })
      .where(eq(reviewQueue.id, review.id));

    return Response.json({ ok: true, status: "dismissed" });
  }

  if (!review.transactionId) {
    await db
      .update(reviewQueue)
      .set({
        status: "resolved",
        resolvedBy: user.id,
        resolvedAt: now,
        updatedAt: now,
      })
      .where(eq(reviewQueue.id, review.id));

    return Response.json({ ok: true, status: "resolved" });
  }

  const [transaction] = await db
    .select({
      id: transactions.id,
      userId: transactions.userId,
      direction: transactions.direction,
      counterpartyId: transactions.counterpartyId,
    })
    .from(transactions)
    .where(and(eq(transactions.id, review.transactionId), eq(transactions.userId, user.id)))
    .limit(1);

  if (!transaction) {
    return Response.json({ error: "Movimiento no encontrado" }, { status: 404 });
  }

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

  if (payload.categoryId) {
    const [category] = await db
      .select({ direction: categories.direction })
      .from(categories)
      .where(and(eq(categories.id, payload.categoryId), eq(categories.userId, user.id)))
      .limit(1);

    if (!category) {
      return Response.json(
        { error: "La categoria no existe o no pertenece al usuario" },
        { status: 400 }
      );
    }

    if (category.direction !== "both" && category.direction !== transaction.direction) {
      return Response.json(
        { error: "La categoria no coincide con el tipo de movimiento" },
        { status: 400 }
      );
    }
  }

  await db
    .update(transactions)
    .set({
      categoryId: payload.categoryId ?? null,
      accountId: payload.accountId === undefined ? undefined : payload.accountId,
      concept: payload.concept ?? undefined,
      notes: payload.notes ?? undefined,
      status: "manually_confirmed",
      manualOverride: true,
      updatedAt: now,
    })
    .where(eq(transactions.id, transaction.id));

  if (payload.ruleMode && payload.ruleMode !== "none") {
    if (payload.ruleMode === "fixed_category" && !payload.categoryId) {
      return Response.json(
        { error: "categoryId es obligatorio cuando ruleMode=fixed_category" },
        { status: 400 }
      );
    }

    let counterpartyPattern = "unknown";
    if (transaction.counterpartyId) {
      const [counterparty] = await db
        .select({
          id: counterparties.id,
          normalizedName: counterparties.normalizedName,
        })
        .from(counterparties)
        .where(eq(counterparties.id, transaction.counterpartyId))
        .limit(1);

      if (counterparty?.normalizedName) {
        counterpartyPattern = counterparty.normalizedName;
      }
    }

    if (!counterpartyPattern || counterpartyPattern === "unknown") {
      counterpartyPattern = normalizeText("counterparty_unknown");
    }

    await db
      .insert(categorizationRules)
      .values({
        userId: user.id,
        counterpartyId: transaction.counterpartyId,
        counterpartyPattern,
        direction: transaction.direction,
        mode: payload.ruleMode,
        categoryId: payload.ruleMode === "fixed_category" ? payload.categoryId ?? null : null,
        matchType: "exact",
        priority: 100,
        minConfidence: "0.7000",
        isActive: true,
        learnedFromReview: true,
        hitsCount: 0,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [
          categorizationRules.userId,
          categorizationRules.counterpartyPattern,
          categorizationRules.direction,
          categorizationRules.matchType,
        ],
        set: {
          mode: payload.ruleMode,
          categoryId: payload.ruleMode === "fixed_category" ? payload.categoryId ?? null : null,
          counterpartyId: transaction.counterpartyId,
          isActive: true,
          updatedAt: now,
        },
      });
  }

  await db
    .update(reviewQueue)
    .set({
      status: "resolved",
      resolvedBy: user.id,
      resolvedAt: now,
      updatedAt: now,
    })
    .where(eq(reviewQueue.id, review.id));

  return Response.json({ ok: true, status: "resolved" });
}

