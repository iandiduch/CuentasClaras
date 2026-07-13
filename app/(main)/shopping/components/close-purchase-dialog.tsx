"use client";

import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  MenuItem,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import { useEffect, useMemo, useState } from "react";

import { apiFetch, formatCurrency, toDateTimeLocal } from "@/lib/client/http";
import type { AccountDto, CategoryDto } from "@/lib/shared/types";

import { parsePriceInput } from "../types";

type CloseResult = {
  list: { id: string };
  transactionId: string | null;
};

type ClosePurchaseDialogProps = {
  open: boolean;
  listId: string;
  listName: string;
  defaultStoreName: string;
  defaultTotal: number | null;
  itemsSum: number;
  defaultPurchasedAt?: string | null;
  ticketDocumentId?: string | null;
  onClose: () => void;
  onClosed: (result: CloseResult) => void;
};

export function ClosePurchaseDialog({
  open,
  listId,
  listName,
  defaultStoreName,
  defaultTotal,
  itemsSum,
  defaultPurchasedAt,
  ticketDocumentId,
  onClose,
  onClosed,
}: ClosePurchaseDialogProps) {
  const [storeName, setStoreName] = useState("");
  const [purchasedAt, setPurchasedAt] = useState("");
  const [totalInput, setTotalInput] = useState("");
  const [registerTransaction, setRegisterTransaction] = useState(true);
  const [categories, setCategories] = useState<CategoryDto[]>([]);
  const [accounts, setAccounts] = useState<AccountDto[]>([]);
  const [categoryId, setCategoryId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);

  // Reset the form only on the false->true transition, mirroring the
  // dialog's previous open-triggered useEffect without setState-in-effect.
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setStoreName(defaultStoreName);
      setPurchasedAt(
        toDateTimeLocal(defaultPurchasedAt ? new Date(defaultPurchasedAt) : new Date())
      );
      const initialTotal = defaultTotal ?? (itemsSum > 0 ? itemsSum : null);
      setTotalInput(initialTotal != null ? initialTotal.toFixed(2).replace(".", ",") : "");
      setError(null);
    }
  }

  useEffect(() => {
    if (!open) return;

    let active = true;
    const loadOptions = async () => {
      try {
        const [categoriesResponse, accountsResponse] = await Promise.all([
          apiFetch<{ categories: CategoryDto[] }>("/api/v1/categories"),
          apiFetch<{ accounts: AccountDto[] }>("/api/v1/accounts"),
        ]);
        if (!active) return;
        const usable = categoriesResponse.categories.filter(
          (category) => category.direction === "expense" || category.direction === "both"
        );
        setCategories(usable);
        setAccounts(accountsResponse.accounts.filter((account) => account.isActive));
        setCategoryId((previous) => previous || (usable[0]?.id ?? ""));
      } catch {
        if (!active) return;
        setError("No se pudieron cargar categorías y cuentas");
      }
    };
    void loadOptions();
    return () => {
      active = false;
    };
  }, [open]);

  const parsedTotal = useMemo(() => parsePriceInput(totalInput), [totalInput]);

  const totalMismatch =
    parsedTotal != null &&
    itemsSum > 0 &&
    Math.abs(parsedTotal - itemsSum) / itemsSum > 0.01;

  const handleConfirm = async () => {
    setError(null);
    if (!storeName.trim()) {
      setError("Indicá el súper");
      return;
    }
    if (parsedTotal == null || parsedTotal <= 0) {
      setError("Indicá el total pagado");
      return;
    }
    if (registerTransaction && !categoryId) {
      setError("Elegí una categoría para registrar el gasto");
      return;
    }

    setBusy(true);
    try {
      const result = await apiFetch<CloseResult>(`/api/v1/shopping/lists/${listId}/close`, {
        method: "POST",
        body: JSON.stringify({
          storeName: storeName.trim(),
          purchasedAt: purchasedAt ? new Date(purchasedAt).toISOString() : undefined,
          total: parsedTotal,
          registerTransaction,
          categoryId: registerTransaction ? categoryId : undefined,
          accountId: registerTransaction && accountId ? accountId : undefined,
          ticketDocumentId: ticketDocumentId ?? undefined,
        }),
      });
      onClosed(result);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "No se pudo cerrar la compra"
      );
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={() => (busy ? null : onClose())} fullWidth maxWidth="xs">
      <DialogTitle>Cerrar compra</DialogTitle>
      <DialogContent>
        <Stack spacing={1.4} sx={{ mt: 0.5 }}>
          <Typography variant="body2" color="text.secondary">
            {listName}
          </Typography>
          {error ? <Alert severity="error">{error}</Alert> : null}
          <TextField
            label="Súper"
            value={storeName}
            onChange={(event) => setStoreName(event.target.value)}
            required
          />
          <TextField
            label="Fecha de compra"
            type="datetime-local"
            value={purchasedAt}
            onChange={(event) => setPurchasedAt(event.target.value)}
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <TextField
            label="Total pagado"
            value={totalInput}
            onChange={(event) => setTotalInput(event.target.value)}
            required
            slotProps={{ htmlInput: { inputMode: "decimal" } }}
            helperText={
              itemsSum > 0 ? `Suma de ítems: ${formatCurrency(itemsSum)}` : undefined
            }
          />
          {totalMismatch ? (
            <Alert severity="warning">
              El total difiere de la suma de ítems ({formatCurrency(itemsSum)}). Podés
              cerrarlo igual.
            </Alert>
          ) : null}
          <FormControlLabel
            control={
              <Switch
                checked={registerTransaction}
                onChange={(event) => setRegisterTransaction(event.target.checked)}
              />
            }
            label="Registrar como gasto"
          />
          {registerTransaction ? (
            <>
              <TextField
                label="Categoría"
                select
                value={categoryId}
                onChange={(event) => setCategoryId(event.target.value)}
                required
              >
                {categories.map((category) => (
                  <MenuItem key={category.id} value={category.id}>
                    {category.name}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                label="Cuenta (opcional)"
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
            </>
          ) : (
            <Typography variant="caption" color="text.secondary">
              La compra se guarda solo en el historial de la herramienta. Podés cargar el
              gasto a mano después.
            </Typography>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          Cancelar
        </Button>
        <Button variant="contained" onClick={() => void handleConfirm()} loading={busy}>
          {busy ? "Cerrando..." : "Cerrar compra"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
