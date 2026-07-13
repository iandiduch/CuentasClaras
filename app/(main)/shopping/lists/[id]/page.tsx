"use client";

import AddOutlinedIcon from "@mui/icons-material/AddOutlined";
import ArrowBackOutlinedIcon from "@mui/icons-material/ArrowBackOutlined";
import ContentCopyOutlinedIcon from "@mui/icons-material/ContentCopyOutlined";
import DeleteOutlineOutlinedIcon from "@mui/icons-material/DeleteOutlineOutlined";
import MoreVertOutlinedIcon from "@mui/icons-material/MoreVertOutlined";
import ReceiptLongOutlinedIcon from "@mui/icons-material/ReceiptLongOutlined";
import RemoveOutlinedIcon from "@mui/icons-material/RemoveOutlined";
import ShoppingCartCheckoutOutlinedIcon from "@mui/icons-material/ShoppingCartCheckoutOutlined";
import StorefrontOutlinedIcon from "@mui/icons-material/StorefrontOutlined";
import {
  Alert,
  Avatar,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Drawer,
  IconButton,
  Menu,
  MenuItem,
  Paper,
  Snackbar,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ListSkeleton } from "@/app/components/list-skeleton";
import { apiFetch, formatCurrency } from "@/lib/client/http";

import { ClosePurchaseDialog } from "../../components/close-purchase-dialog";
import { TicketReviewDrawer } from "../../components/ticket-review-drawer";
import type {
  CatalogSearchProductDto,
  ShoppingListDetail,
  ShoppingListItemDto,
  ShoppingStoreDto,
} from "../../types";
import { parsePriceInput } from "../../types";

type ListResponse = {
  list: ShoppingListDetail;
  items: ShoppingListItemDto[];
};

type SearchResponse = {
  products: CatalogSearchProductDto[];
  total: number;
  catalogEnabled?: boolean;
};

