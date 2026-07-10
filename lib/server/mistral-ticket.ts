import { Mistral } from "@mistralai/mistralai";
import { z } from "zod";

import {
  fallbackNumber,
  parseJsonFromModel,
  parseModelContent,
  runMistralOcr,
} from "@/lib/server/mistral-ingestion";

const ticketItemSchema = z.object({
  name: z.string().trim().min(1).max(200),
  quantity: z.number().positive().optional(),
  unitPrice: z.number().positive().optional(),
  lineTotal: z.number().positive().optional(),
  ean: z.string().trim().max(40).optional(),
});

const extractedTicketSchema = z.object({
  storeName: z.string().trim().max(140).optional(),
  total: z.number().positive().optional(),
  purchasedAt: z.string().trim().optional(),
  items: z.array(ticketItemSchema).default([]),
});

export type TicketLine = {
  name: string;
  quantity: number;
  unitPrice: number | null;
  lineTotal: number | null;
  ean: string | null;
};

export type TicketExtraction = {
  storeName: string | null;
  total: number | null;
  purchasedAt: string | null;
  items: TicketLine[];
};

export type TicketExtractionResult = {
  ocrText: string;
  extracted: TicketExtraction;
  rawModelJson: Record<string, unknown>;
  extractModel: string;
  ocrModel: string;
};

export const TICKET_PROMPT_VERSION = "v1_shopping_ticket";
export const TICKET_EXTRACTOR_NAME = "mistral_ticket";

const TICKET_PROMPT = `
Sos un extractor de tickets de supermercado argentinos.
Recibiras texto OCR de un ticket de compra.

Objetivo:
1) Extraer CADA renglon de producto del ticket: nombre tal como figura impreso, cantidad, precio unitario y total de linea.
2) Extraer el total final pagado del ticket.
3) Extraer el nombre del supermercado/comercio.
4) Extraer la fecha de compra si aparece.

Reglas para renglones:
- Los montos argentinos usan coma como separador decimal (ej: 1.234,56). Convertilos a number con punto decimal.
- Si un renglon indica cantidad y precio unitario (ej: "2 x 1.500,00"), extrae quantity y unitPrice.
- Si solo hay un importe por renglon, usalo como lineTotal y asumi quantity 1.
- Descuentos o promociones que aparecen como renglon separado (ej: "DESC 2DA UNIDAD"): restalos del renglon anterior ajustando su lineTotal/unitPrice; NO los reportes como item propio.
- Ignora renglones que no son productos: subtotales, IVA, redondeo, medios de pago, cuotas, puntos.
- Si el ticket imprime el codigo de barras/EAN del producto, incluilo en "ean".
- No inventes datos. Si un campo no esta, omitilo.

Responde SOLO JSON valido sin markdown ni texto extra, con este formato:
{
  "storeName": "string",
  "total": number,
  "purchasedAt": "YYYY-MM-DDTHH:mm:ss o YYYY-MM-DD",
  "items": [
    { "name": "string", "quantity": number, "unitPrice": number, "lineTotal": number, "ean": "string" }
  ]
}
`.trim();

function salvageTicket(raw: Record<string, unknown>): z.infer<typeof extractedTicketSchema> {
  const rawItems = Array.isArray(raw.items) ? raw.items : [];
  const items: z.infer<typeof ticketItemSchema>[] = [];

  for (const entry of rawItems) {
    if (!entry || typeof entry !== "object") {
      continue;
    }
    const candidate = entry as Record<string, unknown>;
    const name = typeof candidate.name === "string" ? candidate.name.trim() : "";
    if (!name) {
      continue;
    }
    items.push({
      name: name.slice(0, 200),
      quantity: fallbackNumber(candidate.quantity),
      unitPrice: fallbackNumber(candidate.unitPrice),
      lineTotal: fallbackNumber(candidate.lineTotal),
      ean: typeof candidate.ean === "string" ? candidate.ean.trim().slice(0, 40) : undefined,
    });
  }

  return {
    storeName:
      typeof raw.storeName === "string" ? raw.storeName.trim().slice(0, 140) : undefined,
    total: fallbackNumber(raw.total),
    purchasedAt: typeof raw.purchasedAt === "string" ? raw.purchasedAt.trim() : undefined,
    items,
  };
}

export class ShoppingTicketExtractionService {
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

  async extractTicket(fileBase64: string, mimeType: string): Promise<TicketExtractionResult> {
    const ocrText = await runMistralOcr(this.client, this.ocrModel, fileBase64, mimeType);

    if (!ocrText.trim().length) {
      return {
        ocrText: "",
        extracted: { storeName: null, total: null, purchasedAt: null, items: [] },
        rawModelJson: {},
        extractModel: this.extractModel,
        ocrModel: this.ocrModel,
      };
    }

    const chatResponse = await this.client.chat.complete({
      model: this.extractModel,
      messages: [
        {
          role: "user",
          content: `${TICKET_PROMPT}\n\n--- OCR ---\n${ocrText}`,
        },
      ],
      temperature: 0,
      maxTokens: 4000,
      responseFormat: { type: "json_object" },
    });

    const rawContent = parseModelContent(chatResponse.choices?.[0]?.message?.content);
    const rawJson = parseJsonFromModel(rawContent);

    const parsed = extractedTicketSchema.safeParse(rawJson);
    const base = parsed.success ? parsed.data : salvageTicket(rawJson);

    const extracted: TicketExtraction = {
      storeName: base.storeName ?? null,
      total: base.total ?? null,
      purchasedAt: base.purchasedAt ?? null,
      items: base.items.map((item) => ({
        name: item.name,
        quantity: item.quantity ?? 1,
        unitPrice: item.unitPrice ?? null,
        lineTotal: item.lineTotal ?? null,
        ean: item.ean ?? null,
      })),
    };

    return {
      ocrText,
      extracted,
      rawModelJson: rawJson,
      extractModel: this.extractModel,
      ocrModel: this.ocrModel,
    };
  }
}
