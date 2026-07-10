"use client";

import PhotoCameraOutlinedIcon from "@mui/icons-material/PhotoCameraOutlined";
import ReceiptLongOutlinedIcon from "@mui/icons-material/ReceiptLongOutlined";
import {
  Alert,
  Button,
  Chip,
  CircularProgress,
  Divider,
  Drawer,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { ChangeEvent, useEffect, useRef, useState } from "react";

import { apiFetch, formatCurrency } from "@/lib/client/http";

import type { ShoppingListItemDto, TicketJobResponse } from "../types";
import { parsePriceInput } from "../types";

const IGNORE = "__ignore__";
const NEW_ITEM = "__new__";

type LineDecision = {
  target: string; // itemId | IGNORE | NEW_ITEM
  priceInput: string;
};

type TicketReviewDrawerProps = {
  open: boolean;
  listId: string;
  items: ShoppingListItemDto[];
  onClose: () => void;
  onApplied: (result: {
    documentId: string;
    storeName: string | null;
    total: number | null;
    purchasedAt: string | null;
  }) => void;
};

type Phase = "idle" | "uploading" | "processing" | "review" | "applying";

export function TicketReviewDrawer({
  open,
  listId,
  items,
  onClose,
  onApplied,
}: TicketReviewDrawerProps) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [job, setJob] = useState<TicketJobResponse | null>(null);
  const [decisions, setDecisions] = useState<LineDecision[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [wasOpen, setWasOpen] = useState(open);

  // Reset local state only on the true->false transition, without doing it
  // synchronously inside an effect.
  if (open !== wasOpen) {
    setWasOpen(open);
    if (!open) {
      setPhase("idle");
      setError(null);
      setJob(null);
      setDecisions([]);
    }
  }

  useEffect(() => {
    if (!open && pollRef.current) {
      clearTimeout(pollRef.current);
      pollRef.current = null;
    }
  }, [open]);

  useEffect(() => {
    return () => {
      if (pollRef.current) {
        clearTimeout(pollRef.current);
      }
    };
  }, []);

  const pollJob = (jobId: string) => {
    const tick = async () => {
      try {
        const response = await apiFetch<TicketJobResponse>(
          `/api/v1/shopping/ticket-jobs/${jobId}`
        );
        if (response.status === "completed") {
          setJob(response);
          const lines = response.ticket?.items ?? [];
          setDecisions(
            lines.map((line, index) => {
              const proposal = response.proposals?.find(
                (candidate) => candidate.lineIndex === index
              );
              const price = line.unitPrice ?? line.lineTotal;
              return {
                target: proposal?.itemId ?? NEW_ITEM,
                priceInput: price != null ? String(price).replace(".", ",") : "",
              };
            })
          );
          setPhase("review");
          return;
        }
        if (response.status === "failed") {
          setError(response.lastError ?? "No se pudo procesar el ticket");
          setPhase("idle");
          return;
        }
        pollRef.current = setTimeout(() => void tick(), 2000);
      } catch (requestError) {
        setError(
          requestError instanceof Error
            ? requestError.message
            : "No se pudo consultar el estado del ticket"
        );
        setPhase("idle");
      }
    };
    void tick();
  };

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setError(null);
    setPhase("uploading");
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch(`/api/v1/shopping/lists/${listId}/ticket`, {
        method: "POST",
        body: formData,
      });
      const payload = (await response.json().catch(() => null)) as
        | { jobId?: string; error?: string }
        | null;
      if (!response.ok || !payload?.jobId) {
        throw new Error(payload?.error ?? "No se pudo subir el ticket");
      }
      setPhase("processing");
      pollJob(payload.jobId);
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "No se pudo subir el ticket"
      );
      setPhase("idle");
    }
  };

  const handleApply = async () => {
    if (!job?.ticket || !job.documentId) return;
    const lines = job.ticket.items;

    const assignments: Array<{ itemId: string; unitPrice: number; quantity?: number }> = [];
    const newItems: Array<{ label: string; quantity: number; unitPrice: number }> = [];

    for (const [index, decision] of decisions.entries()) {
      if (decision.target === IGNORE) continue;
      const line = lines[index];
      const price = parsePriceInput(decision.priceInput);
      if (price == null) {
        setError(`Falta el precio del renglón "${line.name}"`);
        return;
      }
      if (decision.target === NEW_ITEM) {
        newItems.push({
          label: line.name,
          quantity: line.quantity > 0 ? line.quantity : 1,
          unitPrice: price,
        });
      } else {
        assignments.push({
          itemId: decision.target,
          unitPrice: price,
          quantity: line.quantity > 0 && line.quantity !== 1 ? line.quantity : undefined,
        });
      }
    }

    setError(null);
    setPhase("applying");
    try {
      await apiFetch(`/api/v1/shopping/lists/${listId}/ticket/apply`, {
        method: "POST",
        body: JSON.stringify({
          documentId: job.documentId,
          assignments,
          newItems,
        }),
      });
      onApplied({
        documentId: job.documentId,
        storeName: job.ticket.storeName,
        total: job.ticket.total,
        purchasedAt: job.ticket.purchasedAt,
      });
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "No se pudieron aplicar los precios"
      );
      setPhase("review");
    }
  };

  const busy = phase === "uploading" || phase === "processing" || phase === "applying";
  const uncheckedItems = items.filter((item) => !item.checked);
  const usedTargets = new Set(
    decisions
      .map((decision) => decision.target)
      .filter((target) => target !== IGNORE && target !== NEW_ITEM)
  );

  return (
    <Drawer
      anchor="bottom"
      open={open}
      onClose={() => (busy ? null : onClose())}
      slotProps={{
        paper: {
          sx: {
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            p: 2,
            pb: "calc(16px + env(safe-area-inset-bottom))",
            maxHeight: "88vh",
          },
        },
      }}
    >
      <Stack spacing={1.4}>
        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
          <ReceiptLongOutlinedIcon color="primary" />
          <Typography variant="h6">Cargar ticket</Typography>
        </Stack>

        {error ? <Alert severity="error">{error}</Alert> : null}

        {phase === "idle" ? (
          <Stack spacing={1.2} sx={{ alignItems: "center", py: 2 }}>
            <Typography variant="body2" color="text.secondary" sx={{ textAlign: "center" }}>
              Sacale una foto al ticket y la IA extrae los renglones con sus precios para
              matchearlos con tu lista.
            </Typography>
            <Button
              variant="contained"
              startIcon={<PhotoCameraOutlinedIcon />}
              onClick={() => fileInputRef.current?.click()}
            >
              Sacar foto / elegir archivo
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,application/pdf"
              capture="environment"
              hidden
              onChange={(event) => void handleFile(event)}
            />
          </Stack>
        ) : null}

        {phase === "uploading" || phase === "processing" ? (
          <Stack spacing={1.2} sx={{ alignItems: "center", py: 3 }}>
            <CircularProgress size={32} />
            <Typography variant="body2" color="text.secondary">
              {phase === "uploading" ? "Subiendo ticket…" : "Leyendo el ticket con IA…"}
            </Typography>
          </Stack>
        ) : null}

        {(phase === "review" || phase === "applying") && job?.ticket ? (
          <>
            <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", gap: 0.5 }}>
              {job.ticket.storeName ? (
                <Chip size="small" label={`Súper: ${job.ticket.storeName}`} />
              ) : null}
              {job.ticket.total != null ? (
                <Chip
                  size="small"
                  color="primary"
                  label={`Total: ${formatCurrency(job.ticket.total)}`}
                />
              ) : null}
            </Stack>

            {job.ticket.items.length === 0 ? (
              <Alert severity="info">
                No se detectaron renglones de productos en el ticket. Podés cerrar la
                compra cargando el total a mano.
              </Alert>
            ) : (
              <Stack
                spacing={1}
                sx={{ overflowY: "auto", maxHeight: "48vh", pr: 0.5 }}
              >
                {job.ticket.items.map((line, index) => {
                  const decision = decisions[index];
                  if (!decision) return null;
                  return (
                    <Stack
                      key={index}
                      spacing={0.8}
                      sx={{
                        p: 1.2,
                        borderRadius: "14px",
                        bgcolor: "rgba(226, 232, 240, 0.3)",
                      }}
                    >
                      <Stack
                        direction="row"
                        sx={{ justifyContent: "space-between", alignItems: "center", gap: 1 }}
                      >
                        <Typography variant="body2" sx={{ fontWeight: 700 }} noWrap>
                          {line.name}
                        </Typography>
                        {line.quantity !== 1 ? (
                          <Chip size="small" label={`x${line.quantity}`} />
                        ) : null}
                      </Stack>
                      <Stack direction="row" spacing={1}>
                        <TextField
                          select
                          size="small"
                          label="Ítem de la lista"
                          value={decision.target}
                          onChange={(event) =>
                            setDecisions((previous) =>
                              previous.map((entry, entryIndex) =>
                                entryIndex === index
                                  ? { ...entry, target: event.target.value }
                                  : entry
                              )
                            )
                          }
                          sx={{ flex: 1, minWidth: 0 }}
                        >
                          {uncheckedItems.map((item) => (
                            <MenuItem
                              key={item.id}
                              value={item.id}
                              disabled={
                                usedTargets.has(item.id) && decision.target !== item.id
                              }
                            >
                              {item.label}
                            </MenuItem>
                          ))}
                          <MenuItem value={NEW_ITEM}>Nuevo ítem</MenuItem>
                          <MenuItem value={IGNORE}>Ignorar</MenuItem>
                        </TextField>
                        <TextField
                          size="small"
                          label="Precio"
                          value={decision.priceInput}
                          onChange={(event) =>
                            setDecisions((previous) =>
                              previous.map((entry, entryIndex) =>
                                entryIndex === index
                                  ? { ...entry, priceInput: event.target.value }
                                  : entry
                              )
                            )
                          }
                          disabled={decision.target === IGNORE}
                          slotProps={{ htmlInput: { inputMode: "decimal" } }}
                          sx={{ width: 110, flexShrink: 0 }}
                        />
                      </Stack>
                    </Stack>
                  );
                })}
              </Stack>
            )}

            <Divider />
            <Stack direction="row" spacing={1} sx={{ justifyContent: "flex-end" }}>
              <Button onClick={onClose} disabled={phase === "applying"}>
                Cancelar
              </Button>
              <Button
                variant="contained"
                onClick={() => void handleApply()}
                disabled={phase === "applying"}
              >
                Aplicar y seguir
              </Button>
            </Stack>
          </>
        ) : null}
      </Stack>
    </Drawer>
  );
}
