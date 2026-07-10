import os from "node:os";
import { randomUUID } from "node:crypto";

import { and, desc, eq, sql } from "drizzle-orm";

import { db } from "@/lib/server/db";
import { resolveDisplayFilename } from "@/lib/server/filename";
import { documents, ingestJobs } from "@/lib/server/schema";

type Direction = "income" | "expense";

export type IngestJobKind = "document" | "shopping_ticket";

export type IngestJob = {
  id: string;
  userId: string;
  documentId: string;
  status: "pending" | "processing" | "completed" | "failed" | "retry";
  kind: IngestJobKind;
  payload: Record<string, unknown> | null;
  forcedDirection: Direction | null;
  attempts: number;
  maxAttempts: number;
  priority: number;
  runAfter: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  lastError: string | null;
  workerId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export function createWorkerId(prefix = "ingest-worker") {
  return `${prefix}:${os.hostname()}:${process.pid}:${randomUUID().slice(0, 8)}`;
}

export async function enqueueIngestJob(params: {
  userId: string;
  documentId: string;
  forcedDirection: Direction | null;
  kind?: IngestJobKind;
  payload?: Record<string, unknown> | null;
  priority?: number;
  maxAttempts?: number;
}) {
  const now = new Date();
  const [job] = await db
    .insert(ingestJobs)
    .values({
      userId: params.userId,
      documentId: params.documentId,
      status: "pending",
      kind: params.kind ?? "document",
      payload: params.payload ?? null,
      forcedDirection: params.forcedDirection,
      attempts: 0,
      maxAttempts: params.maxAttempts ?? 3,
      priority: params.priority ?? 100,
      runAfter: now,
      startedAt: null,
      completedAt: null,
      lastError: null,
      workerId: null,
      createdAt: now,
      updatedAt: now,
    })
    .returning({
      id: ingestJobs.id,
      status: ingestJobs.status,
      runAfter: ingestJobs.runAfter,
    });

  return job ?? null;
}

export async function claimNextIngestJob(workerId: string): Promise<IngestJob | null> {
  const result = await db.execute(sql`
    WITH candidate AS (
      SELECT id
      FROM ingest_jobs
      WHERE status IN ('pending', 'retry')
        AND run_after <= NOW()
      ORDER BY priority ASC, created_at ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    UPDATE ingest_jobs j
    SET
      status = 'processing',
      attempts = j.attempts + 1,
      started_at = NOW(),
      worker_id = ${workerId},
      updated_at = NOW()
    FROM candidate
    WHERE j.id = candidate.id
    RETURNING
      j.id,
      j.user_id,
      j.document_id,
      j.status,
      j.kind,
      j.payload,
      j.forced_direction,
      j.attempts,
      j.max_attempts,
      j.priority,
      j.run_after,
      j.started_at,
      j.completed_at,
      j.last_error,
      j.worker_id,
      j.created_at,
      j.updated_at
  `);

  const row = result.rows?.[0] as
    | {
        id: string;
        user_id: string;
        document_id: string;
        status: IngestJob["status"];
        kind: IngestJobKind;
        payload: Record<string, unknown> | null;
        forced_direction: Direction | null;
        attempts: number;
        max_attempts: number;
        priority: number;
        run_after: Date;
        started_at: Date | null;
        completed_at: Date | null;
        last_error: string | null;
        worker_id: string | null;
        created_at: Date;
        updated_at: Date;
      }
    | undefined;

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    userId: row.user_id,
    documentId: row.document_id,
    status: row.status,
    kind: row.kind,
    payload: row.payload,
    forcedDirection: row.forced_direction,
    attempts: Number(row.attempts),
    maxAttempts: Number(row.max_attempts),
    priority: Number(row.priority),
    runAfter: new Date(row.run_after),
    startedAt: row.started_at ? new Date(row.started_at) : null,
    completedAt: row.completed_at ? new Date(row.completed_at) : null,
    lastError: row.last_error,
    workerId: row.worker_id,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export async function markIngestJobCompleted(jobId: string) {
  const now = new Date();
  await db
    .update(ingestJobs)
    .set({
      status: "completed",
      completedAt: now,
      lastError: null,
      updatedAt: now,
    })
    .where(eq(ingestJobs.id, jobId));
}

export async function markIngestJobFailed(params: {
  jobId: string;
  attempts: number;
  maxAttempts: number;
  errorMessage: string;
}) {
  const now = new Date();
  const retryDelaySeconds = Math.min(300, Math.max(10, params.attempts * 20));
  const shouldRetry = params.attempts < params.maxAttempts;

  await db
    .update(ingestJobs)
    .set({
      status: shouldRetry ? "retry" : "failed",
      runAfter: shouldRetry
        ? new Date(now.getTime() + retryDelaySeconds * 1000)
        : sql`NOW()`,
      completedAt: shouldRetry ? null : now,
      lastError: params.errorMessage.slice(0, 1000),
      updatedAt: now,
    })
    .where(eq(ingestJobs.id, params.jobId));
}

export async function recoverStuckIngestJobs(staleMinutes = 15) {
  const threshold = new Date(Date.now() - staleMinutes * 60 * 1000);
  await db
    .update(ingestJobs)
    .set({
      status: "retry",
      runAfter: new Date(),
      lastError: "Recovered from stale processing state",
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(ingestJobs.status, "processing"),
        sql`${ingestJobs.startedAt} IS NOT NULL`,
        sql`${ingestJobs.startedAt} < ${threshold}`
      )
    );
}

export async function getIngestJobForUser(jobId: string, userId: string) {
  const [job] = await db
    .select({
      id: ingestJobs.id,
      status: ingestJobs.status,
      kind: ingestJobs.kind,
      payload: ingestJobs.payload,
      forcedDirection: ingestJobs.forcedDirection,
      attempts: ingestJobs.attempts,
      maxAttempts: ingestJobs.maxAttempts,
      priority: ingestJobs.priority,
      runAfter: ingestJobs.runAfter,
      startedAt: ingestJobs.startedAt,
      completedAt: ingestJobs.completedAt,
      lastError: ingestJobs.lastError,
      documentId: ingestJobs.documentId,
      createdAt: ingestJobs.createdAt,
      updatedAt: ingestJobs.updatedAt,
      documentStatus: documents.status,
      processingError: documents.processingError,
    })
    .from(ingestJobs)
    .innerJoin(documents, eq(documents.id, ingestJobs.documentId))
    .where(and(eq(ingestJobs.id, jobId), eq(ingestJobs.userId, userId)))
    .limit(1);

  return job ?? null;
}

export async function listIngestJobsForUser(params: {
  userId: string;
  status?: IngestJob["status"] | "all" | null;
  limit?: number;
}) {
  const limit = Math.min(Math.max(params.limit ?? 50, 1), 200);

  const rows = await db
    .select({
      id: ingestJobs.id,
      status: ingestJobs.status,
      forcedDirection: ingestJobs.forcedDirection,
      attempts: ingestJobs.attempts,
      maxAttempts: ingestJobs.maxAttempts,
      priority: ingestJobs.priority,
      runAfter: ingestJobs.runAfter,
      startedAt: ingestJobs.startedAt,
      completedAt: ingestJobs.completedAt,
      lastError: ingestJobs.lastError,
      documentId: ingestJobs.documentId,
      createdAt: ingestJobs.createdAt,
      updatedAt: ingestJobs.updatedAt,
      documentStatus: documents.status,
      processingError: documents.processingError,
      originalFilename: documents.originalFilename,
      mimeType: documents.mimeType,
      uploadedAt: documents.uploadedAt,
    })
    .from(ingestJobs)
    .innerJoin(documents, eq(documents.id, ingestJobs.documentId))
    .where(
      and(
        eq(ingestJobs.userId, params.userId),
        // Shopping-ticket jobs have their own polling UI; the inbox only
        // lists receipt/document ingestion jobs.
        eq(ingestJobs.kind, "document"),
        params.status && params.status !== "all"
          ? eq(ingestJobs.status, params.status)
          : sql`TRUE`
      )
    )
    .orderBy(desc(ingestJobs.createdAt))
    .limit(limit);

  return rows.map((row) => ({
    ...row,
    originalFilename: resolveDisplayFilename(row.originalFilename, row.uploadedAt, row.mimeType),
  }));
}

export async function retryFailedIngestJobForUser(params: {
  userId: string;
  jobId: string;
}) {
  const [job] = await db
    .select({
      id: ingestJobs.id,
      documentId: ingestJobs.documentId,
      status: ingestJobs.status,
      forcedDirection: ingestJobs.forcedDirection,
      maxAttempts: ingestJobs.maxAttempts,
    })
    .from(ingestJobs)
    .where(and(eq(ingestJobs.id, params.jobId), eq(ingestJobs.userId, params.userId)))
    .limit(1);

  if (!job) {
    return { ok: false as const, reason: "not_found" as const };
  }

  if (job.status !== "failed") {
    return { ok: false as const, reason: "invalid_status" as const, status: job.status };
  }

  const now = new Date();
  await db
    .update(ingestJobs)
    .set({
      status: "retry",
      attempts: 0,
      runAfter: now,
      startedAt: null,
      completedAt: null,
      lastError: null,
      workerId: null,
      updatedAt: now,
    })
    .where(eq(ingestJobs.id, job.id));

  await db
    .update(documents)
    .set({
      status: "uploaded",
      processingError: null,
      updatedAt: now,
    })
    .where(eq(documents.id, job.documentId));

  const refreshed = await getIngestJobForUser(job.id, params.userId);
  if (!refreshed) {
    return { ok: false as const, reason: "not_found" as const };
  }

  return { ok: true as const, job: refreshed };
}
