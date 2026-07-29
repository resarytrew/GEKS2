import { describe, expect, it } from "vitest";
import type {
  ContactState,
  GameState,
  PlannedOrder,
} from "@/engine/types";
import { applyCommand, replayCommands } from "@/engine/engine";
import {
  evaluateMovementStep,
  executePlannedOrder,
  type ImpulseExecutionContext,
} from "@/engine/order-execution";
import { directionForEdge, sharedEdgeKey, updateSharedEdge } from "@/engine/edges";
import { neighbors, parseKey, sharedEdge } from "@/engine/hex";
import { createRaseiniaiWegoTestState } from "@/scenarios/baltic-1941/wego-test";
import {
  createWegoV041AcceptanceState,
  wegoV041AcceptanceCommands,
} from "@/scenarios/baltic-1941/wego-v041-acceptance";

function context(impulse = 0): ImpulseExecutionContext {
  return { impulse, events: [], createdContactIds: [] };
}

function routeOrder(
  state: GameState,
  entityIds = ["ger-1pz"],
  route = ["16_29", "17_29"],
): PlannedOrder {
  return {
    id: "route",
    side: state.units[entityIds[0]].side,
    entityIds,
    orderType: "advance",
    route,
    startImpulse: 0,
    priority: 2,
    contactPolicy: "attack",
    lossTolerance: "normal",
    remainingMovementBudget: 10,
    status: "committed",
  };
}

function relocate(state: GameState, unitId: string, hexId: string): void {
  const unit = state.units[unitId];
  state.hexes[unit.hexId].stackUnitIds =
    state.hexes[unit.hexId].stackUnitIds.filter((id) => id !== unitId);
  unit.hexId = hexId;
  state.hexes[hexId].stackUnitIds.push(unitId);
}

function openRoute(state: GameState): string[] {
  const from = state.units["ger-1pz"].hexId;
  const target = neighbors(parseKey(from))
    .map(({ q, r }) => state.hexes[`${q}_${r}`])
    .find(
      (hex) =>
        hex &&
        hex.terrain !== "sea" &&
        hex.terrain !== "lake" &&
        hex.stackUnitIds.length === 0 &&
        Number.isFinite(
          evaluateMovementStep(
            state,
            routeOrder(state, ["ger-1pz"], [from, hex.id]),
            { fromHexId: from, toHexId: hex.id },
          ).movementCost,
        ),
    );
  if (!target) throw new Error("No open route");
  return [from, target.id];
}

function reserveContact(
  state: GameState,
  id: string,
  hexId: string,
  friendly = true,
  type: ContactState["type"] = "ATTACK",
): ContactState {
  const value: ContactState = {
    id,
    type,
    hexId,
    attackerSide: friendly ? "germany" : "ussr",
    defenderSide: friendly ? "ussr" : "germany",
    attackerParticipantIds: friendly ? ["ger-1pz"] : ["sov-2td"],
    defenderParticipantIds: [],
    attackerSupportIds: [],
    defenderSupportIds: [],
    attackerReserveIds: [],
    defenderReserveIds: [],
    detectedBy: ["germany", "ussr"],
    impulse: 0,
    status: "ready",
    resolved: false,
  };
  state.contacts.push(value);
  return value;
}

function reserveOrder(state: GameState): PlannedOrder {
  state.units["ger-6pz"].commandState = "in_command";
  return {
    id: "reserve",
    side: "germany",
    entityIds: ["ger-6pz"],
    orderType: "reserve",
    startImpulse: 0,
    priority: 2,
    contactPolicy: "fix",
    lossTolerance: "normal",
    reserveData: {
      triggerRadius: 4,
      triggerConditions: ["friendly_contact"],
      targetPriority: [],
      maxCommitImpulse: 2,
    },
    status: "committed",
  };
}

