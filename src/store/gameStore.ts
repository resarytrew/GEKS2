"use client";

import { create } from "zustand";
import type { GameCommand, GameEvent, GameState, Side, UnitState } from "@/engine/types";
import { applyCommand } from "@/engine/engine";
import { reachableHexes, predictCombat, type Reachable } from "@/engine/rules";
import { createInitialState, SCENARIO, type NewGameOptions } from "@/scenarios/baltic-1941/scenario";
import { createSaveGame } from "@/engine/persistence";
import { writeLocalSave } from "@/lib/localSaves";

export type Panel = "combat" | "objectives" | "log" | "report" | "endgame" | "help" | "save";

export interface Toast {
  id: number;
  text: string;
  side?: Side;
  kind: "info" | "combat" | "objective" | "event";
}

interface HistoryEntry {
  state: GameState;
  commands: GameCommand[];
}

interface StoreState {
  state: GameState | null;
  commands: GameCommand[];
  historyPast: HistoryEntry[];
  historyFuture: HistoryEntry[];
  selectedHexId: string | null;
  selectedUnitIds: string[];
  attackTargetHexId: string | null;
  planningRoute: string[] | null;
  reachable: Map<string, Reachable> | null;
  error: string | null;
  toasts: Toast[];
  openPanel: Panel | null;
  toastSeq: number;

  matchDbId: string | null;
  newGame: (opts?: NewGameOptions) => void;
  loadGame: (state: GameState, commands: GameCommand[]) => void;
  saveProgress: () => Promise<string | null>;
  dispatch: (cmd: GameCommand) => boolean;
  undo: () => boolean;
  redo: () => boolean;
  selectHex: (hexId: string | null) => void;
  toggleUnitInSelection: (unitId: string) => void;
  setSelection: (ids: string[]) => void;
  clearSelection: () => void;
  setAttackTarget: (hexId: string | null) => void;
  clearPlanningRoute: () => void;
  setPanel: (p: Panel | null) => void;
  dismissToast: (id: number) => void;
  clearError: () => void;
  recomputeReachable: () => void;
}

function unitsAt(state: GameState, hexId: string): UnitState[] {
  const hex = state.hexes[hexId];
  if (!hex) return [];
  return hex.stackUnitIds.map((id) => state.units[id]).filter((u) => u && !u.eliminated) as UnitState[];
}

function eventToText(e: GameEvent): { text: string; kind: Toast["kind"]; side?: Side } | null {
  switch (e.type) {
    case "UNIT_LOST_STEP": return { text: `Потеря шага: ${e.unitId}`, kind: "combat" };
    case "UNIT_ELIMINATED": return { text: `Соединение уничтожено: ${e.unitId}`, kind: "combat" };
    case "UNIT_RETREATED": return { text: `Отход соединения ${e.unitId}`, kind: "combat" };
    case "BRIDGE_DESTROYED": return { text: "Мост разрушен", kind: "info" };
    case "CARD_DRAWN": return { text: `Получена карта: ${e.defId}`, kind: "event", side: e.side };
    case "CARD_PLAYED": return { text: `Разыграна карта: ${e.defId}`, kind: "event" };
    case "OBJECTIVE_COMPLETED": return { text: "Цель выполнена!", kind: "objective", side: e.side };
    case "OBJECTIVE_FAILED": return { text: "Цель провалена", kind: "objective", side: e.side };
    case "EVENT_TRIGGERED": return { text: e.title, kind: "event" };
    case "WEATHER_CHANGED": return { text: `Погода: ${e.condition}`, kind: "event" };
    case "HEX_CONTROL_CHANGED": return null;
    case "GAME_COMPLETED": return { text: `Партия завершена: ${e.resultType}`, kind: "objective" };
    default: return null;
  }
}

