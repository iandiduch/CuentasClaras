import { z } from "zod";

import { getIngestJobForUser } from "@/lib/server/ingest-queue";
import { requireUser } from "@/lib/server/route-helpers";

export const runtime = "nodejs";

const jobIdSchema = z.string().uuid();

type GetParams = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, { params }: GetParams) {
  const user = await requireUser();
  if (user instanceof Response) return user;

  const { id } = await params;

  const parseId = jobIdSchema.safeParse(id);
  if (!parseId.success) {
    return Response.json({ error: "jobId invalido" }, { status: 400 });
  }

  const job = await getIngestJobForUser(parseId.data, user.id);
  if (!job) {
    return Response.json({ error: "Job no encontrado" }, { status: 404 });
  }

  const nowMs = Date.now();
  const runAfterMs = new Date(job.runAfter).getTime();
  const retryInSeconds =
    job.status === "pending" || job.status === "retry"
      ? Math.max(0, Math.ceil((runAfterMs - nowMs) / 1000))
      : 0;

  return Response.json({
    job: {
      id: job.id,
      status: job.status,
      forcedDirection: job.forcedDirection,
      attempts: job.attempts,
      maxAttempts: job.maxAttempts,
      priority: job.priority,
      runAfter: job.runAfter?.toISOString() ?? null,
      startedAt: job.startedAt?.toISOString() ?? null,
      completedAt: job.completedAt?.toISOString() ?? null,
      lastError: job.lastError,
      createdAt: job.createdAt?.toISOString() ?? null,
      updatedAt: job.updatedAt?.toISOString() ?? null,
      retryInSeconds,
      document: {
        id: job.documentId,
        status: job.documentStatus,
        processingError: job.processingError,
      },
    },
  });
}