describe("v0.4.1 validated movement intents", () => {
  it("10. no meeting engagement without movement budget", () => {
    const state = createRaseiniaiWegoTestState();
    const result = evaluateMovementStep(state, routeOrder(state), {
      availableMovement: 0,
      allowEnemyOccupiedTarget: true,
    });
    expect(result.canEnter).toBe(false);
    expect(result.blockingReason).toContain("бюджета");
  });

  it("11. no meeting engagement without fuel", () => {
    const state = createRaseiniaiWegoTestState();
    state.units["ger-1pz"].fuel = 0;
    expect(evaluateMovementStep(state, routeOrder(state)).canEnter).toBe(false);
  });

  it("12. no meeting engagement through a destroyed bridge", () => {
    const state = createRaseiniaiWegoTestState();
    const edge = sharedEdge(parseKey("16_29"), parseKey("17_29"))!;
    updateSharedEdge(state, "16_29", directionForEdge(edge)!, (bridge) => ({
      edge,
      type: bridge?.type ?? "road",
      state: "destroyed",
    }));
    expect(evaluateMovementStep(state, routeOrder(state)).canEnter).toBe(false);
  });

  it("13. no meeting engagement with illegal stacking", () => {
    const state = createRaseiniaiWegoTestState();
    relocate(state, "ger-6pz", "17_29");
    state.units["ger-6pz"].stackingCost = 99;
    expect(evaluateMovementStep(state, routeOrder(state)).canEnter).toBe(false);
  });

  it("14. bridge demolition reacts only to a validated crossing", () => {
    const state = createRaseiniaiWegoTestState();
    state.phase = "execution";
    state.impulse = 0;
    const order = routeOrder(state);
    state.units["ger-1pz"].fuel = 0;
    state.plans.germany.orders = [order];
    const edge = sharedEdge(parseKey("16_29"), parseKey("17_29"))!;
    const key = sharedEdgeKey(state, "16_29", edge)!;
    state.preparedBridgeDemolitions[key] = { side: "ussr" };
    state.plans.ussr.reactions = [{
      id: "bridge",
      side: "ussr",
      entityIds: [],
      condition: "enemy_approaches_bridge",
      targetHexId: "16_29",
      edge,
      commandCost: 0,
      priority: 9,
      fromImpulse: 0,
      toImpulse: 5,
      maxUses: 1,
      uses: 0,
      status: "committed",
    }];
    const result = applyCommand(state, { type: "EXECUTE_IMPULSE" });
    expect(
      result.events.some((event) => event.type === "BRIDGE_DESTROYED"),
    ).toBe(false);
  });

  it("15. two valid opposing moves create exactly one contact", () => {
    let state = createWegoV041AcceptanceState();
    for (const command of wegoV041AcceptanceCommands(state).slice(0, 5)) {
      state = applyCommand(state, command).state;
    }
    expect(state.contacts).toHaveLength(1);
  });

  it("16. replay creates an identical meeting contact", () => {
    const initial = createWegoV041AcceptanceState(44);
    const commands = wegoV041AcceptanceCommands(initial).slice(0, 5);
    const left = replayCommands(initial, commands);
    const right = replayCommands(
      createWegoV041AcceptanceState(44),
      commands,
    );
    expect(right.contacts).toEqual(left.contacts);
  });

  it("17. units in different hexes cannot receive one route", () => {
    const state = createWegoV041AcceptanceState();
    const command = applyCommand(state, {
      type: "UPSERT_PLANNED_ORDER",
      side: "germany",
      plannedOrder: {
        ...routeOrder(state, ["ger-1pz", "ger-6pz"]),
        status: "draft",
      },
    });
    expect(command.ok).toBe(false);
    expect(command.errors[0]?.code).toBe("ORDER_UNITS_NOT_COLOCATED");
  });

  it("18. no unit moves when one group member cannot move", () => {
    const state = createRaseiniaiWegoTestState();
    relocate(state, "ger-6pz", "16_29");
    state.units["ger-6pz"].fuel = 0;
    const before = ["ger-1pz", "ger-6pz"].map((id) => state.units[id].hexId);
    executePlannedOrder(
      state,
      routeOrder(state, ["ger-1pz", "ger-6pz"]),
      context(),
    );
    expect(["ger-1pz", "ger-6pz"].map((id) => state.units[id].hexId)).toEqual(
      before,
    );
  });

  it("19. group route cannot teleport a detached unit", () => {
    const state = createRaseiniaiWegoTestState();
    const detachedHex = state.units["ger-6pz"].hexId;
    executePlannedOrder(
      state,
      routeOrder(state, ["ger-1pz", "ger-6pz"]),
      context(),
    );
    expect(state.units["ger-6pz"].hexId).toBe(detachedHex);
  });

  it("20. every moving group member spends its own fuel", () => {
    const state = createRaseiniaiWegoTestState();
    relocate(state, "ger-6pz", "16_29");
    const route = openRoute(state);
    const before = ["ger-1pz", "ger-6pz"].map((id) => state.units[id].fuel);
    executePlannedOrder(
      state,
      routeOrder(state, ["ger-1pz", "ger-6pz"], route),
      context(),
    );
    expect(state.units["ger-1pz"].fuel).toBeLessThan(before[0]);
    expect(state.units["ger-6pz"].fuel).toBeLessThan(before[1]);
  });
});

describe("v0.4.1 reserve triggers", () => {
  it("21. friendly-contact reserve reacts only to friendly contact", () => {
    const state = createRaseiniaiWegoTestState();
    reserveContact(state, "enemy-only", "17_29", false);
    const result = executePlannedOrder(state, reserveOrder(state), context());
    expect(result.status).toBe("delayed");
  });

  it("22. enemy-breakthrough reserve ignores an ordinary contact", () => {
    const state = createRaseiniaiWegoTestState();
    reserveContact(state, "ordinary", "17_29");
    const order = reserveOrder(state);
    order.reserveData!.triggerConditions = ["enemy_breakthrough"];
    expect(executePlannedOrder(state, order, context()).status).toBe("delayed");
  });

  it("23. priority target is selected before an unranked contact", () => {
    const state = createRaseiniaiWegoTestState();
    reserveContact(state, "unranked", "17_29");
    reserveContact(state, "priority", "17_30");
    const order = reserveOrder(state);
    order.reserveData!.targetPriority = ["17_30"];
    const ctx = context();
    executePlannedOrder(state, order, ctx);
    expect(
      ctx.events.find((event) => event.type === "RESERVE_COMMITTED"),
    ).toMatchObject({ contactId: "priority" });
  });

  it("24. reserve is not committed after its final impulse", () => {
    const state = createRaseiniaiWegoTestState();
    reserveContact(state, "late", "17_29");
    const order = reserveOrder(state);
    const result = executePlannedOrder(state, order, context(3));
    expect(result.status).toBe("completed");
    expect(state.contacts[0].attackerParticipantIds).not.toContain("ger-6pz");
  });

  it("25. an unused reserve order completes cleanly", () => {
    const state = createRaseiniaiWegoTestState();
    const order = reserveOrder(state);
    const ctx = context(2);
    expect(executePlannedOrder(state, order, ctx).status).toBe("completed");
    expect(ctx.events.some((event) => event.type === "RESERVE_NOT_COMMITTED")).toBe(
      true,
    );
  });
});