export const useGame = create<StoreState>((set, get) => ({
  state: null,
  commands: [],
  historyPast: [],
  historyFuture: [],
  selectedHexId: null,
  selectedUnitIds: [],
  attackTargetHexId: null,
  planningRoute: null,
  reachable: null,
  error: null,
  toasts: [],
  openPanel: null,
  toastSeq: 1,
  matchDbId: null,

  newGame: (opts) => {
    const state = createInitialState({ mode: "hotseat", ...opts });
    set({
      state,
      commands: [],
      historyPast: [],
      historyFuture: [],
      selectedHexId: null,
      selectedUnitIds: [],
      attackTargetHexId: null,
      planningRoute: null,
      reachable: null,
      error: null,
      toasts: [{ id: 0, text: "22 июня 1941. Сводка готова.", kind: "event" }],
      openPanel: "report",
      toastSeq: 1,
      matchDbId: null,
    });
  },

  loadGame: (state, commands) => {
    set({
      state,
      commands,
      historyPast: [],
      historyFuture: [],
      selectedHexId: null,
      selectedUnitIds: [],
      attackTargetHexId: null,
      planningRoute: null,
      reachable: null,
      error: null,
      toasts: [],
      openPanel: null,
    });
  },

  saveProgress: async () => {
    const { state, commands, matchDbId } = get();
    if (!state) return null;
    const localSave = writeLocalSave(state, commands);
    set({ matchDbId: localSave.id });
    const summary = {
      ...createSaveGame(state, commands),
      commands: undefined,
      seed: state.seed,
      scores: state.scores,
      objectives: state.objectives.map((o) => ({ id: o.id, status: o.status })),
      matchId: state.matchId,
      mode: state.mode,
    };
    const payload = {
      name: `Партия от ${state.date}`,
      scenarioId: state.scenarioId,
      status: state.status,
      turn: state.turn,
      date: state.date,
      activeSide: state.activeSide,
      winner: state.winner,
      resultType: state.resultType,
      commands,
      summary,
    };
    try {
      const health = await fetch("/api/health");
      const healthState = await health.json();
      if (healthState.database !== "connected") return localSave.id;
      if (matchDbId && !matchDbId.startsWith("local:")) {
        await fetch(`/api/matches/${matchDbId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        return matchDbId;
      }
      const res = await fetch("/api/matches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data?.match?.id) {
        set({ matchDbId: data.match.id });
        return data.match.id as string;
      }
      return localSave.id;
    } catch {
      return localSave.id;
    }
  },

  dispatch: (cmd) => {
    const { state, commands, historyPast } = get();
    if (!state) return false;
    const res = applyCommand(state, cmd);
    if (!res.ok) {
      set({ error: res.errors[0]?.message ?? "Действие недоступно." });
      return false;
    }
    // Build toasts from new events.
    const seq = get().toastSeq;
    const toasts: Toast[] = [];
    let n = seq;
    for (const e of res.events) {
      const t = eventToText(e);
      if (t) {
        toasts.push({ id: n++, text: t.text, kind: t.kind, side: t.side });
      }
    }
    if (state.status !== "completed" && res.state.status === "completed") {
      setTimeout(() => set({ openPanel: "endgame" }), 600);
    }
    const prevPhase = state.phase;
    set({
      state: res.state,
      commands: cmd.type === "END_PHASE" || cmd.type === "END_ACTIVATION" ? [...commands, cmd] : [...commands, cmd],
      historyPast: [...historyPast, { state, commands }].slice(-40),
      historyFuture: [],
      error: null,
      toasts: [...get().toasts.slice(-4), ...toasts].slice(-6),
      toastSeq: n,
      // Reset transient selection context across phase boundaries.
      selectedUnitIds: prevPhase !== res.state.phase ? [] : get().selectedUnitIds.filter((id) => !res.state.units[id]?.eliminated && !res.state.units[id]?.acted),
      selectedHexId: prevPhase !== res.state.phase ? null : get().selectedHexId,
      attackTargetHexId: null,
      planningRoute:
        prevPhase !== res.state.phase ? null : get().planningRoute,
      openPanel:
        (res.state.phase === "morning_report" &&
          prevPhase !== "morning_report") ||
        (res.state.phase === "after_action" &&
          prevPhase !== "after_action")
          ? "report"
          : get().openPanel,
    });
    get().recomputeReachable();
    return true;
  },

  undo: () => {
    const { state, commands, historyPast, historyFuture } = get();
    const previous = historyPast.at(-1);
    if (!state || !previous) return false;
    set({
      state: previous.state,
      commands: previous.commands,
      historyPast: historyPast.slice(0, -1),
      historyFuture: [{ state, commands }, ...historyFuture].slice(0, 40),
      selectedHexId: null,
      selectedUnitIds: [],
      attackTargetHexId: null,
      planningRoute: null,
      reachable: null,
      error: null,
      openPanel: null,
      toasts: [
        ...get().toasts.slice(-4),
        { id: get().toastSeq, text: "Последнее действие отменено.", kind: "info" as const },
      ].slice(-6),
      toastSeq: get().toastSeq + 1,
    });
    return true;
  },

  redo: () => {
    const { state, commands, historyPast, historyFuture } = get();
    const next = historyFuture[0];
    if (!state || !next) return false;
    set({
      state: next.state,
      commands: next.commands,
      historyPast: [...historyPast, { state, commands }].slice(-40),
      historyFuture: historyFuture.slice(1),
      selectedHexId: null,
      selectedUnitIds: [],
      attackTargetHexId: null,
      planningRoute: null,
      reachable: null,
      error: null,
      openPanel: null,
      toasts: [
        ...get().toasts.slice(-4),
        { id: get().toastSeq, text: "Отменённое действие повторено.", kind: "info" as const },
      ].slice(-6),
      toastSeq: get().toastSeq + 1,
    });
    return true;
  },

  selectHex: (hexId) => {
    const st = get();
    const state = st.state;
    if (!state) return;
    if (!hexId) {
      set({
        selectedHexId: null,
        selectedUnitIds: [],
        reachable: null,
        planningRoute: null,
      });
      return;
    }
    const hex = state.hexes[hexId];
    if (!hex) return;
    const side = state.activeSide;
    const friendly = unitsAt(state, hexId).filter((u) => u.side === side);

    // Movement: selected friendly units + a reachable hex.
    if (st.selectedUnitIds.length > 0 && st.reachable?.has(hexId)) {
      const route = st.reachable.get(hexId)?.path;
      if (state.phase === "planning" && route) {
        set({
          selectedHexId: hexId,
          planningRoute: route,
          attackTargetHexId: null,
        });
        return;
      }
      const ok = get().dispatch({
        type: "MOVE_STACK",
        unitIds: st.selectedUnitIds,
        destinationHexId: hexId,
      });
      if (ok) {
        set({ selectedHexId: null, selectedUnitIds: [], reachable: null });
      }
      return;
    }
    // Attack: selected units + an enemy-occupied adjacent hex.
    const enemyOnHex = unitsAt(state, hexId).some((u) => u.side !== side);
    if (enemyOnHex) {
      set({
        selectedHexId: hexId,
        attackTargetHexId: hexId,
        openPanel: state.phase === "planning" ? null : "combat",
      });
      return;
    }
    // Otherwise: inspect / select.
    const ids = friendly.map((u) => u.id);
    set({
      selectedHexId: hexId,
      selectedUnitIds: ids,
      attackTargetHexId: null,
      planningRoute: null,
    });
    get().recomputeReachable();
  },

  toggleUnitInSelection: (unitId) => {
    const st = get();
    const ids = st.selectedUnitIds.includes(unitId)
      ? st.selectedUnitIds.filter((id) => id !== unitId)
      : [...st.selectedUnitIds, unitId];
    set({ selectedUnitIds: ids });
    get().recomputeReachable();
  },

  setSelection: (ids) => {
    set({ selectedUnitIds: ids });
    get().recomputeReachable();
  },

  clearSelection: () =>
    set({
      selectedHexId: null,
      selectedUnitIds: [],
      reachable: null,
      attackTargetHexId: null,
      planningRoute: null,
    }),

  setAttackTarget: (hexId) => {
    if (hexId) set({ attackTargetHexId: hexId, openPanel: "combat" });
    else set({ attackTargetHexId: null });
  },
  clearPlanningRoute: () => set({ planningRoute: null }),

  setPanel: (p) => set({ openPanel: p }),

  dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
  clearError: () => set({ error: null }),

  recomputeReachable: () => {
    const st = get();
    const state = st.state;
    if (!state) return;
    const ids = st.selectedUnitIds;
    if (
      ids.length === 0 ||
      (state.phase !== "planning" &&
        state.phase !== "activation" &&
        state.phase !== "exploitation")
    ) {
      set({ reachable: null });
      return;
    }
    const valid = ids.every(
      (id) => state.units[id] && state.units[id].side === state.activeSide && !state.units[id].acted && !state.units[id].eliminated,
    );
    if (!valid) {
      set({ reachable: null });
      return;
    }
    set({ reachable: reachableHexes(state, ids) });
  },
}));

export { predictCombat, SCENARIO, unitsAt };
