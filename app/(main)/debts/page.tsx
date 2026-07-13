"use client";

import AddOutlinedIcon from "@mui/icons-material/AddOutlined";
import DeleteOutlineOutlinedIcon from "@mui/icons-material/DeleteOutlineOutlined";
import PaidOutlinedIcon from "@mui/icons-material/PaidOutlined";
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
  FormControlLabel,
  IconButton,
  MenuItem,
  Stack,
  Switch,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import { FormEvent, useEffect, useMemo, useState } from "react";

import { ListSkeleton } from "@/app/components/list-skeleton";
import { PageHero } from "@/app/components/page-hero";
import { apiFetch, formatCurrency } from "@/lib/client/http";
import { AccountDto, DebtDto } from "@/lib/shared/types";

type DebtsResponse = {
  debts: DebtDto[];
};

type AccountsResponse = {
  accounts: AccountDto[];
};

type SettleForm = {
  debt: DebtDto;
  accountId: string;
  countAsIncomeExpense: boolean;
  notes: string;
};

type StatusFilter = "open" | "settled" | "all";

export default function DebtsPage() {
  const [rows, setRows] = useState<DebtDto[]>([]);
  const [accounts, setAccounts] = useState<AccountDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("open");
  const [direction, setDirection] = useState<"receivable" | "payable">("receivable");
  const [counterpartyName, setCounterpartyName] = useState("");
  const [amount, setAmount] = useState("");
  const [concept, setConcept] = useState("");
  const [reminderDate, setReminderDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [settling, setSettling] = useState<SettleForm | null>(null);
  const [deleting, setDeleting] = useState<DebtDto | null>(null);

  const refresh = async (status: StatusFilter) => {
    const [debtsResponse, accountsResponse] = await Promise.all([
      apiFetch<DebtsResponse>(`/api/v1/debts?status=${status}`),
      apiFetch<AccountsResponse>("/api/v1/accounts"),
    ]);
    setRows(debtsResponse.debts);
    setAccounts(accountsResponse.accounts.filter((account) => account.isActive));
  };

  useEffect(() => {
    let active = true;
    const boot = async () => {
      try {
        await refresh(statusFilter);
      } catch (requestError) {
        if (!active) return;
        setError(requestError instanceof Error ? requestError.message : "No se pudieron cargar las deudas");
      } finally {
        if (active) setLoading(false);
      }
    };
    void boot();
    return () => {
      active = false;
    };
  }, [statusFilter]);

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage(null);
    setError(null);

    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      setError("Monto invalido");
      return;
    }

    try {
      setBusy(true);
      await apiFetch("/api/v1/debts", {
        method: "POST",
        body: JSON.stringify({
          direction,
          counterpartyName,
          amount: numericAmount,
          concept: concept || null,
          reminderDate: reminderDate || null,
        }),
      });

      setCounterpartyName("");
      setAmount("");
      setConcept("");
      setReminderDate("");
      setMessage("Deuda registrada.");
      setCreateOpen(false);
      await refresh(statusFilter);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "No se pudo registrar la deuda");
    } finally {
      setBusy(false);
    }
  };

  const openSettle = (debt: DebtDto) => {
    setSettling({
      debt,
      accountId: accounts[0]?.id ?? "",
      countAsIncomeExpense: false,
      notes: "",
    });
  };

  const confirmSettle = async () => {
    if (!settling) return;
    if (!settling.accountId) {
      setError("Selecciona una cuenta");
      return;
    }
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      await apiFetch(`/api/v1/debts/${settling.debt.id}/settle`, {
        method: "POST",
        body: JSON.stringify({
          accountId: settling.accountId,
          countAsIncomeExpense: settling.countAsIncomeExpense,
          notes: settling.notes || null,
        }),
      });
      setSettling(null);
      setMessage("Deuda saldada.");
      await refresh(statusFilter);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "No se pudo saldar la deuda");
    } finally {
      setBusy(false);
    }
  };

  const removeDebt = async () => {
    if (!deleting) return;
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      await apiFetch(`/api/v1/debts/${deleting.id}`, { method: "DELETE" });
      setDeleting(null);
      setMessage("Deuda eliminada.");
      await refresh(statusFilter);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "No se pudo eliminar la deuda");
    } finally {
      setBusy(false);
    }
  };

  const totals = useMemo(() => {
    const receivable = rows
      .filter((row) => row.direction === "receivable" && row.status === "open")
      .reduce((sum, row) => sum + row.amount, 0);
    const payable = rows
      .filter((row) => row.direction === "payable" && row.status === "open")
      .reduce((sum, row) => sum + row.amount, 0);
    return { receivable, payable };
  }, [rows]);

  return (
    <Stack spacing={2}>
      <PageHero
        title="Deudas"
        subtitle="Anota quien te debe y a quien le debes, y saldalo cuando llegue el pago."
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

      {statusFilter === "open" ? (
        <Stack direction="row" spacing={1}>
          <Chip
            label={`Me deben: ${formatCurrency(totals.receivable)}`}
            sx={{ bgcolor: "rgba(22,163,74,0.12)", color: "success.main", fontWeight: 700 }}
          />
          <Chip
            label={`Debo: ${formatCurrency(totals.payable)}`}
            sx={{ bgcolor: "rgba(239,68,68,0.12)", color: "error.main", fontWeight: 700 }}
          />
        </Stack>
      ) : null}

      {error ? <Alert severity="error">{error}</Alert> : null}
      {message ? <Alert severity="success">{message}</Alert> : null}

      <Card>
        <CardContent>
          <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", mb: 1.3 }}>
            <Typography variant="subtitle1">Lista</Typography>
            <ToggleButtonGroup
              size="small"
              value={statusFilter}
              exclusive
              onChange={(_event, value: StatusFilter | null) => {
                if (!value) return;
                setStatusFilter(value);
              }}
            >
              <ToggleButton value="open">Abiertas</ToggleButton>
              <ToggleButton value="settled">Saldadas</ToggleButton>
              <ToggleButton value="all">Todas</ToggleButton>
            </ToggleButtonGroup>
          </Stack>
          {loading ? (
            <ListSkeleton rows={3} height={80} />
          ) : (
          <Stack spacing={1}>
            {rows.length ? (
              rows.map((debt) => (
                <Stack
                  key={debt.id}
                  direction="row"
                  sx={{
                    p: 1.2,
                    borderRadius: "16px",
                    bgcolor: "rgba(226, 232, 240, 0.3)",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 1,
                    opacity: debt.status === "open" ? 1 : 0.65,
                  }}
                >
                  <Stack spacing={0.2} sx={{ minWidth: 0 }}>
                    <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                      <Typography variant="body2" sx={{ fontWeight: 700 }} noWrap>
                        {debt.counterpartyName}
                      </Typography>
                      <Chip
                        label={debt.direction === "receivable" ? "Me debe" : "Le debo"}
                        size="small"
                      />
                    </Stack>
                    <Typography
                      variant="body2"
                      sx={{ color: debt.direction === "receivable" ? "success.main" : "error.main", fontWeight: 700 }}
                    >
                      {formatCurrency(debt.amount, debt.currency)}
                    </Typography>
                    {debt.concept ? (
                      <Typography variant="caption" color="text.secondary" noWrap>
                        {debt.concept}
                      </Typography>
                    ) : null}
                  </Stack>
                  {debt.status === "open" ? (
                    <Stack direction="row" spacing={0.2}>
                      <IconButton size="small" onClick={() => openSettle(debt)} title="Saldar">
                        <PaidOutlinedIcon fontSize="small" />
                      </IconButton>
                      <IconButton size="small" color="error" onClick={() => setDeleting(debt)}>
                        <DeleteOutlineOutlinedIcon fontSize="small" />
                      </IconButton>
                    </Stack>
                  ) : (
                    <Typography variant="caption" color="text.secondary">
                      {debt.settledAccountName ?? "Saldada"}
                    </Typography>
                  )}
                </Stack>
              ))
            ) : (
              <Typography variant="body2" color="text.secondary">
                No hay deudas para mostrar.
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
            },
          },
        }}
      >
        <Stack component="form" onSubmit={handleCreate} spacing={1.3}>
          <Typography variant="h6">Nueva deuda</Typography>
          {createOpen && error ? <Alert severity="error">{error}</Alert> : null}
          <ToggleButtonGroup
            color="primary"
            value={direction}
            exclusive
            onChange={(_event, value: "receivable" | "payable" | null) => {
              if (!value) return;
              setDirection(value);
            }}
          >
            <ToggleButton value="receivable">Me deben</ToggleButton>
            <ToggleButton value="payable">Debo</ToggleButton>
          </ToggleButtonGroup>
          <TextField
            label="Persona"
            value={counterpartyName}
            onChange={(event) => setCounterpartyName(event.target.value)}
            required
          />
          <TextField
            label="Monto"
            type="number"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            required
            slotProps={{ htmlInput: { min: 0.01, step: 0.01 } }}
          />
          <TextField
            label="Concepto"
            value={concept}
            onChange={(event) => setConcept(event.target.value)}
          />
          <TextField
            label="Recordarme el"
            type="date"
            value={reminderDate}
            onChange={(event) => setReminderDate(event.target.value)}
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <Button variant="contained" type="submit" loading={busy}>
            {busy ? "Registrando..." : "Registrar deuda"}
          </Button>
        </Stack>
      </Drawer>

      <Drawer
        anchor="bottom"
        open={Boolean(settling)}
        onClose={() => {
          if (busy) return;
          setSettling(null);
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
        {settling ? (
          <Stack spacing={1.2}>
            <Typography variant="h6">Saldar deuda de {settling.debt.counterpartyName}</Typography>
            {error ? <Alert severity="error">{error}</Alert> : null}
            <Typography variant="body2" color="text.secondary">
              Monto: {formatCurrency(settling.debt.amount, settling.debt.currency)}
            </Typography>
            <TextField
              label="Cuenta"
              select
              value={settling.accountId}
              onChange={(event) =>
                setSettling((previous) => (previous ? { ...previous, accountId: event.target.value } : previous))
              }
            >
              {accounts.map((account) => (
                <MenuItem key={account.id} value={account.id}>
                  {account.name}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              label="Notas"
              value={settling.notes}
              onChange={(event) =>
                setSettling((previous) => (previous ? { ...previous, notes: event.target.value } : previous))
              }
              multiline
              minRows={2}
            />
            <FormControlLabel
              control={
                <Switch
                  checked={settling.countAsIncomeExpense}
                  onChange={(event) =>
                    setSettling((previous) =>
                      previous ? { ...previous, countAsIncomeExpense: event.target.checked } : previous
                    )
                  }
                />
              }
              label="Contar como ingreso/egreso"
            />
            <Stack direction="row" spacing={1} sx={{ justifyContent: "flex-end" }}>
              <Button
                variant="outlined"
                onClick={() => {
                  if (busy) return;
                  setSettling(null);
                }}
              >
                Cancelar
              </Button>
              <Button variant="contained" onClick={() => void confirmSettle()} loading={busy}>
                {busy ? "Saldando..." : "Saldar"}
              </Button>
            </Stack>
          </Stack>
        ) : null}
      </Drawer>

      <Dialog open={Boolean(deleting)} onClose={() => (busy ? null : setDeleting(null))}>
        <DialogTitle>Eliminar deuda</DialogTitle>
        <DialogContent>
          <Typography variant="body2">Esta accion no se puede deshacer.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleting(null)} disabled={busy}>
            Cancelar
          </Button>
          <Button color="error" variant="contained" onClick={() => void removeDebt()} loading={busy}>
            {busy ? "Eliminando..." : "Eliminar"}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
