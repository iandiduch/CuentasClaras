import { z } from "zod";

import { retryFailedIngestJobForUser } from "@/lib/server/ingest-queue";
import { requireUser } from "@/lib/server/route-helpers";

export const runtime = "nodejs";

const jobIdSchema = z.string().uuid();

type PostParams = {
  params: Promise<{ id: string }>;
};

export async function POST(_request: Request, { params }: PostParams) {
  const user = await requireUser();
  if (user instanceof Response) return user;

  const { id } = await params;

  const parseId = jobIdSchema.safeParse(id);
  if (!parseId.success) {
    return Response.json({ error: "jobId invalido" }, { status: 400 });
  }

  const retried = await retryFailedIngestJobForUser({
    userId: user.id,
    jobId: parseId.data,
  });

  if (!retried.ok) {
    if (retried.reason === "not_found") {
      return Response.json({ error: "Job no encontrado" }, { status: 404 });
    }
    if (retried.reason === "invalid_status") {
      return Response.json(
        { error: `Solo se puede reintentar cuando status=failed (actual: ${retried.status})` },
        { status: 409 }
      );
    }
    return Response.json({ error: "No se pudo reintentar el job" }, { status: 500 });
  }

  return Response.json({
    ok: true,
    job: {
      id: retried.job.id,
      status: retried.job.status,
      attempts: retried.job.attempts,
      maxAttempts: retried.job.maxAttempts,
      forcedDirection: retried.job.forcedDirection,
      runAfter: retried.job.runAfter?.toISOString() ?? null,
      documentId: retried.job.documentId,
      documentStatus: retried.job.documentStatus,
    },
  });
}
