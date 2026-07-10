import type { CategoryDirection } from "@/lib/shared/types";

export const CATEGORY_DIRECTION_LABELS: Record<CategoryDirection, string> = {
  income: "Ingreso",
  expense: "Gasto",
  both: "Ambos",
};

export const REVIEW_STATUS_LABELS: Record<"pending" | "in_progress" | "resolved" | "dismissed", string> = {
  pending: "Pendiente",
  in_progress: "En proceso",
  resolved: "Resuelta",
  dismissed: "Descartada",
};

export const INGEST_JOB_STATUS_LABELS: Record<
  "pending" | "processing" | "completed" | "failed" | "retry",
  string
> = {
  pending: "En cola",
  processing: "Procesando",
  completed: "Completado",
  failed: "Fallo",
  retry: "Reintentando",
};

export const TRANSACTION_STATUS_LABELS: Record<
  "auto_confirmed" | "pending_review" | "manually_confirmed" | "rejected",
  string
> = {
  auto_confirmed: "Confirmado automaticamente",
  pending_review: "Revision",
  manually_confirmed: "Confirmado",
  rejected: "Rechazado",
};
