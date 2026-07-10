"use client";

import {
  Alert,
  Avatar,
  Box,
  Card,
  CardContent,
  Skeleton,
  Stack,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import { BarChart, LineChart } from "@mui/x-charts";
import { useEffect, useMemo, useState } from "react";

import { CategoryIcon } from "@/app/components/category-icons";
import { ListSkeleton } from "@/app/components/list-skeleton";
import { PageHero } from "@/app/components/page-hero";
import { apiFetch, formatCurrency } from "@/lib/client/http";
import { MonthlyAnalyticsDto, ProjectionAnalyticsDto, TransactionDto } from "@/lib/shared/types";

function getCurrentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

type TransactionsResponse = {
  transactions: TransactionDto[];
};

function getMonthRangeIso(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const start = new Date(Date.UTC(year, monthNumber - 1, 1));
  const endExclusive = new Date(Date.UTC(year, monthNumber, 1));
  return { from: start.toISOString(), to: new Date(endExclusive.getTime() - 1).toISOString() };
}

function formatDayLabel(day: string) {
  return new Date(`${day}T00:00:00.000Z`).toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "UTC",
  });
}

export default function AnalysisPage() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const [month, setMonth] = useState(getCurrentMonth());
  const [analytics, setAnalytics] = useState<MonthlyAnalyticsDto | null>(null);
  const [monthExpenses, setMonthExpenses] = useState<TransactionDto[]>([]);
  const [projection, setProjection] = useState<ProjectionAnalyticsDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const result = await apiFetch<ProjectionAnalyticsDto>("/api/v1/analytics/projection?months=6");
        if (!active) return;
        setProjection(result);
      } catch {
        if (!active) return;
        setProjection(null);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const { from, to } = getMonthRangeIso(month);
        const [analyticsResult, transactionsResult] = await Promise.all([
          apiFetch<MonthlyAnalyticsDto>(`/api/v1/analytics/monthly?month=${month}`),
          apiFetch<TransactionsResponse>(
            `/api/v1/transactions?direction=expense&from=${from}&to=${to}&limit=100`
          ),
        ]);
        if (!active) return;
        setAnalytics(analyticsResult);
        setMonthExpenses(transactionsResult.transactions);
        setError(null);
      } catch (requestError) {
        if (!active) return;
        setError(requestError instanceof Error ? requestError.message : "No se pudo cargar analisis");
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [month]);

  const strategicNotes = useMemo(() => {
    if (!analytics) return [];

    const notes: string[] = [];
    const avgExpense =
      analytics.monthTrend.reduce((acc, row) => acc + row.expense, 0) /
      Math.max(analytics.monthTrend.length, 1);

    if (analytics.totals.expense > avgExpense * 1.15) {
      notes.push("Gasto mensual arriba de 15% contra el promedio de 6 meses.");
    }
    if (analytics.totals.balance < 0) {
      notes.push("Balance negativo: define tope semanal por categoria.");
    }
    if (analytics.expenseByCategory.length > 0) {
      notes.push(
        `Mayor peso: ${analytics.expenseByCategory[0].category} (${formatCurrency(
          analytics.expenseByCategory[0].total
        )}).`
      );
    }
    if (!notes.length) {
      notes.push("Buen equilibrio mensual. Sostener seguimiento.");
    }

    return notes;
  }, [analytics]);

  const topSpendingDays = useMemo(() => {
    if (!analytics) return [];
    return [...analytics.dailyCashflow]
      .filter((row) => row.expense > 0)
      .sort((a, b) => b.expense - a.expense)
      .slice(0, 7);
  }, [analytics]);

  const topExpenses = useMemo(() => {
    // Transfers between the user's own accounts are stored with
    // direction "expense" (the outflow leg), and adjustments can be
    // opted out of the totals picture — excluding both keeps this list
    // to real spending, matching expenseByCategory's own filtering.
    return [...monthExpenses]
      .filter((movement) => movement.includeInTotals)
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 10);
  }, [monthExpenses]);

  const displayExpenseByCategory = useMemo(() => {
    if (!analytics) return [];
    const maxBars = isMobile ? 6 : 12;
    if (analytics.expenseByCategory.length <= maxBars) {
      return analytics.expenseByCategory;
    }
    const head = analytics.expenseByCategory.slice(0, maxBars - 1);
    const otherTotal = analytics.expenseByCategory
      .slice(maxBars - 1)
      .reduce((sum, row) => sum + row.total, 0);
    return [...head, { category: "Otros", total: otherTotal }];
  }, [analytics, isMobile]);

  return (
    <Stack spacing={2}>
      <PageHero
        title="Analisis profundo"
        subtitle="Tendencias, categorias dominantes y señales para decidir ajustes."
      />

      <Card>
        <CardContent>
          <Stack direction="row" spacing={1.2} sx={{ alignItems: "center" }}>
            <Typography variant="subtitle1">Mes</Typography>
            <input
              type="month"
              value={month}
              onChange={(event) => setMonth(event.target.value)}
              style={{
                borderRadius: 10,
                border: "1px solid rgba(148,163,184,0.6)",
                padding: "8px 10px",
                background: "white",
              }}
            />
          </Stack>
        </CardContent>
      </Card>

      {error ? <Alert severity="error">{error}</Alert> : null}
      {!analytics ? (
        <Stack spacing={2}>
          <Skeleton variant="rounded" height={260} sx={{ borderRadius: "20px" }} />
          <Skeleton variant="rounded" height={260} sx={{ borderRadius: "20px" }} />
          <ListSkeleton rows={3} height={64} />
        </Stack>
      ) : (
        <>
          <Card>
            <CardContent>
              <Typography variant="subtitle1">Tendencia de 6 meses</Typography>
              <Box sx={{ width: "100%", overflowX: "auto" }}>
                <LineChart
                  height={isMobile ? 240 : 300}
                  xAxis={[{ scaleType: "point", data: analytics.monthTrend.map((row) => row.month.slice(5)) }]}
                  series={[
                    { label: "Ingresos", color: "#15803d", data: analytics.monthTrend.map((row) => row.income) },
                    { label: "Gastos", color: "#b91c1c", data: analytics.monthTrend.map((row) => row.expense) },
                    { label: "Balance", color: "#0f766e", data: analytics.monthTrend.map((row) => row.balance) },
                  ]}
                  slotProps={{
                    legend: isMobile
                      ? { direction: "horizontal", position: { vertical: "bottom", horizontal: "center" } }
                      : undefined,
                  }}
                  margin={isMobile ? { bottom: 60 } : undefined}
                />
              </Box>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <Typography variant="subtitle1">Gasto por categoria</Typography>
              <Box sx={{ width: "100%", overflowX: "auto" }}>
                {isMobile ? (
                  // Horizontal layout on mobile: category names sit on the y-axis
                  // (no rotated text) and each bar/tooltip gets a full-width row,
                  // instead of thin vertical bars with rotated labels that got
                  // hidden under a finger tap and clashed with the tooltip.
                  <BarChart
                    layout="horizontal"
                    height={Math.max(240, displayExpenseByCategory.length * 44)}
                    yAxis={[
                      {
                        scaleType: "band",
                        data: displayExpenseByCategory.map((row) => row.category),
                        tickLabelStyle: { fontSize: 12 },
                        width: 110,
                      },
                    ]}
                    xAxis={[{ tickLabelStyle: { fontSize: 11 } }]}
                    series={[
                      {
                        label: "Gasto",
                        color: "#6D5DFB",
                        data: displayExpenseByCategory.map((row) => row.total),
                        valueFormatter: (value) => formatCurrency(value ?? 0),
                      },
                    ]}
                    margin={{ left: 4 }}
                  />
                ) : (
                  <BarChart
                    height={320}
                    xAxis={[
                      {
                        scaleType: "band",
                        data: displayExpenseByCategory.map((row) => row.category),
                      },
                    ]}
                    series={[
                      {
                        label: "Gasto",
                        color: "#6D5DFB",
                        data: displayExpenseByCategory.map((row) => row.total),
                        valueFormatter: (value) => formatCurrency(value ?? 0),
                      },
                    ]}
                  />
                )}
              </Box>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <Typography variant="subtitle1" gutterBottom>
                Recomendaciones de ahorro
              </Typography>
              <Stack spacing={1}>
                {strategicNotes.map((note) => (
                  <Alert key={note} severity="info">
                    {note}
                  </Alert>
                ))}
              </Stack>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <Typography variant="subtitle1" gutterBottom>
                Dias de mayor gasto
              </Typography>
              {topSpendingDays.length ? (
                <Stack spacing={1}>
                  {topSpendingDays.map((row) => (
                    <Stack
                      key={row.day}
                      direction="row"
                      sx={{
                        p: 1.2,
                        borderRadius: "14px",
                        bgcolor: "rgba(226, 232, 240, 0.3)",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>
                        {formatDayLabel(row.day)}
                      </Typography>
                      <Typography variant="body2" sx={{ fontWeight: 700, color: "error.main" }}>
                        {formatCurrency(row.expense)}
                      </Typography>
                    </Stack>
                  ))}
                </Stack>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  Todavia no hay gastos este mes.
                </Typography>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <Typography variant="subtitle1" gutterBottom>
                Top 10 gastos
              </Typography>
              {topExpenses.length ? (
                <Stack spacing={1}>
                  {topExpenses.map((movement) => (
                    <Stack
                      key={movement.id}
                      direction="row"
                      sx={{
                        p: 1.2,
                        borderRadius: "14px",
                        bgcolor: "rgba(226, 232, 240, 0.3)",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: 1.2,
                      }}
                    >
                      <Stack direction="row" spacing={1.2} sx={{ alignItems: "center", minWidth: 0 }}>
                        <Avatar sx={{ bgcolor: movement.categoryColorHex ?? "#94a3b8", width: 32, height: 32 }}>
                          <CategoryIcon icon={movement.categoryIcon} fontSize="small" />
                        </Avatar>
                        <Box sx={{ minWidth: 0 }}>
                          <Typography variant="body2" sx={{ fontWeight: 700 }} noWrap>
                            {movement.counterpartyName ?? movement.concept ?? "Sin detalle"}
                          </Typography>
                          <Typography variant="caption" color="text.secondary" noWrap>
                            {movement.categoryName ?? "Sin categoria"} ·{" "}
                            {new Date(movement.occurredAt).toLocaleDateString("es-AR")}
                          </Typography>
                        </Box>
                      </Stack>
                      <Typography variant="body2" sx={{ fontWeight: 700, flexShrink: 0, color: "error.main" }}>
                        {formatCurrency(movement.amount, movement.currency)}
                      </Typography>
                    </Stack>
                  ))}
                </Stack>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  Todavia no hay gastos este mes.
                </Typography>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <Typography variant="subtitle1" gutterBottom>
                Proyeccion futura
              </Typography>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Cuanto vas a gastar los proximos meses segun tus cuotas activas y gastos recurrentes.
              </Typography>
              {projection && projection.months.some((row) => row.total > 0) ? (
                <>
                  <Box sx={{ width: "100%", overflowX: "auto" }}>
                    <BarChart
                      height={isMobile ? 240 : 300}
                      xAxis={[{ scaleType: "band", data: projection.months.map((row) => row.month.slice(5)) }]}
                      series={[
                        {
                          label: "Cuotas",
                          color: "#6D5DFB",
                          data: projection.months.map((row) => row.installmentsTotal),
                          stack: "total",
                          valueFormatter: (value) => formatCurrency(value ?? 0),
                        },
                        {
                          label: "Recurrentes",
                          color: "#D97706",
                          data: projection.months.map((row) => row.recurringTotal),
                          stack: "total",
                          valueFormatter: (value) => formatCurrency(value ?? 0),
                        },
                      ]}
                      slotProps={{
                        legend: isMobile
                          ? { direction: "horizontal", position: { vertical: "bottom", horizontal: "center" } }
                          : undefined,
                      }}
                      margin={isMobile ? { bottom: 60 } : undefined}
                    />
                  </Box>
                  {projection.unknownRecurringCount > 0 ? (
                    <Alert severity="info" sx={{ mt: 1 }}>
                      {projection.unknownRecurringCount} gasto
                      {projection.unknownRecurringCount > 1 ? "s" : ""} recurrente
                      {projection.unknownRecurringCount > 1 ? "s" : ""} sin monto esperado no{" "}
                      {projection.unknownRecurringCount > 1 ? "estan" : "esta"} incluido
                      {projection.unknownRecurringCount > 1 ? "s" : ""} en esta proyeccion.
                    </Alert>
                  ) : null}
                </>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  Todavia no tenes cuotas activas ni gastos recurrentes con monto para proyectar.
                </Typography>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </Stack>
  );
}
