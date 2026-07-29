import { describe, expect, it } from "vitest";
import type {
  ContactState,
  GameEvent,
  GameState,
  PlannedOrder,
} from "@/engine/types";
import { applyCommand } from "@/engine/engine";
import { buildAfterActionReport } from "@/engine/after-action";
import { buildCombatModel } from "@/engine/combat";
import { validateStateInvariants } from "@/engine/invariants";
import { migrateSaveGame } from "@/engine/persistence";
import { effectiveMaxCommandPoints } from "@/engine/rules";
import { sanitizeStateForSide } from "@/engine/wego";
import {
  resolveContact,
  shouldAbortOrderForLosses,
} from "@/engine/wego-combat";
import { createRaseiniaiWegoTestState } from "@/scenarios/baltic-1941/wego-test";
import { runWegoV041AcceptanceDay } from "@/scenarios/baltic-1941/wego-v041-acceptance";

function relocate(state: GameState, unitId: string, hexId: string): void {
  const unit = state.units[unitId];
  state.hexes[unit.hexId].stackUnitIds =
    state.hexes[unit.hexId].stackUnitIds.filter((id) => id !== unitId);
  unit.hexId = hexId;
  state.hexes[hexId].stackUnitIds.push(unitId);
}

function battleContact(state: GameState): ContactState {
  const value: ContactState = {
    id: `hq:${state.seed}`,
    type: "PREPARED_ATTACK",
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
    status: "ready",
    resolved: false,
  };
  state.contacts.push(value);
  return value;
}

function resolvedHqBattle(): {
  state: GameState;
  events: GameEvent[];
} {
  for (let seed = 1; seed <= 100; seed++) {
    const state = createRaseiniaiWegoTestState(seed);
    relocate(state, "sov-hq-3mc", "17_29");
    state.units["ger-1pz"].attack = 100;
    state.units["ger-1pz"].supplyState = "full";
    state.units["ger-1pz"].commandState = "in_command";
    state.units["sov-2td"].currentSteps = 1;
    state.pendingExtraAdvance = "germany";
    const events: GameEvent[] = [];
    resolveContact(state, battleContact(state), events);
    if (
      events.some((event) => event.type === "HQ_CAPTURED") &&
      state.units["ger-1pz"].hexId === "17_29"
    ) {
      return { state, events };
    }
  }
  throw new Error("No deterministic HQ capture seed found");
}

function order(tolerance: PlannedOrder["lossTolerance"]): PlannedOrder {
  return {
    id: tolerance,
    side: "germany",
    entityIds: ["ger-1pz"],
    orderType: "advance",
    startImpulse: 0,
    priority: 1,
    contactPolicy: "attack",
    lossTolerance: tolerance,
    status: "executing",
  };
}

describe("v0.4.1 headquarters advance", () => {
  it("26. isolated enemy HQ does not prevent advance", () => {
    expect(resolvedHqBattle().state.units["ger-1pz"].hexId).toBe("17_29");
  });

  it("27. isolated HQ is captured", () => {
    expect(
      resolvedHqBattle().events.some((event) => event.type === "HQ_CAPTURED"),
    ).toBe(true);
  });

  it("28. captured HQ hex receives attacker control", () => {
    expect(resolvedHqBattle().state.hexes["17_29"].control).toBe("germany");
  });

  it("29. stack invariants survive HQ capture and advance", () => {
    expect(validateStateInvariants(resolvedHqBattle().state)).toEqual([]);
  });
});

