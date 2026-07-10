"use client";

import AssignmentTurnedInOutlinedIcon from "@mui/icons-material/AssignmentTurnedInOutlined";
import DeleteSweepOutlinedIcon from "@mui/icons-material/DeleteSweepOutlined";
import {
  Alert,
  Button,
  Card,
  CardContent,
  Chip,
  MenuItem,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { CategoryIcon } from "@/app/components/category-icons";
import { DocumentViewer } from "@/app/components/document-viewer";
import { InfoPopover } from "@/app/components/info-popover";
import { ListSkeleton } from "@/app/components/list-skeleton";
import { PageHero } from "@/app/components/page-hero";
import { apiFetch, formatCurrency } from "@/lib/client/http";
import { REVIEW_STATUS_LABELS } from "@/lib/shared/labels";
import { AccountDto, CategoryDto, ReviewDto } from "@/lib/shared/types";

type ReviewsResponse = {
  reviews: ReviewDto[];
};

type CategoriesResponse = {
  categories: CategoryDto[];
};

type AccountsResponse = {
  accounts: AccountDto[];
};

type RuleMode = "none" | "fixed_category" | "always_review";
type StatusFilter = "open" | "all" | "resolved" | "dismissed";

type ReviewForm = {
  categoryId: string;
  accountId: string;
  concept: string;
  notes: string;
  ruleMode: RuleMode;
};

function readableReason(reason: ReviewDto["reason"]) {
  switch (reason) {
    case "missing_fields":
      return "Faltan datos clave";
    case "low_confidence":
      return "Baja confianza";
    case "unknown_category":
      return "Categoria sin resolver";
    case "identity_ambiguous":
      return "Identidad ambigua";
    case "counterparty_ambiguous":
      return "Contraparte ambigua";
    case "account_ambiguous":
      return "Cuenta sin resolver";
    case "debt_match_ambiguous":
      return "Coincidencia de deuda ambigua";
    case "recurring_match_ambiguous":
      return "Coincidencia de gasto recurrente ambigua";
    default:
      return "Revision manual";
  }
}

function toApiStatus(filter: StatusFilter) {
  if (filter === "open") return "pending";
  return filter;
}

function ReviewsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const highlightId = searchParams.get("id");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(highlightId ? "all" : "open");
  const [reviews, setReviews] = useState<ReviewDto[] | null>(null);
  const [categories, setCategories] = useState<CategoryDto[]>([]);
  const [accounts, setAccounts] = useState<AccountDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [forms, setForms] = useState<Record<string, ReviewForm>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    const [reviewsData, categoriesData, accountsData] = await Promise.all([
      apiFetch<ReviewsResponse>(`/api/v1/reviews?status=${toApiStatus(statusFilter)}`),
      apiFetch<CategoriesResponse>("/api/v1/categories"),
      apiFetch<AccountsResponse>("/api/v1/accounts"),
    ]);
    setReviews(reviewsData.reviews);
    setCategories(categoriesData.categories);
    setAccounts(accountsData.accounts.filter((account) => account.isActive));
    setForms((previous) => {
      const next = { ...previous };
      for (const review of reviewsData.reviews) {
        if (!next[review.id]) {
          next[review.id] = {
            categoryId: review.transaction?.categoryId ?? "",
            accountId: review.transaction?.accountId ?? "",
            concept: review.transaction?.concept ?? "",
            notes: "",
            ruleMode: "none",
          };
        }
      }
      return next;
    });
  };

  useEffect(() => {
    let active = true;
    const boot = async () => {
      try {
        await load();
      } catch (requestError) {
        if (!active) return;
        setError(
          requestError instanceof Error ? requestError.message : "No se pudieron cargar revisiones"
        );
      }
    };
    void boot();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  const pendingCount = useMemo(
    () =>
      reviews?.filter((item) => item.status === "pending" || item.status === "in_progress")
        .length ?? 0,
    [reviews]
  );

  const visibleReviews = useMemo(() => {
    if (!highlightId || !reviews) return reviews;
    const match = reviews.find((item) => item.id === highlightId);
    return match ? [match] : reviews;
  }, [reviews, highlightId]);

  async function resolveReview(review: ReviewDto) {
    const form = forms[review.id];
    if (!form) return;
    setBusyId(review.id);
    setError(null);
    setNotice(null);

    try {
      await apiFetch(`/api/v1/reviews/${review.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          action: "resolve",
          categoryId: form.categoryId || null,
          accountId: form.accountId || null,
          concept: form.concept || null,
          notes: form.notes || null,
          ruleMode: form.ruleMode,
        }),
      });

      await load();
      setNotice("Revision resuelta.");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "No se pudo resolver");
    } finally {
      setBusyId(null);
    }
  }

  async function dismissReview(review: ReviewDto) {
    setBusyId(review.id);
    setError(null);
    setNotice(null);
    try {
      await apiFetch(`/api/v1/reviews/${review.id}`, {
        method: "PATCH",
        body: JSON.stringify({ action: "dismiss" }),
      });
      await load();
      setNotice("Revision descartada.");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "No se pudo descartar");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Stack spacing={2}>
      <PageHero
        title="Revision manual"
        subtitle="Confirma categoria y motivo cuando la IA no alcanza suficiente confianza."
        action={<Chip label={`Pendientes ${pendingCount}`} color="warning" />}
      />

      <Card>
        <CardContent>
          <Stack direction="row" spacing={0.5} sx={{ alignItems: "flex-start" }}>
            <Typography variant="body2" color="text.secondary">
              La IA no siempre puede confirmar sola un movimiento (por ejemplo, si
              no reconoce la categoria o la cuenta). Estos son los casos donde
              necesita que vos confirmes o corrijas los datos antes de guardarlo.
            </Typography>
            <InfoPopover ariaLabel="Que es la revision manual">
              <Typography variant="body2">
                Cuando subís un comprobante, la IA intenta reconocer el monto, la
                categoria, la cuenta y si sos vos quien envia o recibe el dinero.
              </Typography>
              <Typography variant="body2">
                Si no esta lo bastante segura de alguno de esos datos, en vez de
                adivinar y arriesgarse a equivocarse, guarda el movimiento acá para
                que lo confirmes o corrijas vos mismo con un par de clics.
              </Typography>
              <Typography variant="body2">
                Podes <strong>confirmar</strong> (guarda tus correcciones y crea el
                movimiento) o <strong>descartar</strong> (ignora este comprobante,
                no crea ningun movimiento).
              </Typography>
            </InfoPopover>
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Stack direction="row" spacing={1.5} sx={{ alignItems: "center", flexWrap: "wrap" }}>
            <ToggleButtonGroup
              value={statusFilter}
              exclusive
              onChange={(_event, value: StatusFilter | null) => {
                if (!value) return;
                setStatusFilter(value);
              }}
              size="small"
            >
              <ToggleButton value="open">Abiertas</ToggleButton>
              <ToggleButton value="all">Todas</ToggleButton>
              <ToggleButton value="resolved">Resueltas</ToggleButton>
              <ToggleButton value="dismissed">Descartadas</ToggleButton>
            </ToggleButtonGroup>
            {highlightId ? (
              <Button size="small" onClick={() => router.push("/reviews")}>
                Ver todas
              </Button>
            ) : null}
          </Stack>
        </CardContent>
      </Card>

      {error ? <Alert severity="error">{error}</Alert> : null}
      {notice ? <Alert severity="success">{notice}</Alert> : null}

      {!visibleReviews ? (
        <ListSkeleton rows={3} height={220} />
      ) : visibleReviews.length ? (
        visibleReviews.map((review) => {
          const form = forms[review.id] ?? {
            categoryId: "",
            accountId: "",
            concept: "",
            notes: "",
            ruleMode: "none" as RuleMode,
          };
          const direction = review.transaction?.direction;
          const extraction = review.details?.extraction as Record<string, unknown> | undefined;
          const suggestedCategory =
            typeof review.details?.categorySuggestion === "string"
              ? (review.details.categorySuggestion as string)
              : "";
          const suggestedAccount =
            typeof review.details?.accountSuggestion === "string"
              ? (review.details.accountSuggestion as string)
              : "";

          const filteredCategories = categories.filter((item) => {
            if (!direction) return true;
            return item.direction === "both" || item.direction === direction;
          });

          return (
            <Card key={review.id}>
              <CardContent>
                <Stack spacing={1.2}>
                  <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap" }}>
                    <Chip label={readableReason(review.reason)} color="default" />
                    <Chip label={REVIEW_STATUS_LABELS[review.status]} size="small" />
                    <Typography variant="caption" color="text.secondary">
                      {new Date(review.createdAt).toLocaleString("es-AR")}
                    </Typography>
                  </Stack>

                  <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap" }}>
                    <Typography variant="body2">
                      Documento: {review.document.originalFilename ?? "archivo sin nombre"}
                    </Typography>
                    {review.document.id ? (
                      <DocumentViewer
                        documentId={review.document.id}
                        mimeType={review.document.mimeType}
                      />
                    ) : null}
                  </Stack>
                  <Typography variant="body2">
                    Contraparte:{" "}
                    {review.transaction?.counterpartyName ??
                      (typeof extraction?.counterpartyName === "string"
                        ? extraction.counterpartyName
                        : "No detectada")}
                  </Typography>
                  <Typography variant="body2">
                    Monto:{" "}
                    {review.transaction?.amount
                      ? formatCurrency(review.transaction.amount, review.transaction.currency ?? "ARS")
                      : "No detectado"}
                  </Typography>
                  {suggestedCategory ? (
                    <Typography variant="body2" color="text.secondary">
                      Sugerencia IA (categoria): {suggestedCategory}
                    </Typography>
                  ) : null}
                  {suggestedAccount ? (
                    <Typography variant="body2" color="text.secondary">
                      Sugerencia IA (cuenta): {suggestedAccount}
                    </Typography>
                  ) : null}

                  <TextField
                    label="Categoria final"
                    select
                    value={form.categoryId}
                    onChange={(event) =>
                      setForms((previous) => ({
                        ...previous,
                        [review.id]: {
                          ...form,
                          categoryId: event.target.value,
                        },
                      }))
                    }
                  >
                    <MenuItem value="">Sin categoria</MenuItem>
                    {filteredCategories.map((category) => (
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
                    value={form.accountId}
                    onChange={(event) =>
                      setForms((previous) => ({
                        ...previous,
                        [review.id]: {
                          ...form,
                          accountId: event.target.value,
                        },
                      }))
                    }
                  >
                    <MenuItem value="">Sin cuenta</MenuItem>
                    {accounts.map((account) => (
                      <MenuItem key={account.id} value={account.id}>
                        {account.name}
                      </MenuItem>
                    ))}
                  </TextField>

                  <TextField
                    label="Concepto final"
                    value={form.concept}
                    onChange={(event) =>
                      setForms((previous) => ({
                        ...previous,
                        [review.id]: {
                          ...form,
                          concept: event.target.value,
                        },
                      }))
                    }
                  />

                  <TextField
                    label="Regla para proxima vez"
                    select
                    value={form.ruleMode}
                    onChange={(event) =>
                      setForms((previous) => ({
                        ...previous,
                        [review.id]: {
                          ...form,
                          ruleMode: event.target.value as RuleMode,
                        },
                      }))
                    }
                  >
                    <MenuItem value="none">No guardar regla</MenuItem>
                    <MenuItem value="fixed_category">Categoria fija para esta contraparte</MenuItem>
                    <MenuItem value="always_review">Siempre pedir motivo</MenuItem>
                  </TextField>

                  <TextField
                    label="Notas"
                    multiline
                    minRows={2}
                    value={form.notes}
                    onChange={(event) =>
                      setForms((previous) => ({
                        ...previous,
                        [review.id]: {
                          ...form,
                          notes: event.target.value,
                        },
                      }))
                    }
                  />

                  <Stack direction="row" spacing={1} sx={{ justifyContent: "flex-end", flexWrap: "wrap" }}>
                    <Button
                      variant="outlined"
                      color="error"
                      startIcon={<DeleteSweepOutlinedIcon />}
                      disabled={busyId === review.id}
                      onClick={() => void dismissReview(review)}
                    >
                      Descartar
                    </Button>
                    <Button
                      variant="contained"
                      startIcon={<AssignmentTurnedInOutlinedIcon />}
                      disabled={busyId === review.id}
                      onClick={() => void resolveReview(review)}
                    >
                      Confirmar
                    </Button>
                  </Stack>
                </Stack>
              </CardContent>
            </Card>
          );
        })
      ) : (
        <Card>
          <CardContent>
            <Typography variant="body2" color="text.secondary">
              No hay revisiones para el filtro seleccionado.
            </Typography>
          </CardContent>
        </Card>
      )}
    </Stack>
  );
}

export default function ReviewsPage() {
  return (
    <Suspense fallback={null}>
      <ReviewsPageContent />
    </Suspense>
  );
}
