import { eq } from "drizzle-orm";

import { db } from "@/lib/server/db";
import {
  ShoppingTicketExtractionService,
  TICKET_EXTRACTOR_NAME,
  TICKET_PROMPT_VERSION,
} from "@/lib/server/mistral-ticket";
import { documentExtractions, documents } from "@/lib/server/schema";
import { readStoredFile } from "@/lib/server/storage";

export async function processShoppingTicket(params: { documentId: string }): Promise<void> {
  const [document] = await db
    .select({
      id: documents.id,
      mimeType: documents.mimeType,
      storagePath: documents.storagePath,
    })
    .from(documents)
    .where(eq(documents.id, params.documentId))
    .limit(1);

  if (!document) {
    throw new Error(`Documento ${params.documentId} no encontrado`);
  }

  const now = new Date();
  await db
    .update(documents)
    .set({ status: "processing", processingError: null, updatedAt: now })
    .where(eq(documents.id, document.id));

  try {
    const fileBuffer = await readStoredFile(document.storagePath);
    const service = new ShoppingTicketExtractionService();
    const result = await service.extractTicket(
      fileBuffer.toString("base64"),
      document.mimeType
    );

    const finishedAt = new Date();
    await db.insert(documentExtractions).values({
      documentId: document.id,
      extractor: TICKET_EXTRACTOR_NAME,
      modelName: result.extractModel,
      promptVersion: TICKET_PROMPT_VERSION,
      rawText: result.ocrText || null,
      rawJson: result.extracted,
      extractedAmount:
        result.extracted.total != null ? result.extracted.total.toFixed(2) : null,
      extractedCounterpartyName: result.extracted.storeName,
      createdAt: finishedAt,
    });

    await db
      .update(documents)
      .set({ status: "processed", processingError: null, updatedAt: finishedAt })
      .where(eq(documents.id, document.id));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido";
    await db
      .update(documents)
      .set({
        status: "failed",
        processingError: message.slice(0, 1000),
        updatedAt: new Date(),
      })
      .where(eq(documents.id, document.id));
    throw error;
  }
}
