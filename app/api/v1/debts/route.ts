import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { upsertCounterpartyByName } from "@/lib/server/counterparties";
import { db } from "@/lib/server/db";
import { normalizeCurrency } from "@/lib/server/normalize";
import { parseOrRespond, requireUser } from "@/lib/server/route-helpers";
import { accounts, counterparties, debts } from "@/lib/server/schema";

export const runtime = "nodejs";

const createDebtSchema = z.object({
  direction: z.enum(["receivable", "payable"]),
  counterpartyName: z.string().trim().min(2).max(140),
  amount: z.coerce.number().positive(),
  currency: z.string().trim().length(3).optional(),
  concept: z.string().trim().max(280).optional().nullable(),
  reminderDate: z.string().trim().optional().nullable(),
});

export async function GET(request: Request) {
  const user = await requireUser();
  if (user instanceof Response) return user;

  const { searchParams } = new URL(request.url);
  const statusFilter = searchParams.get("status") ?? "open";

  const filters = [eq(debts.userId, user.id)];
  if (statusFilter !== "all") {
    if (statusFilter !== "open" && statusFilter !== "settled" && statusFilter !== "cancelled") {
      return Response.json({ error: "status invalido" }, { status: 400 });
    }
    filters.push(eq(debts.status, statusFilter));
  }

  const rows = await db
    .select({
      id: debts.id,
      direction: debts.direction,
      counterpartyName: counterparties.displayName,
      amount: debts.amount,
      currency: debts.currency,
      concept: debts.concept,
      reminderDate: debts.reminderDate,
      status: debts.status,
      settledAt: debts.settledAt,
      settledAccountName: accounts.name,
      createdAt: debts.createdAt,
    })
    .from(debts)
    .innerJoin(counterparties, eq(counterparties.id, debts.counterpartyId))
    .leftJoin(accounts, eq(accounts.id, debts.settledAccountId))
    .where(and(...filters))
    .orderBy(desc(debts.createdAt));

  return Response.json({
    debts: rows.map((row) => ({ ...row, amount: Number(row.amount) })),
  });
}

export async function POST(request: Request) {
  const payload = parseOrRespond(createDebtSchema, await request.json());
  if (payload instanceof Response) return payload;

  const user = await requireUser();
  if (user instanceof Response) return user;

  const now = new Date();

  const reminderDate = payload.reminderDate ? new Date(payload.reminderDate) : null;
  if (reminderDate && Number.isNaN(reminderDate.getTime())) {
    return Response.json({ error: "reminderDate invalido" }, { status: 400 });
  }

  const currency = normalizeCurrency(payload.currency ?? user.defaultCurrency);
  if (!/^[A-Z]{3}$/.test(currency)) {
    return Response.json(
      { error: "Moneda invalida. Usa formato ISO-4217 (ej: ARS)" },
      { status: 400 }
    );
  }

  const counterpartyId = await upsertCounterpartyByName(user.id, payload.counterpartyName);

  const [debt] = await db
    .insert(debts)
    .values({
      userId: user.id,
      direction: payload.direction,
      counterpartyId,
      amount: payload.amount.toFixed(2),
      currency,
      concept: payload.concept ?? null,
      reminderDate,
      status: "open",
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: debts.id });

  return Response.json({ debt: { id: debt.id } }, { status: 201 });
}
