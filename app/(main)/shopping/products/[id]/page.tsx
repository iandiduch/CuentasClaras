"use client";

import ArrowBackOutlinedIcon from "@mui/icons-material/ArrowBackOutlined";
import {
  Alert,
  Avatar,
  Box,
  Card,
  CardContent,
  Chip,
  IconButton,
  Stack,
  Typography,
} from "@mui/material";
import { LineChart } from "@mui/x-charts";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { ListSkeleton } from "@/app/components/list-skeleton";
import { apiFetch, formatCurrency } from "@/lib/client/http";

type HistoryResponse = {
  product: {
    id: string;
    source: "catalog" | "manual";
    externalId: string | null;
    name: string;
    brand: string | null;
    category: string | null;
    imageUrl: string | null;
    ean: string | null;
  };
  paid: Array<{
    purchasedAt: string;
    storeName: string | null;
    listId: string;
    listName: string;
    unitPrice: number;
    quantity: number;
  }>;
  reference: Array<{
    capturedAt: string;
    recordedAt: string;
    storeSlug: string;
    storeName: string;
    price: number;
    listPrice: number | null;
    promoLabel: string | null;
  }>;
};

type LivePricesResponse = {
  prices: Array<{
    storeSlug: string;
    storeName: string;
    price: number;
    listPrice: number | null;
    promoLabel: string | null;
    recordedAt: string | null;
  }>;
};

const SERIES_COLORS = ["#6D5DFB", "#0f766e", "#b91c1c", "#b45309", "#7c3aed", "#0369a1"];

