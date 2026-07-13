"use client";

import CloudUploadOutlinedIcon from "@mui/icons-material/CloudUploadOutlined";
import SaveOutlinedIcon from "@mui/icons-material/SaveOutlined";
import {
  Alert,
  Button,
  Card,
  CardContent,
  Chip,
  MenuItem,
  Skeleton,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import { useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useEffect, useMemo, useState } from "react";

import { CategoryIcon } from "@/app/components/category-icons";
import { PageHero } from "@/app/components/page-hero";
import { apiFetch, toDateTimeLocal } from "@/lib/client/http";
import { AccountDto, CategoryDto, Direction } from "@/lib/shared/types";

type CategoriesResponse = {
  categories: CategoryDto[];
};

type AccountsResponse = {
  accounts: AccountDto[];
};

type InboxEnqueueResponse = {
  ok: boolean;
  queued: boolean;
  forcedDirection: Direction | null;
  jobs: Array<{
    documentId: string;
    jobId: string;
    jobStatus: "pending" | "processing" | "completed" | "failed" | "retry";
    statusUrl: string;
  }>;
  error?: string;
};

type TrackedJob = {
  statusUrl: string;
  job: {
    id: string;
    status: "pending" | "processing" | "completed" | "failed" | "retry";
    attempts: number;
    maxAttempts: number;
    lastError: string | null;
    document: {
      id: string;
      status: "uploaded" | "processing" | "processed" | "failed" | "archived";
      processingError: string | null;
    };
  } | null;
};

type InboxJobStatusResponse = {
  job: NonNullable<TrackedJob["job"]>;
};

const QUICK_AMOUNTS = [3000, 6000, 12000, 25000];

export default function QuickPage() {
  return (
    <Suspense fallback={null}>
      <QuickPageContent />
    </Suspense>
  );
}

function QuickPageContent() {
  const searchParams = useSearchParams();
  const [categories, setCategories] = useState<CategoryDto[]>([]);
  const [accounts, setAccounts] = useState<AccountDto[]>([]);
  const [direction, setDirection] = useState<Direction>("expense");
  const [syncedDirectionParam, setSyncedDirectionParam] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [occurredAt, setOccurredAt] = useState(() => toDateTimeLocal(new Date()));
  const [categoryId, setCategoryId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [counterpartyName, setCounterpartyName] = useState("");
  const [concept, setConcept] = useState("");
  const [notes, setNotes] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [trackedJobs, setTrackedJobs] = useState<TrackedJob[]>([]);
  const [loading, setLoading] = useState(true);

  const loadCategoriesAndAccounts = async () => {
    const [categoriesResponse, accountsResponse] = await Promise.all([
      apiFetch<CategoriesResponse>("/api/v1/categories"),
      apiFetch<AccountsResponse>("/api/v1/accounts"),
    ]);
    setCategories(categoriesResponse.categories);
    setAccounts(accountsResponse.accounts.filter((account) => account.isActive));
  };

  const directionParam = searchParams.get("direction");
  if (
    directionParam !== syncedDirectionParam &&
    (directionParam === "income" || directionParam === "expense")
  ) {
    setSyncedDirectionParam(directionParam);
    setDirection(directionParam);
  }

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        await loadCategoriesAndAccounts();
      } catch (requestError) {
        if (!active) return;
        setError(
          requestError instanceof Error
            ? requestError.message
            : "No se pudieron cargar datos de carga rapida"
        );
      } finally {
        if (active) setLoading(false);
      }
    };

    void load();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const pending = trackedJobs.filter(
      (tracked) => !tracked.job || (tracked.job.status !== "completed" && tracked.job.status !== "failed")
    );
    if (!pending.length) return;

    let active = true;
    const timeoutId = window.setTimeout(async () => {
      const results = await Promise.all(
        pending.map(async (tracked) => {
          try {
            const payload = await apiFetch<InboxJobStatusResponse>(tracked.statusUrl);
            return { statusUrl: tracked.statusUrl, job: payload.job };
          } catch {
            return null;
          }
        })
      );
      if (!active) return;

      setTrackedJobs((previous) =>
        previous.map((tracked) => {
          const result = results.find((item) => item && item.statusUrl === tracked.statusUrl);
          return result ? { ...tracked, job: result.job } : tracked;
        })
      );

      const anyCompleted = results.some((item) => item?.job.status === "completed");
      const anyFailed = results.some((item) => item?.job.status === "failed");
      if (anyCompleted) {
        setMessage("Al menos un comprobante fue procesado correctamente.");
      }
      if (anyFailed) {
        setError("Al menos un comprobante fallo al procesarse. Revisa el detalle abajo.");
      }
      if (anyCompleted || anyFailed) {
        await loadCategoriesAndAccounts();
      }
    }, 1600);

    return () => {
      active = false;
      window.clearTimeout(timeoutId);
    };
  }, [trackedJobs]);

  const usableCategories = useMemo(() => {
    return categories.filter(
      (category) => category.direction === "both" || category.direction === direction
    );
  }, [categories, direction]);

  const handleManualSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;
    setMessage(null);
    setError(null);

    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      setError("Monto invalido");
      return;
    }

    try {
      setSaving(true);
      await apiFetch<{ transaction: { id: string } }>("/api/v1/transactions/manual", {
        method: "POST",
        body: JSON.stringify({
          direction,
          amount: numericAmount,
          occurredAt: new Date(occurredAt).toISOString(),
          categoryId: categoryId || null,
          accountId: accountId || null,
          counterpartyName: counterpartyName || null,
          concept: concept || null,
          notes: notes || null,
        }),
      });
      setAmount("");
      setOccurredAt(toDateTimeLocal(new Date()));
      setCategoryId("");
      setCounterpartyName("");
      setConcept("");
      setNotes("");
      setMessage("Movimiento manual guardado.");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "No se pudo guardar el movimiento"
      );
      window.scrollTo({ top: 0, behavior: "smooth" });
    } finally {
      setSaving(false);
    }
  };

  const handleUploadReceipt = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage(null);
    setError(null);

    if (!uploadFiles.length) {
      setError("Selecciona una o mas imagenes o PDF primero.");
      return;
    }

    try {
      setUploading(true);
      const formData = new FormData();
      for (const file of uploadFiles) {
        formData.append("file", file);
      }

      const response = await fetch("/api/v1/inbox", {
        method: "POST",
        headers: {
          "x-transaction-direction": direction,
        },
        body: formData,
      });
      const payload = (await response.json()) as InboxEnqueueResponse;

      if (!response.ok) {
        throw new Error(payload.error ?? "No se pudo procesar el comprobante");
      }

      if (!payload.queued || !payload.jobs?.length) {
        throw new Error("Respuesta invalida del endpoint de inbox");
      }

      setUploadFiles([]);
      setTrackedJobs(payload.jobs.map((job) => ({ statusUrl: job.statusUrl, job: null })));
      setMessage(
        payload.jobs.length === 1
          ? `Comprobante recibido. Job ${payload.jobs[0].jobId} en cola.`
          : `${payload.jobs.length} comprobantes recibidos y en cola.`
      );
      await loadCategoriesAndAccounts();
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "No se pudo subir el comprobante"
      );
    } finally {
      setUploading(false);
    }
  };

  return (
    <Stack spacing={2}>
      <PageHero
        title="Carga rapida"
        subtitle="Sube comprobantes o registra en manual. Diseñado para registrar en segundos."
      />

      {error ? <Alert severity="error">{error}</Alert> : null}
      {message ? <Alert severity="success">{message}</Alert> : null}
      {trackedJobs.length ? (
        <Stack spacing={0.8}>
          {trackedJobs.map((tracked) => (
            <Alert
              key={tracked.statusUrl}
              severity={
                !tracked.job
                  ? "info"
                  : tracked.job.status === "failed"
                    ? "error"
                    : tracked.job.status === "completed"
                      ? "success"
                      : "info"
              }
            >
              {tracked.job
                ? `Job ${tracked.job.id}: ${tracked.job.status} (${tracked.job.attempts}/${tracked.job.maxAttempts})`
                : "Job en cola, esperando estado..."}
            </Alert>
          ))}
        </Stack>
      ) : null}

      <Card component="form" onSubmit={handleUploadReceipt}>
        <CardContent>
          <Stack spacing={1.5}>
            <Typography variant="subtitle1">Escaneo por comprobante</Typography>
            <Typography variant="body2" color="text.secondary">
              OCR + extraccion IA + categorizacion automática con revisión cuando aplica. Podes seleccionar varios archivos a la vez.
            </Typography>
            <ToggleButtonGroup
              color="primary"
              value={direction}
              exclusive
              onChange={(_event, value: Direction | null) => {
                if (!value) return;
                setDirection(value);
                setCategoryId("");
              }}
            >
              <ToggleButton value="expense">Gasto</ToggleButton>
              <ToggleButton value="income">Ingreso</ToggleButton>
            </ToggleButtonGroup>

            <Button variant="outlined" component="label" startIcon={<CloudUploadOutlinedIcon />}>
              {uploadFiles.length
                ? `${uploadFiles.length} archivo${uploadFiles.length > 1 ? "s" : ""} seleccionado${uploadFiles.length > 1 ? "s" : ""}`
                : "Seleccionar archivos"}
              <input
                type="file"
                hidden
                multiple
                accept="application/pdf,image/png,image/jpeg,image/webp"
                onChange={(event) => setUploadFiles(Array.from(event.target.files ?? []))}
              />
            </Button>

            <Button type="submit" variant="contained" loading={uploading} size="large">
              {uploading ? "Encolando..." : "Subir y analizar"}
            </Button>
          </Stack>
        </CardContent>
      </Card>

      <Card component="form" onSubmit={handleManualSubmit}>
        <CardContent>
          <Stack spacing={1.5}>
            <Typography variant="subtitle1">Carga manual instantanea</Typography>

            <TextField
              label="Monto"
              type="number"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              required
              slotProps={{ htmlInput: { min: 0.01, step: 0.01 } }}
            />

            <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
              {QUICK_AMOUNTS.map((preset) => (
                <Chip
                  key={preset}
                  label={`$${preset.toLocaleString("es-AR")}`}
                  color="primary"
                  variant="outlined"
                  onClick={() => setAmount(String(preset))}
                  sx={{ cursor: "pointer" }}
                />
              ))}
            </Stack>

            <TextField
              label="Fecha y hora"
              type="datetime-local"
              value={occurredAt}
              onChange={(event) => setOccurredAt(event.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
            />

            {loading ? (
              <Skeleton variant="rounded" height={56} sx={{ borderRadius: "16px" }} />
            ) : (
              <TextField
                label="Categoria"
                select
                value={categoryId}
                onChange={(event) => setCategoryId(event.target.value)}
              >
                <MenuItem value="">Sin categoria</MenuItem>
                {usableCategories.map((category) => (
                  <MenuItem key={category.id} value={category.id}>
                    <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                      <CategoryIcon icon={category.icon} fontSize="small" sx={{ color: category.colorHex ?? "text.secondary" }} />
                      <span>{category.name}</span>
                    </Stack>
                  </MenuItem>
                ))}
              </TextField>
            )}

            {loading ? (
              <Skeleton variant="rounded" height={56} sx={{ borderRadius: "16px" }} />
            ) : (
              <TextField
                label="Cuenta"
                select
                value={accountId}
                onChange={(event) => setAccountId(event.target.value)}
              >
                <MenuItem value="">Sin cuenta</MenuItem>
                {accounts.map((account) => (
                  <MenuItem key={account.id} value={account.id}>
                    {account.name}
                  </MenuItem>
                ))}
              </TextField>
            )}

            <TextField
              label="Comercio o persona"
              value={counterpartyName}
              onChange={(event) => setCounterpartyName(event.target.value)}
            />

            <TextField
              label="Concepto"
              value={concept}
              onChange={(event) => setConcept(event.target.value)}
            />

            <TextField
              label="Notas"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              multiline
              minRows={2}
            />

            <Button
              type="submit"
              variant="contained"
              size="large"
              startIcon={<SaveOutlinedIcon />}
              loading={saving}
              loadingPosition="start"
            >
              {saving ? "Guardando..." : "Guardar movimiento"}
            </Button>
          </Stack>
        </CardContent>
      </Card>


    </Stack>
  );
}
