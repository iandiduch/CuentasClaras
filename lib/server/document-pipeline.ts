import { and, asc, eq, sql } from "drizzle-orm";

import { db } from "@/lib/server/db";
import { findDebtMatch, settleDebtWithTransaction } from "@/lib/server/debt-matching";
import { findRecurringMatch } from "@/lib/server/recurring-expenses";
import { MistralExtraction, MistralIngestionService } from "@/lib/server/mistral-ingestion";
import { normalizeCurrency, normalizeText } from "@/lib/server/normalize";
import {
  accounts,
  categories,
  categorizationRules,
  counterparties,
  documentExtractions,
  documents,
  reviewQueue,
  transactions,
  userIdentities,
  users,
} from "@/lib/server/schema";
import { readStoredFile } from "@/lib/server/storage";

type ProcessDocumentInput = {
  documentId: string;
  forcedDirection?: "income" | "expense" | null;
};

type CounterpartyInfo = {
  id: string;
  displayName: string;
  normalizedName: string;
  taxId: string | null;
  cvu: string | null;
};

function serializeExtraction(extracted: MistralExtraction) {
  return {
    ...extracted,
    occurredAt: extracted.occurredAt?.toISOString() ?? null,
  };
}

// Category names that don't actually explain what a purchase was for — even
// a confident match against one of these should still go to review instead
// of auto-confirming, since "Transferencia"/"Varios" tell the user nothing.
const AMBIGUOUS_CATEGORY_NAMES = new Set(["transferencia", "varios"]);

function isDirectionCompatible(
  categoryDirection: "income" | "expense" | "both",
  direction: "income" | "expense"
) {
  return categoryDirection === "both" || categoryDirection === direction;
}

function inferDirection(extracted: MistralExtraction): "income" | "expense" | null {
  if (extracted.direction === "income" || extracted.direction === "expense") {
    return extracted.direction;
  }

  if (extracted.documentType === "transfer_in") {
    return "income";
  }
  if (extracted.documentType === "transfer_out" || extracted.documentType === "purchase") {
    return "expense";
  }

  if (extracted.isUserSender === true) {
    return "expense";
  }
  if (extracted.isUserSender === false) {
    return "income";
  }

  return null;
}

function ruleMatches(
  rule: {
    counterpartyPattern: string;
    matchType: "exact" | "contains" | "regex";
    counterpartyId: string | null;
  },
  counterparty: CounterpartyInfo | null,
  candidates: string[]
) {
  if (!counterparty && !candidates.length) {
    return false;
  }

  if (rule.counterpartyId && counterparty?.id === rule.counterpartyId) {
    return true;
  }

  const pattern = rule.counterpartyPattern.trim();
  if (!pattern.length) {
    return false;
  }

  if (rule.matchType === "exact") {
    return candidates.some((candidate) => candidate === pattern);
  }

  if (rule.matchType === "contains") {
    return candidates.some((candidate) => candidate.includes(pattern));
  }

  try {
    const regex = new RegExp(pattern, "i");
    return candidates.some((candidate) => regex.test(candidate));
  } catch {
    return false;
  }
}

async function upsertCounterparty(
  userId: string,
  extracted: MistralExtraction
): Promise<CounterpartyInfo | null> {
  const displayName =
    extracted.counterpartyName?.trim() ||
    extracted.counterpartyTaxId ||
    extracted.counterpartyCvu ||
    null;
  if (!displayName) {
    return null;
  }

  const normalizedName = normalizeText(displayName);
  const [counterparty] = await db
    .insert(counterparties)
    .values({
      userId,
      displayName,
      normalizedName,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [counterparties.userId, counterparties.normalizedName],
      set: {
        displayName,
        updatedAt: new Date(),
      },
    })
    .returning({
      id: counterparties.id,
      displayName: counterparties.displayName,
      normalizedName: counterparties.normalizedName,
    });

  if (!counterparty) {
    return null;
  }

  return {
    ...counterparty,
    taxId: extracted.counterpartyTaxId,
    cvu: extracted.counterpartyCvu,
  };
}

