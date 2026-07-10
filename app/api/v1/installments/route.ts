import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";

import { upsertCounterpartyByName } from "@/lib/server/counterparties";
import { db } from "@/lib/server/db";
import { normalizeCurrency } from "@/lib/server/normalize";
import { parseOrRespond, requireUser } from "@/lib/server/route-helpers";
import {
  accounts,
  categories,
  counterparties,
  installmentPlans,
  transactions,
} from "@/lib/server/schema";

export const runtime = "nodejs";

const createInstallmentSchema = z.object({
  concept: z.string().trim().min(2).max(140),
  totalAmount: z.coerce.number().positive(),
  installmentsCount: z.coerce.number().int().min(1).max(60),
  startDate: z.string().trim(),
  currency: z.string().trim().length(3).optional(),
  categoryId: z.string().uuid().optional().nullable(),
  accountId: z.string().uuid().optional().nullable(),
  counterpartyName: z.string().trim().min(2).max(140).optional().nullable(),
});

function addMonths(date: Date, offset: number) {
  const copy = new Date(date);
  copy.setUTCMonth(copy.getUTCMonth() + offset);
  return copy;
}

export async function GET() {
  const user = await requireUser();
  if (user instanceof Response) return user;

  const plans = await db
    .select({
      id: installmentPlans.id,
      concept: installmentPlans.concept,
      totalAmount: installmentPlans.totalAmount,
      installmentsCount: installmentPlans.installmentsCount,
      installmentAmount: installmentPlans.installmentAmount,
      startDate: installmentPlans.startDate,
      currency: installmentPlans.currency,
      categoryId: installmentPlans.categoryId,
      categoryName: categories.name,
      accountId: installmentPlans.accountId,
      accountName: accounts.name,
      counterpartyName: counterparties.displayName,
      status: installmentPlans.status,
      createdAt: installmentPlans.createdAt,
    })
    .from(installmentPlans)
    .leftJoin(categories, eq(categories.id, installmentPlans.categoryId))
    .leftJoin(accounts, eq(accounts.id, installmentPlans.accountId))
    .leftJoin(counterparties, eq(counterparties.id, installmentPlans.counterpartyId))
    .where(eq(installmentPlans.userId, user.id))
    .orderBy(asc(installmentPlans.startDate));

  if (!plans.length) {
    return Response.json({ plans: [] });
  }

  const installmentRows = await db
    .select({
      installmentPlanId: transactions.installmentPlanId,
      occurredAt: transactions.occurredAt,
    })
    .from(transactions)
    .where(eq(transactions.userId, user.id));

  const now = new Date();
  const byPlan = new Map<string, Date[]>();
  for (const row of installmentRows) {
    if (!row.installmentPlanId) continue;
    const list = byPlan.get(row.installmentPlanId) ?? [];
    list.push(row.occurredAt);
    byPlan.set(row.installmentPlanId, list);
  }

  return Response.json({
    plans: plans.map((plan) => {
      const dates = (byPlan.get(plan.id) ?? []).sort((a, b) => a.getTime() - b.getTime());
      const paidCount = dates.filter((date) => date.getTime() <= now.getTime()).length;
      const nextUnpaid = dates.find((date) => date.getTime() > now.getTime());
      return {
        ...plan,
        totalAmount: Number(plan.totalAmount),
        installmentAmount: Number(plan.installmentAmount),
        paidCount,
        remainingCount: plan.installmentsCount - paidCount,
        nextDueDate: nextUnpaid ? nextUnpaid.toISOString() : null,
      };
    }),
  });
}

export async function POST(request: Request) {
  const payload = parseOrRespond(createInstallmentSchema, await request.json());
  if (payload instanceof Response) return payload;

  const user = await requireUser();
  if (user instanceof Response) return user;

  const startDate = new Date(payload.startDate);

  if (Number.isNaN(startDate.getTime())) {
    return Response.json({ error: "startDate invalido" }, { status: 400 });
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

    if (category.direction !== "both" && category.direction !== "expense") {
      return Response.json(
        { error: "La categoria no coincide con un gasto" },
        { status: 400 }
      );
    }
  }

  const currency = normalizeCurrency(payload.currency ?? user.defaultCurrency);
  if (!/^[A-Z]{3}$/.test(currency)) {
    return Response.json(
      { error: "Moneda invalida. Usa formato ISO-4217 (ej: ARS)" },
      { status: 400 }
    );
  }

  const now = new Date();
  const counterpartyId = payload.counterpartyName
    ? await upsertCounterpartyByName(user.id, payload.counterpartyName)
    : null;

  // Split in whole cents so the sum of installments always reconciles
  // exactly to totalAmount — the last installment absorbs the remainder.
  const totalCents = Math.round(payload.totalAmount * 100);
  const perInstallmentCents = Math.floor(totalCents / payload.installmentsCount);
  const remainderCents = totalCents - perInstallmentCents * payload.installmentsCount;
  const lastInstallmentCents = perInstallmentCents + remainderCents;

  const plan = await db.transaction(async (tx) => {
    const [insertedPlan] = await tx
      .insert(installmentPlans)
      .values({
        userId: user.id,
        concept: payload.concept,
        totalAmount: payload.totalAmount.toFixed(2),
        installmentsCount: payload.installmentsCount,
        installmentAmount: (perInstallmentCents / 100).toFixed(2),
        startDate,
        currency,
        categoryId: payload.categoryId ?? null,
        accountId: payload.accountId ?? null,
        counterpartyId,
        status: "active",
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: installmentPlans.id });

    for (let i = 1; i <= payload.installmentsCount; i += 1) {
      const cents = i === payload.installmentsCount ? lastInstallmentCents : perInstallmentCents;
      await tx.insert(transactions).values({
        userId: user.id,
        accountId: payload.accountId ?? null,
        direction: "expense",
        kind: "standard",
        includeInTotals: true,
        amount: (cents / 100).toFixed(2),
        currency,
        occurredAt: addMonths(startDate, i - 1),
        counterpartyId,
        categoryId: payload.categoryId ?? null,
        installmentPlanId: insertedPlan.id,
        installmentNumber: i,
        concept: `${payload.concept} (cuota ${i}/${payload.installmentsCount})`,
        status: "manually_confirmed",
        manualOverride: true,
        createdBy: "user",
        createdAt: now,
        updatedAt: now,
      });
    }

    return insertedPlan;
  });

  return Response.json({ plan: { id: plan.id } }, { status: 201 });
}
