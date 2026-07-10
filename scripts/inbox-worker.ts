import {
  claimNextIngestJob,
  createWorkerId,
  markIngestJobCompleted,
  markIngestJobFailed,
  recoverStuckIngestJobs,
} from "@/lib/server/ingest-queue";
import { processDocumentPipeline } from "@/lib/server/document-pipeline";
import { processShoppingTicket } from "@/lib/server/shopping-ticket-pipeline";

const workerId = createWorkerId();
const pollMs = Number(process.env.INGEST_WORKER_POLL_MS ?? "1200");
const idleMs = Number.isFinite(pollMs) && pollMs > 100 ? pollMs : 1200;
const concurrencyRaw = Number(process.env.QUEUE_CONCURRENCY ?? "1");
const concurrency = Number.isFinite(concurrencyRaw) && concurrencyRaw >= 1
  ? Math.floor(concurrencyRaw)
  : 1;
const RECOVERY_SWEEP_MS = 5 * 60 * 1000;
let isRunning = true;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function processOne(laneWorkerId: string) {
  const job = await claimNextIngestJob(laneWorkerId);
  if (!job) {
    return false;
  }

  try {
    if (job.kind === "shopping_ticket") {
      await processShoppingTicket({ documentId: job.documentId });
    } else {
      await processDocumentPipeline({
        documentId: job.documentId,
        forcedDirection: job.forcedDirection,
      });
    }
    await markIngestJobCompleted(job.id);
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown worker error";
    await markIngestJobFailed({
      jobId: job.id,
      attempts: job.attempts,
      maxAttempts: job.maxAttempts,
      errorMessage: message,
    });
    return true;
  }
}

// Each lane claims jobs independently via claimNextIngestJob's `FOR UPDATE
// SKIP LOCKED`, so running several lanes in the same process is exactly as
// safe as running several separate worker processes — no double-claiming.
async function runLane(laneIndex: number) {
  const laneWorkerId = concurrency > 1 ? `${workerId}:lane${laneIndex}` : workerId;
  while (isRunning) {
    const didWork = await processOne(laneWorkerId);
    if (!didWork) {
      await sleep(idleMs);
    }
  }
}

async function main() {
  await recoverStuckIngestJobs();
  console.info(`[inbox-worker] started (${workerId}), concurrency=${concurrency}`);

  // A job stuck in "processing" (e.g. a hung network call that never threw)
  // only gets swept back to "retry" once it's 15+ minutes stale — but this
  // function used to run only once at boot. A long-lived process would
  // never notice a job going stale *during* its own run; it needed to crash
  // and restart for the boot-time check to fire again. Sweep periodically
  // instead, so a stuck job gets recovered without needing a restart at all.
  const recoveryTimer = setInterval(() => {
    void recoverStuckIngestJobs().catch((error) => {
      console.error("[inbox-worker] recovery sweep failed", error);
    });
  }, RECOVERY_SWEEP_MS);

  await Promise.all(Array.from({ length: concurrency }, (_, index) => runLane(index)));

  clearInterval(recoveryTimer);
  console.info("[inbox-worker] stopped");
}

process.on("SIGINT", () => {
  isRunning = false;
});
process.on("SIGTERM", () => {
  isRunning = false;
});

void main().catch((error) => {
  console.error("[inbox-worker] fatal error", error);
  process.exitCode = 1;
});
