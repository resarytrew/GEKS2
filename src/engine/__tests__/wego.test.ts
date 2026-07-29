import { describe, expect, it } from "vitest";
import { applyCommand, replayCommands } from "@/engine/engine";
import { directionForEdge, setBridgeState, sharedEdgeKey } from "@/engine/edges";
import { neighbors, parseKey } from "@/engine/hex";
import { commandInfo, reachableHexes } from "@/engine/rules";
import {
  assessOrderReliability,
  sanitizeStateForSide,
} from "@/engine/wego";
import { createInitialState } from "@/scenarios/baltic-1941/scenario";
import type {
  GameCommand,
  GameState,
  PlannedOrder,
  PlannedReaction,
  Side,
  UnitState,
} from "@/engine/types";

function planning(seed = 22061941): GameState {
  let state = createInitialState({ seed, matchId: "wego-test", mode: "hotseat" });
  state = applyCommand(state, { type: "END_PHASE" }).state;
  state = applyCommand(state, { type: "END_PHASE" }).state;
  expect(state.phase).toBe("planning");
  return state;
}

function moveUnit(state: GameState, unit: UnitState, hexId: string): void {
  state.hexes[unit.hexId].stackUnitIds = state.hexes[unit.hexId].stackUnitIds.filter(
    (id) => id !== unit.id,
  );
  unit.hexId = hexId;
  if (!state.hexes[hexId].stackUnitIds.includes(unit.id)) {
    state.hexes[hexId].stackUnitIds.push(unit.id);
  }
}

function firstRoute(state: GameState, side: Side): { unit: UnitState; route: string[] } {
  for (const unit of Object.values(state.units)) {
    if (unit.side !== side || unit.entityType !== "combat_unit") continue;
    const route = [...reachableHexes(state, [unit.id]).values()][0]?.path;
    if (route?.length && route.length >= 2) return { unit, route: route.slice(0, 2) };
  }
  throw new Error(`route unavailable for ${side}`);
}

function order(
  side: Side,
  unit: UnitState,
  route: string[],
  id = `order-${side}`,
): PlannedOrder {
  return {
    id,
    side,
    entityIds: [unit.id],
    orderType: "march",
    route,
    startImpulse: 0,
    priority: 1,
    contactPolicy: "attack",
    lossTolerance: "normal",
    status: "draft",
  };
}

function upsert(state: GameState, plannedOrder: PlannedOrder): GameState {
  const result = applyCommand(state, {
    type: "UPSERT_PLANNED_ORDER",
    side: plannedOrder.side,
    plannedOrder,
  });
  expect(result.ok).toBe(true);
  return result.state;
}

function commit(state: GameState, side: Side): GameState {
  const result = applyCommand(state, { type: "COMMIT_PLAN", side });
  expect(result.ok).toBe(true);
  return result.state;
}

describe("WEGO planning and secrecy", () => {
  it("lets both sides create simultaneous plans", () => {
    let state = planning();
    const german = firstRoute(state, "germany");
    const soviet = firstRoute(state, "ussr");
    state = upsert(state, order("germany", german.unit, german.route));
    state = upsert(state, order("ussr", soviet.unit, soviet.route));
    expect(state.plans.germany.orders).toHaveLength(1);
    expect(state.plans.ussr.orders).toHaveLength(1);
  });

  it("does not enter execution until both plans are committed", () => {
    let state = planning();
    state = commit(state, "germany");
    expect(state.phase).toBe("planning");
    expect(state.activeSide).toBe("ussr");
    state = commit(state, "ussr");
    expect(state.phase).toBe("execution");
    expect(state.eventLog.some((event) => event.type === "PLANS_LOCKED")).toBe(true);
  });

  it("rejects changing a committed plan", () => {
    let state = planning();
    const german = firstRoute(state, "germany");
    state = upsert(state, order("germany", german.unit, german.route));
    state = commit(state, "germany");
    const result = applyCommand(state, {
      type: "REMOVE_PLANNED_ORDER",
      side: "germany",
      plannedOrderId: "order-germany",
    });
    expect(result.ok).toBe(false);
    expect(result.errors[0].code).toBe("PLAN_ALREADY_COMMITTED");
  });

  it("hides the opponent plan until contact reveals its entities", () => {
    let state = planning();
    const german = firstRoute(state, "germany");
    state = upsert(state, order("germany", german.unit, german.route));
    expect(sanitizeStateForSide(state, "ussr").plans.germany.orders).toEqual([]);
    state.contacts.push({
      id: "seen",
      hexId: german.route[1],
      entityIds: [german.unit.id],
      type: "ATTACK",
      impulse: 0,
      detectedBy: ["ussr"],
      resolved: false,
    });
    expect(sanitizeStateForSide(state, "ussr").plans.germany.orders).toHaveLength(1);
  });

  it("returns explanatory deterministic delay estimates before commitment", () => {
    const state = planning();
    const german = firstRoute(state, "germany");
    const simple = assessOrderReliability(state, order("germany", german.unit, german.route));
    expect(["high", "medium", "low"]).toContain(simple.level);
    expect(simple.reasons.length).toBeGreaterThan(0);
    german.unit.commandState = "out_of_command";
    const hq = commandInfo(state, german.unit).hq;
    if (hq) hq.movedThisTurn = true;
    const degraded = assessOrderReliability(
      state,
      {
        ...order("germany", german.unit, [...german.route, german.route[1]], "complex"),
        orderType: "prepared_attack",
        waitForEntityIds: ["missing"],
      },
    );
    expect(degraded.delay.maximum).toBeGreaterThanOrEqual(simple.delay.maximum);
    expect(degraded.reasons.length).toBeGreaterThan(simple.reasons.length);
  });
});

