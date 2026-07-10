import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

// `startsWith(root)` alone would let a resolved path like `${root}baz` slip
// through when `root` has no trailing separator (e.g. root=/foo/bar would
// accept /foo/barbaz). Comparing the relative path instead only accepts
// paths that stay strictly inside `root`.
function isInsideRoot(root: string, absolutePath: string) {
  const relative = path.relative(root, absolutePath);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

const EXTENSIONS_BY_MIME: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

function getStorageRootAbsolutePath() {
  const baseStorageRoot = path.join(
    /* turbopackIgnore: true */ process.cwd(),
    "storage"
  );
  const configured = process.env.STORAGE_LOCAL_ROOT ?? "documents";
  const normalized = configured
    .replace(/^\.?[\\/]+/, "")
    .replace(/^storage[\\/]+/i, "")
    .replace(/\.\./g, "");
  return path.join(baseStorageRoot, normalized);
}

function sanitizeFilenamePart(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function extensionFromMime(mimeType: string, originalFilename: string | null) {
  const byMime = EXTENSIONS_BY_MIME[mimeType.toLowerCase()];
  if (byMime) {
    return byMime;
  }

  const ext = path.extname(originalFilename ?? "").replace(".", "").toLowerCase();
  if (!ext) {
    return "bin";
  }
  return sanitizeFilenamePart(ext);
}

export type StoredFile = {
  relativePath: string;
  absolutePath: string;
  sha256: string;
  sizeBytes: number;
  extension: string;
};

export async function saveFileToLocalStorage(
  input: Buffer,
  options: {
    userId: string;
    mimeType: string;
    originalFilename: string | null;
  }
): Promise<StoredFile> {
  const root = getStorageRootAbsolutePath();
  const now = new Date();
  const extension = extensionFromMime(options.mimeType, options.originalFilename);
  const fileName = `${randomUUID()}.${extension}`;
  const relativePath = path
    .join(
      sanitizeFilenamePart(options.userId),
      String(now.getUTCFullYear()),
      String(now.getUTCMonth() + 1).padStart(2, "0"),
      fileName
    )
    .replace(/\\/g, "/");
  const absolutePath = path.resolve(root, relativePath);

  if (!isInsideRoot(root, absolutePath)) {
    throw new Error("Ruta de almacenamiento invalida");
  }

  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, input);

  const sha256 = createHash("sha256").update(input).digest("hex");

  return {
    relativePath,
    absolutePath,
    sha256,
    sizeBytes: input.byteLength,
    extension,
  };
}

export async function readStoredFile(relativePath: string): Promise<Buffer> {
  const root = getStorageRootAbsolutePath();
  const absolutePath = path.resolve(root, relativePath);

  if (!isInsideRoot(root, absolutePath)) {
    throw new Error("Ruta de lectura invalida");
  }

  return readFile(absolutePath);
}
