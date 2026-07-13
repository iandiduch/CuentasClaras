"use client";

import AddOutlinedIcon from "@mui/icons-material/AddOutlined";
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
  FormControlLabel,
  IconButton,
  LinearProgress,
  MenuItem,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import { FormEvent, useEffect, useMemo, useState } from "react";

import { CategoryIcon } from "@/app/components/category-icons";
import { CategoryIconPicker } from "@/app/components/category-icon-picker";
import { ListSkeleton } from "@/app/components/list-skeleton";
import { PageHero } from "@/app/components/page-hero";
import { apiFetch, formatCurrency } from "@/lib/client/http";
import { CATEGORY_DIRECTION_LABELS } from "@/lib/shared/labels";
import { CategoryBudgetDto, CategoryDirection, CategoryDto } from "@/lib/shared/types";

type CategoriesResponse = {
  categories: CategoryDto[];
};

type BudgetsResponse = {
  budgets: CategoryBudgetDto[];
};

type EditForm = {
  name: string;
  direction: CategoryDirection;
  colorHex: string;
  icon: string | null;
  includeInAnalysis: boolean;
  monthlyBudget: string;
};

function budgetColor(percent: number) {
  if (percent >= 100) return "error";
  if (percent >= 80) return "warning";
  return "success";
}

