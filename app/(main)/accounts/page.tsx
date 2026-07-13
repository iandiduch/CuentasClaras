"use client";

import AddOutlinedIcon from "@mui/icons-material/AddOutlined";
import DeleteOutlineOutlinedIcon from "@mui/icons-material/DeleteOutlineOutlined";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import SwapHorizOutlinedIcon from "@mui/icons-material/SwapHorizOutlined";
import TuneOutlinedIcon from "@mui/icons-material/TuneOutlined";
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
  Typography,
} from "@mui/material";
import { useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useEffect, useState } from "react";

import { ListSkeleton } from "@/app/components/list-skeleton";
import { PageHero } from "@/app/components/page-hero";
import { apiFetch, formatCurrency, toDateTimeLocal } from "@/lib/client/http";
import { AccountDto } from "@/lib/shared/types";

type AccountsResponse = {
  accounts: AccountDto[];
};

const ACCOUNT_TYPES: Array<{ value: string; label: string }> = [
  { value: "cash", label: "Efectivo" },
  { value: "bank", label: "Banco" },
  { value: "wallet", label: "Billetera virtual" },
  { value: "credit_card", label: "Tarjeta de credito" },
  { value: "debit_card", label: "Tarjeta de debito" },
  { value: "other", label: "Otra" },
];

type EditForm = {
  name: string;
  accountType: string;
  currency: string;
  openingBalance: string;
  isActive: boolean;
};

type AdjustForm = {
  account: AccountDto;
  newBalance: string;
  occurredAt: string;
  notes: string;
  countAsIncomeExpense: boolean;
};

type TransferForm = {
  fromAccountId: string;
  toAccountId: string;
  amount: string;
  notes: string;
};

export default function AccountsPage() {
  return (
    <Suspense fallback={null}>
      <AccountsPageContent />
    </Suspense>
  );
}