describe("WEGO impulse execution", () => {
  it("moves both sides within the same impulse", () => {
    let state = planning(400);
    const german = firstRoute(state, "germany");
    const soviet = firstRoute(state, "ussr");
    const germanFrom = german.unit.hexId;
    const sovietFrom = soviet.unit.hexId;
    state = upsert(state, order("germany", german.unit, german.route));
    state = upsert(state, order("ussr", soviet.unit, soviet.route));
    state = commit(state, "germany");
    state = commit(state, "ussr");
    state.plans.germany.orders[0].actualStartImpulse = 0;
    state.plans.germany.orders[0].status = "committed";
    state.plans.ussr.orders[0].actualStartImpulse = 0;
    state.plans.ussr.orders[0].status = "committed";
    const result = applyCommand(state, { type: "EXECUTE_IMPULSE" });
    expect(result.ok).toBe(true);
    expect(result.state.units[german.unit.id].hexId).not.toBe(germanFrom);
    expect(result.state.units[soviet.unit.id].hexId).not.toBe(sovietFrom);
    expect(result.events.filter((event) => event.type === "UNIT_MOVED")).toHaveLength(2);
  });

  it("creates a meeting engagement for simultaneous entry", () => {
    let state = planning(401);
    const center = Object.values(state.hexes).find((hex) => {
      if (hex.terrain !== "clear" || hex.stackUnitIds.length > 0) return false;
      const adjacent = neighbors(parseKey(hex.id))
        .map(({ q, r }) => state.hexes[`${q}_${r}`])
        .filter((candidate) => candidate?.terrain === "clear");
      return adjacent.length >= 2;
    });
    if (!center) throw new Error("meeting hex unavailable");
    const adjacent = neighbors(parseKey(center.id))
      .map(({ q, r }) => state.hexes[`${q}_${r}`])
      .filter((hex) => hex?.terrain === "clear");
    const german = Object.values(state.units).find(
      (unit) => unit.side === "germany" && unit.entityType === "combat_unit",
    );
    const soviet = Object.values(state.units).find(
      (unit) => unit.side === "ussr" && unit.entityType === "combat_unit",
    );
    if (!german || !soviet || adjacent.length < 2) throw new Error("meeting units unavailable");
    moveUnit(state, german, adjacent[0].id);
    moveUnit(state, soviet, adjacent[1].id);
    const germanHq = commandInfo(state, german).hq;
    const sovietHq = commandInfo(state, soviet).hq;
    if (germanHq) moveUnit(state, germanHq, adjacent[0].id);
    if (sovietHq) moveUnit(state, sovietHq, adjacent[1].id);
    state = upsert(state, order("germany", german, [adjacent[0].id, center.id]));
    state = upsert(state, order("ussr", soviet, [adjacent[1].id, center.id]));
    state = commit(state, "germany");
    state = commit(state, "ussr");
    for (const side of ["germany", "ussr"] as Side[]) {
      state.plans[side].orders[0].actualStartImpulse = 0;
      state.plans[side].orders[0].status = "committed";
    }
    const result = applyCommand(state, { type: "EXECUTE_IMPULSE" });
    expect(result.state.contacts[0]?.type).toBe("MEETING_ENGAGEMENT");
    expect(result.events.some((event) => event.type === "MEETING_ENGAGEMENT")).toBe(true);
    expect(result.state.contacts[0]?.resolved).toBe(true);
    expect(result.state.combatResolutions).toHaveLength(1);
  });

  it("starts a delayed order only at its actual impulse", () => {
    let state = planning(402);
    const german = firstRoute(state, "germany");
    const from = german.unit.hexId;
    state = upsert(state, order("germany", german.unit, german.route));
    state = commit(state, "germany");
    state = commit(state, "ussr");
    state.preparedBridgeDemolitions = {};
    const planned = state.plans.germany.orders[0];
    planned.actualStartImpulse = 2;
    planned.status = "delayed";
    state = applyCommand(state, { type: "EXECUTE_IMPULSE" }).state;
    expect(state.units[german.unit.id].hexId).toBe(from);
    state = applyCommand(state, { type: "EXECUTE_IMPULSE" }).state;
    expect(state.units[german.unit.id].hexId).toBe(from);
    state = applyCommand(state, { type: "EXECUTE_IMPULSE" }).state;
    expect(state.units[german.unit.id].hexId).toBe(german.route[1]);
  });

  it("moves to after-action after all six impulses", () => {
    let state = planning();
    state = commit(state, "germany");
    state = commit(state, "ussr");
    for (let impulse = 0; impulse < 6; impulse++) {
      state = applyCommand(state, { type: "EXECUTE_IMPULSE" }).state;
    }
    expect(state.phase).toBe("after_action");
    expect(state.impulse).toBe(6);
    expect(state.afterActionReport).toBeDefined();
  });
});

