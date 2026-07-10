import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is required");
}

const databaseSsl = process.env.DATABASE_SSL;
const sslConfig =
  databaseSsl === "true"
    ? { rejectUnauthorized: false }
    : databaseSsl === "false"
      ? false
      : undefined;

const globalForDb = globalThis as unknown as { pgPool?: Pool };
const pool =
  globalForDb.pgPool ??
  new Pool({
    connectionString,
    ...(sslConfig === undefined ? {} : { ssl: sslConfig }),
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.pgPool = pool;
}

export { pool };
export const db = drizzle(pool);
