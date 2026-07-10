import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "CuentasClaras",
    short_name: "Cuentas",
    description: "Gestiona gastos e ingresos desde una PWA pensada para celular.",
    start_url: "/",
    display: "standalone",
    background_color: "#f4f8f7",
    theme_color: "#14532d",
    shortcuts: [
      {
        name: "Carga rapida",
        short_name: "Carga",
        url: "/quick",
      },
      {
        name: "Inbox OCR",
        short_name: "Inbox",
        url: "/inbox",
      },
      {
        name: "Revisiones",
        short_name: "Revision",
        url: "/reviews",
      },
      {
        name: "Analisis mensual",
        short_name: "Analisis",
        url: "/analysis",
      },
    ],
    icons: [
      {
        src: "/favicon.ico",
        sizes: "any",
        type: "image/x-icon",
      },
    ],
  };
}
