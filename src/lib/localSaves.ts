import type { GameCommand, GameState, SaveGame } from "@/engine/types";
import { createSaveGame } from "@/engine/persistence";

const LOCAL_SAVES_KEY = "baltic-front-1941:saves:v3";

export interface LocalSavedMatch {
  id: string;
  name: string;
  status: string;
  turn: number;
  date: string;
  activeSide: string;
  winner: string | null;
  resultType: string | null;
  updatedAt: string;
  storage: "local";
  save: SaveGame;
}

function isLocalSavedMatch(value: unknown): value is LocalSavedMatch {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Partial<LocalSavedMatch>;
  return (
    typeof item.id === "string" &&
    item.id.startsWith("local:") &&
    typeof item.name === "string" &&
    typeof item.updatedAt === "string" &&
    typeof item.save === "object" &&
    item.save !== null
  );
}

export function readLocalSaves(): LocalSavedMatch[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed: unknown = JSON.parse(
      window.localStorage.getItem(LOCAL_SAVES_KEY) ?? "[]",
    );
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isLocalSavedMatch);
  } catch {
    return [];
  }
}

export function writeLocalSave(
  state: GameState,
  commands: GameCommand[],
): LocalSavedMatch {
  const id = `local:${state.matchId}`;
  const item: LocalSavedMatch = {
    id,
    name: `Партия от ${state.date}`,
    status: state.status,
    turn: state.turn,
    date: state.date,
    activeSide: state.activeSide,
    winner: state.winner ?? null,
    resultType: state.resultType ?? null,
    updatedAt: new Date().toISOString(),
    storage: "local",
    save: createSaveGame(state, commands),
  };
  const remaining = readLocalSaves().filter((saved) => saved.id !== id);
  window.localStorage.setItem(
    LOCAL_SAVES_KEY,
    JSON.stringify([item, ...remaining].slice(0, 50)),
  );
  return item;
}

export function removeLocalSave(id: string): void {
  if (typeof window === "undefined") return;
  const remaining = readLocalSaves().filter((saved) => saved.id !== id);
  window.localStorage.setItem(LOCAL_SAVES_KEY, JSON.stringify(remaining));
}
