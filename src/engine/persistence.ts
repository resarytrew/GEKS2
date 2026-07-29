import type { GameCommand, GameState, SaveGame } from "@/engine/types";
import { replayCommands } from "@/engine/engine";
import { createInitialState } from "@/scenarios/baltic-1941/scenario";

export const CURRENT_SCHEMA_VERSION = 5;
export const CURRENT_ENGINE_VERSION = "0.4.1";
export const CURRENT_SCENARIO_VERSION = "0.4.1";

export type SaveMigrationResult =
  | { ok: true; save: SaveGame; migratedFrom?: number; warnings: string[] }
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

function migrateCommand(command: GameCommand): GameCommand | undefined {
  if (
    command.type === "UPSERT_REACTION" &&
    command.reaction?.condition === "loss_threshold"
  ) {
    return undefined;
  }
  if (command.type !== "UPSERT_PLANNED_ORDER" || !command.plannedOrder) {
    return command;
  }
  const order = command.plannedOrder;
  return {
    ...command,
    plannedOrder: {
      ...order,
      priority: Number.isFinite(order.priority) ? order.priority : 1,
      contactPolicy: order.contactPolicy ?? "attack",
      lossTolerance: order.lossTolerance ?? "normal",
      status: order.status ?? "draft",
      progressIndex: order.progressIndex ?? 0,
      movementSpentThisImpulse: order.movementSpentThisImpulse ?? 0,
      remainingMovementBudget: order.remainingMovementBudget ?? 0,
    },
  };
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
  const sourceCommands = commandsFrom(value.commands);
  if (!sourceCommands) {
    return { ok: false, code: "INVALID_SAVE", message: "Журнал команд отсутствует или повреждён." };
  }
  const removedLossThreshold = sourceCommands.some(
    (command) =>
      command.type === "UPSERT_REACTION" &&
      command.reaction?.condition === "loss_threshold",
  );
  const commands = sourceCommands
    .map(migrateCommand)
    .filter((command): command is GameCommand => !!command);
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
  const sourceVersion = schemaVersion ?? 2;
  const warnings: string[] = [];
  if (removedLossThreshold) {
    warnings.push(
      "Устаревшая реакция loss_threshold удалена: порог потерь теперь задаётся lossTolerance приказа.",
    );
  }
  if (sourceVersion < CURRENT_SCHEMA_VERSION) {
    warnings.push(
      `Сохранение v${sourceVersion} перенесено в v${CURRENT_SCHEMA_VERSION}; WEGO-команды будут воспроизведены правилами v0.4.1.`,
    );
  }
  const save: SaveGame = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    engineVersion: CURRENT_ENGINE_VERSION,
    scenarioVersion: CURRENT_SCENARIO_VERSION,
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
    migratedFrom: sourceVersion,
    warnings,
  };
}

export function restoreSaveGame(input: unknown):
  | { ok: true; state: GameState; commands: GameCommand[]; migratedFrom?: number; warnings: string[] }
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
      warnings: migrated.warnings,
    };
  } catch {
    return {
      ok: false,
      code: "INVALID_SAVE",
      message: "Сохранение распознано, но журнал команд не удалось воспроизвести.",
    };
  }
}