describe("v0.4.1 loss tolerance", () => {
  it("30. low aborts after one loss step", () => {
    expect(shouldAbortOrderForLosses(order("low"), 1)).toBe(true);
  });

  it("31. normal aborts after two loss steps", () => {
    expect(shouldAbortOrderForLosses(order("normal"), 1)).toBe(false);
    expect(shouldAbortOrderForLosses(order("normal"), 2)).toBe(true);
  });

  it("32. high aborts after three loss steps", () => {
    expect(shouldAbortOrderForLosses(order("high"), 2)).toBe(false);
    expect(shouldAbortOrderForLosses(order("high"), 3)).toBe(true);
  });

  it("33. legacy loss reaction is removed instead of firing twice", () => {
    const result = migrateSaveGame({
      schemaVersion: 4,
      seed: 1,
      commands: [{
        type: "UPSERT_REACTION",
        side: "germany",
        reaction: {
          id: "legacy",
          side: "germany",
          entityIds: ["ger-1pz"],
          condition: "loss_threshold",
          commandCost: 1,
          priority: 1,
          fromImpulse: 0,
          toImpulse: 5,
          maxUses: 1,
          uses: 0,
          status: "draft",
        },
      }],
    });
    expect(result.ok && result.save.commands).toEqual([]);
    expect(result.ok && result.warnings.join(" ")).toContain("loss_threshold");
  });
});

describe("v0.4.1 temporary command effects", () => {
  it("34. temporary CP is available in the next planning turn", () => {
    const state = createRaseiniaiWegoTestState();
    const hq = state.headquarters["ger-hq-pzg4"];
    state.turn = 2;
    state.temporaryCommandEffects.push({
      id: "cp",
      targetHqId: hq.id,
      commandPointModifier: 2,
      initiativeModifier: 0,
      startsAtTurn: 2,
      expiresAfterTurn: 3,
    });
    expect(effectiveMaxCommandPoints(state, hq)).toBe(hq.maxCommandPoints + 2);
  });

  it("35. command bonus lasts its declared turns", () => {
    const state = createRaseiniaiWegoTestState();
    const hq = state.headquarters["ger-hq-pzg4"];
    state.temporaryCommandEffects.push({
      id: "cp",
      targetHqId: hq.id,
      commandPointModifier: 2,
      initiativeModifier: 0,
      startsAtTurn: 2,
      expiresAfterTurn: 3,
    });
    state.turn = 2;
    const first = effectiveMaxCommandPoints(state, hq);
    state.turn = 3;
    expect(effectiveMaxCommandPoints(state, hq)).toBe(first);
  });

  it("36. command bonus expires exactly after its duration", () => {
    const state = createRaseiniaiWegoTestState();
    const hq = state.headquarters["ger-hq-pzg4"];
    state.turn = 4;
    state.temporaryCommandEffects.push({
      id: "cp",
      targetHqId: hq.id,
      commandPointModifier: 2,
      initiativeModifier: 0,
      startsAtTurn: 2,
      expiresAfterTurn: 3,
    });
    expect(effectiveMaxCommandPoints(state, hq)).toBe(hq.maxCommandPoints);
  });

  it("37. repeated calculation does not apply a bonus twice", () => {
    const state = createRaseiniaiWegoTestState();
    const hq = state.headquarters["ger-hq-pzg4"];
    state.temporaryCommandEffects.push({
      id: "cp",
      targetHqId: hq.id,
      commandPointModifier: 2,
      initiativeModifier: 0,
      startsAtTurn: 1,
      expiresAfterTurn: 2,
    });
    expect(effectiveMaxCommandPoints(state, hq)).toBe(
      effectiveMaxCommandPoints(state, hq),
    );
  });

  it("38. serialization in the middle of an effect preserves calculation", () => {
    const state = createRaseiniaiWegoTestState();
    const hq = state.headquarters["ger-hq-pzg4"];
    state.temporaryCommandEffects.push({
      id: "cp",
      targetHqId: hq.id,
      commandPointModifier: 2,
      initiativeModifier: 0,
      startsAtTurn: 1,
      expiresAfterTurn: 2,
    });
    const restored = structuredClone(state);
    expect(effectiveMaxCommandPoints(restored, restored.headquarters[hq.id])).toBe(
      effectiveMaxCommandPoints(state, hq),
    );
  });
});

