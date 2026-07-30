import {
  EXECUTION_IMPULSE_COUNT,
  LAST_EXECUTION_IMPULSE,
  type DailyAfterActionReport,
  type GameCommand,
  type GameState,
  type PlannedOrder,
  type PlannedReaction,
} from "@/engine/types";
import { applyCommand, replayCommands } from "@/engine/engine";
import {
  createSaveGame,
  migrateSaveGame,
} from "@/engine/persistence";
import { parseKey, sharedEdge } from "@/engine/hex";
import {
  setBridgeState,
  sharedEdgeKey,
} from "@/engine/edges";
import {
  createRaseiniaiWegoTestState,
  relocateWegoFixtureUnit,
} from "@/scenarios/baltic-1941/wego-test";
import {
  createWegoV041AcceptanceState,
  wegoV041AcceptanceCommands,
} from "@/scenarios/baltic-1941/wego-v041-acceptance";

export interface FullAcceptanceResult {
  initialState: GameState;
  commands: GameCommand[];
  state: GameState;
  aar?: DailyAfterActionReport;
  restoredState?: GameState;
}

function applyCommands(
  initialState: GameState,
  commands: readonly GameCommand[],
): GameState {
  let state = initialState;
  for (const command of commands) {
    const result = applyCommand(state, command);
    if (!result.ok) {
      throw new Error(
        result.errors
          .map((error) => `${error.code}: ${error.message}`)
          .join("; "),
      );
    }
    state = result.state;
  }
  return state;
}

const NEXT_PLANNING_COMMANDS: GameCommand[] = [
  { type: "END_PHASE" },
  { type: "END_PHASE" },
  { type: "END_PHASE" },
];

export function runMovementAndCombatAcceptanceFlow(
  seed = 22061941,
): FullAcceptanceResult {
  const initialState = createWegoV041AcceptanceState(seed);
  const commands = [
    ...wegoV041AcceptanceCommands(initialState),
    ...NEXT_PLANNING_COMMANDS,
  ];
  const state = applyCommands(initialState, commands);
  return {
    initialState,
    commands,
    state,
    aar: state.afterActionReport,
  };
}

function routeOrder(
  id: string,
  side: "germany" | "ussr",
  entityIds: string[],
  route: string[],
  priority: number,
): PlannedOrder {
  return {
    id,
    side,
    entityIds,
    orderType: "advance",
    route,
    targetHexId: route.at(-1),
    startImpulse: 0,
    priority,
    contactPolicy: "assault",
    lossTolerance: "high",
    remainingMovementBudget: 10,
    status: "draft",
  };
}

export function createReactionsAndPersistenceAcceptanceState(
  seed = 4102,
): GameState {
  const state = createRaseiniaiWegoTestState(seed);
  state.scenarioId = "baltic-1941";
  state.phase = "planning";
  state.activeSide = "germany";
  state.impulse = 0;
  state.plans = {
    germany: {
      side: "germany",
      orders: [],
      reactions: [],
      committed: false,
    },
    ussr: {
      side: "ussr",
      orders: [],
      reactions: [],
      committed: false,
    },
  };

  relocateWegoFixtureUnit(state, "sov-2td", "18_29");
  const exposedDefender = relocateWegoFixtureUnit(
    state,
    "sov-84md",
    "17_28",
  );
  exposedDefender.currentSteps = 1;
  exposedDefender.defense = 0;
  exposedDefender.organization = 5;
  exposedDefender.commandState = "disorganized";
  const attacker = state.units["ger-3mot"];
  attacker.attack = 30;
  attacker.organization = 100;
  attacker.fuel = 100;
  attacker.ammunition = 100;

  const bridgeEdge = sharedEdge(parseKey("16_29"), parseKey("17_29"));
  if (bridgeEdge == null) {
    throw new Error("Acceptance bridge edge is missing.");
  }
  setBridgeState(
    state,
    "16_29",
    bridgeEdge,
    "prepared_for_demolition",
  );
  const bridgeKey = sharedEdgeKey(state, "16_29", bridgeEdge);
  if (!bridgeKey) throw new Error("Acceptance bridge key is missing.");
  state.preparedBridgeDemolitions[bridgeKey] = {
    side: "ussr",
    preparedById: "sov-10sd",
  };

  const hq = state.headquarters["ger-hq-pzg4"];
  state.temporaryCommandEffects.push({
    id: "acceptance:future-cp",
    targetHqId: hq.id,
    commandPointModifier: 2,
    initiativeModifier: 0,
    startsAtTurn: state.turn + 1,
    expiresAfterTurn: state.turn + 2,
  });
  return state;
}

