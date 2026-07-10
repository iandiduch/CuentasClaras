import { alias } from "drizzle-orm/pg-core";
import { and, desc, eq, gte, lte } from "drizzle-orm";

import { db } from "@/lib/server/db";
import { requireUser } from "@/lib/server/route-helpers";
import { accounts, categories, counterparties, transactions } from "@/lib/server/schema";

export const runtime = "nodejs";

const MAX_LIMIT = 100;

const transferAccounts = alias(accounts, "transfer_accounts");

export async function GET(request: Request) {
  const user = await requireUser();
  if (user instanceof Response) return user;

  const { searchParams } = new URL(request.url);

  const direction = searchParams.get("direction");
  const categoryId = searchParams.get("categoryId");
  const accountId = searchParams.get("accountId");
  const id = searchParams.get("id");
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const limitParam = Number(searchParams.get("limit") ?? "20");
  const limit = Number.isFinite(limitParam)
    ? Math.min(Math.max(limitParam, 1), MAX_LIMIT)
    : 20;

  if (direction && direction !== "income" && direction !== "expense") {
    return Response.json({ error: "direction invalido" }, { status: 400 });
  }
  const normalizedDirection =
    direction === "income" || direction === "expense" ? direction : null;

  const filters = [eq(transactions.userId, user.id)];

  if (id) {
    filters.push(eq(transactions.id, id));
  }

  if (normalizedDirection) {
    filters.push(eq(transactions.direction, normalizedDirection));
  }

  if (categoryId) {
    filters.push(eq(transactions.categoryId, categoryId));
  }

  if (accountId) {
    filters.push(eq(transactions.accountId, accountId));
  }

  if (from) {
    const fromDate = new Date(from);
    if (Number.isNaN(fromDate.getTime())) {
      return Response.json({ error: "from invalido" }, { status: 400 });
    }
    filters.push(gte(transactions.occurredAt, fromDate));
  }

  if (to) {
    const toDate = new Date(to);
    if (Number.isNaN(toDate.getTime())) {
      return Response.json({ error: "to invalido" }, { status: 400 });
    }
    filters.push(lte(transactions.occurredAt, toDate));
  }

  const rows = await db
    .select({
      id: transactions.id,
      direction: transactions.direction,
      kind: transactions.kind,
      includeInTotals: transactions.includeInTotals,
      amount: transactions.amount,
      currency: transactions.currency,
      occurredAt: transactions.occurredAt,
      concept: transactions.concept,
      notes: transactions.notes,
      status: transactions.status,
      categoryId: transactions.categoryId,
      categoryName: categories.name,
      categoryIcon: categories.icon,
      categoryColorHex: categories.colorHex,
      counterpartyName: counterparties.displayName,
      accountId: transactions.accountId,
      accountName: accounts.name,
      transferAccountId: transactions.transferAccountId,
      transferAccountName: transferAccounts.name,
      documentId: transactions.documentId,
      createdAt: transactions.createdAt,
    })
    .from(transactions)
    .leftJoin(categories, eq(categories.id, transactions.categoryId))
    .leftJoin(counterparties, eq(counterparties.id, transactions.counterpartyId))
    .leftJoin(accounts, eq(accounts.id, transactions.accountId))
    .leftJoin(transferAccounts, eq(transferAccounts.id, transactions.transferAccountId))
    .where(and(...filters))
    .orderBy(desc(transactions.occurredAt), desc(transactions.createdAt))
    .limit(limit);

  return Response.json({
    transactions: rows.map((row) => ({
      ...row,
      amount: Number(row.amount),
    })),
  });
}
