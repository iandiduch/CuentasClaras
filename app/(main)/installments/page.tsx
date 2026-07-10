"use client";

import AddOutlinedIcon from "@mui/icons-material/AddOutlined";
import DeleteOutlineOutlinedIcon from "@mui/icons-material/DeleteOutlineOutlined";
import {
  Alert,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Drawer,
  IconButton,
  LinearProgress,
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
import { AccountDto, CategoryDto, InstallmentPlanDto } from "@/lib/shared/types";

type PlansResponse = {
  plans: InstallmentPlanDto[];
};

type CategoriesResponse = {
  categories: CategoryDto[];
};

type AccountsResponse = {
  accounts: AccountDto[];
};

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

export default function InstallmentsPage() {
  const [rows, setRows] = useState<InstallmentPlanDto[]>([]);
  const [categories, setCategories] = useState<CategoryDto[]>([]);
  const [accounts, setAccounts] = useState<AccountDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [concept, setConcept] = useState("");
  const [totalAmount, setTotalAmount] = useState("");
  const [installmentsCount, setInstallmentsCount] = useState("12");
  const [startDate, setStartDate] = useState(todayIsoDate());
  const [categoryId, setCategoryId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [counterpartyName, setCounterpartyName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cancelling, setCancelling] = useState<InstallmentPlanDto | null>(null);

  const usableCategories = useMemo(
    () => categories.filter((category) => category.direction === "both" || category.direction === "expense"),
    [categories]
  );

  const previewPerInstallment = useMemo(() => {
    const total = Number(totalAmount);
    const count = Number(installmentsCount);
    if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(count) || count < 1) {
      return null;
    }
    return total / count;
  }, [totalAmount, installmentsCount]);

  const refresh = async () => {
    const [plansResponse, categoriesResponse, accountsResponse] = await Promise.all([
      apiFetch<PlansResponse>("/api/v1/installments"),
      apiFetch<CategoriesResponse>("/api/v1/categories"),
      apiFetch<AccountsResponse>("/api/v1/accounts"),
    ]);
    setRows(plansResponse.plans);
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
        setError(requestError instanceof Error ? requestError.message : "No se pudieron cargar las cuotas");
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

    const numericTotal = Number(totalAmount);
    const numericCount = Number(installmentsCount);
    if (!Number.isFinite(numericTotal) || numericTotal <= 0) {
      setError("Monto total invalido");
      return;
    }
    if (!Number.isFinite(numericCount) || numericCount < 1 || numericCount > 60) {
      setError("La cantidad de cuotas debe ser entre 1 y 60");
      return;
    }

    try {
      setBusy(true);
      await apiFetch("/api/v1/installments", {
        method: "POST",
        body: JSON.stringify({
          concept,
          totalAmount: numericTotal,
          installmentsCount: numericCount,
          startDate,
          categoryId: categoryId || null,
          accountId: accountId || null,
          counterpartyName: counterpartyName || null,
        }),
      });

      setConcept("");
      setTotalAmount("");
      setInstallmentsCount("12");
      setStartDate(todayIsoDate());
      setCategoryId("");
      setAccountId("");
      setCounterpartyName("");
      setMessage("Compra en cuotas creada.");
      setCreateOpen(false);
      await refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "No se pudo crear la compra en cuotas");
    } finally {
      setBusy(false);
    }
  };

  const confirmCancel = async () => {
    if (!cancelling) return;
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      await apiFetch(`/api/v1/installments/${cancelling.id}`, {
        method: "PATCH",
        body: JSON.stringify({ action: "cancel" }),
      });
      setCancelling(null);
      setMessage("Plan cancelado. Las cuotas ya pagadas quedan intactas.");
      await refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "No se pudo cancelar el plan");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Stack spacing={2}>
      <PageHero
        title="Cuotas"
        subtitle="Carga una compra en cuotas y cada pago mensual se genera solo."
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
            Planes activos
          </Typography>
          {loading ? (
            <ListSkeleton rows={3} height={92} />
          ) : (
          <Stack spacing={1.4}>
            {rows.length ? (
              rows.map((plan) => (
                <Stack
                  key={plan.id}
                  spacing={0.6}
                  sx={{
                    p: 1.2,
                    borderRadius: "16px",
                    bgcolor: "rgba(226, 232, 240, 0.3)",
                    opacity: plan.status === "cancelled" ? 0.6 : 1,
                  }}
                >
                  <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "flex-start" }}>
                    <Stack spacing={0.2} sx={{ minWidth: 0 }}>
                      <Typography variant="body2" sx={{ fontWeight: 700 }} noWrap>
                        {plan.concept}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {formatCurrency(plan.installmentAmount, plan.currency)} x {plan.installmentsCount}
                        {plan.accountName ? ` · ${plan.accountName}` : ""}
                      </Typography>
                    </Stack>
                    {plan.status === "active" ? (
                      <IconButton size="small" color="error" onClick={() => setCancelling(plan)}>
                        <DeleteOutlineOutlinedIcon fontSize="small" />
                      </IconButton>
                    ) : (
                      <Typography variant="caption" color="text.secondary">
                        Cancelado
                      </Typography>
                    )}
                  </Stack>
                  <LinearProgress
                    variant="determinate"
                    value={Math.min((plan.paidCount / plan.installmentsCount) * 100, 100)}
                    sx={{ borderRadius: 999, height: 6 }}
                  />
                  <Typography variant="caption" color="text.secondary">
                    {plan.paidCount}/{plan.installmentsCount} pagadas
                    {plan.nextDueDate
                      ? ` · proxima el ${new Date(plan.nextDueDate).toLocaleDateString("es-AR")}`
                      : ""}
                  </Typography>
                </Stack>
              ))
            ) : (
              <Typography variant="body2" color="text.secondary">
                Todavia no cargaste compras en cuotas.
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
          <Typography variant="h6">Nueva compra en cuotas</Typography>
          <TextField
            label="Concepto"
            value={concept}
            onChange={(event) => setConcept(event.target.value)}
            required
          />
          <TextField
            label="Monto total"
            type="number"
            value={totalAmount}
            onChange={(event) => setTotalAmount(event.target.value)}
            required
            slotProps={{ htmlInput: { min: 0.01, step: 0.01 } }}
          />
          <TextField
            label="Cantidad de cuotas"
            type="number"
            value={installmentsCount}
            onChange={(event) => setInstallmentsCount(event.target.value)}
            required
            slotProps={{ htmlInput: { min: 1, max: 60, step: 1 } }}
          />
          {previewPerInstallment !== null ? (
            <Alert severity="info">
              {installmentsCount} cuotas de {formatCurrency(previewPerInstallment)}
            </Alert>
          ) : null}
          <TextField
            label="Fecha de la primera cuota"
            type="date"
            value={startDate}
            onChange={(event) => setStartDate(event.target.value)}
            slotProps={{ inputLabel: { shrink: true } }}
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
            label="Comercio o persona"
            value={counterpartyName}
            onChange={(event) => setCounterpartyName(event.target.value)}
          />
          <Button variant="contained" type="submit" disabled={busy}>
            Crear plan de cuotas
          </Button>
        </Stack>
      </Drawer>

      <Dialog open={Boolean(cancelling)} onClose={() => (busy ? null : setCancelling(null))}>
        <DialogTitle>Cancelar plan de cuotas</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            Se eliminaran las cuotas futuras no pagadas de &ldquo;{cancelling?.concept}&rdquo;. Las
            cuotas ya ocurridas quedan intactas en tu historial.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCancelling(null)} disabled={busy}>
            Volver
          </Button>
          <Button color="error" variant="contained" onClick={() => void confirmCancel()} disabled={busy}>
            Cancelar plan
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
