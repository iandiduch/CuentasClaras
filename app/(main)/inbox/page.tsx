"use client";

import AutorenewOutlinedIcon from "@mui/icons-material/AutorenewOutlined";
import RefreshOutlinedIcon from "@mui/icons-material/RefreshOutlined";
import {
  Alert,
  Button,
  Card,
  CardContent,
  Chip,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { InboxApiHelp } from "@/app/components/inbox-api-help";
import { ListSkeleton } from "@/app/components/list-skeleton";
import { PageHero } from "@/app/components/page-hero";
import { apiFetch } from "@/lib/client/http";
import { INGEST_JOB_STATUS_LABELS } from "@/lib/shared/labels";
import { IngestJobDto, ReviewDto } from "@/lib/shared/types";

type JobsResponse = {
  jobs: IngestJobDto[];
};

type ReviewsResponse = {
  reviews: ReviewDto[];
};

type JobFilter = "all" | "failed" | "pending" | "processing" | "retry" | "completed";

function statusColor(status: IngestJobDto["status"]): "default" | "error" | "warning" | "success" | "info" {
  if (status === "failed") return "error";
  if (status === "processing" || status === "retry") return "warning";
  if (status === "pending") return "info";
  if (status === "completed") return "success";
  return "default";
}

export default function InboxPage() {
  const [filter, setFilter] = useState<JobFilter>("all");
  const [jobs, setJobs] = useState<IngestJobDto[] | null>(null);
  const [reviews, setReviews] = useState<ReviewDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const loadJobs = async () => {
    try {
      const query = new URLSearchParams();
      query.set("status", filter);
      query.set("limit", "120");
      const payload = await apiFetch<JobsResponse>(`/api/v1/inbox/jobs?${query.toString()}`);
      setJobs(payload.jobs);
      setError(null);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "No se pudo cargar la auditoria de inbox"
      );
    }
  };

  useEffect(() => {
    let active = true;
    const run = async () => {
      try {
        const query = new URLSearchParams();
        query.set("status", filter);
        query.set("limit", "120");
        const payload = await apiFetch<JobsResponse>(`/api/v1/inbox/jobs?${query.toString()}`);
        if (!active) return;
        setJobs(payload.jobs);
        setError(null);
      } catch (requestError) {
        if (!active) return;
        setError(
          requestError instanceof Error
            ? requestError.message
            : "No se pudo cargar la auditoria de inbox"
        );
      }
    };
    void run();
    return () => {
      active = false;
    };
  }, [filter]);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const payload = await apiFetch<ReviewsResponse>("/api/v1/reviews?status=all");
        if (active) setReviews(payload.reviews);
      } catch {
        // The per-job "ir a revision" link degrades to a disabled state if this fails.
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const reviewByDocumentId = useMemo(() => {
    const map = new Map<string, ReviewDto>();
    for (const review of reviews) {
      if (review.document.id) {
        map.set(review.document.id, review);
      }
    }
    return map;
  }, [reviews]);

  const counts = useMemo(() => {
    const base = {
      failed: 0,
      pending: 0,
      processing: 0,
      retry: 0,
      completed: 0,
    };
    if (!jobs) {
      return base;
    }
    for (const job of jobs) {
      base[job.status] += 1;
    }
    return base;
  }, [jobs]);

  const retryJob = async (job: IngestJobDto) => {
    setRetryingId(job.id);
    setError(null);
    setNotice(null);
    try {
      setLoading(true);
      await apiFetch(`/api/v1/inbox/jobs/${job.id}/retry`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      setNotice("Job enviado nuevamente a la cola.");
      await loadJobs();
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "No se pudo reintentar el job"
      );
    } finally {
      setLoading(false);
      setRetryingId(null);
    }
  };

  return (
    <Stack spacing={2}>
      <PageHero
        title="Inbox IA y auditoria"
        subtitle="Monitorea en tiempo real si OCR/extraccion falla y reintenta en un toque."
        action={
          <Button
            onClick={() => {
              setLoading(true);
              void loadJobs().finally(() => setLoading(false));
            }}
            startIcon={<RefreshOutlinedIcon />}
            variant="outlined"
            size="small"
          >
            Refrescar
          </Button>
        }
      />

      {error ? <Alert severity="error">{error}</Alert> : null}
      {notice ? <Alert severity="success">{notice}</Alert> : null}

      <Card>
        <CardContent>
          <Stack spacing={1.5}>
            <Typography variant="subtitle1">Estado operativo</Typography>
            <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
              <Chip label={`Fallidos ${counts.failed}`} color="error" />
              <Chip label={`Pendientes ${counts.pending}`} color="info" />
              <Chip label={`Procesando ${counts.processing}`} color="warning" />
              <Chip label={`Reintento ${counts.retry}`} color="warning" variant="outlined" />
              <Chip label={`Completados ${counts.completed}`} color="success" />
            </Stack>
            <ToggleButtonGroup
              color="primary"
              value={filter}
              exclusive
              size="small"
              onChange={(_event, value: JobFilter | null) => {
                if (!value) return;
                setFilter(value);
              }}
              sx={{ flexWrap: "wrap", justifyContent: "flex-start" }}
            >
              <ToggleButton value="all">Todos</ToggleButton>
              <ToggleButton value="failed">Fallidos</ToggleButton>
              <ToggleButton value="pending">Pendientes</ToggleButton>
              <ToggleButton value="processing">Procesando</ToggleButton>
              <ToggleButton value="retry">Retry</ToggleButton>
              <ToggleButton value="completed">Completados</ToggleButton>
            </ToggleButtonGroup>
          </Stack>
        </CardContent>
      </Card>

      {jobs === null ? <ListSkeleton rows={4} height={110} /> : null}

      {jobs && jobs.length ? (
        <Stack spacing={1.25}>
          {jobs.map((job) => {
            const review = reviewByDocumentId.get(job.document.id);
            const reviewAction =
              review?.status === "pending" || review?.status === "in_progress"
                ? { label: "Ir a revision", href: `/reviews?id=${review.id}` }
                : review?.status === "resolved" && review.transaction?.id
                  ? { label: "Ver movimiento", href: `/transactions?highlight=${review.transaction.id}` }
                  : null;

            return (
            <Card key={job.id}>
              <CardContent>
                <Stack spacing={1.1}>
                  <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap" }}>
                    <Chip label={INGEST_JOB_STATUS_LABELS[job.status]} color={statusColor(job.status)} size="small" />
                    <Typography variant="caption" color="text.secondary">
                      Intentos {job.attempts}/{job.maxAttempts}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {job.document.originalFilename ?? "archivo sin nombre"}
                    </Typography>
                  </Stack>

                  <Typography variant="body2" color="text.secondary">
                    Documento: {job.document.id}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Subido:{" "}
                    {job.document.uploadedAt
                      ? new Date(job.document.uploadedAt).toLocaleString("es-AR")
                      : "sin fecha"}
                  </Typography>

                  {job.lastError || job.document.processingError ? (
                    <Alert severity="error" sx={{ mt: 0.5 }}>
                      {job.lastError ?? job.document.processingError}
                    </Alert>
                  ) : null}

                  <Stack direction="row" spacing={1} sx={{ justifyContent: "flex-end", flexWrap: "wrap" }}>
                    {job.status === "failed" ? (
                      <Button
                        variant="contained"
                        startIcon={<AutorenewOutlinedIcon />}
                        loading={retryingId === job.id}
                        loadingPosition="start"
                        onClick={() => void retryJob(job)}
                      >
                        Reintentar analisis
                      </Button>
                    ) : null}
                    {reviewAction ? (
                      <Button component={Link} href={reviewAction.href} variant="outlined">
                        {reviewAction.label}
                      </Button>
                    ) : (
                      <Button variant="outlined" disabled>
                        Sin revision pendiente
                      </Button>
                    )}
                  </Stack>
                </Stack>
              </CardContent>
            </Card>
            );
          })}
        </Stack>
      ) : null}

      {jobs && !jobs.length && !loading ? (
        <Card>
          <CardContent>
            <Typography variant="body2" color="text.secondary">
              No hay jobs para este filtro.
            </Typography>
          </CardContent>
        </Card>
      ) : null}

      <InboxApiHelp />
    </Stack>
  );
}
