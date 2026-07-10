import { z } from "zod";

import { db } from "@/lib/server/db";
import { enqueueIngestJob } from "@/lib/server/ingest-queue";
import { resolveVerifiedMime } from "@/lib/server/mime-sniff";
import { requireUser } from "@/lib/server/route-helpers";
import { documents } from "@/lib/server/schema";
import { getShoppingListForUser } from "@/lib/server/shopping";
import { saveFileToLocalStorage } from "@/lib/server/storage";

export const runtime = "nodejs";

const idSchema = z.string().uuid();

type RouteParams = {
  params: Promise<{ id: string }>;
};

function getMaxUploadBytes() {
  const mb = Number(process.env.MAX_UPLOAD_MB ?? "20");
  const safeMb = Number.isFinite(mb) && mb > 0 ? mb : 20;
  return Math.floor(safeMb * 1024 * 1024);
}

export async function POST(request: Request, { params }: RouteParams) {
  const user = await requireUser();
  if (user instanceof Response) return user;

  const { id } = await params;
  if (!idSchema.safeParse(id).success) {
    return Response.json({ error: "Lista inválida" }, { status: 400 });
  }

  const list = await getShoppingListForUser(id, user.id);
  if (!list) {
    return Response.json({ error: "Lista no encontrada" }, { status: 404 });
  }
  if (list.status !== "active") {
    return Response.json({ error: "La lista ya está cerrada" }, { status: 409 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return Response.json(
      { error: "Content-Type inválido. Usá multipart/form-data con el campo 'file'." },
      { status: 415 }
    );
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return Response.json(
      { error: "Se esperaba un archivo en el campo 'file'" },
      { status: 400 }
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const maxBytes = getMaxUploadBytes();
  if (buffer.byteLength > maxBytes) {
    return Response.json(
      { error: `Archivo demasiado grande. Máximo ${process.env.MAX_UPLOAD_MB ?? 20}MB.` },
      { status: 400 }
    );
  }

  const mimeType = resolveVerifiedMime(buffer);
  if (!mimeType) {
    return Response.json(
      {
        error:
          "Formato no soportado o no coincide con el contenido real del archivo. Usá PDF, JPG, PNG o WEBP.",
      },
      { status: 400 }
    );
  }

  const stored = await saveFileToLocalStorage(buffer, {
    userId: user.id,
    mimeType,
    originalFilename: file.name || null,
  });

  const now = new Date();
  const [document] = await db
    .insert(documents)
    .values({
      userId: user.id,
      source: "pwa_manual_upload",
      originalFilename: file.name || null,
      mimeType,
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
        status: "uploaded",
        processingError: null,
        updatedAt: now,
      },
    })
    .returning({ id: documents.id });

  if (!document) {
    return Response.json(
      { error: "No se pudo registrar el ticket" },
      { status: 500 }
    );
  }

  const job = await enqueueIngestJob({
    userId: user.id,
    documentId: document.id,
    forcedDirection: null,
    kind: "shopping_ticket",
    payload: { listId: list.id },
  });

  if (!job) {
    return Response.json(
      { error: "No se pudo encolar el ticket para procesamiento" },
      { status: 500 }
    );
  }

  return Response.json(
    {
      ok: true,
      jobId: job.id,
      documentId: document.id,
      statusUrl: `/api/v1/shopping/ticket-jobs/${job.id}`,
    },
    { status: 202 }
  );
}