describe("WEGO reactions, replay and concurrency", () => {
  it("detonates a prepared bridge reaction and stops the route", () => {
    let state = planning(405);
    const bridgeHex = Object.values(state.hexes).find((hex) => hex.bridgeEdges.length > 0);
    const german = Object.values(state.units).find(
      (unit) => unit.side === "germany" && unit.entityType === "combat_unit",
    );
    if (!bridgeHex || !german) throw new Error("bridge reaction fixture unavailable");
    const edge = bridgeHex.bridgeEdges[0].edge;
    const direction = directionForEdge(edge);
    if (direction == null) throw new Error("bridge direction unavailable");
    const neighbor = neighbors(parseKey(bridgeHex.id))[direction];
    const to = state.hexes[`${neighbor.q}_${neighbor.r}`];
    if (!to) throw new Error("bridge neighbor unavailable");
    moveUnit(state, german, bridgeHex.id);
    const hq = commandInfo(state, german).hq;
    if (hq) moveUnit(state, hq, bridgeHex.id);
    setBridgeState(state, bridgeHex.id, edge, "prepared_for_demolition");
    const key = sharedEdgeKey(state, bridgeHex.id, edge);
    if (!key) throw new Error("bridge key unavailable");
    state.preparedBridgeDemolitions[key] = { side: "ussr" };
    const plannedOrder = order("germany", german, [bridgeHex.id, to.id]);
    const reaction: PlannedReaction = {
      id: "soviet-demolition",
      side: "ussr",
      entityIds: [],
      condition: "enemy_approaches_bridge",
      targetHexId: bridgeHex.id,
      edge,
      commandCost: 0,
      priority: 10,
      fromImpulse: 0,
      toImpulse: 5,
      maxUses: 1,
      uses: 0,
      status: "draft",
    };
    state = upsert(state, plannedOrder);
    state = applyCommand(state, { type: "UPSERT_REACTION", side: "ussr", reaction }).state;
    state = commit(state, "germany");
    state = commit(state, "ussr");
    state.plans.germany.orders[0].actualStartImpulse = 0;
    state.plans.germany.orders[0].status = "committed";
    const result = applyCommand(state, { type: "EXECUTE_IMPULSE" });
    expect(result.state.units[german.id].hexId).toBe(bridgeHex.id);
    expect(result.state.plans.germany.orders[0].status).toBe("failed");
    expect(result.events.some((event) => event.type === "REACTION_TRIGGERED")).toBe(true);
    expect(result.events.some((event) => event.type === "BRIDGE_DESTROYED")).toBe(true);
  });

  it("replays a complete planning and impulse sequence exactly", () => {
    const initial = planning(406);
    const german = firstRoute(initial, "germany");
    const commands: GameCommand[] = [
      {
        type: "UPSERT_PLANNED_ORDER",
        side: "germany",
        plannedOrder: order("germany", german.unit, german.route),
      },
      { type: "COMMIT_PLAN", side: "germany" },
      { type: "COMMIT_PLAN", side: "ussr" },
      { type: "EXECUTE_IMPULSE" },
    ];
    let direct = initial;
    for (const command of commands) direct = applyCommand(direct, command).state;
    const replayed = replayCommands(initial, commands);
    expect(replayed.plans).toEqual(direct.plans);
    expect(replayed.contacts).toEqual(direct.contacts);
    expect(replayed.units[german.unit.id].hexId).toBe(direct.units[german.unit.id].hexId);
    expect(replayed.rngCursor).toBe(direct.rngCursor);
  });

  it("rejects stale versions and applies an idempotent command once", () => {
    const state = planning();
    const stale = applyCommand(state, {
      type: "COMMIT_PLAN",
      side: "germany",
      expectedVersion: state.version - 1,
    });
    expect(stale.ok).toBe(false);
    expect(stale.errors[0].code).toBe("VERSION_CONFLICT");
    const command: GameCommand = {
      type: "COMMIT_PLAN",
      side: "germany",
      commandId: "commit-germany-once",
      expectedVersion: state.version,
    };
    const first = applyCommand(state, command);
    const second = applyCommand(first.state, { ...command, expectedVersion: first.state.version });
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(second.state).toBe(first.state);
    expect(second.events).toEqual([]);
  });
});
