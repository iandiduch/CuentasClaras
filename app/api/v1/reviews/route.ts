import { and, desc, eq, inArray } from "drizzle-orm";

import { db } from "@/lib/server/db";
import { resolveDisplayFilename } from "@/lib/server/filename";
import { requireUser } from "@/lib/server/route-helpers";
import {
  accounts,
  categories,
  counterparties,
  documents,
  reviewQueue,
  transactions,
} from "@/lib/server/schema";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const user = await requireUser();
  if (user instanceof Response) return user;

  const { searchParams } = new URL(request.url);
  const statusParam = searchParams.get("status");

  const statuses =
    statusParam === "resolved"
      ? (["resolved"] as const)
      : statusParam === "dismissed"
        ? (["dismissed"] as const)
        : statusParam === "all"
          ? (["pending", "in_progress", "resolved", "dismissed"] as const)
          : (["pending", "in_progress"] as const);

  const rows = await db
    .select({
      id: reviewQueue.id,
      reason: reviewQueue.reason,
      status: reviewQueue.status,
      details: reviewQueue.details,
      createdAt: reviewQueue.createdAt,
      documentId: documents.id,
      originalFilename: documents.originalFilename,
      mimeType: documents.mimeType,
      uploadedAt: documents.uploadedAt,
      transactionId: transactions.id,
      direction: transactions.direction,
      amount: transactions.amount,
      currency: transactions.currency,
      occurredAt: transactions.occurredAt,
      concept: transactions.concept,
      transactionStatus: transactions.status,
      categoryId: categories.id,
      categoryName: categories.name,
      counterpartyId: counterparties.id,
      counterpartyName: counterparties.displayName,
      accountId: accounts.id,
      accountName: accounts.name,
    })
    .from(reviewQueue)
    .leftJoin(documents, eq(documents.id, reviewQueue.documentId))
    .leftJoin(transactions, eq(transactions.id, reviewQueue.transactionId))
    .leftJoin(categories, eq(categories.id, transactions.categoryId))
    .leftJoin(counterparties, eq(counterparties.id, transactions.counterpartyId))
    .leftJoin(accounts, eq(accounts.id, transactions.accountId))
    .where(
      and(
        eq(reviewQueue.userId, user.id),
        inArray(reviewQueue.status, statuses)
      )
    )
    .orderBy(desc(reviewQueue.createdAt));

  return Response.json({
    reviews: rows.map((row) => ({
      id: row.id,
      reason: row.reason,
      status: row.status,
      details: row.details,
      createdAt: row.createdAt,
      document: {
        id: row.documentId,
        originalFilename: row.documentId
          ? resolveDisplayFilename(row.originalFilename, row.uploadedAt, row.mimeType)
          : null,
        mimeType: row.mimeType,
      },
      transaction: row.transactionId
        ? {
            id: row.transactionId,
            direction: row.direction,
            amount: row.amount ? Number(row.amount) : null,
            currency: row.currency,
            occurredAt: row.occurredAt,
            concept: row.concept,
            status: row.transactionStatus,
            categoryId: row.categoryId,
            categoryName: row.categoryName,
            counterpartyId: row.counterpartyId,
            counterpartyName: row.counterpartyName,
            accountId: row.accountId,
            accountName: row.accountName,
          }
        : null,
    })),
  });
}

