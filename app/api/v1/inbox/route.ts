import { z } from "zod";

import { resolveApiToken } from "@/lib/server/auth/api-tokens";
import type { CurrentUser } from "@/lib/server/auth/session";
import { getCurrentUser } from "@/lib/server/current-user";
import { db } from "@/lib/server/db";
import { enqueueIngestJob } from "@/lib/server/ingest-queue";
import { resolveVerifiedMime } from "@/lib/server/mime-sniff";
import { documents } from "@/lib/server/schema";
import { saveFileToLocalStorage } from "@/lib/server/storage";

export const runtime = "nodejs";

const jsonUploadFileSchema = z.object({
  fileBase64: z.string().trim().optional(),
  fileDataUri: z.string().trim().optional(),
  fileName: z.string().trim().optional(),
});

const jsonUploadSchema = jsonUploadFileSchema.extend({
  files: z.array(jsonUploadFileSchema).optional(),
});

type ParsedUpload = {
  buffer: Buffer;
  fileName: string | null;
  size: number;
};

type VerifiedUpload = ParsedUpload & { mimeType: string };

function getMaxUploadBytes() {
  const mb = Number(process.env.MAX_UPLOAD_MB ?? "20");
  const safeMb = Number.isFinite(mb) && mb > 0 ? mb : 20;
  return Math.floor(safeMb * 1024 * 1024);
}

async function resolveInboxUser(
  request: Request
): Promise<{ user: CurrentUser; authMethod: "session" | "token" } | null> {
  const authHeader = request.headers.get("authorization");
  if (authHeader?.toLowerCase().startsWith("bearer ")) {
    const token = authHeader.slice("bearer ".length).trim();
    const user = await resolveApiToken(token);
    // An explicit (and wrong) token should fail loudly rather than silently
    // falling back to a session cookie the caller almost certainly doesn't have.
    return user ? { user, authMethod: "token" } : null;
  }

  const sessionUser = await getCurrentUser();
  return sessionUser ? { user: sessionUser, authMethod: "session" } : null;
}

function parseForcedDirection(request: Request):
  | { ok: true; direction: "income" | "expense" | null }
  | { ok: false; message: string } {
  const raw =
    request.headers.get("x-transaction-direction") ??
    request.headers.get("x-direction") ??
    request.headers.get("x-movement-direction");

  if (!raw) {
    return { ok: true, direction: null };
  }

  const normalized = raw.trim().toLowerCase();
  if (normalized === "income" || normalized === "expense") {
    return { ok: true, direction: normalized };
  }

  return {
    ok: false,
    message:
      "Header de direccion invalido. Usa x-transaction-direction: income|expense",
  };
}

function parseDataUri(value: string) {
  const match = value.match(/^data:([^;]+);base64,([\s\S]+)$/);
  if (!match) {
    return null;
  }

  return {
    base64: match[2].trim(),
  };
}

function decodeBase64(base64: string) {
  try {
    return Buffer.from(base64, "base64");
  } catch {
    return null;
  }
}

async function parseBinaryUpload(request: Request): Promise<
  | { ok: true; uploads: ParsedUpload[] }
  | { ok: false; status: number; message: string }
> {
  let buffer: Buffer;
  try {
    buffer = Buffer.from(await request.arrayBuffer());
  } catch {
    return {
      ok: false,
      status: 400,
      message: "No se pudo leer el body binario",
    };
  }

  if (!buffer.length) {
    return {
      ok: false,
      status: 400,
      message: "Body vacio. Envia un archivo en el body de la request.",
    };
  }

  const fileName =
    request.headers.get("x-file-name")?.trim() ||
    request.headers.get("x-filename")?.trim() ||
    null;

  // A raw binary body is inherently a single blob per request — clients
  // that need to send several screenshots at once (e.g. iOS Shortcuts)
  // should issue one request per file or use multipart/JSON with an array.
  return {
    ok: true,
    uploads: [
      {
        buffer,
        fileName,
        size: buffer.byteLength,
      },
    ],
  };
}

async function parseJsonUpload(request: Request): Promise<
  | { ok: true; uploads: ParsedUpload[] }
  | { ok: false; status: number; message: string }
> {
  let payloadRaw: unknown;
  try {
    payloadRaw = await request.json();
  } catch {
    return { ok: false, status: 400, message: "JSON invalido" };
  }

  const parsed = jsonUploadSchema.safeParse(payloadRaw);
  if (!parsed.success) {
    return {
      ok: false,
      status: 400,
      message: "JSON invalido. Usa fileBase64, fileDataUri o files[].",
    };
  }

  const payload = parsed.data;
  const entries =
    payload.files && payload.files.length > 0
      ? payload.files
      : [
          {
            fileBase64: payload.fileBase64,
            fileDataUri: payload.fileDataUri,
            fileName: payload.fileName,
          },
        ];

  const uploads: ParsedUpload[] = [];

  for (const entry of entries) {
    const dataUri = entry.fileDataUri ? parseDataUri(entry.fileDataUri) : null;
    const base64 = (dataUri?.base64 ?? entry.fileBase64 ?? "").trim();

    if (!base64) {
      return {
        ok: false,
        status: 400,
        message: "Faltan datos. Cada archivo necesita fileBase64 o fileDataUri.",
      };
    }

    const buffer = decodeBase64(base64);
    if (!buffer || !buffer.length) {
      return { ok: false, status: 400, message: "fileBase64 invalido" };
    }

    uploads.push({
      buffer,
      fileName: entry.fileName ?? null,
      size: buffer.byteLength,
    });
  }

  return { ok: true, uploads };
}

