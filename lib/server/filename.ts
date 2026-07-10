const EXTENSION_BY_MIME: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export function resolveDisplayFilename(
  originalFilename: string | null,
  uploadedAt: Date | string | null,
  mimeType: string | null
): string {
  if (originalFilename) {
    return originalFilename;
  }

  const date = uploadedAt ? new Date(uploadedAt) : null;
  const dateLabel =
    date && !Number.isNaN(date.getTime()) ? date.toLocaleDateString("es-AR") : "sin fecha";
  const extension = (mimeType && EXTENSION_BY_MIME[mimeType.toLowerCase()]) || "archivo";

  return `Comprobante ${dateLabel}.${extension}`;
}
