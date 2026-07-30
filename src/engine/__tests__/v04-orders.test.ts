import { describe, expect, it } from "vitest";
import {
  LAST_EXECUTION_IMPULSE,
  type GameState,
  type PlannedOrder,
  type PlannedOrderType,
  type UnitState,
} from "@/engine/types";
import {
  executePlannedOrder,
  movementBudgetForOrder,
  ORDER_COST,
  type ImpulseExecutionContext,
} from "@/engine/order-execution";
import { neighbors, parseKey, sharedEdge } from "@/engine/hex";
import { directionForEdge, updateSharedEdge } from "@/engine/edges";
import { createRaseiniaiWegoTestState } from "@/scenarios/baltic-1941/wego-test";

function context(impulse = 0): ImpulseExecutionContext {
  return { impulse, events: [], createdContactIds: [] };
}

function baseOrder(
  state: GameState,
  orderType: PlannedOrderType,
  entityIds = ["ger-1pz"],
): PlannedOrder {
  return {
    id: `test:${orderType}`,
    side: state.units[entityIds[0]].side,
    entityIds,
    orderType,
    startImpulse: 0,
    priority: 2,
    contactPolicy: "attack",
    lossTolerance: "normal",
    status: "committed",
  };
}

function firstOpenRoute(state: GameState, unit: UnitState): string[] {
  unit.supplyState = "full";
  const target = neighbors(parseKey(unit.hexId))
    .map((axial) => state.hexes[`${axial.q}_${axial.r}`])
    .find(
      (hex) =>
        hex &&
        hex.terrain !== "sea" &&
        hex.terrain !== "lake" &&
        hex.stackUnitIds.length === 0,
    );
  if (!target) throw new Error(`No route for ${unit.id}`);
  target.control = unit.side;
  return [unit.hexId, target.id];
}

function moveUnit(state: GameState, unitId: string, hexId: string): void {
  const unit = state.units[unitId];
  state.hexes[unit.hexId].stackUnitIds = state.hexes[
    unit.hexId
  ].stackUnitIds.filter((id) => id !== unitId);
  unit.hexId = hexId;
  if (!state.hexes[hexId].stackUnitIds.includes(unitId)) {
    state.hexes[hexId].stackUnitIds.push(unitId);
  }
}

describe("v0.4 order cost contract", () => {
  it.each(Object.keys(ORDER_COST) as PlannedOrderType[])(
    "%s has an explicit non-negative command cost",
    (orderType) => {
      expect(Number.isInteger(ORDER_COST[orderType])).toBe(true);
      expect(ORDER_COST[orderType]).toBeGreaterThanOrEqual(0);
    },
  );
});

describe("v0.4 impulse movement budgets", () => {
  it("gives march more movement than advance", () => {
    const state = createRaseiniaiWegoTestState();
    const march = movementBudgetForOrder(state, baseOrder(state, "march"));
    const advance = movementBudgetForOrder(state, baseOrder(state, "advance"));
    expect(march.available).toBeGreaterThan(advance.available);
  });

  it("reduces the budget when organization falls", () => {
    const state = createRaseiniaiWegoTestState();
    const order = baseOrder(state, "march");
    const ready = movementBudgetForOrder(state, order).available;
    state.units["ger-1pz"].organization = 40;
    expect(movementBudgetForOrder(state, order).available).toBeLessThan(ready);
  });

  it("reduces the budget for poor supply", () => {
    const state = createRaseiniaiWegoTestState();
    const order = baseOrder(state, "march");
    state.units["ger-1pz"].supplyState = "full";
    const full = movementBudgetForOrder(state, order).available;
    state.units["ger-1pz"].supplyState = "isolated";
    expect(movementBudgetForOrder(state, order).available).toBeLessThan(full);
  });

  it("reduces the budget at night", () => {
    const state = createRaseiniaiWegoTestState();
    const order = baseOrder(state, "march");
    state.impulse = 0;
    const day = movementBudgetForOrder(state, order).available;
    state.impulse = 5;
    expect(movementBudgetForOrder(state, order).available).toBeLessThan(day);
  });

  it("carries unused budget into the next impulse", () => {
    const state = createRaseiniaiWegoTestState();
    const order = baseOrder(state, "march");
    const withoutCarry = movementBudgetForOrder(state, order).available;
    order.remainingMovementBudget = 1.25;
    expect(movementBudgetForOrder(state, order).available).toBeCloseTo(
      withoutCarry + 1.25,
    );
  });

  it("returns zero for an unavailable formation", () => {
    const state = createRaseiniaiWegoTestState();
    state.units["ger-1pz"].eliminated = true;
    expect(
      movementBudgetForOrder(state, baseOrder(state, "march")).available,
    ).toBe(0);
  });
});

