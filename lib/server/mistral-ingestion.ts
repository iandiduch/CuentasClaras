import { Mistral } from "@mistralai/mistralai";
import { z } from "zod";

import { normalizeCurrency, normalizeCuil, normalizeCvu } from "@/lib/server/normalize";

const ExtractedReceiptSchema = z.object({
  documentType: z
    .enum(["purchase", "transfer_out", "transfer_in", "unknown"])
    .optional(),
  direction: z.enum(["income", "expense"]).optional(),
  amount: z.number().positive().optional(),
  currency: z.string().trim().length(3).optional(),
  occurredAt: z.string().trim().optional(),
  counterpartyName: z.string().trim().min(2).max(200).optional(),
  counterpartyTaxId: z.string().trim().optional(),
  counterpartyCvu: z.string().trim().optional(),
  selfName: z.string().trim().max(200).optional(),
  selfTaxId: z.string().trim().optional(),
  selfCvu: z.string().trim().optional(),
  concept: z.string().trim().max(300).optional(),
  categorySuggestion: z.string().trim().max(80).optional(),
  categoryConfidence: z.number().min(0).max(1).optional(),
  accountSuggestion: z.string().trim().max(80).optional(),
  accountConfidence: z.number().min(0).max(1).optional(),
  overallConfidence: z.number().min(0).max(1).optional(),
  isUserSender: z.boolean().optional(),
});

export type MistralExtraction = {
  documentType: "purchase" | "transfer_out" | "transfer_in" | "unknown";
  direction: "income" | "expense" | null;
  amount: number | null;
  currency: string | null;
  occurredAt: Date | null;
  counterpartyName: string | null;
  counterpartyTaxId: string | null;
  counterpartyCvu: string | null;
  selfName: string | null;
  selfTaxId: string | null;
  selfCvu: string | null;
  concept: string | null;
  categorySuggestion: string | null;
  categoryConfidence: number | null;
  accountSuggestion: string | null;
  accountConfidence: number | null;
  overallConfidence: number | null;
  isUserSender: boolean | null;
};

export type MistralIngestionResult = {
  ocrText: string;
  extracted: MistralExtraction;
  rawModelJson: Record<string, unknown>;
  extractModel: string;
  ocrModel: string;
};

type ExtractionContext = {
  categories: Array<{
    name: string;
    direction: "income" | "expense" | "both";
  }>;
  accounts: Array<{
    name: string;
    accountType: string;
  }>;
  userIdentities: string[];
  userName: string;
};

function createPrompt(context: ExtractionContext) {
  const categoriesDescription = context.categories
    .map((category) => `- ${category.name} (${category.direction})`)
    .join("\n");
  const identitiesDescription = context.userIdentities.length
    ? context.userIdentities.map((item) => `- ${item}`).join("\n")
    : "- (sin identidades adicionales)";
  const accountsDescription = context.accounts.length
    ? context.accounts.map((account) => `- ${account.name} (${account.accountType})`).join("\n")
    : "- (sin cuentas registradas)";

  return `
Sos un extractor de comprobantes de gastos/ingresos argentinos.
Recibiras texto OCR de ticket, transferencia o comprobante.

Objetivo:
1) Identificar monto (obligatorio si esta visible).
2) Identificar fecha del movimiento si aparece.
3) Identificar contraparte (comercio/persona origen-destino).
4) Identificar si es ingreso o egreso y tipo de documento.
5) Sugerir categoria usando SOLO la lista disponible.
6) Si el comprobante menciona un banco, tarjeta o billetera identificable (nombre, ultimos digitos, alias), sugerir a que cuenta propia del usuario corresponde, usando SOLO la lista de cuentas disponibles.

Mis datos para reconocerme:
- Nombre principal: ${context.userName}
${identitiesDescription}

Categorias disponibles:
${categoriesDescription}

Cuentas propias disponibles:
${accountsDescription}

Responde SOLO JSON valido sin markdown ni texto extra.
Campos posibles:
{
  "documentType": "purchase|transfer_out|transfer_in|unknown",
  "direction": "income|expense",
  "amount": number,
  "currency": "ARS|USD|...",
  "occurredAt": "YYYY-MM-DDTHH:mm:ssZ o YYYY-MM-DD",
  "counterpartyName": "string",
  "counterpartyTaxId": "11 digitos sin guiones",
  "counterpartyCvu": "22 digitos sin espacios",
  "selfName": "string",
  "selfTaxId": "11 digitos sin guiones",
  "selfCvu": "22 digitos sin espacios",
  "concept": "string",
  "categorySuggestion": "una categoria exacta de la lista o vacio",
  "categoryConfidence": 0..1,
  "accountSuggestion": "una cuenta exacta de la lista o vacio",
  "accountConfidence": 0..1,
  "overallConfidence": 0..1,
  "isUserSender": true|false
}

Reglas:
- Si falta un campo, omitilo.
- No inventes datos.
- categorySuggestion debe ser exactamente una categoria listada.
- accountSuggestion debe ser exactamente una cuenta listada.
- Si no estas seguro de categoria o de cuenta, no la envies.
`.trim();
}

