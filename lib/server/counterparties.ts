import { db } from "@/lib/server/db";
import { normalizeText } from "@/lib/server/normalize";
import { counterparties } from "@/lib/server/schema";

/**
 * Upsert-by-normalized-name, shared by every route that accepts a free-text
 * counterparty name (debts, installments, recurring expenses, manual
 * transactions, shopping purchases, etc.). Returns the counterparty id.
 *
 * Not used by the OCR ingestion pipeline (lib/server/document-pipeline.ts),
 * which has its own richer version that also carries taxId/cvu extracted
 * from the document — a different shape for a genuinely different caller,
 * left as-is rather than forced into this simpler signature.
 */
export async function upsertCounterpartyByName(
  userId: string,
  displayName: string
): Promise<string> {
  const now = new Date();
  const [row] = await db
    .insert(counterparties)
    .values({
      userId,
      displayName,
      normalizedName: normalizeText(displayName),
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [counterparties.userId, counterparties.normalizedName],
      set: {
        displayName,
        updatedAt: now,
      },
    })
    .returning({ id: counterparties.id });

  return row!.id;
}