async function parseMultipartUpload(request: Request): Promise<
  | { ok: true; uploads: ParsedUpload[] }
  | { ok: false; status: number; message: string }
> {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return {
      ok: false,
      status: 415,
      message:
        "Content-Type invalido para form-data. Usa multipart/form-data o application/json.",
    };
  }

  const files = [...formData.getAll("file"), ...formData.getAll("upload")].filter(
    (value): value is File => value instanceof File
  );

  if (!files.length) {
    return {
      ok: false,
      status: 400,
      message: "Se esperaba uno o mas archivos en el campo 'file' o 'upload'",
    };
  }

  const uploads: ParsedUpload[] = [];
  for (const file of files) {
    const buffer = Buffer.from(await file.arrayBuffer());
    uploads.push({
      buffer,
      fileName: file.name || null,
      size: file.size,
    });
  }

  return { ok: true, uploads };
}

async function parseUploadFromRequest(request: Request): Promise<
  | { ok: true; uploads: ParsedUpload[] }
  | { ok: false; status: number; message: string }
> {
  const contentType = request.headers.get(
    "content-type"
  )?.toLowerCase() ?? "";

  if (contentType.includes("multipart/form-data")) {
    return parseMultipartUpload(request);
  }

  if (contentType.includes("application/json")) {
    return parseJsonUpload(request);
  }

  // Mobile clients (e.g. iOS Shortcuts) often send raw binary body.
  return parseBinaryUpload(request);
}

export async function POST(request: Request) {
  const auth = await resolveInboxUser(request);
  if (!auth) {
    return Response.json(
      {
        error:
          "No autenticado. Usa tu token personal (header Authorization: Bearer <token>, generado en Perfil) o inicia sesion en la app.",
      },
      { status: 401 }
    );
  }
  const { user, authMethod } = auth;

  const maxBytes = getMaxUploadBytes();
  const declaredLength = Number(request.headers.get("content-length") ?? "");
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    return Response.json(
      { error: `Body demasiado grande. Maximo ${process.env.MAX_UPLOAD_MB ?? 20}MB.` },
      { status: 413 }
    );
  }

  const parsedDirection = parseForcedDirection(request);
  if (!parsedDirection.ok) {
    return Response.json({ error: parsedDirection.message }, { status: 400 });
  }

  const parsedUpload = await parseUploadFromRequest(request);
  if (!parsedUpload.ok) {
    return Response.json({ error: parsedUpload.message }, { status: parsedUpload.status });
  }

  const { uploads } = parsedUpload;
  const verifiedUploads: VerifiedUpload[] = [];

  for (const [index, upload] of uploads.entries()) {
    if (upload.size > maxBytes) {
      return Response.json(
        {
          error: `Archivo ${index + 1} (${upload.fileName ?? "sin nombre"}): demasiado grande. Maximo ${process.env.MAX_UPLOAD_MB ?? 20}MB.`,
        },
        { status: 400 }
      );
    }

    const mimeType = resolveVerifiedMime(upload.buffer);
    if (!mimeType) {
      return Response.json(
        {
          error: `Archivo ${index + 1} (${upload.fileName ?? "sin nombre"}): formato no soportado o no coincide con el contenido real del archivo. Usa PDF, JPG, PNG o WEBP.`,
        },
        { status: 400 }
      );
    }

    verifiedUploads.push({ ...upload, mimeType });
  }

  const now = new Date();
  const jobs: Array<{
    documentId: string;
    jobId: string;
    jobStatus: string;
    statusUrl: string;
  }> = [];

  for (const upload of verifiedUploads) {
    const stored = await saveFileToLocalStorage(upload.buffer, {
      userId: user.id,
      mimeType: upload.mimeType,
      originalFilename: upload.fileName,
    });

    const [document] = await db
      .insert(documents)
      .values({
        userId: user.id,
        source: authMethod === "token" ? "api" : "pwa_manual_upload",
        originalFilename: upload.fileName ?? null,
        mimeType: upload.mimeType,
        fileExtension: stored.extension,
        storagePath: stored.relativePath,
        sha256: stored.sha256,
        fileSizeBytes: stored.sizeBytes,
        uploadedAt: now,
        status: "uploaded",
        processingError: null,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [documents.userId, documents.sha256],
        set: {
          updatedAt: now,
        },
      })
      .returning({
        id: documents.id,
        status: documents.status,
      });

    if (!document) {
      return Response.json({ error: "No se pudo registrar el documento" }, { status: 500 });
    }

    const job = await enqueueIngestJob({
      userId: user.id,
      documentId: document.id,
      forcedDirection: parsedDirection.direction,
    });

    if (!job) {
      return Response.json(
        { error: "No se pudo encolar el documento para procesamiento" },
        { status: 500 }
      );
    }

    jobs.push({
      documentId: document.id,
      jobId: job.id,
      jobStatus: job.status,
      statusUrl: `/api/v1/inbox/jobs/${job.id}`,
    });
  }

  return Response.json(
    {
      ok: true,
      queued: true,
      forcedDirection: parsedDirection.direction,
      jobs,
    },
    { status: 202 }
  );
}