function AccountsPageContent() {
  const searchParams = useSearchParams();
  const [handledAction, setHandledAction] = useState<string | null>(null);
  const [actionHint, setActionHint] = useState<string | null>(null);
  const [rows, setRows] = useState<AccountDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [accountType, setAccountType] = useState("bank");
  const [currency, setCurrency] = useState("ARS");
  const [openingBalance, setOpeningBalance] = useState("0");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<AccountDto | null>(null);
  const [editForm, setEditForm] = useState<EditForm | null>(null);
  const [deleting, setDeleting] = useState<AccountDto | null>(null);
  const [adjusting, setAdjusting] = useState<AdjustForm | null>(null);
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferForm, setTransferForm] = useState<TransferForm>({
    fromAccountId: "",
    toAccountId: "",
    amount: "",
    notes: "",
  });

  const refreshAccounts = async () => {
    const response = await apiFetch<AccountsResponse>("/api/v1/accounts");
    setRows(response.accounts);
  };

  useEffect(() => {
    let active = true;

    const boot = async () => {
      try {
        const response = await apiFetch<AccountsResponse>("/api/v1/accounts");
        if (!active) return;
        setRows(response.accounts);
      } catch (requestError) {
        if (!active) return;
        setError(
          requestError instanceof Error ? requestError.message : "No se pudieron cargar cuentas"
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

    const numericOpeningBalance = Number(openingBalance);
    if (!Number.isFinite(numericOpeningBalance)) {
      setError("Saldo inicial invalido");
      return;
    }

    try {
      setBusy(true);
      await apiFetch<{ account: AccountDto }>("/api/v1/accounts", {
        method: "POST",
        body: JSON.stringify({
          name,
          accountType,
          currency,
          openingBalance: numericOpeningBalance,
        }),
      });

      setName("");
      setAccountType("bank");
      setCurrency("ARS");
      setOpeningBalance("0");
      setMessage("Cuenta creada.");
      setCreateOpen(false);
      await refreshAccounts();
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "No se pudo crear la cuenta"
      );
    } finally {
      setBusy(false);
    }
  };

  const openEdit = (account: AccountDto) => {
    setEditing(account);
    setEditForm({
      name: account.name,
      accountType: account.accountType,
      currency: account.currency,
      openingBalance: account.openingBalance.toString(),
      isActive: account.isActive,
    });
  };

  const saveEdit = async () => {
    if (!editing || !editForm) return;
    const numericOpeningBalance = Number(editForm.openingBalance);
    if (!Number.isFinite(numericOpeningBalance)) {
      setError("Saldo inicial invalido");
      return;
    }
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      await apiFetch(`/api/v1/accounts/${editing.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: editForm.name,
          accountType: editForm.accountType,
          currency: editForm.currency,
          openingBalance: numericOpeningBalance,
          isActive: editForm.isActive,
        }),
      });
      setEditing(null);
      setEditForm(null);
      setMessage("Cuenta actualizada.");
      await refreshAccounts();
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "No se pudo actualizar la cuenta"
      );
    } finally {
      setBusy(false);
    }
  };

  const removeAccount = async () => {
    if (!deleting) return;
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      await apiFetch(`/api/v1/accounts/${deleting.id}`, { method: "DELETE" });
      setDeleting(null);
      setMessage("Cuenta desactivada.");
      await refreshAccounts();
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "No se pudo desactivar la cuenta"
      );
    } finally {
      setBusy(false);
    }
  };

  const openAdjust = (account: AccountDto) => {
    setAdjusting({
      account,
      newBalance: account.currentBalance.toString(),
      occurredAt: toDateTimeLocal(new Date()),
      notes: "",
      countAsIncomeExpense: false,
    });
  };

  const saveAdjustment = async () => {
    if (!adjusting) return;
    const targetBalance = Number(adjusting.newBalance);
    if (!Number.isFinite(targetBalance)) {
      setError("Nuevo saldo invalido");
      return;
    }

    const delta = targetBalance - adjusting.account.currentBalance;
    if (delta === 0) {
      setAdjusting(null);
      return;
    }

    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      await apiFetch("/api/v1/transactions/adjustments", {
        method: "POST",
        body: JSON.stringify({
          accountId: adjusting.account.id,
          direction: delta > 0 ? "income" : "expense",
          amount: Math.abs(delta),
          occurredAt: new Date(adjusting.occurredAt).toISOString(),
          notes: adjusting.notes || null,
          countAsIncomeExpense: adjusting.countAsIncomeExpense,
        }),
      });
      setAdjusting(null);
      setMessage("Saldo reajustado.");
      await refreshAccounts();
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "No se pudo reajustar el saldo"
      );
    } finally {
      setBusy(false);
    }
  };

  const activeAccounts = rows.filter((account) => account.isActive);

  const openTransfer = () => {
    setTransferForm({
      fromAccountId: activeAccounts[0]?.id ?? "",
      toAccountId: activeAccounts[1]?.id ?? "",
      amount: "",
      notes: "",
    });
    setTransferOpen(true);
  };

  useEffect(() => {
    const action = searchParams.get("action");
    if (!action || !rows.length || action === handledAction) return;

    const timeoutId = window.setTimeout(() => {
      setHandledAction(action);
      if (action === "transfer") {
        if (activeAccounts.length >= 2) {
          openTransfer();
        } else {
          setActionHint("Necesitas al menos 2 cuentas activas para transferir.");
        }
      } else if (action === "adjust") {
        setActionHint("Toca el icono de ajuste en la cuenta que quieras corregir.");
      }
    }, 0);

    return () => window.clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, searchParams, handledAction]);

  const saveTransfer = async () => {
    const numericAmount = Number(transferForm.amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      setError("Monto invalido");
      return;
    }
    if (!transferForm.fromAccountId || !transferForm.toAccountId) {
      setError("Selecciona cuenta de origen y destino");
      return;
    }
    if (transferForm.fromAccountId === transferForm.toAccountId) {
      setError("Las cuentas de origen y destino deben ser distintas");
      return;
    }

    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      await apiFetch("/api/v1/transactions/transfer", {
        method: "POST",
        body: JSON.stringify({
          fromAccountId: transferForm.fromAccountId,
          toAccountId: transferForm.toAccountId,
          amount: numericAmount,
          notes: transferForm.notes || null,
        }),
      });
      setTransferOpen(false);
      setMessage("Transferencia registrada.");
      await refreshAccounts();
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "No se pudo registrar la transferencia"
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Stack spacing={2}>
      <PageHero
        title="Cuentas"
        subtitle="Administra tus cuentas, reajusta saldos y transferi entre ellas."
        action={
          <Stack direction="row" spacing={1}>
            <Button
              variant="outlined"
              size="small"
              startIcon={<SwapHorizOutlinedIcon fontSize="small" />}
              onClick={openTransfer}
              disabled={activeAccounts.length < 2}
            >
              Transferir
            </Button>
            <IconButton
              size="small"
              onClick={() => setCreateOpen(true)}
              sx={{ bgcolor: "primary.main", color: "#fff", "&:hover": { bgcolor: "primary.dark" } }}
            >
              <AddOutlinedIcon fontSize="small" />
            </IconButton>
          </Stack>
        }
      />

      {error ? <Alert severity="error">{error}</Alert> : null}
      {message ? <Alert severity="success">{message}</Alert> : null}
      {actionHint ? <Alert severity="info" onClose={() => setActionHint(null)}>{actionHint}</Alert> : null}

      <Card>
        <CardContent>
          <Typography variant="subtitle1" sx={{ mb: 1.3 }}>
            Lista actual
          </Typography>
          {loading ? (
            <ListSkeleton rows={3} />
          ) : (
          <Stack spacing={1}>
            {rows.length ? (
              rows.map((account) => (
                <Stack
                  key={account.id}
                  direction="row"
                  sx={{
                    p: 1,
                    borderRadius: "16px",
                    bgcolor: "rgba(226, 232, 240, 0.3)",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 1,
                    opacity: account.isActive ? 1 : 0.6,
                  }}
                >
                  <Stack spacing={0.3} sx={{ minWidth: 0 }}>
                    <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>
                        {account.name}
                      </Typography>
                      <Chip label={account.accountType} size="small" />
                      {!account.isActive ? (
                        <Chip label="Inactiva" size="small" color="default" variant="outlined" />
                      ) : null}
                    </Stack>
                    <Typography
                      variant="body2"
                      sx={{ color: account.currentBalance >= 0 ? "success.main" : "error.main", fontWeight: 700 }}
                    >
                      {formatCurrency(account.currentBalance, account.currency)}
                    </Typography>
                  </Stack>
                  <Stack direction="row" spacing={0.2}>
                    <IconButton size="small" onClick={() => openAdjust(account)} title="Ajustar saldo">
                      <TuneOutlinedIcon fontSize="small" />
                    </IconButton>
                    <IconButton size="small" onClick={() => openEdit(account)}>
                      <EditOutlinedIcon fontSize="small" />
                    </IconButton>
                    <IconButton size="small" color="error" onClick={() => setDeleting(account)}>
                      <DeleteOutlineOutlinedIcon fontSize="small" />
                    </IconButton>
                  </Stack>
                </Stack>
              ))
            ) : (
              <Typography variant="body2" color="text.secondary">
                Aun no creaste cuentas.
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
          <Typography variant="h6">Nueva cuenta</Typography>
          {createOpen && error ? <Alert severity="error">{error}</Alert> : null}
          <TextField
            label="Nombre"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
          />
          <TextField
            label="Tipo"
            value={accountType}
            onChange={(event) => setAccountType(event.target.value)}
            select
          >
            {ACCOUNT_TYPES.map((type) => (
              <MenuItem key={type.value} value={type.value}>
                {type.label}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            label="Moneda"
            value={currency}
            onChange={(event) => setCurrency(event.target.value.toUpperCase())}
            slotProps={{ htmlInput: { maxLength: 3 } }}
          />
          <TextField
            label="Saldo inicial"
            type="number"
            value={openingBalance}
            onChange={(event) => setOpeningBalance(event.target.value)}
            slotProps={{ htmlInput: { step: 0.01 } }}
          />
          <Button variant="contained" type="submit" loading={busy}>
            {busy ? "Creando..." : "Crear cuenta"}
          </Button>
        </Stack>
      </Drawer>

      <Drawer
        anchor="bottom"
        open={Boolean(editing && editForm)}
        onClose={() => {
          if (busy) return;
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
          <Stack spacing={1.2}>
            <Typography variant="h6">Editar cuenta</Typography>
            {error ? <Alert severity="error">{error}</Alert> : null}
            <TextField
              label="Nombre"
              value={editForm.name}
              onChange={(event) =>
                setEditForm((previous) =>
                  previous ? { ...previous, name: event.target.value } : previous
                )
              }
            />
            <TextField
              label="Tipo"
              select
              value={editForm.accountType}
              onChange={(event) =>
                setEditForm((previous) =>
                  previous ? { ...previous, accountType: event.target.value } : previous
                )
              }
            >
              {ACCOUNT_TYPES.map((type) => (
                <MenuItem key={type.value} value={type.value}>
                  {type.label}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              label="Moneda"
              value={editForm.currency}
              onChange={(event) =>
                setEditForm((previous) =>
                  previous ? { ...previous, currency: event.target.value.toUpperCase() } : previous
                )
              }
              slotProps={{ htmlInput: { maxLength: 3 } }}
            />
            <TextField
              label="Saldo inicial"
              type="number"
              value={editForm.openingBalance}
              onChange={(event) =>
                setEditForm((previous) =>
                  previous ? { ...previous, openingBalance: event.target.value } : previous
                )
              }
              slotProps={{ htmlInput: { step: 0.01 } }}
            />
            <FormControlLabel
              control={
                <Switch
                  checked={editForm.isActive}
                  onChange={(event) =>
                    setEditForm((previous) =>
                      previous ? { ...previous, isActive: event.target.checked } : previous
                    )
                  }
                />
              }
              label="Cuenta activa"
            />
            <Stack direction="row" spacing={1} sx={{ justifyContent: "flex-end" }}>
              <Button
                variant="outlined"
                onClick={() => {
                  if (busy) return;
                  setEditing(null);
                  setEditForm(null);
                }}
              >
                Cancelar
              </Button>
              <Button variant="contained" onClick={() => void saveEdit()} loading={busy}>
                {busy ? "Guardando..." : "Guardar cambios"}
              </Button>
            </Stack>
          </Stack>
        ) : null}
      </Drawer>

      <Drawer
        anchor="bottom"
        open={Boolean(adjusting)}
        onClose={() => {
          if (busy) return;
          setAdjusting(null);
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
        {adjusting ? (
          <Stack spacing={1.2}>
            <Typography variant="h6">Ajustar saldo de {adjusting.account.name}</Typography>
            {error ? <Alert severity="error">{error}</Alert> : null}
            <Typography variant="body2" color="text.secondary">
              Saldo actual: {formatCurrency(adjusting.account.currentBalance, adjusting.account.currency)}
            </Typography>
            <TextField
              label="Nuevo saldo"
              type="number"
              value={adjusting.newBalance}
              onChange={(event) =>
                setAdjusting((previous) =>
                  previous ? { ...previous, newBalance: event.target.value } : previous
                )
              }
              slotProps={{ htmlInput: { step: 0.01 } }}
            />
            <TextField
              label="Fecha y hora"
              type="datetime-local"
              value={adjusting.occurredAt}
              onChange={(event) =>
                setAdjusting((previous) =>
                  previous ? { ...previous, occurredAt: event.target.value } : previous
                )
              }
              slotProps={{ inputLabel: { shrink: true } }}
            />
            <TextField
              label="Notas"
              value={adjusting.notes}
              onChange={(event) =>
                setAdjusting((previous) =>
                  previous ? { ...previous, notes: event.target.value } : previous
                )
              }
              multiline
              minRows={2}
            />
            <FormControlLabel
              control={
                <Switch
                  checked={adjusting.countAsIncomeExpense}
                  onChange={(event) =>
                    setAdjusting((previous) =>
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
                  setAdjusting(null);
                }}
              >
                Cancelar
              </Button>
              <Button variant="contained" onClick={() => void saveAdjustment()} loading={busy}>
                {busy ? "Guardando..." : "Guardar ajuste"}
              </Button>
            </Stack>
          </Stack>
        ) : null}
      </Drawer>

      <Dialog open={transferOpen} onClose={() => (busy ? null : setTransferOpen(false))} fullWidth maxWidth="xs">
        <DialogTitle>Transferir entre cuentas</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5} sx={{ mt: 0.5 }}>
            {error ? <Alert severity="error">{error}</Alert> : null}
            <TextField
              label="Desde"
              select
              value={transferForm.fromAccountId}
              onChange={(event) =>
                setTransferForm((previous) => ({ ...previous, fromAccountId: event.target.value }))
              }
            >
              {activeAccounts.map((account) => (
                <MenuItem key={account.id} value={account.id}>
                  {account.name}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              label="Hacia"
              select
              value={transferForm.toAccountId}
              onChange={(event) =>
                setTransferForm((previous) => ({ ...previous, toAccountId: event.target.value }))
              }
            >
              {activeAccounts.map((account) => (
                <MenuItem key={account.id} value={account.id}>
                  {account.name}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              label="Monto"
              type="number"
              value={transferForm.amount}
              onChange={(event) =>
                setTransferForm((previous) => ({ ...previous, amount: event.target.value }))
              }
              slotProps={{ htmlInput: { min: 0.01, step: 0.01 } }}
            />
            <TextField
              label="Notas"
              value={transferForm.notes}
              onChange={(event) =>
                setTransferForm((previous) => ({ ...previous, notes: event.target.value }))
              }
              multiline
              minRows={2}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setTransferOpen(false)} disabled={busy}>
            Cancelar
          </Button>
          <Button variant="contained" onClick={() => void saveTransfer()} loading={busy}>
            {busy ? "Transfiriendo..." : "Transferir"}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(deleting)} onClose={() => (busy ? null : setDeleting(null))}>
        <DialogTitle>Desactivar cuenta</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            La cuenta dejara de aparecer como opcion para nuevos movimientos, pero se conserva su
            historial.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleting(null)} disabled={busy}>
            Cancelar
          </Button>
          <Button color="error" variant="contained" onClick={() => void removeAccount()} loading={busy}>
            {busy ? "Desactivando..." : "Desactivar"}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
