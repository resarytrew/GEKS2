import { NextResponse, type NextRequest } from "next/server";
import { applyCommand } from "@/engine/engine";
import { restoreSaveGame } from "@/engine/persistence";
import { sanitizeStateForSide } from "@/engine/wego";
import type { GameCommand, Side } from "@/engine/types";

export const dynamic = "force-dynamic";

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

export async function POST(request: NextRequest) {
  const body = record(await request.json());
  if (!body) return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });
  const side = body.side;
  if (side !== "germany" && side !== "ussr") {
    return NextResponse.json({ error: "INVALID_SIDE" }, { status: 400 });
  }
  const headerSide = request.headers.get("x-match-side");
  if (headerSide !== side) {
    return NextResponse.json({ error: "MATCH_ACCESS_DENIED" }, { status: 403 });
  }
  const localToken = process.env.LOCAL_MATCH_TOKEN;
  if (
    process.env.NODE_ENV === "production" &&
    (!localToken || request.headers.get("x-local-match-token") !== localToken)
  ) {
    return NextResponse.json(
      { error: "DEVELOPMENT_ADAPTER_DISABLED" },
      { status: 503 },
    );
  }
  const commandRecord = record(body.command);
  if (!commandRecord || typeof commandRecord.type !== "string") {
    return NextResponse.json({ error: "INVALID_COMMAND" }, { status: 400 });
  }
  const forbidden = ["eventLog", "scores", "state", "result", "rngResult"];
  if (forbidden.some((key) => key in commandRecord)) {
    return NextResponse.json({ error: "CLIENT_RESULT_REJECTED" }, { status: 400 });
  }
  if (
    typeof commandRecord.expectedVersion !== "number" ||
    typeof commandRecord.commandId !== "string" ||
    commandRecord.commandId.length < 4
  ) {
    return NextResponse.json(
      { error: "VERSION_AND_IDEMPOTENCY_REQUIRED" },
      { status: 400 },
    );
  }
  const restored = restoreSaveGame({
    schemaVersion: body.schemaVersion,
    engineVersion: body.engineVersion,
    scenarioVersion: body.scenarioVersion,
    stateVersion: body.stateVersion,
    scenarioId: body.scenarioId ?? "baltic-1941",
    matchId: body.matchId,
    mode: body.mode ?? "hotseat",
    seed: body.seed,
    commands: body.commands,
  });
  if (!restored.ok) {
    return NextResponse.json(
      { error: restored.code, message: restored.message },
      { status: 400 },
    );
  }
  const command = { ...commandRecord, side } as unknown as GameCommand;
  const result = applyCommand(restored.state, command);
  if (!result.ok) {
    return NextResponse.json(
      { error: "COMMAND_REJECTED", reasons: result.errors, version: restored.state.version },
      { status: 409 },
    );
  }
  const viewer = side as Side;
  return NextResponse.json({
    ok: true,
    version: result.state.version,
    events: result.events,
    state: sanitizeStateForSide(result.state, viewer),
  });
}