async function createReview(
  payload: {
    userId: string;
    documentId: string;
    transactionId: string | null;
    reason:
      | "unknown_category"
      | "low_confidence"
      | "missing_fields"
      | "identity_ambiguous"
      | "counterparty_ambiguous"
      | "account_ambiguous"
      | "other"
      | "debt_match_ambiguous"
      | "recurring_match_ambiguous";
    details: Record<string, unknown>;
  }
) {
  try {
    await db.insert(reviewQueue).values({
      userId: payload.userId,
      documentId: payload.documentId,
      transactionId: payload.transactionId,
      reason: payload.reason,
      details: payload.details,
      status: "pending",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  } catch {
    // Unique partial index might already have an open review for this document.
  }
}

export async function processDocumentPipeline({
  documentId,
  forcedDirection = null,
}: ProcessDocumentInput): Promise<{
  documentId: string;
  transactionId: string | null;
  needsReview: boolean;
}> {
  const [document] = await db
    .select({
      id: documents.id,
      userId: documents.userId,
      mimeType: documents.mimeType,
      storagePath: documents.storagePath,
      uploadedAt: documents.uploadedAt,
    })
    .from(documents)
    .where(eq(documents.id, documentId))
    .limit(1);

  if (!document) {
    throw new Error("Documento no encontrado");
  }

  const [user] = await db
    .select({
      id: users.id,
      fullName: users.fullName,
      username: users.username,
      defaultCurrency: users.defaultCurrency,
    })
    .from(users)
    .where(eq(users.id, document.userId))
    .limit(1);

  if (!user) {
    throw new Error("Usuario del documento no encontrado");
  }

  const userName = user.fullName ?? user.username ?? "Usuario";

  await db
    .update(documents)
    .set({
      status: "processing",
      processingError: null,
      updatedAt: new Date(),
    })
    .where(eq(documents.id, document.id));

  try {
    const [categoryRows, identityRows, accountRows] = await Promise.all([
      db
        .select({
          id: categories.id,
          name: categories.name,
          direction: categories.direction,
        })
        .from(categories)
        .where(eq(categories.userId, user.id)),
      db
        .select({
          value: userIdentities.identityValue,
        })
        .from(userIdentities)
        .where(eq(userIdentities.userId, user.id)),
      db
        .select({
          id: accounts.id,
          name: accounts.name,
          accountType: accounts.accountType,
        })
        .from(accounts)
        .where(and(eq(accounts.userId, user.id), eq(accounts.isActive, true))),
    ]);

    const rawBuffer = await readStoredFile(document.storagePath);
    const fileBase64 = rawBuffer.toString("base64");

    const mistralService = new MistralIngestionService();
    const ingestionResult = await mistralService.processDocument(
      fileBase64,
      document.mimeType,
      {
        categories: categoryRows.map((row) => ({
          name: row.name,
          direction: row.direction,
        })),
        accounts: accountRows.map((row) => ({
          name: row.name,
          accountType: row.accountType,
        })),
        userIdentities: identityRows.map((row) => row.value),
        userName,
      }
    );

    const direction = forcedDirection ?? inferDirection(ingestionResult.extracted);
    const amount = ingestionResult.extracted.amount;
    const counterparty = await upsertCounterparty(user.id, ingestionResult.extracted);
    const occurredAt = ingestionResult.extracted.occurredAt ?? document.uploadedAt;
    const currency = normalizeCurrency(
      ingestionResult.extracted.currency ?? user.defaultCurrency
    );

    let categoryId: string | null = null;
    let categorizationConfidence: number | null = null;
    let needsReview = false;
    let reviewReason:
      | "unknown_category"
      | "low_confidence"
      | "missing_fields"
      | "identity_ambiguous"
      | "counterparty_ambiguous"
      | "account_ambiguous"
      | "other"
      | "debt_match_ambiguous"
      | "recurring_match_ambiguous" = "unknown_category";

    const candidateTokens = Array.from(
      new Set(
        [
          counterparty?.normalizedName ?? null,
          counterparty?.taxId ?? null,
          counterparty?.cvu ?? null,
        ].filter((item): item is string => Boolean(item))
      )
    );

    if (direction && counterparty) {
      const rules = await db
        .select({
          id: categorizationRules.id,
          counterpartyId: categorizationRules.counterpartyId,
          counterpartyPattern: categorizationRules.counterpartyPattern,
          direction: categorizationRules.direction,
          mode: categorizationRules.mode,
          categoryId: categorizationRules.categoryId,
          matchType: categorizationRules.matchType,
          minConfidence: categorizationRules.minConfidence,
          priority: categorizationRules.priority,
        })
        .from(categorizationRules)
        .where(
          and(
            eq(categorizationRules.userId, user.id),
            eq(categorizationRules.direction, direction),
            eq(categorizationRules.isActive, true)
          )
        )
        .orderBy(asc(categorizationRules.priority), asc(categorizationRules.createdAt));

      const matchedRule = rules.find((rule) =>
        ruleMatches(
          {
            counterpartyId: rule.counterpartyId,
            counterpartyPattern: rule.counterpartyPattern,
            matchType: rule.matchType,
          },
          counterparty,
          candidateTokens
        )
      );

      if (matchedRule) {
        await db
          .update(categorizationRules)
          .set({
            hitsCount: sql`${categorizationRules.hitsCount} + 1`,
            lastMatchedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(categorizationRules.id, matchedRule.id));

        if (matchedRule.mode === "always_review") {
          needsReview = true;
          reviewReason = "unknown_category";
        } else if (matchedRule.categoryId) {
          categoryId = matchedRule.categoryId;
          categorizationConfidence = 1;
        } else {
          needsReview = true;
          reviewReason = "unknown_category";
        }
      }
    }

    if (!categoryId && !needsReview && direction) {
      const suggestion = ingestionResult.extracted.categorySuggestion;
      const suggestionConfidence = ingestionResult.extracted.categoryConfidence ?? 0;

      if (suggestion) {
        const normalizedSuggestion = normalizeText(suggestion);
        const matchedCategory = categoryRows.find(
          (row) =>
            normalizeText(row.name) === normalizedSuggestion &&
            isDirectionCompatible(row.direction, direction)
        );

        if (matchedCategory && suggestionConfidence >= 0.8) {
          categoryId = matchedCategory.id;
          categorizationConfidence = suggestionConfidence;
        } else if (matchedCategory && suggestionConfidence >= 0.55) {
          needsReview = true;
          reviewReason = "low_confidence";
        } else {
          // Unmatched or low-confidence suggestion — don't silently save as uncategorized.
          needsReview = true;
          reviewReason = "unknown_category";
        }
      } else {
        needsReview = true;
        reviewReason = "unknown_category";
      }
    }

    if (categoryId && !needsReview) {
      const resolvedCategory = categoryRows.find((row) => row.id === categoryId);
      if (resolvedCategory && AMBIGUOUS_CATEGORY_NAMES.has(normalizeText(resolvedCategory.name))) {
        needsReview = true;
        reviewReason = "unknown_category";
      }
    }

    let accountId: string | null = null;

    if (accountRows.length > 0) {
      const accountSuggestion = ingestionResult.extracted.accountSuggestion;
      const accountSuggestionConfidence = ingestionResult.extracted.accountConfidence ?? 0;
      const normalizedAccountSuggestion = accountSuggestion
        ? normalizeText(accountSuggestion)
        : null;
      const matchedAccount = normalizedAccountSuggestion
        ? accountRows.find((row) => normalizeText(row.name) === normalizedAccountSuggestion)
        : null;

      if (matchedAccount && accountSuggestionConfidence >= 0.7) {
        accountId = matchedAccount.id;
      } else {
        // Could not confidently identify which of the user's accounts the
        // money moved through — surface for manual assignment instead of
        // silently leaving the transaction unlinked from any account.
        needsReview = true;
        reviewReason = "account_ambiguous";
      }
    }

    if (!amount || !direction) {
      needsReview = true;
      reviewReason = "missing_fields";
    }

    if (!counterparty) {
      needsReview = true;
      reviewReason = "missing_fields";
    }

    let matchedDebtId: string | null = null;

    if (direction === "income" && counterparty && amount && !needsReview) {
      const debtMatch = await findDebtMatch({
        userId: user.id,
        counterpartyId: counterparty.id,
        amount,
        currency,
      });

      if (debtMatch.ambiguous) {
        needsReview = true;
        reviewReason = "debt_match_ambiguous";
      } else {
        matchedDebtId = debtMatch.matchedDebtId;
      }
    }

    let matchedRecurringExpenseId: string | null = null;

    if (direction === "expense" && counterparty && amount && !needsReview) {
      const recurringMatch = await findRecurringMatch({
        userId: user.id,
        counterpartyId: counterparty.id,
        amount,
        currency,
        occurredAt,
      });

      if (recurringMatch.ambiguous) {
        needsReview = true;
        reviewReason = "recurring_match_ambiguous";
      } else {
        matchedRecurringExpenseId = recurringMatch.matchedRecurringExpenseId;
      }
    }

    const [extractionRow] = await db
      .insert(documentExtractions)
      .values({
        documentId: document.id,
        extractor: "mistral",
        modelName: `${ingestionResult.ocrModel} + ${ingestionResult.extractModel}`,
        promptVersion: "v1_receipt_transfer",
        rawText: ingestionResult.ocrText,
        rawJson: ingestionResult.rawModelJson,
        extractedAmount: amount ? amount.toFixed(2) : null,
        extractedCurrency: currency,
        extractedOccurredAt: occurredAt,
        extractedDirection: direction,
        extractedCounterpartyName: counterparty?.displayName ?? null,
        extractedConcept: ingestionResult.extracted.concept,
        isUserSender: ingestionResult.extracted.isUserSender,
        confidenceOverall: ingestionResult.extracted.overallConfidence
          ? ingestionResult.extracted.overallConfidence.toFixed(4)
          : null,
        confidenceAmount: amount ? "1.0000" : "0.0000",
        confidenceCounterparty: counterparty ? "1.0000" : "0.0000",
        confidenceDirection: direction ? "1.0000" : "0.0000",
        confidenceConcept: ingestionResult.extracted.concept ? "0.7000" : "0.0000",
        createdAt: new Date(),
      })
      .returning({ id: documentExtractions.id });

    let transactionId: string | null = null;

    if (amount && direction) {
      const [transaction] = await db
        .insert(transactions)
        .values({
          userId: user.id,
          documentId: document.id,
          accountId,
          direction,
          amount: amount.toFixed(2),
          currency,
          occurredAt,
          counterpartyId: counterparty?.id ?? null,
          categoryId,
          recurringExpenseId: matchedRecurringExpenseId,
          concept: ingestionResult.extracted.concept,
          status: needsReview ? "pending_review" : "auto_confirmed",
          extractionConfidence: ingestionResult.extracted.overallConfidence
            ? ingestionResult.extracted.overallConfidence.toFixed(4)
            : null,
          categorizationConfidence: categorizationConfidence
            ? categorizationConfidence.toFixed(4)
            : null,
          createdBy: "api",
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning({ id: transactions.id });

      transactionId = transaction?.id ?? null;

      if (matchedDebtId && transactionId) {
        await settleDebtWithTransaction(matchedDebtId, transactionId, accountId);
      }
    }

    if (needsReview) {
      await createReview({
        userId: user.id,
        documentId: document.id,
        transactionId,
        reason: reviewReason,
        details: {
          extraction: serializeExtraction(ingestionResult.extracted),
          extractionId: extractionRow?.id ?? null,
          categorySuggestion: ingestionResult.extracted.categorySuggestion,
          categoryConfidence: ingestionResult.extracted.categoryConfidence,
          accountSuggestion: ingestionResult.extracted.accountSuggestion,
          accountConfidence: ingestionResult.extracted.accountConfidence,
          forcedDirection,
          candidateCategories: categoryRows.map((item) => ({
            id: item.id,
            name: item.name,
            direction: item.direction,
          })),
          candidateAccounts: accountRows.map((item) => ({
            id: item.id,
            name: item.name,
            accountType: item.accountType,
          })),
          counterparty: counterparty
            ? {
                id: counterparty.id,
                name: counterparty.displayName,
                normalizedName: counterparty.normalizedName,
              }
            : null,
          direction,
        },
      });
    }

    await db
      .update(documents)
      .set({
        status: "processed",
        updatedAt: new Date(),
      })
      .where(eq(documents.id, document.id));

    return {
      documentId: document.id,
      transactionId,
      needsReview,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error de procesamiento";
    await db
      .update(documents)
      .set({
        status: "failed",
        processingError: message.slice(0, 500),
        updatedAt: new Date(),
      })
      .where(eq(documents.id, document.id));
    throw error;
  }
}
