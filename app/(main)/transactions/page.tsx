"use client";

import DeleteOutlineOutlinedIcon from "@mui/icons-material/DeleteOutlineOutlined";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import {
  Alert,
  Avatar,
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Drawer,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

import { CategoryIcon } from "@/app/components/category-icons";
import { DocumentViewer } from "@/app/components/document-viewer";
import { ListSkeleton } from "@/app/components/list-skeleton";
import { PageHero } from "@/app/components/page-hero";
import { apiFetch, formatCurrency, toDateTimeLocal } from "@/lib/client/http";
import { TRANSACTION_STATUS_LABELS } from "@/lib/shared/labels";
import { AccountDto, CategoryDto, Direction, TransactionDto } from "@/lib/shared/types";

type TransactionsResponse = {
  transactions: TransactionDto[];
};

type CategoriesResponse = {
  categories: CategoryDto[];
};

type AccountsResponse = {
  accounts: AccountDto[];
};

function kindLabel(kind: TransactionDto["kind"]) {
  if (kind === "transfer") return "Transferencia";
  if (kind === "adjustment") return "Ajuste";
  return null;
}

function getCurrentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function buildMonthRange(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const from = new Date(Date.UTC(year, monthNumber - 1, 1, 0, 0, 0));
  const to = new Date(Date.UTC(year, monthNumber, 1, 0, 0, 0));
  return { from, to };
}

type EditForm = {
  direction: Direction;
  amount: string;
  occurredAt: string;
  categoryId: string;
  accountId: string;
  counterpartyName: string;
  concept: string;
  notes: string;
};

function TransactionsPageContent() {
  const searchParams = useSearchParams();
  const highlightId = searchParams.get("highlight");
  const [month, setMonth] = useState(getCurrentMonth());
  const [direction, setDirection] = useState<"all" | "income" | "expense">("all");
  const [accountId, setAccountId] = useState("all");
  const [categoryId, setCategoryId] = useState("all");
  const [rows, setRows] = useState<TransactionDto[] | null>(null);
  const [categories, setCategories] = useState<CategoryDto[]>([]);
  const [accounts, setAccounts] = useState<AccountDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState<TransactionDto | null>(null);
  const [editForm, setEditForm] = useState<EditForm | null>(null);
  const [deleting, setDeleting] = useState<TransactionDto | null>(null);
  const [saving, setSaving] = useState(false);

  const query = useMemo(() => {
    const { from, to } = buildMonthRange(month);
    const params = new URLSearchParams();
    params.set("limit", "100");
    params.set("from", from.toISOString());
    params.set("to", to.toISOString());
    if (direction !== "all") {
      params.set("direction", direction);
    }
    if (accountId !== "all") {
      params.set("accountId", accountId);
    }
    if (categoryId !== "all") {
      params.set("categoryId", categoryId);
    }
    return params.toString();
  }, [month, direction, accountId, categoryId]);

  const load = async () => {
    const [transactionsData, categoriesData, accountsData] = await Promise.all([
      apiFetch<TransactionsResponse>(`/api/v1/transactions?${query}`),
      apiFetch<CategoriesResponse>("/api/v1/categories"),
      apiFetch<AccountsResponse>("/api/v1/accounts"),
    ]);
    setRows(transactionsData.transactions);
    setCategories(categoriesData.categories);
    setAccounts(accountsData.accounts);
  };

  useEffect(() => {
    let active = true;
    const run = async () => {
      try {
        await load();
        if (!active) return;
        setError(null);
      } catch (requestError) {
        if (!active) return;
        setError(
          requestError instanceof Error
            ? requestError.message
            : "No se pudieron cargar los movimientos"
        );
      }
    };
    void run();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  // Deep-link support (e.g. coming from /inbox for an already-resolved
  // review): jump the month filter to wherever the highlighted transaction
  // actually lives, since it may not be in the currently selected month.
  useEffect(() => {
    if (!highlightId) return;
    let active = true;
    void (async () => {
      try {
        const { transactions: found } = await apiFetch<TransactionsResponse>(
          `/api/v1/transactions?id=${highlightId}`
        );
        if (!active) return;
        const match = found[0];
        if (match) {
          const occurredAt = new Date(match.occurredAt);
          const targetMonth = `${occurredAt.getFullYear()}-${String(occurredAt.getMonth() + 1).padStart(2, "0")}`;
          setMonth((current) => (current === targetMonth ? current : targetMonth));
        }
      } catch {
        // If the lookup fails the page still works, it just won't auto-jump months.
      }
    })();
    return () => {
      active = false;
    };
  }, [highlightId]);

  useEffect(() => {
    if (!highlightId || !rows) return;
    const node = document.getElementById(`txn-${highlightId}`);
    node?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlightId, rows]);

  const openEditor = (movement: TransactionDto) => {
    setEditing(movement);
    setEditForm({
      direction: movement.direction,
      amount: movement.amount.toString(),
      occurredAt: toDateTimeLocal(movement.occurredAt),
      categoryId: movement.categoryId ?? "",
      accountId: movement.accountId ?? "",
      counterpartyName: movement.counterpartyName ?? "",
      concept: movement.concept ?? "",
      notes: movement.notes ?? "",
    });
  };

  const filteredCategories = useMemo(() => {
    if (!editForm) return [];
    return categories.filter(
      (category) => category.direction === "both" || category.direction === editForm.direction
    );
  }, [categories, editForm]);

  const saveEdit = async () => {
    if (!editing || !editForm) return;
    const amount = Number(editForm.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Monto invalido");
      return;
    }
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await apiFetch(`/api/v1/transactions/${editing.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          direction: editForm.direction,
          amount,
          occurredAt: new Date(editForm.occurredAt).toISOString(),
          categoryId: editForm.categoryId || null,
          accountId: editForm.accountId || null,
          counterpartyName: editForm.counterpartyName || null,
          concept: editForm.concept || null,
          notes: editForm.notes || null,
        }),
      });
      setEditing(null);
      setEditForm(null);
      setNotice("Movimiento actualizado.");
      await load();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "No se pudo actualizar");
    } finally {
      setSaving(false);
    }
  };

  const removeTransaction = async () => {
    if (!deleting) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await apiFetch(`/api/v1/transactions/${deleting.id}`, { method: "DELETE" });
      setDeleting(null);
      setNotice("Movimiento eliminado.");
      await load();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "No se pudo eliminar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Stack spacing={2}>
      <PageHero
        title="Movimientos"
        subtitle="Edita o elimina registros para mantener tu historial limpio y confiable."
      />

      {error ? <Alert severity="error">{error}</Alert> : null}
      {notice ? <Alert severity="success">{notice}</Alert> : null}

      <Card>
        <CardContent>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.2}>
            <input
              type="month"
              value={month}
              onChange={(event) => setMonth(event.target.value)}
              style={{
                borderRadius: 10,
                border: "1px solid rgba(148,163,184,0.6)",
                padding: "8px 10px",
                background: "white",
              }}
            />
            <FormControl size="small" sx={{ minWidth: 170 }}>
              <InputLabel id="direction-label">Tipo</InputLabel>
              <Select
                labelId="direction-label"
                label="Tipo"
                value={direction}
                onChange={(event) =>
                  setDirection(event.target.value as "all" | "income" | "expense")
                }
              >
                <MenuItem value="all">Todos</MenuItem>
                <MenuItem value="income">Ingresos</MenuItem>
                <MenuItem value="expense">Gastos</MenuItem>
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 170 }}>
              <InputLabel id="account-label">Cuenta</InputLabel>
              <Select
                labelId="account-label"
                label="Cuenta"
                value={accountId}
                onChange={(event) => setAccountId(event.target.value)}
              >
                <MenuItem value="all">Todas</MenuItem>
                {accounts.map((account) => (
                  <MenuItem key={account.id} value={account.id}>
                    {account.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 190 }}>
              <InputLabel id="category-label">Categoria</InputLabel>
              <Select
                labelId="category-label"
                label="Categoria"
                value={categoryId}
                onChange={(event) => setCategoryId(event.target.value)}
              >
                <MenuItem value="all">Todas</MenuItem>
                {categories.map((category) => (
                  <MenuItem key={category.id} value={category.id}>
                    <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                      <CategoryIcon
                        icon={category.icon}
                        fontSize="small"
                        sx={{ color: category.colorHex ?? "text.secondary" }}
                      />
                      <span>{category.name}</span>
                    </Stack>
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Stack>
        </CardContent>
      </Card>

      {rows === null ? (
        <ListSkeleton rows={5} height={90} />
      ) : rows.length ? (
        <Stack spacing={1.1}>
          {rows.map((movement) => (
            <Card
              key={movement.id}
              id={`txn-${movement.id}`}
              sx={
                movement.id === highlightId
                  ? { outline: "2px solid", outlineColor: "primary.main" }
                  : undefined
              }
            >
              <CardContent>
                <Stack direction="row" spacing={1.2} sx={{ justifyContent: "space-between" }}>
                  <Stack direction="row" spacing={1.2} sx={{ minWidth: 0 }}>
                    <Avatar sx={{ bgcolor: movement.categoryColorHex ?? "#94a3b8", width: 38, height: 38, mt: 0.2 }}>
                      <CategoryIcon icon={movement.categoryIcon} fontSize="small" />
                    </Avatar>
                    <Stack spacing={0.45} sx={{ minWidth: 0 }}>
                      <Typography variant="body1" sx={{ fontWeight: 700 }}>
                        {movement.counterpartyName ?? movement.concept ?? "Sin detalle"}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {new Date(movement.occurredAt).toLocaleString("es-AR")}
                      </Typography>
                      <Stack direction="row" spacing={0.8} useFlexGap sx={{ flexWrap: "wrap" }}>
                        {kindLabel(movement.kind) ? (
                          <Chip label={kindLabel(movement.kind)} size="small" color="info" variant="outlined" />
                        ) : (
                          <Chip label={movement.categoryName ?? "Sin categoria"} size="small" />
                        )}
                        <Chip
                          size="small"
                          label={TRANSACTION_STATUS_LABELS[movement.status]}
                          color={movement.status === "pending_review" ? "warning" : "default"}
                        />
                        {movement.accountName ? (
                          <Chip label={movement.accountName} size="small" variant="outlined" />
                        ) : null}
                      </Stack>
                    </Stack>
                  </Stack>
                  <Stack sx={{ alignItems: "flex-end" }}>
                    <Typography
                      variant="body1"
                      sx={{
                        fontWeight: 700,
                        color: movement.direction === "income" ? "success.main" : "error.main",
                      }}
                    >
                      {movement.direction === "income" ? "+" : "-"}
                      {formatCurrency(movement.amount, movement.currency)}
                    </Typography>
                    <Stack direction="row" spacing={0.3}>
                      {movement.documentId ? (
                        <DocumentViewer documentId={movement.documentId} iconOnly />
                      ) : null}
                      <IconButton onClick={() => openEditor(movement)} size="small">
                        <EditOutlinedIcon fontSize="small" />
                      </IconButton>
                      <IconButton onClick={() => setDeleting(movement)} size="small" color="error">
                        <DeleteOutlineOutlinedIcon fontSize="small" />
                      </IconButton>
                    </Stack>
                  </Stack>
                </Stack>
              </CardContent>
            </Card>
          ))}
        </Stack>
      ) : (
        <Card>
          <CardContent>
            <Typography variant="body2" color="text.secondary">
              No hay movimientos para este filtro.
            </Typography>
          </CardContent>
        </Card>
      )}

      <Drawer
        anchor="bottom"
        open={Boolean(editing && editForm)}
        onClose={() => {
          if (saving) return;
          setEditing(null);
          setEditForm(null);
        }}
        slotProps={{
          paper: {
            sx: {
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              p: 2,
              pb: "calc(16px + env(safe-area-inset-bottom))",
            },
          },
        }}
      >
        {editForm ? (
          <Stack spacing={1.3}>
            <Typography variant="h6">Editar movimiento</Typography>
            <FormControl size="small">
              <InputLabel id="edit-direction-label">Tipo</InputLabel>
              <Select
                labelId="edit-direction-label"
                label="Tipo"
                value={editForm.direction}
                onChange={(event) =>
                  setEditForm((previous) =>
                    previous
                      ? {
                          ...previous,
                          direction: event.target.value as Direction,
                          categoryId: "",
                        }
                      : previous
                  )
                }
              >
                <MenuItem value="expense">Gasto</MenuItem>
                <MenuItem value="income">Ingreso</MenuItem>
              </Select>
            </FormControl>

            <TextField
              label="Monto"
              type="number"
              value={editForm.amount}
              onChange={(event) =>
                setEditForm((previous) =>
                  previous ? { ...previous, amount: event.target.value } : previous
                )
              }
              slotProps={{ htmlInput: { min: 0.01, step: 0.01 } }}
            />

            <TextField
              label="Fecha y hora"
              type="datetime-local"
              value={editForm.occurredAt}
              onChange={(event) =>
                setEditForm((previous) =>
                  previous ? { ...previous, occurredAt: event.target.value } : previous
                )
              }
              slotProps={{ inputLabel: { shrink: true } }}
            />

            <TextField
              label="Categoria"
              select
              value={editForm.categoryId}
              onChange={(event) =>
                setEditForm((previous) =>
                  previous ? { ...previous, categoryId: event.target.value } : previous
                )
              }
            >
              <MenuItem value="">Sin categoria</MenuItem>
              {filteredCategories.map((category) => (
                <MenuItem key={category.id} value={category.id}>
                  <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                    <CategoryIcon icon={category.icon} fontSize="small" sx={{ color: category.colorHex ?? "text.secondary" }} />
                    <span>{category.name}</span>
                  </Stack>
                </MenuItem>
              ))}
            </TextField>

            <TextField
              label="Cuenta"
              select
              value={editForm.accountId}
              onChange={(event) =>
                setEditForm((previous) =>
                  previous ? { ...previous, accountId: event.target.value } : previous
                )
              }
            >
              <MenuItem value="">Sin cuenta</MenuItem>
              {accounts.map((account) => (
                <MenuItem key={account.id} value={account.id}>
                  {account.name}
                </MenuItem>
              ))}
            </TextField>

            <TextField
              label="Comercio o persona"
              value={editForm.counterpartyName}
              onChange={(event) =>
                setEditForm((previous) =>
                  previous ? { ...previous, counterpartyName: event.target.value } : previous
                )
              }
            />

            <TextField
              label="Concepto"
              value={editForm.concept}
              onChange={(event) =>
                setEditForm((previous) =>
                  previous ? { ...previous, concept: event.target.value } : previous
                )
              }
            />

            <TextField
              label="Notas"
              value={editForm.notes}
              multiline
              minRows={2}
              onChange={(event) =>
                setEditForm((previous) =>
                  previous ? { ...previous, notes: event.target.value } : previous
                )
              }
            />

            <Stack direction="row" spacing={1} sx={{ justifyContent: "flex-end", mt: 0.5 }}>
              <Button
                variant="outlined"
                onClick={() => {
                  if (saving) return;
                  setEditing(null);
                  setEditForm(null);
                }}
              >
                Cancelar
              </Button>
              <Button variant="contained" disabled={saving} onClick={() => void saveEdit()}>
                Guardar cambios
              </Button>
            </Stack>
          </Stack>
        ) : null}
      </Drawer>

      <Dialog open={Boolean(deleting)} onClose={() => (saving ? null : setDeleting(null))}>
        <DialogTitle>Eliminar movimiento</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            Esta accion no se puede deshacer. El movimiento sera eliminado del historial.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleting(null)} disabled={saving}>
            Cancelar
          </Button>
          <Button color="error" variant="contained" disabled={saving} onClick={() => void removeTransaction()}>
            Eliminar
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}

export default function TransactionsPage() {
  return (
    <Suspense fallback={null}>
      <TransactionsPageContent />
    </Suspense>
  );
}