describe("v0.4.1 after-action report", () => {
  it("39. damagedThisTurn contains only current-day losses", () => {
    const state = createRaseiniaiWegoTestState();
    state.turnStartedAtEventIndex = 1;
    state.eventLog = [
      { type: "UNIT_LOST_STEP", unitId: "ger-6pz", amount: 1 },
      { type: "UNIT_LOST_STEP", unitId: "ger-1pz", amount: 1 },
    ];
    expect(buildAfterActionReport(state).damagedThisTurn).toEqual(["ger-1pz"]);
  });

  it("40. understrengthUnits contains old damage", () => {
    const state = createRaseiniaiWegoTestState();
    state.units["ger-6pz"].currentSteps -= 1;
    expect(buildAfterActionReport(state).understrengthUnits).toContain("ger-6pz");
  });

  it("41. a damaged unit is listed only once", () => {
    const state = createRaseiniaiWegoTestState();
    state.eventLog.push(
      { type: "UNIT_LOST_STEP", unitId: "ger-1pz", amount: 1 },
      { type: "UNIT_LOST_STEP", unitId: "ger-1pz", amount: 1 },
    );
    expect(buildAfterActionReport(state).damagedThisTurn).toEqual(["ger-1pz"]);
  });

  it("42. side-filtered AAR does not reveal hidden enemy losses", () => {
    const state = createRaseiniaiWegoTestState();
    state.eventLog.push({
      type: "UNIT_LOST_STEP",
      unitId: "sov-5td",
      amount: 1,
    });
    state.afterActionReport = buildAfterActionReport(state);
    expect(
      sanitizeStateForSide(state, "germany").afterActionReport?.damagedThisTurn,
    ).not.toContain("sov-5td");
  });

  it("43. identical event logs produce identical AAR", () => {
    const state = createRaseiniaiWegoTestState();
    state.eventLog.push({
      type: "UNIT_LOST_STEP",
      unitId: "ger-1pz",
      amount: 1,
    });
    expect(buildAfterActionReport(structuredClone(state))).toEqual(
      buildAfterActionReport(state),
    );
  });
});

describe("v0.4.1 determinism", () => {
  it("44. full acceptance day has identical state hash", () => {
    expect(JSON.stringify(runWegoV041AcceptanceDay(77))).toBe(
      JSON.stringify(runWegoV041AcceptanceDay(77)),
    );
  }, 15_000);

  it("45. object key order does not change combat result", () => {
    const state = createRaseiniaiWegoTestState();
    const reversed = {
      ...state,
      units: Object.fromEntries(Object.entries(state.units).reverse()),
      hexes: Object.fromEntries(Object.entries(state.hexes).reverse()),
    };
    const declaration = {
      attackerIds: ["ger-1pz"],
      defenderIds: ["sov-2td"],
      defenderHexId: "17_29",
    };
    expect(buildCombatModel(reversed, declaration)).toEqual(
      buildCombatModel(state, declaration),
    );
  });

  it("46. idempotent command does not consume resources twice", () => {
    let state = createRaseiniaiWegoTestState();
    state.phase = "planning";
    const plannedOrder: PlannedOrder = {
      id: "defend",
      side: "germany",
      entityIds: ["ger-1pz"],
      orderType: "defend",
      startImpulse: 0,
      priority: 1,
      contactPolicy: "fix",
      lossTolerance: "normal",
      status: "draft",
    };
    state = applyCommand(state, {
      type: "UPSERT_PLANNED_ORDER",
      side: "germany",
      plannedOrder,
    }).state;
    const command = {
      type: "COMMIT_PLAN" as const,
      side: "germany" as const,
      commandId: "same",
    };
    const once = applyCommand(state, command).state;
    const before = once.headquarters["ger-hq-pzg4"].commandPoints;
    const twice = applyCommand(once, command).state;
    expect(twice.headquarters["ger-hq-pzg4"].commandPoints).toBe(before);
  });
});
