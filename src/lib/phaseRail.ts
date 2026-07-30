import type { GamePhase, GameState } from "@/engine/types";

export interface PhaseRailItem {
  id: string;
  phase: GamePhase | GamePhase[];
  label: string;
  status: "completed" | "current" | "upcoming" | "locked" | "unavailable";
}

const WEGO_FLOW: Array<{ id: string; phase: GamePhase | GamePhase[]; label: string }> = [
  { id: "report", phase: "morning_report", label: "Сводка" },
  { id: "events", phase: ["events", "command"], label: "События и штабы" },
  { id: "planning", phase: "planning", label: "Планирование" },
  { id: "locked", phase: "plans_locked", label: "Планы запечатаны" },
  { id: "execution", phase: "execution", label: "Исполнение" },
  { id: "reaction", phase: "reaction", label: "Реакции" },
  { id: "supply", phase: "supply", label: "Снабжение" },
  { id: "after", phase: ["after_action", "end_of_day"], label: "Итоги" },
];

const LEGACY_FLOW: Array<{ id: string; phase: GamePhase | GamePhase[]; label: string }> = [
  { id: "report", phase: "morning_report", label: "Сводка" },
  { id: "events", phase: ["events", "command", "air"], label: "Подготовка" },
  { id: "activation", phase: ["activation", "combat", "exploitation"], label: "Активации" },
  { id: "supply", phase: "supply", label: "Снабжение" },
  { id: "after", phase: ["after_action", "end_of_day"], label: "Итоги" },
];

function contains(item: { phase: GamePhase | GamePhase[] }, phase: GamePhase) {
  return Array.isArray(item.phase) ? item.phase.includes(phase) : item.phase === phase;
}

/** Pure UI projection of engine phase; it never advances or calculates the game. */
export function getVisiblePhaseFlow(state: GameState): PhaseRailItem[] {
  const flow = state.mode === "legacy_debug" ? LEGACY_FLOW : WEGO_FLOW;
  const current = flow.findIndex((item) => contains(item, state.phase));
  return flow.map((item, index) => ({
    ...item,
    status: index === current ? "current" : index < current ? "completed" : item.id === "locked" && state.phase === "planning" ? "locked" : "upcoming",
  }));
}
