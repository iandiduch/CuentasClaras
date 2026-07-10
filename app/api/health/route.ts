import { pool } from "@/lib/server/db";

export const runtime = "nodejs";

// Deliberately public (no requireUser): uptime monitors and load balancers
// need to reach this without a session.
export async function GET() {
  try {
    await pool.query("SELECT 1");
    return Response.json({ ok: true, timestamp: new Date().toISOString() });
  } catch (error) {
    console.error("[health] database check failed", error);
    return Response.json(
      { ok: false, error: "No se pudo conectar a la base de datos" },
      { status: 503 }
    );
  }
}