describe("v0.4 concrete order executors", () => {
  it("march moves a mobile unit and spends fuel", () => {
    const state = createRaseiniaiWegoTestState();
    const unit = state.units["ger-1pz"];
    const route = firstOpenRoute(state, unit);
    const order = { ...baseOrder(state, "march"), route };
    const fuel = unit.fuel;
    const result = executePlannedOrder(state, order, context());
    expect(["progressed", "completed"]).toContain(result.status);
    expect(unit.hexId).toBe(route[1]);
    expect(unit.fuel).toBeLessThan(fuel);
  });

  it("foot march does not consume fuel", () => {
    const state = createRaseiniaiWegoTestState();
    const unit = state.units["sov-10sd"];
    const route = firstOpenRoute(state, unit);
    const fuel = unit.fuel;
    executePlannedOrder(
      state,
      { ...baseOrder(state, "march", [unit.id]), route },
      context(),
    );
    expect(unit.fuel).toBe(fuel);
  });

  it("mobile march halts with empty fuel", () => {
    const state = createRaseiniaiWegoTestState();
    const unit = state.units["ger-1pz"];
    const route = firstOpenRoute(state, unit);
    unit.fuel = 0;
    const result = executePlannedOrder(
      state,
      { ...baseOrder(state, "march"), route },
      context(),
    );
    expect(result.status).toBe("delayed");
    expect(result.events.some((event) => event.type === "UNIT_HALTED_NO_FUEL")).toBe(
      true,
    );
  });

  it("advance creates contact against an occupied target", () => {
    const state = createRaseiniaiWegoTestState();
    const edge = sharedEdge(parseKey("16_29"), parseKey("17_29"));
    if (edge == null) throw new Error("Expected adjacent fixture hexes");
    updateSharedEdge(state, "16_29", directionForEdge(edge)!, (bridge) => ({
      edge,
      type: bridge?.type ?? "road",
      state: "intact",
    }));
    const order = {
      ...baseOrder(state, "advance"),
      route: ["16_29", "17_29"],
      remainingMovementBudget: 10,
    };
    const result = executePlannedOrder(state, order, context());
    expect(result.status).toBe("contact");
    expect(state.contacts[0]?.type).toBe("HASTY_ATTACK");
  });

  it("prepared attack creates a prepared contact", () => {
    const state = createRaseiniaiWegoTestState();
    const order = {
      ...baseOrder(state, "prepared_attack"),
      targetHexId: "17_29",
    };
    const result = executePlannedOrder(state, order, context());
    expect(result.status).toBe("contact");
    expect(state.contacts[0]?.type).toBe("PREPARED_ATTACK");
  });

  it("prepared attack fails with critical ammunition", () => {
    const state = createRaseiniaiWegoTestState();
    state.units["ger-1pz"].ammunition = 14;
    const result = executePlannedOrder(
      state,
      {
        ...baseOrder(state, "prepared_attack"),
        targetHexId: "17_29",
      },
      context(),
    );
    expect(result.status).toBe("failed");
    expect(state.contacts).toHaveLength(0);
  });

  it("defend improves posture over successive impulses", () => {
    const state = createRaseiniaiWegoTestState();
    const order = baseOrder(state, "defend");
    executePlannedOrder(state, order, context(0));
    executePlannedOrder(state, order, context(1));
    expect(state.units["ger-1pz"].defensivePosture?.level).toBe(2);
  });

  it("defend completes only after reaching posture level three", () => {
    const state = createRaseiniaiWegoTestState();
    const order = baseOrder(state, "defend");
    executePlannedOrder(state, order, context(0));
    executePlannedOrder(state, order, context(1));
    const result = executePlannedOrder(state, order, context(2));
    expect(result.status).toBe("completed");
    expect(order.status).toBe("completed");
  });

  it("delay remains active at its maximum posture", () => {
    const state = createRaseiniaiWegoTestState();
    const order = baseOrder(state, "delay");
    executePlannedOrder(state, order, context(0));
    executePlannedOrder(state, order, context(1));
    const result = executePlannedOrder(state, order, context(2));
    expect(result.status).toBe("progressed");
    expect(order.status).toBe("executing");
    expect(state.units["ger-1pz"].defensivePosture?.level).toBe(2);
  });

  it("withdraw follows its fallback route", () => {
    const state = createRaseiniaiWegoTestState();
    const unit = state.units["ger-1pz"];
    const route = firstOpenRoute(state, unit);
    const result = executePlannedOrder(
      state,
      { ...baseOrder(state, "withdraw"), route },
      context(),
    );
    expect(["progressed", "completed"]).toContain(result.status);
    expect(unit.hexId).toBe(route[1]);
  });

  it("recover restores organization under supply", () => {
    const state = createRaseiniaiWegoTestState();
    const unit = state.units["ger-1pz"];
    unit.supplyState = "full";
    unit.organization = 40;
    executePlannedOrder(state, baseOrder(state, "recover"), context());
    expect(unit.organization).toBeGreaterThan(40);
  });

  it("recover cannot restore organization without supply", () => {
    const state = createRaseiniaiWegoTestState();
    const unit = state.units["ger-1pz"];
    unit.supplyState = "none";
    unit.organization = 40;
    executePlannedOrder(state, baseOrder(state, "recover"), context());
    expect(unit.organization).toBe(40);
  });

  it("reserve joins an eligible friendly contact", () => {
    const state = createRaseiniaiWegoTestState();
    state.contacts.push({
      id: "contact:test",
      type: "ATTACK",
      hexId: "17_29",
      attackerSide: "germany",
      defenderSide: "ussr",
      attackerParticipantIds: ["ger-1pz"],
      defenderParticipantIds: ["sov-2td"],
      attackerSupportIds: [],
      defenderSupportIds: [],
      attackerReserveIds: [],
      defenderReserveIds: [],
      detectedBy: ["germany", "ussr"],
      impulse: 0,
      resolved: false,
      status: "ready",
    });
    const order = {
      ...baseOrder(state, "reserve", ["ger-6pz"]),
      reserveData: {
        triggerRadius: 3,
        triggerConditions: ["friendly_contact" as const],
        targetPriority: ["17_29"],
        maxCommitImpulse: LAST_EXECUTION_IMPULSE,
      },
    };
    const result = executePlannedOrder(state, order, context());
    expect(result.status).toBe("completed");
    expect(state.contacts[0].attackerParticipantIds).toContain("ger-6pz");
    expect(state.contacts[0].attackerReserveIds).not.toContain("ger-6pz");
  });

  it("demolition requires an engineer", () => {
    const state = createRaseiniaiWegoTestState();
    const result = executePlannedOrder(
      state,
      {
        ...baseOrder(state, "prepare_demolition"),
        bridgeHexId: "16_29",
        bridgeEdge: 0,
      },
      context(),
    );
    expect(result.status).toBe("failed");
  });

  it("pontoon requires a river edge", () => {
    const state = createRaseiniaiWegoTestState();
    const engineer = state.units["sov-10sd"];
    const order = {
      ...baseOrder(state, "build_pontoon", [engineer.id]),
      bridgeHexId: engineer.hexId,
      bridgeEdge: 0,
    };
    executePlannedOrder(state, order, context(0));
    const result = executePlannedOrder(state, order, context(1));
    expect(result.status).toBe("failed");
  });

  it("route-blocked reaction replaces the route with a fallback", () => {
    const state = createRaseiniaiWegoTestState();
    state.hexes["15_29"].control = "germany";
    const order = {
      ...baseOrder(state, "march"),
      route: ["16_29", "17_29"],
      contactPolicy: "avoid" as const,
      remainingMovementBudget: 10,
    };
    state.plans.germany.reactions.push({
      id: "reroute",
      side: "germany",
      entityIds: ["ger-1pz"],
      condition: "route_blocked",
      targetHexId: "17_29",
      commandCost: 1,
      priority: 3,
      fromImpulse: 0,
      toImpulse: LAST_EXECUTION_IMPULSE,
      maxUses: 1,
      uses: 0,
      status: "committed",
      fallbackRoute: ["16_29", "15_29"],
    });
    const result = executePlannedOrder(state, order, context());
    expect(result.status).toBe("delayed");
    expect(order.route).toEqual(["16_29", "15_29"]);
    expect(state.plans.germany.reactions[0].uses).toBe(1);
  });

  it("engineers complete a pontoon after two impulses", () => {
    const state = createRaseiniaiWegoTestState();
    const riverHex = Object.values(state.hexes).find(
      (hex) =>
        hex.riverEdges.length > 0 &&
        directionForEdge(hex.riverEdges[0]) != null,
    );
    if (!riverHex) throw new Error("Fixture has no river edge");
    const edge = riverHex.riverEdges[0];
    const direction = directionForEdge(edge)!;
    updateSharedEdge(state, riverHex.id, direction, (bridge) => ({
      edge,
      type: bridge?.type ?? "road",
      state: "destroyed",
    }));
    for (const unit of Object.values(state.units)) {
      if (unit.side !== "germany" || unit.entityType !== "combat_unit") continue;
      state.hexes[unit.hexId].stackUnitIds = state.hexes[
        unit.hexId
      ].stackUnitIds.filter((id) => id !== unit.id);
      unit.eliminated = true;
    }
    moveUnit(state, "sov-10sd", riverHex.id);
    const order = {
      ...baseOrder(state, "build_pontoon", ["sov-10sd"]),
      bridgeHexId: riverHex.id,
      bridgeEdge: edge,
    };
    expect(executePlannedOrder(state, order, context(0)).status).toBe(
      "progressed",
    );
    expect(executePlannedOrder(state, order, context(1)).status).toBe(
      "completed",
    );
    expect(order.status).toBe("completed");
  });
});
