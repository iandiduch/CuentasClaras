"use client";

import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
import {
  Alert,
  Avatar,
  Box,
  Card,
  CardContent,
  Chip,
  Drawer,
  IconButton,
  LinearProgress,
  Skeleton,
  Stack,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import { LineChart, PieChart } from "@mui/x-charts";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { CategoryIcon } from "@/app/components/category-icons";
import { ListSkeleton } from "@/app/components/list-skeleton";
import { apiFetch, formatCurrency } from "@/lib/client/http";
import { CategoryBudgetDto, MonthlyAnalyticsDto, TransactionDto } from "@/lib/shared/types";

type DashboardResponse = {
  transactions: TransactionDto[];
};

type BudgetsResponse = {
  budgets: CategoryBudgetDto[];
};

function getCurrentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function budgetColor(percent: number) {
  if (percent >= 100) return "error";
  if (percent >= 80) return "warning";
  return "success";
}

export default function DashboardPage() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const [month, setMonth] = useState(getCurrentMonth());
  const [analytics, setAnalytics] = useState<MonthlyAnalyticsDto | null>(null);
  const [recent, setRecent] = useState<TransactionDto[]>([]);
  const [budgets, setBudgets] = useState<CategoryBudgetDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [breakdown, setBreakdown] = useState<"balance" | "income" | "expense" | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const [analyticsData, recentData, budgetsData] = await Promise.all([
          apiFetch<MonthlyAnalyticsDto>(`/api/v1/analytics/monthly?month=${month}`),
          apiFetch<DashboardResponse>("/api/v1/transactions?limit=8"),
          apiFetch<BudgetsResponse>(`/api/v1/categories/budgets?month=${month}`),
        ]);

        if (!active) return;
        setAnalytics(analyticsData);
        setRecent(recentData.transactions);
        setBudgets(budgetsData.budgets);
        setError(null);
      } catch (requestError) {
        if (!active) return;
        setError(
          requestError instanceof Error ? requestError.message : "No se pudo cargar el dashboard"
        );
      }
    };

    void load();
    return () => {
      active = false;
    };
  }, [month]);

  const topExpense = useMemo(() => analytics?.expenseByCategory?.[0] ?? null, [analytics]);

  const breakdownRows = useMemo(() => {
    if (!analytics || !breakdown) return [];
    if (breakdown === "balance") return analytics.byAccount;
    return analytics.byAccount.filter((account) =>
      breakdown === "income" ? account.income > 0 : account.expense > 0
    );
  }, [analytics, breakdown]);

  const breakdownTitle =
    breakdown === "balance"
      ? "Balance por cuenta"
      : breakdown === "income"
        ? "Ingresos por cuenta"
        : "Gastos por cuenta";

  const insights = useMemo(() => {
    if (!analytics) return [];
    const items: string[] = [];

    if (analytics.totals.savingsRate < 10) {
      items.push("Ahorro bajo: estas por debajo del 10% del ingreso.");
    }
    if (topExpense && analytics.totals.expense > 0) {
      const weight = (topExpense.total / analytics.totals.expense) * 100;
      if (weight > 35) {
        items.push(`${topExpense.category} concentra ${weight.toFixed(1)}% del gasto mensual.`);
      }
    }
    if (analytics.totals.balance < 0) {
      items.push("Balance negativo: prioriza ajuste en gastos variables.");
    }
    if (!items.length) {
      items.push("Mes estable: manten seguimiento semanal para sostener tendencia.");
    }
    return items;
  }, [analytics, topExpense]);

  return (
    <Stack spacing={2}>
      <Box
        className="card-gradient"
        sx={{ borderRadius: "28px", px: 2.4, py: 2.6, boxShadow: "0 18px 40px rgba(76, 63, 224, 0.28)" }}
      >
        <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "flex-start" }}>
          <Stack
            spacing={0.4}
            onClick={() => analytics && setBreakdown("balance")}
            sx={{
              minWidth: 0,
              cursor: analytics ? "pointer" : "default",
              borderRadius: "12px",
              "&:hover": analytics ? { opacity: 0.85 } : undefined,
            }}
          >
            <Typography variant="body2" sx={{ opacity: 0.85 }}>
              Balance total
            </Typography>
            <Typography variant="h4" sx={{ color: "#fff" }} noWrap>
              {analytics ? formatCurrency(analytics.totals.balance) : "..."}
            </Typography>
          </Stack>
          <Stack direction="row" spacing={0.8} sx={{ alignItems: "center", flexShrink: 0 }}>
            <input
              type="month"
              value={month}
              onChange={(event) => setMonth(event.target.value)}
              style={{
                borderRadius: 999,
                border: "1px solid rgba(255,255,255,0.4)",
                padding: "5px 10px",
                background: "rgba(255,255,255,0.12)",
                color: "#fff",
                colorScheme: "dark",
                fontSize: "0.8rem",
              }}
            />
            <IconButton component={Link} href="/config" size="small" sx={{ color: "#fff" }}>
              <SettingsOutlinedIcon fontSize="small" />
            </IconButton>
          </Stack>
        </Stack>

        <Stack direction="row" spacing={1} sx={{ mt: 2.2, flexWrap: "wrap" }} useFlexGap>
          <Chip
            onClick={() => analytics && setBreakdown("income")}
            label={
              <Box component="span" sx={{ fontWeight: 700 }}>
                <Box component="span" sx={{ color: "#4ADE80", fontWeight: 800 }}>
                  +
                </Box>
                {analytics ? formatCurrency(analytics.totals.income) : "..."}
              </Box>
            }
            sx={{ bgcolor: "rgba(255,255,255,0.16)", color: "#fff" }}
          />
          <Chip
            onClick={() => analytics && setBreakdown("expense")}
            label={
              <Box component="span" sx={{ fontWeight: 700 }}>
                <Box component="span" sx={{ color: "#F87171", fontWeight: 800 }}>
                  -
                </Box>
                {analytics ? formatCurrency(analytics.totals.expense) : "..."}
              </Box>
            }
            sx={{ bgcolor: "rgba(255,255,255,0.16)", color: "#fff" }}
          />
        </Stack>
      </Box>

      {error ? <Alert severity="error">{error}</Alert> : null}

      {!analytics ? (
        <Stack spacing={2}>
          <Skeleton variant="rounded" height={170} sx={{ borderRadius: "28px" }} />
          <Box sx={{ display: "grid", gap: 1.2, gridTemplateColumns: "1fr 1fr" }}>
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} variant="rounded" height={80} sx={{ borderRadius: "16px" }} />
            ))}
          </Box>
          <ListSkeleton rows={3} height={72} />
        </Stack>
      ) : (
        <>
          <Box
            sx={{
              display: "grid",
              gap: 1.2,
              gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(4, 1fr)" },
            }}
          >
            {analytics.expenseByCategory.slice(0, 4).map((row) => (
              <Card key={row.category}>
                <CardContent>
                  <Typography variant="caption" color="text.secondary" noWrap>
                    {row.category}
                  </Typography>
                  <Typography variant="h6">{formatCurrency(row.total)}</Typography>
                </CardContent>
              </Card>
            ))}
            {analytics.expenseByCategory.length === 0 ? (
              <Card sx={{ gridColumn: "1 / -1" }}>
                <CardContent>
                  <Typography variant="body2" color="text.secondary">
                    Todavia no hay gastos categorizados este mes.
                  </Typography>
                </CardContent>
              </Card>
            ) : null}
          </Box>

          {budgets.length ? (
            <Card>
              <CardContent>
                <Typography variant="subtitle1" gutterBottom>
                  Presupuestos del mes
                </Typography>
                <Stack spacing={1.4}>
                  {budgets.slice(0, 5).map((budget) => (
                    <Stack key={budget.categoryId} spacing={0.5}>
                      <Stack direction="row" spacing={1} sx={{ alignItems: "center", justifyContent: "space-between" }}>
                        <Stack direction="row" spacing={1} sx={{ alignItems: "center", minWidth: 0 }}>
                          <Avatar sx={{ bgcolor: budget.colorHex ?? "#94a3b8", width: 30, height: 30 }}>
                            <CategoryIcon icon={budget.icon} sx={{ fontSize: 16 }} />
                          </Avatar>
                          <Typography variant="body2" sx={{ fontWeight: 700 }} noWrap>
                            {budget.categoryName}
                          </Typography>
                        </Stack>
                        <Typography variant="caption" color={`${budgetColor(budget.percent)}.main`} sx={{ fontWeight: 700 }}>
                          {formatCurrency(budget.spent)} / {formatCurrency(budget.monthlyBudget)}
                        </Typography>
                      </Stack>
                      <LinearProgress
                        variant="determinate"
                        value={Math.min(budget.percent, 100)}
                        color={budgetColor(budget.percent)}
                        sx={{ borderRadius: 999, height: 6 }}
                      />
                    </Stack>
                  ))}
                </Stack>
              </CardContent>
            </Card>
          ) : null}

          <Box
            sx={{
              display: "grid",
              gap: 1.25,
              gridTemplateColumns: { xs: "1fr", md: "minmax(0, 7fr) minmax(0, 5fr)" },
            }}
          >
            <Card>
              <CardContent>
                <Typography variant="subtitle1" gutterBottom>
                  Flujo diario del mes
                </Typography>
                <Box sx={{ width: "100%", overflowX: "auto" }}>
                  <LineChart
                    height={isMobile ? 220 : 260}
                    xAxis={[{ scaleType: "point", data: analytics.dailyCashflow.map((row) => row.day.slice(8)) }]}
                    series={[
                      { label: "Ingresos", color: "#16A34A", data: analytics.dailyCashflow.map((row) => row.income) },
                      { label: "Gastos", color: "#EF4444", data: analytics.dailyCashflow.map((row) => row.expense) },
                      { label: "Balance", color: "#6D5DFB", data: analytics.dailyCashflow.map((row) => row.balance) },
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
                <Typography variant="subtitle1" gutterBottom>
                  Distribucion de gastos
                </Typography>
                <Box sx={{ width: "100%", overflowX: "auto" }}>
                  <PieChart
                    height={isMobile ? 240 : 260}
                    series={[
                      {
                        data: analytics.expenseByCategory.map((row, index) => ({
                          id: `${row.category}-${index}`,
                          label: row.category,
                          value: row.total,
                        })),
                      },
                    ]}
                    slotProps={{
                      legend: isMobile
                        ? { direction: "horizontal", position: { vertical: "bottom", horizontal: "center" } }
                        : undefined,
                    }}
                    margin={isMobile ? { bottom: 70 } : undefined}
                  />
                </Box>
              </CardContent>
            </Card>
          </Box>



          <Card>
            <CardContent>
              <Typography variant="subtitle1" gutterBottom>
                Movimientos recientes
              </Typography>
              <Stack spacing={1}>
                {recent.length ? (
                  recent.map((movement) => (
                    <Box
                      key={movement.id}
                      sx={{
                        p: 1.2,
                        borderRadius: "16px",
                        bgcolor: "rgba(109, 93, 251, 0.05)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 1.2,
                      }}
                    >
                      <Stack direction="row" spacing={1.2} sx={{ alignItems: "center", minWidth: 0 }}>
                        <Avatar sx={{ bgcolor: movement.categoryColorHex ?? "#94a3b8", width: 36, height: 36 }}>
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
                      <Typography
                        variant="body2"
                        sx={{
                          fontWeight: 700,
                          flexShrink: 0,
                          color: movement.direction === "income" ? "success.main" : "error.main",
                        }}
                      >
                        {movement.direction === "income" ? "+" : "-"}
                        {formatCurrency(movement.amount, movement.currency)}
                      </Typography>
                    </Box>
                  ))
                ) : (
                  <Typography variant="body2" color="text.secondary">
                    Todavia no hay movimientos cargados.
                  </Typography>
                )}
              </Stack>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <Typography variant="subtitle1" gutterBottom>
                Alertas para decidir
              </Typography>
              <Stack spacing={1}>
                {insights.map((insight) => (
                  <Alert key={insight} severity="info">
                    {insight}
                  </Alert>
                ))}
              </Stack>
            </CardContent>
          </Card>
        </>
      )}

      <Drawer
        anchor="bottom"
        open={Boolean(breakdown)}
        onClose={() => setBreakdown(null)}
        slotProps={{
          paper: {
            sx: {
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              p: 2,
              pb: "calc(16px + env(safe-area-inset-bottom))",
              maxHeight: "70vh",
            },
          },
        }}
      >
        <Stack spacing={1.2}>
          <Typography variant="h6">{breakdownTitle}</Typography>
          <Stack spacing={1}>
            {breakdownRows.length ? (
              breakdownRows.map((account) => {
                const value =
                  breakdown === "balance"
                    ? account.balance
                    : breakdown === "income"
                      ? account.income
                      : account.expense;
                const color =
                  breakdown === "expense"
                    ? "error.main"
                    : breakdown === "income"
                      ? "success.main"
                      : value >= 0
                        ? "success.main"
                        : "error.main";

                return (
                  <Stack
                    key={account.accountId}
                    direction="row"
                    sx={{
                      justifyContent: "space-between",
                      alignItems: "center",
                      p: 1.2,
                      borderRadius: "14px",
                      bgcolor: "rgba(226, 232, 240, 0.3)",
                    }}
                  >
                    <Typography variant="body2" sx={{ fontWeight: 700 }} noWrap>
                      {account.accountName}
                    </Typography>
                    <Typography variant="body2" sx={{ fontWeight: 700, color }}>
                      {formatCurrency(value)}
                    </Typography>
                  </Stack>
                );
              })
            ) : (
              <Typography variant="body2" color="text.secondary">
                Sin movimientos este mes.
              </Typography>
            )}
          </Stack>
        </Stack>
      </Drawer>
    </Stack>
  );
}
