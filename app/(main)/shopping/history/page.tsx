"use client";

import ArrowBackOutlinedIcon from "@mui/icons-material/ArrowBackOutlined";
import ReceiptLongOutlinedIcon from "@mui/icons-material/ReceiptLongOutlined";
import {
  Alert,
  Box,
  Card,
  CardContent,
  Chip,
  IconButton,
  Stack,
  Typography,
} from "@mui/material";
import { BarChart } from "@mui/x-charts";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { ListSkeleton } from "@/app/components/list-skeleton";
import { PageHero } from "@/app/components/page-hero";
import { apiFetch, formatCurrency } from "@/lib/client/http";

import type { ShoppingListSummary } from "../types";

type AnalyticsResponse = {
  monthlyTotals: Array<{ month: string; total: number; purchaseCount: number }>;
  byStore: Array<{ storeName: string; total: number; purchaseCount: number }>;
  productInflation: Array<{
    productId: string;
    label: string;
    months: Array<{ month: string; avgUnitPrice: number }>;
  }>;
};

type ListsResponse = {
  lists: ShoppingListSummary[];
};

export default function ShoppingHistoryPage() {
  const router = useRouter();
  const [purchases, setPurchases] = useState<ShoppingListSummary[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const boot = async () => {
      try {
        const [listsResponse, analyticsResponse] = await Promise.all([
          apiFetch<ListsResponse>("/api/v1/shopping/lists?status=closed&limit=100"),
          apiFetch<AnalyticsResponse>("/api/v1/shopping/analytics?months=12"),
        ]);
        if (!active) return;
        setPurchases(listsResponse.lists);
        setAnalytics(analyticsResponse);
      } catch (requestError) {
        if (!active) return;
        setError(
          requestError instanceof Error
            ? requestError.message
            : "No se pudo cargar el historial"
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

  // % promedio de variación de precios de productos con datos en los últimos 2 meses
  const inflationSummary = useMemo(() => {
    if (!analytics) return null;
    const changes: number[] = [];
    for (const product of analytics.productInflation) {
      const months = product.months;
      if (months.length < 2) continue;
      const previous = months[months.length - 2];
      const latest = months[months.length - 1];
      if (previous.avgUnitPrice > 0) {
        changes.push((latest.avgUnitPrice - previous.avgUnitPrice) / previous.avgUnitPrice);
      }
    }
    if (!changes.length) return null;
    const average = changes.reduce((sum, value) => sum + value, 0) / changes.length;
    return { average: average * 100, count: changes.length };
  }, [analytics]);

  return (
    <Stack spacing={2}>
      <PageHero
        title="Historial de compras"
        subtitle="Tus compras cerradas, cuánto gastaste por mes y en qué súper."
        action={
          <IconButton size="small" onClick={() => router.push("/shopping")}>
            <ArrowBackOutlinedIcon fontSize="small" />
          </IconButton>
        }
      />

      {error ? <Alert severity="error">{error}</Alert> : null}

      {loading ? (
        <ListSkeleton rows={4} height={80} />
      ) : (
        <>
          {analytics && analytics.monthlyTotals.length > 0 ? (
            <Card>
              <CardContent>
                <Typography variant="subtitle1" sx={{ mb: 1 }}>
                  Gasto mensual en súper
                </Typography>
                <Box sx={{ width: "100%" }}>
                  <BarChart
                    height={220}
                    xAxis={[
                      {
                        scaleType: "band",
                        data: analytics.monthlyTotals.map((row) => row.month.slice(5)),
                      },
                    ]}
                    series={[
                      {
                        label: "Total",
                        color: "#6D5DFB",
                        data: analytics.monthlyTotals.map((row) => row.total),
                        valueFormatter: (value) => formatCurrency(value ?? 0),
                      },
                    ]}
                    slotProps={{ legend: { sx: { display: "none" } } }}
                  />
                </Box>
                {inflationSummary ? (
                  <Alert severity={inflationSummary.average > 0 ? "warning" : "success"}>
                    Tus productos {inflationSummary.average > 0 ? "subieron" : "bajaron"} en
                    promedio {Math.abs(inflationSummary.average).toFixed(1)}% vs. el mes
                    anterior ({inflationSummary.count} productos con datos).
                  </Alert>
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          {analytics && analytics.byStore.length > 0 ? (
            <Card>
              <CardContent sx={{ "&:last-child": { pb: 2 } }}>
                <Typography variant="subtitle1" sx={{ mb: 1 }}>
                  Por súper (últimos 12 meses)
                </Typography>
                <Stack direction="row" sx={{ flexWrap: "wrap", gap: 0.8 }}>
                  {analytics.byStore.map((store) => (
                    <Chip
                      key={store.storeName}
                      label={`${store.storeName}: ${formatCurrency(store.total)} (${store.purchaseCount})`}
                    />
                  ))}
                </Stack>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardContent sx={{ "&:last-child": { pb: 1.6 } }}>
              <Typography variant="subtitle1" sx={{ mb: 1 }}>
                Compras
              </Typography>
              {purchases.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  Todavía no cerraste ninguna compra.
                </Typography>
              ) : (
                <Stack spacing={0.8}>
                  {purchases.map((purchase) => (
                    <Stack
                      key={purchase.id}
                      direction="row"
                      onClick={() => router.push(`/shopping/lists/${purchase.id}`)}
                      sx={{
                        p: 1.2,
                        borderRadius: "14px",
                        bgcolor: "rgba(226, 232, 240, 0.3)",
                        alignItems: "center",
                        gap: 1,
                        cursor: "pointer",
                        "&:hover": { bgcolor: "rgba(226, 232, 240, 0.55)" },
                      }}
                    >
                      <ReceiptLongOutlinedIcon color="disabled" fontSize="small" />
                      <Stack sx={{ flex: 1, minWidth: 0 }}>
                        <Typography variant="body2" sx={{ fontWeight: 700 }} noWrap>
                          {purchase.name}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" noWrap>
                          {purchase.storeName ?? "Sin súper"}
                          {purchase.purchasedAt
                            ? ` · ${new Date(purchase.purchasedAt).toLocaleDateString("es-AR")}`
                            : ""}
                          {` · ${purchase.checkedCount} ítems`}
                        </Typography>
                      </Stack>
                      <Stack sx={{ alignItems: "flex-end", flexShrink: 0 }}>
                        <Typography variant="body2" sx={{ fontWeight: 700 }}>
                          {purchase.total != null ? formatCurrency(purchase.total) : "—"}
                        </Typography>
                        {purchase.registeredTransactionId ? (
                          <Chip size="small" color="success" label="Gasto" sx={{ height: 18 }} />
                        ) : null}
                      </Stack>
                    </Stack>
                  ))}
                </Stack>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </Stack>
  );
}
