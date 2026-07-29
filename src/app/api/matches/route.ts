import { NextResponse, type NextRequest } from "next/server";
import { desc } from "drizzle-orm";
import { getDb } from "@/db";
import { matches } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ matches: [], storage: "local_only" });
  }
  const db = getDb();
  const rows = await db
    .select({
      id: matches.id,
      name: matches.name,
      scenarioId: matches.scenarioId,
      status: matches.status,
      turn: matches.turn,
      date: matches.date,
      activeSide: matches.activeSide,
      winner: matches.winner,
      resultType: matches.resultType,
      summary: matches.summary,
      updatedAt: matches.updatedAt,
    })
    .from(matches)
    .orderBy(desc(matches.updatedAt))
    .limit(50);
  return NextResponse.json({ matches: rows });
}

export async function POST(req: NextRequest) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json(
      { error: "DATABASE_NOT_CONFIGURED", storage: "local_only" },
      { status: 503 },
    );
  }
  const db = getDb();
  const body = await req.json();
  const [row] = await db
    .insert(matches)
    .values({
      name: body.name ?? "Партия Прибалтика 1941",
      scenarioId: body.scenarioId ?? "baltic-1941",
      status: body.status ?? "active",
      turn: body.turn ?? 1,
      date: body.date,
      activeSide: body.activeSide,
      winner: body.winner,
      resultType: body.resultType,
      commands: body.commands ?? [],
      summary: body.summary ?? {},
    })
    .returning();
  return NextResponse.json({ match: row });
}
