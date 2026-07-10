"use client";

import ArrowBackOutlinedIcon from "@mui/icons-material/ArrowBackOutlined";
import ShoppingBasketOutlinedIcon from "@mui/icons-material/ShoppingBasketOutlined";
import {
  Alert,
  Avatar,
  Card,
  CardContent,
  IconButton,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { ListSkeleton } from "@/app/components/list-skeleton";
import { PageHero } from "@/app/components/page-hero";
import { apiFetch, formatCurrency } from "@/lib/client/http";

type ProductRow = {
  id: string;
  source: "catalog" | "manual";
  externalId: string | null;
  name: string;
  brand: string | null;
  category: string | null;
  imageUrl: string | null;
  purchaseCount: number;
  lastPaidPrice: number | null;
  lastPurchasedAt: string | null;
};

type ProductsResponse = {
  products: ProductRow[];
};

export default function ShoppingProductsPage() {
  const router = useRouter();
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const timer = setTimeout(async () => {
      try {
        const response = await apiFetch<ProductsResponse>(
          `/api/v1/shopping/products${query.trim() ? `?q=${encodeURIComponent(query.trim())}` : ""}`
        );
        if (!active) return;
        setProducts(response.products);
        setError(null);
      } catch (requestError) {
        if (!active) return;
        setError(
          requestError instanceof Error
            ? requestError.message
            : "No se pudieron cargar los productos"
        );
      } finally {
        if (active) setLoading(false);
      }
    }, query ? 300 : 0);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query]);

  return (
    <Stack spacing={2}>
      <PageHero
        title="Mis productos"
        subtitle="Todo lo que compraste o agregaste a listas, con su último precio."
        action={
          <IconButton size="small" onClick={() => router.push("/shopping")}>
            <ArrowBackOutlinedIcon fontSize="small" />
          </IconButton>
        }
      />

      <TextField
        size="small"
        label="Filtrar productos"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />

      {error ? <Alert severity="error">{error}</Alert> : null}

      {loading ? (
        <ListSkeleton rows={5} height={64} />
      ) : products.length === 0 ? (
        <Card>
          <CardContent>
            <Typography variant="body2" color="text.secondary">
              Todavía no hay productos. Se crean solos cuando agregás ítems a una lista.
            </Typography>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent sx={{ "&:last-child": { pb: 1.6 } }}>
            <Stack spacing={0.8}>
              {products.map((product) => (
                <Stack
                  key={product.id}
                  direction="row"
                  spacing={1}
                  onClick={() => router.push(`/shopping/products/${product.id}`)}
                  sx={{
                    p: 1,
                    borderRadius: "14px",
                    bgcolor: "rgba(226, 232, 240, 0.3)",
                    alignItems: "center",
                    cursor: "pointer",
                    "&:hover": { bgcolor: "rgba(226, 232, 240, 0.55)" },
                  }}
                >
                  <Avatar
                    variant="rounded"
                    src={product.imageUrl ?? undefined}
                    sx={{ width: 40, height: 40, bgcolor: "rgba(226,232,240,0.6)" }}
                  >
                    <ShoppingBasketOutlinedIcon fontSize="small" />
                  </Avatar>
                  <Stack sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                      {product.name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" noWrap>
                      {product.brand ?? (product.source === "manual" ? "Ítem libre" : "")}
                      {product.purchaseCount > 0
                        ? ` · comprado ${product.purchaseCount} ${product.purchaseCount === 1 ? "vez" : "veces"}`
                        : ""}
                    </Typography>
                  </Stack>
                  {product.lastPaidPrice != null ? (
                    <Stack sx={{ alignItems: "flex-end", flexShrink: 0 }}>
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>
                        {formatCurrency(product.lastPaidPrice)}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        último pagado
                      </Typography>
                    </Stack>
                  ) : null}
                </Stack>
              ))}
            </Stack>
          </CardContent>
        </Card>
      )}
    </Stack>
  );
}
