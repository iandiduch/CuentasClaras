export const ALLOWED_UPLOAD_MIME_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
]);

// Bytes are the only thing we trust for MIME detection — a client-declared
// type (form field, JSON field, header) is never used, since it's trivial to
// spoof and used to let a mislabeled file slip past the allow-list.
export function detectMimeFromBytes(buffer: Buffer): string | null {
  if (buffer.length >= 4) {
    if (
      buffer[0] === 0x25 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x44 &&
      buffer[3] === 0x46
    ) {
      return "application/pdf";
    }
  }

  if (buffer.length >= 3) {
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
      return "image/jpeg";
    }
  }

  if (buffer.length >= 8) {
    if (
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47 &&
      buffer[4] === 0x0d &&
      buffer[5] === 0x0a &&
      buffer[6] === 0x1a &&
      buffer[7] === 0x0a
    ) {
      return "image/png";
    }
  }

  if (buffer.length >= 12) {
    if (
      buffer[0] === 0x52 &&
      buffer[1] === 0x49 &&
      buffer[2] === 0x46 &&
      buffer[3] === 0x46 &&
      buffer[8] === 0x57 &&
      buffer[9] === 0x45 &&
      buffer[10] === 0x42 &&
      buffer[11] === 0x50
    ) {
      return "image/webp";
    }
  }

  return null;
}

export function resolveVerifiedMime(buffer: Buffer): string | null {
  const sniffed = detectMimeFromBytes(buffer);
  return sniffed && ALLOWED_UPLOAD_MIME_TYPES.has(sniffed) ? sniffed : null;
}
