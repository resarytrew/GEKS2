import { getDb } from "@/db";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!process.env.DATABASE_URL) {
    return Response.json({
      ok: true,
      engine: "ready",
      database: "not_configured",
      persistence: "local_only",
    });
  }
  try {
    const db = getDb();
    await db.execute(sql`select 1`);
    return Response.json({
      ok: true,
      engine: "ready",
      database: "connected",
      persistence: "postgresql",
    });
  } catch {
    return Response.json(
      {
        ok: false,
        engine: "ready",
        database: "unavailable",
        persistence: "postgresql",
      },
      { status: 503 },
    );
  }
}
