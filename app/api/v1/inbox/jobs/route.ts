import { z } from "zod";

import { listIngestJobsForUser } from "@/lib/server/ingest-queue";
import { requireUser } from "@/lib/server/route-helpers";

export const runtime = "nodejs";

const querySchema = z.object({
  status: z
    .enum(["pending", "processing", "completed", "failed", "retry", "all"])
    .optional()
    .default("all"),
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
});

export async function GET(request: Request) {
  const user = await requireUser();
  if (user instanceof Response) return user;

  const { searchParams } = new URL(request.url);
  const parseResult = querySchema.safeParse({
    status: searchParams.get("status") ?? undefined,
    limit: searchParams.get("limit") ?? undefined,
  });

  if (!parseResult.success) {
    return Response.json(
      { error: "Query invalida", details: parseResult.error.flatten() },
      { status: 400 }
    );
  }

  const query = parseResult.data;
  const rows = await listIngestJobsForUser({
    userId: user.id,
    status: query.status,
    limit: query.limit,
  });

  return Response.json({
    jobs: rows.map((row) => ({
      id: row.id,
      status: row.status,
      forcedDirection: row.forcedDirection,
      attempts: row.attempts,
      maxAttempts: row.maxAttempts,
      priority: row.priority,
      runAfter: row.runAfter?.toISOString() ?? null,
      startedAt: row.startedAt?.toISOString() ?? null,
      completedAt: row.completedAt?.toISOString() ?? null,
      lastError: row.lastError,
      createdAt: row.createdAt?.toISOString() ?? null,
      updatedAt: row.updatedAt?.toISOString() ?? null,
      document: {
        id: row.documentId,
        status: row.documentStatus,
        processingError: row.processingError,
        originalFilename: row.originalFilename,
        mimeType: row.mimeType,
        uploadedAt: row.uploadedAt?.toISOString() ?? null,
      },
    })),
  });
}