export default function CategoriesPage() {
  const [rows, setRows] = useState<CategoryDto[]>([]);
  const [budgets, setBudgets] = useState<CategoryBudgetDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [direction, setDirection] = useState<CategoryDirection>("expense");
  const [colorHex, setColorHex] = useState("#6D5DFB");
  const [icon, setIcon] = useState<string | null>(null);
  const [includeInAnalysis, setIncludeInAnalysis] = useState(true);
  const [monthlyBudget, setMonthlyBudget] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<CategoryDto | null>(null);
  const [editForm, setEditForm] = useState<EditForm | null>(null);
  const [deleting, setDeleting] = useState<CategoryDto | null>(null);

  const budgetByCategoryId = useMemo(
    () => new Map(budgets.map((budget) => [budget.categoryId, budget])),
    [budgets]
  );

  const refreshAll = async () => {
    const [categoriesResponse, budgetsResponse] = await Promise.all([
      apiFetch<CategoriesResponse>("/api/v1/categories"),
      apiFetch<BudgetsResponse>("/api/v1/categories/budgets"),
    ]);
    setRows(categoriesResponse.categories);
    setBudgets(budgetsResponse.budgets);
  };

  useEffect(() => {
    let active = true;

    const boot = async () => {
      try {
        await refreshAll();
        if (!active) return;
      } catch (requestError) {
        if (!active) return;
        setError(
          requestError instanceof Error
            ? requestError.message
            : "No se pudieron cargar categorias"
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

    try {
      setBusy(true);
      await apiFetch<{ category: CategoryDto }>("/api/v1/categories", {
        method: "POST",
        body: JSON.stringify({
          name,
          direction,
          colorHex,
          icon,
          includeInAnalysis,
          monthlyBudget: monthlyBudget ? Number(monthlyBudget) : null,
        }),
      });

      setName("");
      setDirection("expense");
      setColorHex("#6D5DFB");
      setIcon(null);
      setIncludeInAnalysis(true);
      setMonthlyBudget("");
      setMessage("Categoria creada.");
      setCreateOpen(false);
      await refreshAll();
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "No se pudo crear la categoria"
      );
    } finally {
      setBusy(false);
    }
  };

  const openEdit = (category: CategoryDto) => {
    setEditing(category);
    setEditForm({
      name: category.name,
      direction: category.direction,
      colorHex: category.colorHex ?? "#6D5DFB",
      icon: category.icon,
      includeInAnalysis: category.includeInAnalysis,
      monthlyBudget: category.monthlyBudget?.toString() ?? "",
    });
  };

  const saveEdit = async () => {
    if (!editing || !editForm) return;
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      await apiFetch(`/api/v1/categories/${editing.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: editForm.name,
          direction: editForm.direction,
          colorHex: editForm.colorHex,
          icon: editForm.icon,
          includeInAnalysis: editForm.includeInAnalysis,
          monthlyBudget: editForm.monthlyBudget ? Number(editForm.monthlyBudget) : null,
        }),
      });
      setEditing(null);
      setEditForm(null);
      setMessage("Categoria actualizada.");
      await refreshAll();
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "No se pudo actualizar categoria"
      );
    } finally {
      setBusy(false);
    }
  };

  const removeCategory = async () => {
    if (!deleting) return;
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      await apiFetch(`/api/v1/categories/${deleting.id}`, { method: "DELETE" });
      setDeleting(null);
      setMessage("Categoria eliminada.");
      await refreshAll();
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "No se pudo eliminar categoria"
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Stack spacing={2}>
      <PageHero
        title="Categorias"
        subtitle="Crea, edita y asigna icono y presupuesto a tus categorias."
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
            <ListSkeleton rows={4} height={80} />
          ) : (
          <Stack spacing={1}>
            {rows.length ? (
              rows.map((category) => {
                const budget = budgetByCategoryId.get(category.id);
                return (
                  <Stack
                    key={category.id}
                    sx={{
                      p: 1.2,
                      borderRadius: "16px",
                      bgcolor: "rgba(109, 93, 251, 0.05)",
                    }}
                    spacing={0.8}
                  >
                    <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", gap: 1 }}>
                      <Stack direction="row" spacing={1.2} sx={{ alignItems: "center", minWidth: 0 }}>
                        <Avatar
                          sx={{
                            bgcolor: category.colorHex ?? "#94a3b8",
                            width: 38,
                            height: 38,
                          }}
                        >
                          <CategoryIcon icon={category.icon} fontSize="small" />
                        </Avatar>
                        <Stack spacing={0.2} sx={{ minWidth: 0 }}>
                          <Typography variant="body2" sx={{ fontWeight: 700 }}>
                            {category.name}
                          </Typography>
                          <Stack direction="row" spacing={0.6} useFlexGap sx={{ flexWrap: "wrap" }}>
                            <Chip label={CATEGORY_DIRECTION_LABELS[category.direction]} size="small" />
                            {!category.includeInAnalysis ? (
                              <Chip label="Fuera de analisis" size="small" variant="outlined" />
                            ) : null}
                          </Stack>
                        </Stack>
                      </Stack>
                      <Stack direction="row" spacing={0.2}>
                        <IconButton size="small" onClick={() => openEdit(category)}>
                          <EditOutlinedIcon fontSize="small" />
                        </IconButton>
                        <IconButton size="small" color="error" onClick={() => setDeleting(category)}>
                          <DeleteOutlineOutlinedIcon fontSize="small" />
                        </IconButton>
                      </Stack>
                    </Stack>
                    {budget ? (
                      <Stack spacing={0.4}>
                        <Stack direction="row" sx={{ justifyContent: "space-between" }}>
                          <Typography variant="caption" color="text.secondary">
                            {formatCurrency(budget.spent)} de {formatCurrency(budget.monthlyBudget)}
                          </Typography>
                          <Typography variant="caption" color={`${budgetColor(budget.percent)}.main`} sx={{ fontWeight: 700 }}>
                            {budget.percent}%
                          </Typography>
                        </Stack>
                        <LinearProgress
                          variant="determinate"
                          value={Math.min(budget.percent, 100)}
                          color={budgetColor(budget.percent)}
                          sx={{ borderRadius: 999, height: 6 }}
                        />
                        <Typography
                          variant="caption"
                          color={
                            budget.deltaVsLastMonth > 0
                              ? "error.main"
                              : budget.deltaVsLastMonth < 0
                                ? "success.main"
                                : "text.secondary"
                          }
                        >
                          {formatCurrency(budget.spentSameDayLastMonth)} al mismo dia del mes pasado
                          {budget.deltaPercent !== null
                            ? ` (${budget.deltaVsLastMonth > 0 ? "+" : ""}${budget.deltaPercent}%)`
                            : ""}
                        </Typography>
                      </Stack>
                    ) : null}
                  </Stack>
                );
              })
            ) : (
              <Typography variant="body2" color="text.secondary">
                Aun no creaste categorias.
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
          <Typography variant="h6">Nueva categoria</Typography>
          {createOpen && error ? <Alert severity="error">{error}</Alert> : null}
          <TextField
            label="Nombre"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
          />
          <TextField
            label="Direccion"
            value={direction}
            onChange={(event) => setDirection(event.target.value as CategoryDirection)}
            select
          >
            <MenuItem value="expense">Gasto</MenuItem>
            <MenuItem value="income">Ingreso</MenuItem>
            <MenuItem value="both">Ambos</MenuItem>
          </TextField>
          <TextField
            label="Color"
            type="color"
            value={colorHex}
            onChange={(event) => setColorHex(event.target.value)}
          />
          <CategoryIconPicker value={icon} onChange={setIcon} color={colorHex} />
          {direction !== "income" ? (
            <TextField
              label="Presupuesto mensual (opcional)"
              type="number"
              value={monthlyBudget}
              onChange={(event) => setMonthlyBudget(event.target.value)}
              slotProps={{ htmlInput: { min: 0, step: 0.01 } }}
            />
          ) : null}
          <FormControlLabel
            control={
              <Switch
                checked={includeInAnalysis}
                onChange={(event) => setIncludeInAnalysis(event.target.checked)}
              />
            }
            label="Incluir en analisis"
          />
          <Button variant="contained" type="submit" loading={busy}>
            {busy ? "Creando..." : "Crear categoria"}
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
              maxHeight: "85vh",
              overflowY: "auto",
            },
          },
        }}
      >
        {editForm ? (
          <Stack spacing={1.2}>
            <Typography variant="h6">Editar categoria</Typography>
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
              label="Direccion"
              select
              value={editForm.direction}
              onChange={(event) =>
                setEditForm((previous) =>
                  previous
                    ? {
                        ...previous,
                        direction: event.target.value as CategoryDirection,
                      }
                    : previous
                )
              }
            >
              <MenuItem value="expense">Gasto</MenuItem>
              <MenuItem value="income">Ingreso</MenuItem>
              <MenuItem value="both">Ambos</MenuItem>
            </TextField>
            <TextField
              label="Color"
              type="color"
              value={editForm.colorHex}
              onChange={(event) =>
                setEditForm((previous) =>
                  previous ? { ...previous, colorHex: event.target.value } : previous
                )
              }
            />
            <CategoryIconPicker
              value={editForm.icon}
              color={editForm.colorHex}
              onChange={(nextIcon) =>
                setEditForm((previous) => (previous ? { ...previous, icon: nextIcon } : previous))
              }
            />
            {editForm.direction !== "income" ? (
              <TextField
                label="Presupuesto mensual (opcional)"
                type="number"
                value={editForm.monthlyBudget}
                onChange={(event) =>
                  setEditForm((previous) =>
                    previous ? { ...previous, monthlyBudget: event.target.value } : previous
                  )
                }
                slotProps={{ htmlInput: { min: 0, step: 0.01 } }}
              />
            ) : null}
            <FormControlLabel
              control={
                <Switch
                  checked={editForm.includeInAnalysis}
                  onChange={(event) =>
                    setEditForm((previous) =>
                      previous ? { ...previous, includeInAnalysis: event.target.checked } : previous
                    )
                  }
                />
              }
              label="Incluir en analisis"
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

      <Dialog open={Boolean(deleting)} onClose={() => (busy ? null : setDeleting(null))}>
        <DialogTitle>Eliminar categoria</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            Los movimientos que usaban esta categoria quedaran sin categoria. Podras reclasificarlos despues.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleting(null)} disabled={busy}>
            Cancelar
          </Button>
          <Button color="error" variant="contained" onClick={() => void removeCategory()} loading={busy}>
            {busy ? "Eliminando..." : "Eliminar"}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