export default function ShoppingProductDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const productId = params.id;

  const [data, setData] = useState<HistoryResponse | null>(null);
  const [livePrices, setLivePrices] = useState<LivePricesResponse["prices"] | null>(null);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const boot = async () => {
      try {
        const response = await apiFetch<HistoryResponse>(
          `/api/v1/shopping/products/${productId}/history`
        );
        if (!active) return;
        setData(response);

        if (response.product.externalId) {
          try {
            const live = await apiFetch<LivePricesResponse>(
              `/api/v1/shopping/catalog/products/${response.product.externalId}/prices`
            );
            if (!active) return;
            setLivePrices(live.prices);
          } catch (liveRequestError) {
            if (!active) return;
            setLiveError(
              liveRequestError instanceof Error
                ? liveRequestError.message
                : "No se pudieron traer los precios online"
            );
          }
        }
      } catch (requestError) {
        if (!active) return;
        setError(
          requestError instanceof Error
            ? requestError.message
            : "No se pudo cargar el producto"
        );
      } finally {
        if (active) setLoading(false);
      }
    };
    void boot();
    return () => {
      active = false;
    };
  }, [productId]);

  // Serie de pagado + una serie por súper de referencia, sobre un eje temporal común
  const chart = useMemo(() => {
    if (!data) return null;

    type Point = { time: number; value: number };
    const paidPoints: Point[] = data.paid.map((row) => ({
      time: new Date(row.purchasedAt).getTime(),
      value: row.unitPrice,
    }));

    const referenceByStore = new Map<string, { name: string; points: Point[] }>();
    for (const row of data.reference) {
      const entry = referenceByStore.get(row.storeSlug) ?? {
        name: row.storeName,
        points: [],
      };
      entry.points.push({ time: new Date(row.capturedAt).getTime(), value: row.price });
      referenceByStore.set(row.storeSlug, entry);
    }

    // los 4 súpers con más datos para no saturar el gráfico
    const topStores = [...referenceByStore.entries()]
      .sort((a, b) => b[1].points.length - a[1].points.length)
      .slice(0, 4);

    const allTimes = [
      ...paidPoints.map((point) => point.time),
      ...topStores.flatMap(([, store]) => store.points.map((point) => point.time)),
    ];
    if (allTimes.length === 0) return null;

    const timeline = [...new Set(allTimes)].sort((a, b) => a - b);
    const timeIndex = new Map(timeline.map((time, index) => [time, index]));

    const toSeriesData = (points: Point[]) => {
      const values: (number | null)[] = Array(timeline.length).fill(null);
      for (const point of points) {
        values[timeIndex.get(point.time)!] = point.value;
      }
      return values;
    };

    return {
      xLabels: timeline.map((time) =>
        new Date(time).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" })
      ),
      series: [
        ...(paidPoints.length
          ? [
              {
                label: "Pagado",
                color: "#161329",
                data: toSeriesData(paidPoints),
                connectNulls: true,
              },
            ]
          : []),
        ...topStores.map(([, store], index) => ({
          label: store.name,
          color: SERIES_COLORS[index % SERIES_COLORS.length],
          data: toSeriesData(store.points),
          connectNulls: true,
        })),
      ],
    };
  }, [data]);

  if (loading) {
    return <ListSkeleton rows={4} height={90} />;
  }

  if (!data) {
    return <Alert severity="error">{error ?? "Producto no encontrado"}</Alert>;
  }

  const sortedLive = livePrices ? [...livePrices].sort((a, b) => a.price - b.price) : null;

  return (
    <Stack spacing={1.6}>
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
        <Stack direction="row" spacing={1.2} sx={{ alignItems: "center" }}>
          <IconButton size="small" onClick={() => router.push("/shopping/products")}>
            <ArrowBackOutlinedIcon fontSize="small" />
          </IconButton>
          <Avatar
            variant="rounded"
            src={data.product.imageUrl ?? undefined}
            sx={{ width: 48, height: 48, bgcolor: "rgba(226,232,240,0.6)" }}
          />
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="subtitle1" sx={{ lineHeight: 1.2 }}>
              {data.product.name}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {data.product.brand ?? (data.product.source === "manual" ? "Ítem libre" : "")}
            </Typography>
          </Box>
        </Stack>
      </Box>

      {error ? <Alert severity="error">{error}</Alert> : null}

      {chart ? (
        <Card>
          <CardContent>
            <Typography variant="subtitle1" sx={{ mb: 1 }}>
              Evolución de precios
            </Typography>
            <LineChart
              height={260}
              xAxis={[{ scaleType: "point", data: chart.xLabels }]}
              series={chart.series.map((series) => ({
                ...series,
                valueFormatter: (value: number | null) =>
                  value != null ? formatCurrency(value) : "",
              }))}
              slotProps={{
                legend: {
                  direction: "horizontal",
                  position: { vertical: "bottom", horizontal: "center" },
                },
              }}
              margin={{ bottom: 60 }}
            />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent>
            <Typography variant="body2" color="text.secondary">
              Todavía no hay historial de precios para este producto. Se va armando cuando
              lo agregás a listas y cerrás compras.
            </Typography>
          </CardContent>
        </Card>
      )}

      {data.paid.length > 0 ? (
        <Card>
          <CardContent sx={{ "&:last-child": { pb: 1.6 } }}>
            <Typography variant="subtitle1" sx={{ mb: 1 }}>
              Lo que pagaste
            </Typography>
            <Stack spacing={0.6}>
              {[...data.paid].reverse().map((row, index) => (
                <Stack
                  key={index}
                  direction="row"
                  sx={{ justifyContent: "space-between", alignItems: "center" }}
                >
                  <Typography variant="body2" color="text.secondary">
                    {new Date(row.purchasedAt).toLocaleDateString("es-AR")}
                    {row.storeName ? ` · ${row.storeName}` : ""}
                  </Typography>
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>
                    {formatCurrency(row.unitPrice)}
                  </Typography>
                </Stack>
              ))}
            </Stack>
          </CardContent>
        </Card>
      ) : null}

      {data.product.externalId ? (
        <Card>
          <CardContent sx={{ "&:last-child": { pb: 1.6 } }}>
            <Typography variant="subtitle1" sx={{ mb: 1 }}>
              Precios online ahora
            </Typography>
            {liveError ? <Alert severity="warning">{liveError}</Alert> : null}
            {sortedLive ? (
              <Stack spacing={0.6}>
                {sortedLive.map((price, index) => (
                  <Stack
                    key={price.storeSlug}
                    direction="row"
                    sx={{ justifyContent: "space-between", alignItems: "center" }}
                  >
                    <Stack direction="row" spacing={0.8} sx={{ alignItems: "center" }}>
                      <Typography variant="body2">{price.storeName}</Typography>
                      {index === 0 ? (
                        <Chip size="small" color="success" label="Más barato" sx={{ height: 18 }} />
                      ) : null}
                      {price.promoLabel ? (
                        <Chip size="small" color="warning" label={price.promoLabel} sx={{ height: 18 }} />
                      ) : null}
                    </Stack>
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>
                      {formatCurrency(price.price)}
                    </Typography>
                  </Stack>
                ))}
              </Stack>
            ) : !liveError ? (
              <Typography variant="body2" color="text.secondary">
                Cargando precios…
              </Typography>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </Stack>
  );
}
