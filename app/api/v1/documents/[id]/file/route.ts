import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/lib/server/db";
import { requireUser } from "@/lib/server/route-helpers";
import { documents } from "@/lib/server/schema";
import { readStoredFile } from "@/lib/server/storage";

export const runtime = "nodejs";

const routeIdSchema = z.string().uuid();

type RouteParams = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, { params }: RouteParams) {
  const user = await requireUser();
  if (user instanceof Response) return user;

  const { id } = await params;

  const parseId = routeIdSchema.safeParse(id);
  if (!parseId.success) {
    return Response.json({ error: "documentId invalido" }, { status: 400 });
  }

  const [document] = await db
    .select({
      storagePath: documents.storagePath,
      mimeType: documents.mimeType,
      originalFilename: documents.originalFilename,
    })
    .from(documents)
    .where(and(eq(documents.id, parseId.data), eq(documents.userId, user.id)))
    .limit(1);

  if (!document) {
    return Response.json({ error: "Documento no encontrado" }, { status: 404 });
  }

  let buffer: Buffer;
  try {
    buffer = await readStoredFile(document.storagePath);
  } catch {
    return Response.json({ error: "No se pudo leer el archivo almacenado" }, { status: 404 });
  }

  const fileName = document.originalFilename ?? "documento";

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": document.mimeType,
      "Content-Disposition": `inline; filename="${fileName.replace(/"/g, "")}"`,
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