export function reactionsAndPersistenceAcceptanceCommands(
  state: GameState,
): GameCommand[] {
  const bridgeEdge = sharedEdge(parseKey("16_29"), parseKey("17_29"));
  if (bridgeEdge == null) {
    throw new Error("Acceptance bridge edge is missing.");
  }
  const fallbackReaction: PlannedReaction = {
    id: "acceptance:route-blocked",
    side: "germany",
    entityIds: ["ger-1pz"],
    condition: "route_blocked",
    targetHexId: "17_29",
    commandCost: 1,
    priority: 5,
    fromImpulse: 0,
    toImpulse: LAST_EXECUTION_IMPULSE,
    maxUses: 1,
    uses: 0,
    status: "draft",
    fallbackRoute: ["16_29", "15_29"],
  };
  const bridgeReaction: PlannedReaction = {
    id: "acceptance:bridge-demolition",
    side: "ussr",
    entityIds: ["sov-10sd"],
    condition: "enemy_approaches_bridge",
    targetHexId: "16_29",
    edge: bridgeEdge,
    commandCost: 1,
    priority: 5,
    fromImpulse: 0,
    toImpulse: LAST_EXECUTION_IMPULSE,
    maxUses: 1,
    uses: 0,
    status: "draft",
  };
  return [
    {
      type: "UPSERT_PLANNED_ORDER",
      side: "germany",
      plannedOrder: routeOrder(
        "acceptance:bridge-crossing",
        "germany",
        ["ger-1pz"],
        ["16_29", "17_29"],
        5,
      ),
    },
    {
      type: "UPSERT_PLANNED_ORDER",
      side: "germany",
      plannedOrder: routeOrder(
        "acceptance:hq-attack",
        "germany",
        ["ger-3mot"],
        ["16_28", "17_28"],
        4,
      ),
    },
    {
      type: "UPSERT_PLANNED_ORDER",
      side: "germany",
      plannedOrder: {
        id: "acceptance:reserve",
        side: "germany",
        entityIds: ["ger-6pz"],
        orderType: "reserve",
        startImpulse: 0,
        priority: 3,
        contactPolicy: "attack",
        lossTolerance: "normal",
        reserveData: {
          triggerRadius: 3,
          triggerConditions: ["friendly_contact"],
          targetPriority: ["17_28"],
          maxCommitImpulse: LAST_EXECUTION_IMPULSE,
        },
        status: "draft",
      },
    },
    {
      type: "UPSERT_REACTION",
      side: "germany",
      reaction: fallbackReaction,
    },
    {
      type: "UPSERT_REACTION",
      side: "ussr",
      reaction: bridgeReaction,
    },
    { type: "COMMIT_PLAN", side: "germany" },
    { type: "COMMIT_PLAN", side: "ussr" },
    ...Array.from(
      { length: EXECUTION_IMPULSE_COUNT },
      (): GameCommand => ({ type: "EXECUTE_IMPULSE" }),
    ),
    ...NEXT_PLANNING_COMMANDS,
  ];
}

export function runReactionsAndPersistenceAcceptanceFlow(
  seed = 4102,
): FullAcceptanceResult {
  const initialState = createReactionsAndPersistenceAcceptanceState(seed);
  const commands = reactionsAndPersistenceAcceptanceCommands(initialState);
  const state = applyCommands(initialState, commands);
  const save = createSaveGame(state, commands);
  const migrated = migrateSaveGame(save);
  if (!migrated.ok) {
    throw new Error(`${migrated.code}: ${migrated.message}`);
  }
  const restoredState = replayCommands(
    createReactionsAndPersistenceAcceptanceState(seed),
    migrated.save.commands,
  );
  return {
    initialState,
    commands,
    state,
    aar: state.afterActionReport,
    restoredState,
  };
}
