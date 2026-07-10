import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/lib/server/db";
import { getIngestJobForUser } from "@/lib/server/ingest-queue";
import type { TicketExtraction, TicketLine } from "@/lib/server/mistral-ticket";
import { TICKET_EXTRACTOR_NAME } from "@/lib/server/mistral-ticket";
import { requireUser } from "@/lib/server/route-helpers";
import {
  documentExtractions,
  shoppingListItems,
  shoppingProducts,
} from "@/lib/server/schema";
import { matchTicketLines } from "@/lib/server/shopping-matching";

export const runtime = "nodejs";

const idSchema = z.string().uuid();

type RouteParams = {
  params: Promise<{ jobId: string }>;
};

function parseExtraction(rawJson: unknown): TicketExtraction {
  const raw = (rawJson ?? {}) as Partial<TicketExtraction>;
  const items: TicketLine[] = Array.isArray(raw.items)
    ? raw.items.map((item) => ({
        name: typeof item.name === "string" ? item.name : "",
        quantity: typeof item.quantity === "number" && item.quantity > 0 ? item.quantity : 1,
        unitPrice: typeof item.unitPrice === "number" ? item.unitPrice : null,
        lineTotal: typeof item.lineTotal === "number" ? item.lineTotal : null,
        ean: typeof item.ean === "string" ? item.ean : null,
      }))
    : [];

  return {
    storeName: typeof raw.storeName === "string" ? raw.storeName : null,
    total: typeof raw.total === "number" ? raw.total : null,
    purchasedAt: typeof raw.purchasedAt === "string" ? raw.purchasedAt : null,
    items: items.filter((item) => item.name.length > 0),
  };
}

export async function GET(_request: Request, { params }: RouteParams) {
  const user = await requireUser();
  if (user instanceof Response) return user;

  const { jobId } = await params;
  if (!idSchema.safeParse(jobId).success) {
    return Response.json({ error: "Job inválido" }, { status: 400 });
  }

  const job = await getIngestJobForUser(jobId, user.id);
  if (!job || job.kind !== "shopping_ticket") {
    return Response.json({ error: "Job no encontrado" }, { status: 404 });
  }

  const base = {
    jobId: job.id,
    status: job.status,
    attempts: job.attempts,
    maxAttempts: job.maxAttempts,
    lastError: job.status === "failed" ? job.lastError : null,
    documentId: job.documentId,
  };

  if (job.status !== "completed") {
    return Response.json(base);
  }

  const [extraction] = await db
    .select({
      rawJson: documentExtractions.rawJson,
      createdAt: documentExtractions.createdAt,
    })
    .from(documentExtractions)
    .where(
      and(
        eq(documentExtractions.documentId, job.documentId),
        eq(documentExtractions.extractor, TICKET_EXTRACTOR_NAME)
      )
    )
    .orderBy(desc(documentExtractions.createdAt))
    .limit(1);

  if (!extraction) {
    return Response.json({
      ...base,
      ticket: null,
      proposals: [],
    });
  }

  const ticket = parseExtraction(extraction.rawJson);

  const listId =
    job.payload && typeof job.payload === "object"
      ? (job.payload as Record<string, unknown>).listId
      : null;

  let proposals: ReturnType<typeof matchTicketLines> = [];

  if (typeof listId === "string" && idSchema.safeParse(listId).success) {
    const items = await db
      .select({
        id: shoppingListItems.id,
        label: shoppingListItems.label,
        checked: shoppingListItems.checked,
        productName: shoppingProducts.name,
        productBrand: shoppingProducts.brand,
        productEan: shoppingProducts.ean,
      })
      .from(shoppingListItems)
      .innerJoin(shoppingProducts, eq(shoppingProducts.id, shoppingListItems.productId))
      .where(
        and(
          eq(shoppingListItems.listId, listId),
          eq(shoppingListItems.userId, user.id)
        )
      );

    proposals = matchTicketLines(ticket.items, items);
  }

  return Response.json({
    ...base,
    ticket,
    proposals,
  });
}