function parseDate(value: string | undefined): Date | null {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function parseModelContent(content: unknown): string | null {
  if (typeof content === "string") {
    const trimmed = content.trim();
    return trimmed.length ? trimmed : null;
  }

  if (!Array.isArray(content)) {
    return null;
  }

  const normalized = content
    .map((chunk) => {
      if (typeof chunk === "string") {
        return chunk;
      }
      if (!chunk || typeof chunk !== "object") {
        return "";
      }
      const candidate = chunk as { type?: unknown; text?: unknown };
      if (candidate.type === "text" && typeof candidate.text === "string") {
        return candidate.text;
      }
      return "";
    })
    .join("\n")
    .trim();

  return normalized.length ? normalized : null;
}

export function parseJsonFromModel(rawContent: string | null): Record<string, unknown> {
  if (!rawContent) {
    return {};
  }

  const match =
    rawContent.match(/```json\s*([\s\S]*?)\s*```/) ??
    rawContent.match(/\{[\s\S]*\}/);
  const jsonString = match?.[1] ?? match?.[0];

  if (!jsonString) {
    return {};
  }

  try {
    const parsed = JSON.parse(jsonString);
    if (!parsed || typeof parsed !== "object") {
      return {};
    }
    return parsed as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function fallbackNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value;
  }
  if (typeof value === "string") {
    const cleaned = value.replace(/\./g, "").replace(",", ".").replace(/[^0-9.-]/g, "");
    const parsed = Number(cleaned);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return undefined;
}

function salvageExtraction(raw: Record<string, unknown>) {
  return {
    documentType:
      raw.documentType === "purchase" ||
      raw.documentType === "transfer_out" ||
      raw.documentType === "transfer_in" ||
      raw.documentType === "unknown"
        ? raw.documentType
        : undefined,
    direction:
      raw.direction === "income" || raw.direction === "expense"
        ? raw.direction
        : undefined,
    amount: fallbackNumber(raw.amount),
    currency: typeof raw.currency === "string" ? raw.currency.trim() : undefined,
    occurredAt: typeof raw.occurredAt === "string" ? raw.occurredAt : undefined,
    counterpartyName:
      typeof raw.counterpartyName === "string" ? raw.counterpartyName.trim() : undefined,
    counterpartyTaxId:
      typeof raw.counterpartyTaxId === "string" ? raw.counterpartyTaxId : undefined,
    counterpartyCvu: typeof raw.counterpartyCvu === "string" ? raw.counterpartyCvu : undefined,
    selfName: typeof raw.selfName === "string" ? raw.selfName : undefined,
    selfTaxId: typeof raw.selfTaxId === "string" ? raw.selfTaxId : undefined,
    selfCvu: typeof raw.selfCvu === "string" ? raw.selfCvu : undefined,
    concept: typeof raw.concept === "string" ? raw.concept.trim() : undefined,
    categorySuggestion:
      typeof raw.categorySuggestion === "string" ? raw.categorySuggestion.trim() : undefined,
    categoryConfidence:
      typeof raw.categoryConfidence === "number" &&
      raw.categoryConfidence >= 0 &&
      raw.categoryConfidence <= 1
        ? raw.categoryConfidence
        : undefined,
    accountSuggestion:
      typeof raw.accountSuggestion === "string" ? raw.accountSuggestion.trim() : undefined,
    accountConfidence:
      typeof raw.accountConfidence === "number" &&
      raw.accountConfidence >= 0 &&
      raw.accountConfidence <= 1
        ? raw.accountConfidence
        : undefined,
    overallConfidence:
      typeof raw.overallConfidence === "number" &&
      raw.overallConfidence >= 0 &&
      raw.overallConfidence <= 1
        ? raw.overallConfidence
        : undefined,
    isUserSender: typeof raw.isUserSender === "boolean" ? raw.isUserSender : undefined,
  };
}

export class MistralIngestionService {
  private readonly client: Mistral;
  private readonly ocrModel: string;
  private readonly extractModel: string;

  constructor() {
    const apiKey = process.env.MISTRAL_API_KEY;
    if (!apiKey) {
      throw new Error("MISTRAL_API_KEY no esta configurada");
    }

    this.client = new Mistral({ apiKey });
    this.ocrModel = process.env.MISTRAL_OCR_MODEL ?? "mistral-ocr-latest";
    this.extractModel = process.env.MISTRAL_EXTRACT_MODEL ?? "mistral-small-latest";
  }

  async processDocument(
    fileBase64: string,
    mimeType: string,
    context: ExtractionContext
  ): Promise<MistralIngestionResult> {
    const ocrText = await this.runOcr(fileBase64, mimeType);
    if (!ocrText.trim().length) {
      return {
        ocrText: "",
        extracted: {
          documentType: "unknown",
          direction: null,
          amount: null,
          currency: null,
          occurredAt: null,
          counterpartyName: null,
          counterpartyTaxId: null,
          counterpartyCvu: null,
          selfName: null,
          selfTaxId: null,
          selfCvu: null,
          concept: null,
          categorySuggestion: null,
          categoryConfidence: null,
          accountSuggestion: null,
          accountConfidence: null,
          overallConfidence: null,
          isUserSender: null,
        },
        rawModelJson: {},
        extractModel: this.extractModel,
        ocrModel: this.ocrModel,
      };
    }

    const prompt = createPrompt(context);
    const chatResponse = await this.client.chat.complete({
      model: this.extractModel,
      messages: [
        {
          role: "user",
          content: `${prompt}\n\n--- OCR ---\n${ocrText}`,
        },
      ],
      temperature: 0,
      maxTokens: 1200,
      responseFormat: { type: "json_object" },
    });

    const rawContent = parseModelContent(chatResponse.choices?.[0]?.message?.content);
    const rawJson = parseJsonFromModel(rawContent);

    const parsed = ExtractedReceiptSchema.safeParse(rawJson);
    const base = parsed.success ? parsed.data : salvageExtraction(rawJson);

    const documentType: MistralExtraction["documentType"] =
      base.documentType === "purchase" ||
      base.documentType === "transfer_out" ||
      base.documentType === "transfer_in" ||
      base.documentType === "unknown"
        ? base.documentType
        : "unknown";

    const direction: MistralExtraction["direction"] =
      base.direction === "income" || base.direction === "expense"
        ? base.direction
        : null;

    const extracted: MistralExtraction = {
      documentType,
      direction,
      amount: base.amount ?? null,
      currency: base.currency ? normalizeCurrency(base.currency) : null,
      occurredAt: parseDate(base.occurredAt),
      counterpartyName: base.counterpartyName ?? null,
      counterpartyTaxId: normalizeCuil(base.counterpartyTaxId),
      counterpartyCvu: normalizeCvu(base.counterpartyCvu),
      selfName: base.selfName ?? null,
      selfTaxId: normalizeCuil(base.selfTaxId),
      selfCvu: normalizeCvu(base.selfCvu),
      concept: base.concept ?? null,
      categorySuggestion: base.categorySuggestion ?? null,
      categoryConfidence: base.categoryConfidence ?? null,
      accountSuggestion: base.accountSuggestion ?? null,
      accountConfidence: base.accountConfidence ?? null,
      overallConfidence: base.overallConfidence ?? null,
      isUserSender: typeof base.isUserSender === "boolean" ? base.isUserSender : null,
    };

    return {
      ocrText,
      extracted,
      rawModelJson: rawJson,
      extractModel: this.extractModel,
      ocrModel: this.ocrModel,
    };
  }

  private async runOcr(fileBase64: string, mimeType: string): Promise<string> {
    return runMistralOcr(this.client, this.ocrModel, fileBase64, mimeType);
  }
}

export async function runMistralOcr(
  client: Mistral,
  model: string,
  fileBase64: string,
  mimeType: string
): Promise<string> {
  const dataUri = `data:${mimeType};base64,${fileBase64}`;

  const document =
    mimeType === "application/pdf"
      ? { type: "document_url" as const, documentUrl: dataUri }
      : { type: "image_url" as const, imageUrl: dataUri };

  const response = await client.ocr.process({
    model,
    document,
  });

  if (!response.pages?.length) {
    return "";
  }

  return response.pages.map((page) => page.markdown ?? "").join("\n\n");
}
