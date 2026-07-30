import {
  EXECUTION_IMPULSE_COUNT,
  type GameCommand,
  type GameState,
  type PlannedOrder,
} from "@/engine/types";
import { applyCommand } from "@/engine/engine";
import { createRaseiniaiWegoTestState } from "@/scenarios/baltic-1941/wego-test";

function order(
  state: GameState,
  side: "germany" | "ussr",
  unitId: string,
  route: string[],
  supportIds: string[],
): PlannedOrder {
  return {
    id: `acceptance:${side}`,
    side,
    entityIds: [unitId],
    orderType: "advance",
    route,
    targetHexId: route.at(-1),
    startImpulse: 0,
    priority: 3,
    contactPolicy: "attack",
    lossTolerance: "normal",
    supportIds,
    remainingMovementBudget: 10,
    status: "draft",
  };
}

export function createWegoV041AcceptanceState(
  seed = 22061941,
): GameState {
  const state = createRaseiniaiWegoTestState(seed);
  state.phase = "planning";
  state.activeSide = "germany";
  state.impulse = 0;
  state.plans = {
    germany: { side: "germany", orders: [], reactions: [], committed: false },
    ussr: { side: "ussr", orders: [], reactions: [], committed: false },
  };
  state.headquarters["ger-hq-xxxi"].commQuality = 5;
  state.headquarters["sov-hq-3mc"].commQuality = 5;
  return state;
}

export function wegoV041AcceptanceCommands(
  state: GameState,
): GameCommand[] {
  return [
    {
      type: "UPSERT_PLANNED_ORDER",
      side: "germany",
      plannedOrder: order(
        state,
        "germany",
        "ger-1pz",
        ["16_29", "17_29"],
        ["ger-269"],
      ),
    },
    {
      type: "UPSERT_PLANNED_ORDER",
      side: "ussr",
      plannedOrder: {
        ...order(
          state,
          "ussr",
          "sov-2td",
          ["17_29", "16_29"],
          ["sov-48sd"],
        ),
        lossTolerance: "high",
      },
    },
    { type: "COMMIT_PLAN", side: "germany" },
    { type: "COMMIT_PLAN", side: "ussr" },
    ...Array.from(
      { length: EXECUTION_IMPULSE_COUNT },
      (): GameCommand => ({ type: "EXECUTE_IMPULSE" }),
    ),
  ];
}

export function runWegoV041AcceptanceDay(
  seed = 22061941,
): GameState {
  let state = createWegoV041AcceptanceState(seed);
  for (const command of wegoV041AcceptanceCommands(state)) {
    const result = applyCommand(state, command);
    if (!result.ok) {
      throw new Error(
        result.errors.map((error) => `${error.code}: ${error.message}`).join("; "),
      );
    }
    state = result.state;
  }
  return state;
}
