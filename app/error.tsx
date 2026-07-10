"use client";

import { useEffect } from "react";
import RefreshOutlinedIcon from "@mui/icons-material/RefreshOutlined";
import { Box, Button, Stack, Typography } from "@mui/material";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app/error]", error);
  }, [error]);

  return (
    <Box
      sx={{
        display: "flex",
        minHeight: "100dvh",
        alignItems: "center",
        justifyContent: "center",
        p: 3,
      }}
    >
      <Stack spacing={2} sx={{ maxWidth: 360, textAlign: "center", alignItems: "center" }}>
        <Typography variant="h5">Algo salió mal</Typography>
        <Typography variant="body2" color="text.secondary">
          Hubo un error inesperado al cargar esta pantalla. Tu sesión y tus datos están a salvo
          — probá de nuevo.
        </Typography>
        <Button
          variant="contained"
          size="large"
          startIcon={<RefreshOutlinedIcon />}
          onClick={() => reset()}
        >
          Reintentar
        </Button>
      </Stack>
    </Box>
  );
}
