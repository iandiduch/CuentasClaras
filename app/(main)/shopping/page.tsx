"use client";

import AddOutlinedIcon from "@mui/icons-material/AddOutlined";
import HistoryOutlinedIcon from "@mui/icons-material/HistoryOutlined";
import Inventory2OutlinedIcon from "@mui/icons-material/Inventory2Outlined";
import ShoppingCartOutlinedIcon from "@mui/icons-material/ShoppingCartOutlined";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

import { ListSkeleton } from "@/app/components/list-skeleton";
import { PageHero } from "@/app/components/page-hero";
import { apiFetch, formatCurrency } from "@/lib/client/http";

import type { ShoppingListSummary } from "./types";

type ListsResponse = {
  lists: ShoppingListSummary[];
};

export default function ShoppingPage() {
  const router = useRouter();
  const [lists, setLists] = useState<ShoppingListSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    const boot = async () => {
      try {
        const response = await apiFetch<ListsResponse>("/api/v1/shopping/lists?status=active");
        if (!active) return;
        setLists(response.lists);
      } catch (requestError) {
        if (!active) return;
        setError(
          requestError instanceof Error
            ? requestError.message
            : "No se pudieron cargar las listas"
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
    if (!newName.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const response = await apiFetch<{ list: { id: string } }>("/api/v1/shopping/lists", {
        method: "POST",
        body: JSON.stringify({ name: newName.trim() }),
      });
      router.push(`/shopping/lists/${response.list.id}`);
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "No se pudo crear la lista"
      );
      setBusy(false);
    }
  };

  return (
    <Stack spacing={2}>
      <PageHero
        title="Lista de súper"
        subtitle="Armá tu lista con precios online, tachá en el súper y guardá lo que pagaste."
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

      <Stack direction="row" spacing={1}>
        <Button
          size="small"
          variant="outlined"
          startIcon={<HistoryOutlinedIcon fontSize="small" />}
          onClick={() => router.push("/shopping/history")}
          sx={{ borderRadius: "14px", textTransform: "none" }}
        >
          Historial
        </Button>
        <Button
          size="small"
          variant="outlined"
          startIcon={<Inventory2OutlinedIcon fontSize="small" />}
          onClick={() => router.push("/shopping/products")}
          sx={{ borderRadius: "14px", textTransform: "none" }}
        >
          Mis productos
        </Button>
      </Stack>

      {error ? <Alert severity="error">{error}</Alert> : null}

      {loading ? (
        <ListSkeleton rows={3} height={92} />
      ) : lists.length ? (
        <Stack spacing={1.2}>
          {lists.map((list) => (
            <Card
              key={list.id}
              onClick={() => router.push(`/shopping/lists/${list.id}`)}
              sx={{ cursor: "pointer", "&:hover": { boxShadow: 4 } }}
            >
              <CardContent sx={{ "&:last-child": { pb: 2 } }}>
                <Stack
                  direction="row"
                  sx={{ justifyContent: "space-between", alignItems: "center", gap: 1 }}
                >
                  <Stack spacing={0.4} sx={{ minWidth: 0 }}>
                    <Typography variant="subtitle1" noWrap>
                      {list.name}
                    </Typography>
                    <Stack direction="row" spacing={0.8} sx={{ alignItems: "center" }}>
                      <Chip
                        size="small"
                        label={`${list.checkedCount}/${list.itemCount} ítems`}
                      />
                      {list.storeId ? (
                        <Chip
                          size="small"
                          color="primary"
                          icon={<ShoppingCartOutlinedIcon />}
                          label="En el súper"
                        />
                      ) : null}
                    </Stack>
                  </Stack>
                  <Stack spacing={0.2} sx={{ alignItems: "flex-end", flexShrink: 0 }}>
                    {list.estimatedTotal != null ? (
                      <>
                        <Typography variant="body2" sx={{ fontWeight: 700 }}>
                          {formatCurrency(list.estimatedTotal)}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          estimado
                        </Typography>
                      </>
                    ) : null}
                  </Stack>
                </Stack>
              </CardContent>
            </Card>
          ))}
        </Stack>
      ) : (
        <Card>
          <CardContent>
            <Stack spacing={1} sx={{ alignItems: "center", py: 2 }}>
              <ShoppingCartOutlinedIcon color="disabled" sx={{ fontSize: 40 }} />
              <Typography variant="body2" color="text.secondary" sx={{ textAlign: "center" }}>
                No tenés listas activas. Creá una y empezá a agregar productos.
              </Typography>
              <Button variant="contained" onClick={() => setCreateOpen(true)}>
                Nueva lista
              </Button>
            </Stack>
          </CardContent>
        </Card>
      )}

      <Dialog
        open={createOpen}
        onClose={() => (busy ? null : setCreateOpen(false))}
        fullWidth
        maxWidth="xs"
      >
        <Box component="form" onSubmit={handleCreate}>
          <DialogTitle>Nueva lista</DialogTitle>
          <DialogContent>
            <TextField
              autoFocus
              fullWidth
              label="Nombre"
              placeholder="Ej: Semanal, Asado sábado"
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              sx={{ mt: 1 }}
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setCreateOpen(false)} disabled={busy}>
              Cancelar
            </Button>
            <Button type="submit" variant="contained" loading={busy} disabled={!newName.trim()}>
              {busy ? "Creando..." : "Crear"}
            </Button>
          </DialogActions>
        </Box>
      </Dialog>
    </Stack>
  );
}
