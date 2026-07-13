"use client";

import AddOutlinedIcon from "@mui/icons-material/AddOutlined";
import DeleteOutlineOutlinedIcon from "@mui/icons-material/DeleteOutlineOutlined";
import {
  Alert,
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Drawer,
  IconButton,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { FormEvent, useEffect, useMemo, useState } from "react";

import { CategoryIcon } from "@/app/components/category-icons";
import { ListSkeleton } from "@/app/components/list-skeleton";
import { PageHero } from "@/app/components/page-hero";
import { apiFetch, formatCurrency } from "@/lib/client/http";
import { AccountDto, CategoryDto, RecurringExpenseDto } from "@/lib/shared/types";

type RecurringResponse = {
  recurringExpenses: RecurringExpenseDto[];
};

type CategoriesResponse = {
  categories: CategoryDto[];
};

type AccountsResponse = {
  accounts: AccountDto[];
};

function statusChip(status: RecurringExpenseDto["thisMonthStatus"]) {
  switch (status) {
    case "generated":
      return { label: "Generado", color: "success" as const };
    case "awaiting_manual":
      return { label: "Pendiente", color: "warning" as const };
    default:
      return { label: "Aun no vence", color: "default" as const };
  }
}

export default function RecurringExpensesPage() {
  const [rows, setRows] = useState<RecurringExpenseDto[]>([]);
  const [categories, setCategories] = useState<CategoryDto[]>([]);
  const [accounts, setAccounts] = useState<AccountDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [expectedAmount, setExpectedAmount] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [counterpartyName, setCounterpartyName] = useState("");
  const [dayOfMonth, setDayOfMonth] = useState("1");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [deactivating, setDeactivating] = useState<RecurringExpenseDto | null>(null);

  const usableCategories = useMemo(
    () => categories.filter((category) => category.direction === "both" || category.direction === "expense"),
    [categories]
  );

  const refresh = async () => {
    const [recurringResponse, categoriesResponse, accountsResponse] = await Promise.all([
      apiFetch<RecurringResponse>("/api/v1/recurring-expenses"),
      apiFetch<CategoriesResponse>("/api/v1/categories"),
      apiFetch<AccountsResponse>("/api/v1/accounts"),
    ]);
    setRows(recurringResponse.recurringExpenses);
    setCategories(categoriesResponse.categories);
    setAccounts(accountsResponse.accounts.filter((account) => account.isActive));
  };

  useEffect(() => {
    let active = true;
    const boot = async () => {
      try {
        await refresh();
      } catch (requestError) {
        if (!active) return;
        setError(
          requestError instanceof Error ? requestError.message : "No se pudieron cargar los gastos recurrentes"
        );
      } finally {
        if (active) setLoading(false);
      }
    };
    void boot();
    return () => {
      active = false;
    };
  }, []);

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage(null);
    setError(null);

    const numericDay = Number(dayOfMonth);
    if (!Number.isFinite(numericDay) || numericDay < 1 || numericDay > 31) {
      setError("El dia del mes debe ser entre 1 y 31");
      return;
    }

    try {
      setBusy(true);
      await apiFetch("/api/v1/recurring-expenses", {
        method: "POST",
        body: JSON.stringify({
          name,
          expectedAmount: expectedAmount ? Number(expectedAmount) : null,
          categoryId: categoryId || null,
          accountId: accountId || null,
          counterpartyName: counterpartyName || null,
          dayOfMonth: numericDay,
        }),
      });

      setName("");
      setExpectedAmount("");
      setCategoryId("");
      setAccountId("");
      setCounterpartyName("");
      setDayOfMonth("1");
      setMessage("Gasto recurrente creado.");
      setCreateOpen(false);
      await refresh();
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "No se pudo crear el gasto recurrente"
      );
    } finally {
      setBusy(false);
    }
  };

  const confirmDeactivate = async () => {
    if (!deactivating) return;
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      await apiFetch(`/api/v1/recurring-expenses/${deactivating.id}`, { method: "DELETE" });
      setDeactivating(null);
      setMessage("Gasto recurrente desactivado.");
      await refresh();
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "No se pudo desactivar el gasto recurrente"
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Stack spacing={2}>
      <PageHero
        title="Gastos recurrentes"
        subtitle="Servicios fijos que se generan solos cada mes, sin que hagas nada."
        action={
          <IconButton
            size="small"
            onClick={() => setCreateOpen(true)}
            sx={{ bgcolor: "primary.main", color: "#fff", "&:hover": { bgcolor: "primary.dark" } }}
          >
            <AddOutlinedIcon fontSize="small" />
          </IconButton>
        }
      />

      {error ? <Alert severity="error">{error}</Alert> : null}
      {message ? <Alert severity="success">{message}</Alert> : null}

      <Card>
        <CardContent>
          <Typography variant="subtitle1" sx={{ mb: 1.3 }}>
            Lista actual
          </Typography>
          {loading ? (
            <ListSkeleton rows={3} height={72} />
          ) : (
          <Stack spacing={1}>
            {rows.length ? (
              rows.map((recurring) => {
                const chip = statusChip(recurring.thisMonthStatus);
                return (
                  <Stack
                    key={recurring.id}
                    direction="row"
                    sx={{
                      p: 1.2,
                      borderRadius: "16px",
                      bgcolor: "rgba(226, 232, 240, 0.3)",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: 1,
                      opacity: recurring.isActive ? 1 : 0.6,
                    }}
                  >
                    <Stack spacing={0.2} sx={{ minWidth: 0 }}>
                      <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                        <Typography variant="body2" sx={{ fontWeight: 700 }} noWrap>
                          {recurring.name}
                        </Typography>
                        {recurring.isActive ? (
                          <Chip label={chip.label} size="small" color={chip.color} />
                        ) : (
                          <Chip label="Inactivo" size="small" variant="outlined" />
                        )}
                      </Stack>
                      <Typography variant="caption" color="text.secondary">
                        {recurring.expectedAmount ? formatCurrency(recurring.expectedAmount, recurring.currency) : "Monto variable"}
                        {" · dia "}
                        {recurring.dayOfMonth}
                        {recurring.accountName ? ` · ${recurring.accountName}` : ""}
                      </Typography>
                    </Stack>
                    {recurring.isActive ? (
                      <IconButton size="small" color="error" onClick={() => setDeactivating(recurring)}>
                        <DeleteOutlineOutlinedIcon fontSize="small" />
                      </IconButton>
                    ) : null}
                  </Stack>
                );
              })
            ) : (
              <Typography variant="body2" color="text.secondary">
                Todavia no cargaste gastos recurrentes.
              </Typography>
            )}
          </Stack>
          )}
        </CardContent>
      </Card>

      <Drawer
        anchor="bottom"
        open={createOpen}
        onClose={() => {
          if (busy) return;
          setCreateOpen(false);
        }}
        slotProps={{
          paper: {
            sx: {
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              p: 2,
              pb: "calc(16px + env(safe-area-inset-bottom))",
              maxHeight: "85vh",
              overflowY: "auto",
            },
          },
        }}
      >
        <Stack component="form" onSubmit={handleCreate} spacing={1.3}>
          <Typography variant="h6">Nuevo gasto recurrente</Typography>
          {createOpen && error ? <Alert severity="error">{error}</Alert> : null}
          <TextField
            label="Nombre"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
          />
          <TextField
            label="Monto esperado (opcional)"
            type="number"
            value={expectedAmount}
            onChange={(event) => setExpectedAmount(event.target.value)}
            slotProps={{ htmlInput: { min: 0.01, step: 0.01 } }}
          />
          <TextField
            label="Dia del mes"
            type="number"
            value={dayOfMonth}
            onChange={(event) => setDayOfMonth(event.target.value)}
            required
            slotProps={{ htmlInput: { min: 1, max: 31, step: 1 } }}
          />
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
          <TextField
            label="Contraparte (para detectar el pago automaticamente)"
            value={counterpartyName}
            onChange={(event) => setCounterpartyName(event.target.value)}
            helperText="El nombre exacto al que le transferis, para que la IA lo reconozca en un comprobante"
          />
          <Button variant="contained" type="submit" loading={busy}>
            {busy ? "Creando..." : "Crear gasto recurrente"}
          </Button>
        </Stack>
      </Drawer>

      <Dialog open={Boolean(deactivating)} onClose={() => (busy ? null : setDeactivating(null))}>
        <DialogTitle>Desactivar gasto recurrente</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            Dejara de generarse automaticamente cada mes, pero se conserva su historial.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeactivating(null)} disabled={busy}>
            Cancelar
          </Button>
          <Button color="error" variant="contained" onClick={() => void confirmDeactivate()} loading={busy}>
            {busy ? "Desactivando..." : "Desactivar"}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
