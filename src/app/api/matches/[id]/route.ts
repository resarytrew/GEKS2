import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { matches } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json(
      { error: "DATABASE_NOT_CONFIGURED", storage: "local_only" },
      { status: 503 },
    );
  }
  const db = getDb();
  const { id } = await ctx.params;
  const [row] = await db.select().from(matches).where(eq(matches.id, id)).limit(1);
  if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ match: row });
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json(
      { error: "DATABASE_NOT_CONFIGURED", storage: "local_only" },
      { status: 503 },
    );
  }
  const db = getDb();
  const { id } = await ctx.params;
  const body = await req.json();
  const [row] = await db
    .update(matches)
    .set({
      status: body.status,
      turn: body.turn,
      date: body.date,
      activeSide: body.activeSide,
      winner: body.winner,
      resultType: body.resultType,
      commands: body.commands,
      summary: body.summary,
      updatedAt: new Date(),
    })
    .where(eq(matches.id, id))
    .returning();
  return NextResponse.json({ match: row });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json(
      { error: "DATABASE_NOT_CONFIGURED", storage: "local_only" },
      { status: 503 },
    );
  }
  const db = getDb();
  const { id } = await ctx.params;
  await db.delete(matches).where(eq(matches.id, id));
  return NextResponse.json({ ok: true });
}
