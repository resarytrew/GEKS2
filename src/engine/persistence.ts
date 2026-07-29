import type { GameCommand, GameState, SaveGame } from "@/engine/types";
import { replayCommands } from "@/engine/engine";
import { createInitialState } from "@/scenarios/baltic-1941/scenario";

export const CURRENT_SCHEMA_VERSION = 3;

export type SaveMigrationResult =
  | { ok: true; save: SaveGame; migratedFrom?: number }
  | { ok: false; code: "INVALID_SAVE" | "UNSUPPORTED_SCHEMA"; message: string };

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

function commandsFrom(value: unknown): GameCommand[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const commands: GameCommand[] = [];
  for (const item of value) {
    const candidate = record(item);
    if (!candidate || typeof candidate.type !== "string") return undefined;
    commands.push(candidate as unknown as GameCommand);
  }
  return commands;
}

export function createSaveGame(state: GameState, commands: GameCommand[]): SaveGame {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    engineVersion: state.engineVersion,
    scenarioVersion: state.scenarioVersion,
    stateVersion: state.version,
    scenarioId: state.scenarioId,
    matchId: state.matchId,
    mode: state.mode,
    seed: state.seed,
    commands: structuredClone(commands),
  };
}

export function migrateSaveGame(input: unknown): SaveMigrationResult {
  const value = record(input);
  if (!value) {
    return { ok: false, code: "INVALID_SAVE", message: "Сохранение не является объектом." };
  }
  const schemaVersion =
    typeof value.schemaVersion === "number" ? value.schemaVersion : undefined;
  if (schemaVersion != null && schemaVersion > CURRENT_SCHEMA_VERSION) {
    return {
      ok: false,
      code: "UNSUPPORTED_SCHEMA",
      message: `Сохранение версии ${schemaVersion} новее поддерживаемой версии ${CURRENT_SCHEMA_VERSION}.`,
    };
  }
  const legacySummary = record(value.summary);
  const commands = commandsFrom(value.commands);
  if (!commands) {
    return { ok: false, code: "INVALID_SAVE", message: "Журнал команд отсутствует или повреждён." };
  }
  const seed =
    typeof value.seed === "number"
      ? value.seed
      : typeof legacySummary?.seed === "number"
        ? legacySummary.seed
        : undefined;
  if (seed == null || !Number.isFinite(seed)) {
    return { ok: false, code: "INVALID_SAVE", message: "В сохранении отсутствует допустимый seed." };
  }
  const scenarioId =
    typeof value.scenarioId === "string" ? value.scenarioId : "baltic-1941";
  if (scenarioId !== "baltic-1941") {
    return {
      ok: false,
      code: "UNSUPPORTED_SCHEMA",
      message: `Сценарий ${scenarioId} не поддерживается этой сборкой.`,
    };
  }
  const save: SaveGame = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    engineVersion:
      typeof value.engineVersion === "string" ? value.engineVersion : "0.2.0",
    scenarioVersion:
      typeof value.scenarioVersion === "string" ? value.scenarioVersion : "0.2.0",
    stateVersion: typeof value.stateVersion === "number" ? value.stateVersion : 1,
    scenarioId,
    matchId:
      typeof value.matchId === "string"
        ? value.matchId
        : typeof legacySummary?.matchId === "string"
          ? legacySummary.matchId
          : "migrated-local-match",
    mode:
      typeof value.mode === "string"
        ? value.mode
        : typeof legacySummary?.mode === "string"
          ? legacySummary.mode
          : "legacy_debug",
    seed,
    commands,
  };
  return {
    ok: true,
    save,
    migratedFrom: schemaVersion ?? 2,
  };
}

export function restoreSaveGame(input: unknown):
  | { ok: true; state: GameState; commands: GameCommand[]; migratedFrom?: number }
  | { ok: false; code: string; message: string } {
  const migrated = migrateSaveGame(input);
  if (!migrated.ok) return migrated;
  try {
    const initial = createInitialState({
      seed: migrated.save.seed,
      matchId: migrated.save.matchId,
      mode: migrated.save.mode,
    });
    const state = replayCommands(initial, migrated.save.commands);
    return {
      ok: true,
      state,
      commands: migrated.save.commands,
      migratedFrom: migrated.migratedFrom,
    };
  } catch {
    return {
      ok: false,
      code: "INVALID_SAVE",
      message: "Сохранение распознано, но журнал команд не удалось воспроизвести.",
    };
  }
}
