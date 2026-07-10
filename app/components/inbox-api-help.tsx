"use client";

import { Box, Card, CardContent, Stack, Typography } from "@mui/material";

const CURL_EXAMPLE = `curl -X POST https://tu-dominio/api/v1/inbox \\
  -H "Authorization: Bearer <tu-token>" \\
  -F "file=@comprobante.pdf"`;

export function InboxApiHelp() {
  return (
    <Card>
      <CardContent>
        <Stack spacing={1.2}>
          <Typography variant="subtitle1">Subir comprobantes por API</Typography>
          <Typography variant="body2" color="text.secondary">
            Pensado para automatizaciones (atajos de iOS, scripts, curl). Generá
            un token personal en Perfil y usalo en cada request — nunca compartas
            tu usuario y contraseña en una automatizacion.
          </Typography>
          <Typography variant="body2">
            <strong>Endpoint:</strong> <code>POST /api/v1/inbox</code>
          </Typography>
          <Typography variant="body2">
            <strong>Autenticacion:</strong> header <code>Authorization: Bearer &lt;token&gt;</code>
          </Typography>
          <Typography variant="body2">
            <strong>Formatos aceptados:</strong> PDF, JPG, PNG o WEBP
          </Typography>
          <Typography variant="body2">
            <strong>Formas de enviar el archivo:</strong> multipart/form-data (campo{" "}
            <code>file</code>), JSON (<code>fileBase64</code> o <code>fileDataUri</code>), o
            binario crudo en el body.
          </Typography>
          <Box
            component="pre"
            sx={{
              m: 0,
              p: 1.5,
              borderRadius: "12px",
              bgcolor: "rgba(15, 23, 42, 0.06)",
              fontSize: "0.75rem",
              overflowX: "auto",
            }}
          >
            {CURL_EXAMPLE}
          </Box>
        </Stack>
      </CardContent>
    </Card>
  );
}
