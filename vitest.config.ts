import path from "node:path";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Mirrors the "@/*" -> "./*" path mapping in tsconfig.json.
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
    // DB-backed integration tests hit a real Postgres connection per test
    // file; keep them from trampling each other via parallel workers.
    fileParallelism: false,
  },
});