export default function ShoppingListDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const listId = params.id;

  const [list, setList] = useState<ShoppingListDetail | null>(null);
  const [items, setItems] = useState<ShoppingListItemDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // search (build mode)
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<CatalogSearchProductDto[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // store picker
  const [storePickerOpen, setStorePickerOpen] = useState(false);
  const [stores, setStores] = useState<ShoppingStoreDto[]>([]);
  const [customStore, setCustomStore] = useState("");

  // price inputs while in-store (itemId -> raw input)
  const [priceInputs, setPriceInputs] = useState<Record<string, string>>({});

  // menu / dialogs
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [ticketOpen, setTicketOpen] = useState(false);
  const [ticketDefaults, setTicketDefaults] = useState<{
    documentId: string | null;
    storeName: string | null;
    total: number | null;
    purchasedAt: string | null;
  }>({ documentId: null, storeName: null, total: null, purchasedAt: null });

  const refresh = useCallback(async () => {
    const response = await apiFetch<ListResponse>(`/api/v1/shopping/lists/${listId}`);
    setList(response.list);
    setItems(response.items);
    setPriceInputs((previous) => {
      const next: Record<string, string> = {};
      for (const item of response.items) {
        next[item.id] =
          previous[item.id] ??
          (item.paidUnitPrice != null
            ? String(item.paidUnitPrice).replace(".", ",")
            : "");
      }
      return next;
    });
  }, [listId]);

  useEffect(() => {
    let active = true;
    const boot = async () => {
      try {
        await refresh();
      } catch (requestError) {
        if (!active) return;
        setError(
          requestError instanceof Error
            ? requestError.message
            : "No se pudo cargar la lista"
        );
      } finally {
        if (active) setLoading(false);
      }
    };
    void boot();
    return () => {
      active = false;
    };
  }, [refresh]);

  const mode: "build" | "instore" | "closed" = !list
    ? "build"
    : list.status === "closed"
      ? "closed"
      : list.storeId
        ? "instore"
        : "build";

  const estimatedTotal = useMemo(
    () =>
      items.reduce(
        (sum, item) => sum + (item.refPrice != null ? item.refPrice * item.quantity : 0),
        0
      ),
    [items]
  );

  const paidTotal = useMemo(
    () =>
      items.reduce(
        (sum, item) =>
          sum +
          (item.checked && item.paidUnitPrice != null
            ? item.paidUnitPrice * item.quantity
            : 0),
        0
      ),
    [items]
  );

  // --- search (debounced) ---
  useEffect(() => {
    if (searchTimer.current) {
      clearTimeout(searchTimer.current);
    }
    const query = search.trim();
    if (query.length < 3) {
      // Results stay hidden by the JSX guard below until 3+ chars, so no
      // need to reset state here (avoids a synchronous setState-in-effect).
      return;
    }
    searchTimer.current = setTimeout(async () => {
      setSearching(true);
      try {
        const response = await apiFetch<SearchResponse>(
          `/api/v1/shopping/catalog/search?q=${encodeURIComponent(query)}`
        );
        setSearchResults(response.products);
        setSearchError(
          response.catalogEnabled === false
            ? "Búsqueda online deshabilitada (falta PRICE_CATALOG_BASE_URL). Podés agregar el ítem manualmente."
            : null
        );
      } catch (requestError) {
        setSearchResults([]);
        setSearchError(
          requestError instanceof Error
            ? requestError.message
            : "No se pudo buscar precios"
        );
      } finally {
        setSearching(false);
      }
    }, 400);
    return () => {
      if (searchTimer.current) {
        clearTimeout(searchTimer.current);
      }
    };
  }, [search]);

  const addItem = async (product: CatalogSearchProductDto | null, label?: string) => {
    const itemLabel = product ? product.name : (label ?? search.trim());
    if (!itemLabel) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/v1/shopping/lists/${listId}/items`, {
        method: "POST",
        body: JSON.stringify({
          label: itemLabel,
          quantity: 1,
          product: product ?? undefined,
        }),
      });
      setSearch("");
      setSearchResults([]);
      await refresh();
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "No se pudo agregar el ítem"
      );
    } finally {
      setBusy(false);
    }
  };

  const patchItem = async (
    itemId: string,
    payload: Record<string, unknown>,
    options?: { silent?: boolean }
  ) => {
    try {
      await apiFetch(`/api/v1/shopping/lists/${listId}/items/${itemId}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      if (!options?.silent) {
        await refresh();
      }
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "No se pudo actualizar el ítem"
      );
      await refresh();
    }
  };

  const changeQuantity = async (item: ShoppingListItemDto, delta: number) => {
    const next = Math.max(1, item.quantity + delta);
    if (next === item.quantity) return;
    setItems((previous) =>
      previous.map((entry) =>
        entry.id === item.id ? { ...entry, quantity: next } : entry
      )
    );
    await patchItem(item.id, { quantity: next }, { silent: true });
  };

  const toggleChecked = async (item: ShoppingListItemDto) => {
    const next = !item.checked;
    setItems((previous) =>
      previous.map((entry) =>
        entry.id === item.id ? { ...entry, checked: next } : entry
      )
    );
    await patchItem(item.id, { checked: next }, { silent: true });
  };

  const commitPrice = async (item: ShoppingListItemDto) => {
    const raw = priceInputs[item.id] ?? "";
    const parsed = raw.trim() === "" ? null : parsePriceInput(raw);
    if (raw.trim() !== "" && parsed == null) {
      return;
    }
    if (parsed === item.paidUnitPrice) {
      return;
    }
    setItems((previous) =>
      previous.map((entry) =>
        entry.id === item.id ? { ...entry, paidUnitPrice: parsed } : entry
      )
    );
    await patchItem(item.id, { paidUnitPrice: parsed }, { silent: true });
  };

  const deleteItem = async (item: ShoppingListItemDto) => {
    setItems((previous) => previous.filter((entry) => entry.id !== item.id));
    try {
      await apiFetch(`/api/v1/shopping/lists/${listId}/items/${item.id}`, {
        method: "DELETE",
      });
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "No se pudo borrar el ítem"
      );
      await refresh();
    }
  };

  const openStorePicker = async () => {
    setStorePickerOpen(true);
    try {
      const response = await apiFetch<{ stores: ShoppingStoreDto[] }>(
        "/api/v1/shopping/stores"
      );
      setStores(response.stores);
    } catch {
      setStores([]);
    }
  };

  const enterStore = async (storeId: string | null, storeName?: string) => {
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/v1/shopping/lists/${listId}`, {
        method: "PATCH",
        body: JSON.stringify(storeName ? { storeName } : { storeId }),
      });
      setStorePickerOpen(false);
      setCustomStore("");
      await refresh();
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "No se pudo cambiar el modo"
      );
    } finally {
      setBusy(false);
    }
  };

  const duplicateList = async () => {
    setBusy(true);
    try {
      const response = await apiFetch<{ list: { id: string } }>(
        `/api/v1/shopping/lists/${listId}/duplicate`,
        { method: "POST", body: JSON.stringify({}) }
      );
      router.push(`/shopping/lists/${response.list.id}`);
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "No se pudo duplicar la lista"
      );
      setBusy(false);
    }
  };

  const deleteList = async () => {
    setBusy(true);
    try {
      await apiFetch(`/api/v1/shopping/lists/${listId}`, { method: "DELETE" });
      router.push("/shopping");
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "No se pudo borrar la lista"
      );
      setBusy(false);
      setDeleteOpen(false);
    }
  };

  if (loading) {
    return (
      <Stack spacing={2}>
        <ListSkeleton rows={5} height={72} />
      </Stack>
    );
  }

  if (!list) {
    return <Alert severity="error">{error ?? "Lista no encontrada"}</Alert>;
  }

  const showRefComparison = mode === "closed";

  return (
    <Stack spacing={1.6} sx={{ pb: mode === "instore" ? 12 : 0 }}>
      <Box
        sx={{
          px: 2,
          py: 1.6,
          borderRadius: "24px",
          bgcolor: "background.paper",
          border: "1px solid rgba(22, 19, 41, 0.05)",
          boxShadow: "0 10px 30px rgba(31, 25, 84, 0.06)",
        }}
      >
        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
          <IconButton size="small" onClick={() => router.push("/shopping")}>
            <ArrowBackOutlinedIcon fontSize="small" />
          </IconButton>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="h6" noWrap sx={{ lineHeight: 1.2 }}>
              {list.name}
            </Typography>
            <Stack direction="row" spacing={0.6} sx={{ alignItems: "center", mt: 0.3 }}>
              {mode === "closed" ? (
                <>
                  <Chip size="small" label={list.storeName ?? "Sin súper"} />
                  {list.purchasedAt ? (
                    <Typography variant="caption" color="text.secondary">
                      {new Date(list.purchasedAt).toLocaleDateString("es-AR")}
                    </Typography>
                  ) : null}
                  {list.registeredTransactionId ? (
                    <Chip size="small" color="success" label="Gasto registrado" />
                  ) : null}
                </>
              ) : mode === "instore" ? (
                <Chip
                  size="small"
                  color="primary"
                  icon={<StorefrontOutlinedIcon />}
                  label={list.store?.name ?? "En el súper"}
                />
              ) : (
                <Typography variant="caption" color="text.secondary">
                  {items.length} ítems · estimado {formatCurrency(estimatedTotal)}
                </Typography>
              )}
            </Stack>
          </Box>
          <IconButton size="small" onClick={(event) => setMenuAnchor(event.currentTarget)}>
            <MoreVertOutlinedIcon fontSize="small" />
          </IconButton>
        </Stack>
      </Box>

      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={() => setMenuAnchor(null)}
      >
        <MenuItem
          onClick={() => {
            setMenuAnchor(null);
            void duplicateList();
          }}
        >
          <ContentCopyOutlinedIcon fontSize="small" style={{ marginRight: 8 }} />
          Repetir lista
        </MenuItem>
        {mode === "instore" ? (
          <MenuItem
            onClick={() => {
              setMenuAnchor(null);
              void enterStore(null);
            }}
          >
            <ArrowBackOutlinedIcon fontSize="small" style={{ marginRight: 8 }} />
            Salir del modo súper
          </MenuItem>
        ) : null}
        <MenuItem
          onClick={() => {
            setMenuAnchor(null);
            setDeleteOpen(true);
          }}
          sx={{ color: "error.main" }}
        >
          <DeleteOutlineOutlinedIcon fontSize="small" style={{ marginRight: 8 }} />
          Eliminar lista
        </MenuItem>
      </Menu>

      {error ? <Alert severity="error" onClose={() => setError(null)}>{error}</Alert> : null}

      {mode === "closed" && list.total != null ? (
        <Card>
          <CardContent sx={{ "&:last-child": { pb: 2 } }}>
            <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center" }}>
              <Typography variant="subtitle2" color="text.secondary">
                Total pagado
              </Typography>
              <Typography variant="h6">{formatCurrency(list.total)}</Typography>
            </Stack>
            <Button
              fullWidth
              variant="contained"
              startIcon={<ContentCopyOutlinedIcon />}
              onClick={() => void duplicateList()}
              disabled={busy}
              sx={{ mt: 1.2 }}
            >
              Repetir lista
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {mode === "build" ? (
        <Card>
          <CardContent sx={{ "&:last-child": { pb: 2 } }}>
            <TextField
              fullWidth
              size="small"
              label="Buscar producto o escribir ítem"
              placeholder="Ej: queso rallado"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            {search.trim().length >= 3 ? (
              <Stack spacing={0.6} sx={{ mt: 1, maxHeight: 320, overflowY: "auto" }}>
                {searching ? (
                  <Stack sx={{ alignItems: "center", py: 1.5 }}>
                    <CircularProgress size={22} />
                  </Stack>
                ) : (
                  <>
                    {searchError ? <Alert severity="warning">{searchError}</Alert> : null}
                    {searchResults.map((product) => (
                      <Stack
                        key={product.externalId}
                        direction="row"
                        spacing={1}
                        onClick={() => (busy ? null : void addItem(product))}
                        sx={{
                          p: 1,
                          borderRadius: "12px",
                          alignItems: "center",
                          cursor: "pointer",
                          "&:hover": { bgcolor: "rgba(226, 232, 240, 0.4)" },
                        }}
                      >
                        <Avatar
                          variant="rounded"
                          src={product.imageUrl ?? undefined}
                          sx={{ width: 40, height: 40, bgcolor: "rgba(226,232,240,0.6)" }}
                        >
                          <ShoppingCartCheckoutOutlinedIcon fontSize="small" />
                        </Avatar>
                        <Stack sx={{ flex: 1, minWidth: 0 }}>
                          <Typography variant="body2" noWrap>
                            {product.name}
                          </Typography>
                          <Typography variant="caption" color="text.secondary" noWrap>
                            {product.brand ?? ""}
                          </Typography>
                        </Stack>
                        {product.minPrice != null ? (
                          <Stack sx={{ alignItems: "flex-end", flexShrink: 0 }}>
                            <Typography variant="body2" sx={{ fontWeight: 700 }}>
                              {formatCurrency(product.minPrice)}
                            </Typography>
                            {product.minPriceStore ? (
                              <Typography variant="caption" color="text.secondary">
                                {product.minPriceStore.name}
                              </Typography>
                            ) : null}
                          </Stack>
                        ) : null}
                      </Stack>
                    ))}
                    <Stack
                      direction="row"
                      spacing={1}
                      onClick={() => (busy ? null : void addItem(null))}
                      sx={{
                        p: 1,
                        borderRadius: "12px",
                        alignItems: "center",
                        cursor: "pointer",
                        "&:hover": { bgcolor: "rgba(226, 232, 240, 0.4)" },
                      }}
                    >
                      <Avatar
                        variant="rounded"
                        sx={{ width: 40, height: 40, bgcolor: "primary.main" }}
                      >
                        <AddOutlinedIcon fontSize="small" />
                      </Avatar>
                      <Typography variant="body2">
                        Agregar &quot;{search.trim()}&quot; como ítem libre
                      </Typography>
                    </Stack>
                  </>
                )}
              </Stack>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardContent sx={{ "&:last-child": { pb: 1.4 } }}>
          {items.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>
              La lista está vacía. Buscá productos arriba o escribí un ítem libre.
            </Typography>
          ) : (
            <Stack spacing={0.8}>
              {items.map((item) => (
                <Stack
                  key={item.id}
                  direction="row"
                  spacing={0.6}
                  sx={{
                    p: 1,
                    borderRadius: "14px",
                    bgcolor: "rgba(226, 232, 240, 0.3)",
                    alignItems: "center",
                  }}
                >
                  {mode !== "build" ? (
                    <Checkbox
                      size="small"
                      checked={item.checked}
                      disabled={mode === "closed"}
                      onChange={() => void toggleChecked(item)}
                      sx={{ p: 0.4 }}
                    />
                  ) : null}
                  <Stack sx={{ flex: 1, minWidth: 0 }}>
                    <Typography
                      variant="body2"
                      noWrap
                      sx={{
                        fontWeight: 600,
                        textDecoration: item.checked ? "line-through" : "none",
                        color: item.checked ? "text.secondary" : "text.primary",
                      }}
                    >
                      {item.quantity !== 1 ? `${item.quantity} × ` : ""}
                      {item.label}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" noWrap>
                      {item.refPrice != null
                        ? `Ref: ${formatCurrency(item.refPrice)}${item.refStoreName ? ` (${item.refStoreName})` : ""}`
                        : "Sin precio online"}
                      {showRefComparison && item.paidUnitPrice != null && item.refPrice != null
                        ? ` · pagado ${formatCurrency(item.paidUnitPrice)}`
                        : ""}
                    </Typography>
                  </Stack>

                  {mode === "build" ? (
                    <Stack direction="row" spacing={0.2} sx={{ alignItems: "center", flexShrink: 0 }}>
                      <IconButton size="small" onClick={() => void changeQuantity(item, -1)}>
                        <RemoveOutlinedIcon fontSize="small" />
                      </IconButton>
                      <Typography variant="body2" sx={{ minWidth: 18, textAlign: "center" }}>
                        {item.quantity}
                      </Typography>
                      <IconButton size="small" onClick={() => void changeQuantity(item, 1)}>
                        <AddOutlinedIcon fontSize="small" />
                      </IconButton>
                      <IconButton size="small" color="error" onClick={() => void deleteItem(item)}>
                        <DeleteOutlineOutlinedIcon fontSize="small" />
                      </IconButton>
                    </Stack>
                  ) : null}

                  {mode === "instore" ? (
                    <TextField
                      size="small"
                      placeholder="Precio"
                      value={priceInputs[item.id] ?? ""}
                      onChange={(event) =>
                        setPriceInputs((previous) => ({
                          ...previous,
                          [item.id]: event.target.value,
                        }))
                      }
                      onBlur={() => void commitPrice(item)}
                      disabled={!item.checked}
                      slotProps={{ htmlInput: { inputMode: "decimal" } }}
                      sx={{ width: 96, flexShrink: 0 }}
                    />
                  ) : null}

                  {mode === "closed" && item.checked ? (
                    <Typography variant="body2" sx={{ fontWeight: 700, flexShrink: 0 }}>
                      {item.paidUnitPrice != null
                        ? formatCurrency(item.paidUnitPrice * item.quantity)
                        : "—"}
                    </Typography>
                  ) : null}
                </Stack>
              ))}
            </Stack>
          )}
        </CardContent>
      </Card>

      {mode === "build" && items.length > 0 ? (
        <Button
          variant="contained"
          size="large"
          startIcon={<StorefrontOutlinedIcon />}
          onClick={() => void openStorePicker()}
          disabled={busy}
        >
          Ir al súper
        </Button>
      ) : null}

      {mode === "instore" ? (
        <Paper
          elevation={8}
          sx={{
            position: "fixed",
            left: 12,
            right: 12,
            bottom: "calc(84px + env(safe-area-inset-bottom))",
            borderRadius: "20px",
            p: 1.4,
            zIndex: 1200,
          }}
        >
          <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
            <Stack sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="caption" color="text.secondary">
                {items.filter((item) => item.checked).length}/{items.length} ·
                total parcial
              </Typography>
              <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
                {formatCurrency(paidTotal)}
              </Typography>
            </Stack>
            <IconButton
              onClick={() => setTicketOpen(true)}
              sx={{ bgcolor: "rgba(226,232,240,0.6)" }}
              title="Cargar ticket"
            >
              <ReceiptLongOutlinedIcon />
            </IconButton>
            <Button
              variant="contained"
              onClick={() => setCloseOpen(true)}
              disabled={items.every((item) => !item.checked)}
            >
              Cerrar compra
            </Button>
          </Stack>
        </Paper>
      ) : null}

      <Drawer
        anchor="bottom"
        open={storePickerOpen}
        onClose={() => (busy ? null : setStorePickerOpen(false))}
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
        <Stack spacing={1.2}>
          <Typography variant="h6">¿En qué súper estás?</Typography>
          {stores.length ? (
            <Stack direction="row" sx={{ flexWrap: "wrap", gap: 0.8 }}>
              {stores.map((store) => (
                <Chip
                  key={store.id}
                  label={store.name}
                  onClick={() => void enterStore(store.id)}
                  disabled={busy}
                  sx={{ cursor: "pointer" }}
                />
              ))}
            </Stack>
          ) : (
            <Typography variant="body2" color="text.secondary">
              Todavía no tenés súpers guardados.
            </Typography>
          )}
          <Stack direction="row" spacing={1}>
            <TextField
              fullWidth
              size="small"
              label="Otro súper"
              placeholder="Ej: Coto, Carrefour, chino del barrio"
              value={customStore}
              onChange={(event) => setCustomStore(event.target.value)}
            />
            <Button
              variant="contained"
              disabled={busy || !customStore.trim()}
              onClick={() => void enterStore(null, customStore.trim())}
            >
              Ir
            </Button>
          </Stack>
        </Stack>
      </Drawer>

      <TicketReviewDrawer
        open={ticketOpen}
        listId={listId}
        items={items}
        onClose={() => setTicketOpen(false)}
        onApplied={async (result) => {
          setTicketOpen(false);
          setTicketDefaults({
            documentId: result.documentId,
            storeName: result.storeName,
            total: result.total,
            purchasedAt: result.purchasedAt,
          });
          await refresh();
          setCloseOpen(true);
        }}
      />

      <ClosePurchaseDialog
        open={closeOpen}
        listId={listId}
        listName={list.name}
        defaultStoreName={ticketDefaults.storeName ?? list.store?.name ?? ""}
        defaultTotal={ticketDefaults.total}
        itemsSum={paidTotal}
        defaultPurchasedAt={ticketDefaults.purchasedAt}
        ticketDocumentId={ticketDefaults.documentId}
        onClose={() => setCloseOpen(false)}
        onClosed={async (result) => {
          setCloseOpen(false);
          setMessage(
            result.transactionId
              ? "Compra cerrada y gasto registrado."
              : "Compra guardada en el historial."
          );
          await refresh();
        }}
      />

      <Dialog open={deleteOpen} onClose={() => (busy ? null : setDeleteOpen(false))}>
        <DialogTitle>Eliminar lista</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            Se borra la lista y sus ítems.
            {list.registeredTransactionId
              ? " El gasto registrado en transacciones NO se borra."
              : ""}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteOpen(false)} disabled={busy}>
            Cancelar
          </Button>
          <Button color="error" variant="contained" onClick={() => void deleteList()} loading={busy}>
            {busy ? "Eliminando..." : "Eliminar"}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={Boolean(message)}
        autoHideDuration={3500}
        onClose={() => setMessage(null)}
        message={message}
      />
    </Stack>
  );
}
