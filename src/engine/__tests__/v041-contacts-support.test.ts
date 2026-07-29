import { describe, expect, it } from "vitest";
import type { ContactState, GameEvent, GameState } from "@/engine/types";
import { buildCombatModel } from "@/engine/combat";
import { validateStateInvariants } from "@/engine/invariants";
import { getEligibleSupportUnits } from "@/engine/support";
import { resolveContact } from "@/engine/wego-combat";
import { createRaseiniaiWegoTestState } from "@/scenarios/baltic-1941/wego-test";

function contact(state: GameState): ContactState {
  const value: ContactState = {
    id: `v041:${state.seed}`,
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
    sourceOrderIds: [],
    impulse: 0,
    createdAtImpulse: 0,
    detectedBy: ["germany", "ussr"],
    status: "ready",
    resolved: false,
  };
  state.contacts.push(value);
  return value;
}

function readySupport(state: GameState, id: string): void {
  state.units[id].supplyState = "full";
  state.units[id].commandState = "in_command";
  state.units[id].ammunition = 80;
}

describe("v0.4.1 contacts and support", () => {
  it("1. reserve cannot be counted twice", () => {
    const state = createRaseiniaiWegoTestState();
    const value = contact(state);
    value.attackerParticipantIds.push("ger-6pz");
    value.attackerReserveIds.push("ger-6pz");
    expect(
      validateStateInvariants(state).map((entry) => entry.code),
    ).toContain("CONTACT_RESERVE_DUPLICATE_ROLE");
  });

  it("2. Soviet support does not strengthen Germany", () => {
    const state = createRaseiniaiWegoTestState();
    const base = buildCombatModel(state, {
      attackerIds: ["ger-1pz"],
      defenderIds: ["sov-2td"],
      defenderHexId: "17_29",
    });
    const wrong = buildCombatModel(state, {
      attackerIds: ["ger-1pz"],
      defenderIds: ["sov-2td"],
      defenderHexId: "17_29",
      supportIds: ["sov-48sd"],
    });
    expect(wrong.attackerStrength).toBe(base.attackerStrength);
  });

  it("3. German support does not strengthen the USSR", () => {
    const state = createRaseiniaiWegoTestState();
    const base = buildCombatModel(state, {
      attackerIds: ["sov-2td"],
      defenderIds: ["ger-1pz"],
      defenderHexId: "16_29",
    });
    const wrong = buildCombatModel(state, {
      attackerIds: ["sov-2td"],
      defenderIds: ["ger-1pz"],
      defenderHexId: "16_29",
      supportIds: ["ger-269"],
    });
    expect(wrong.attackerStrength).toBe(base.attackerStrength);
  });

  it("4. participant cannot simultaneously be support", () => {
    const state = createRaseiniaiWegoTestState();
    const value = contact(state);
    value.attackerSupportIds = ["ger-1pz"];
    expect(
      validateStateInvariants(state).map((entry) => entry.code),
    ).toContain("CONTACT_SUPPORT_DUPLICATES_PARTICIPANT");
  });

  it("5. support spends ammunition only when actually engaged", () => {
    const state = createRaseiniaiWegoTestState(9);
    const value = contact(state);
    value.attackerSupportIds = ["ger-269"];
    readySupport(state, "ger-269");
    const before = state.units["ger-269"].ammunition;
    const events: GameEvent[] = [];
    resolveContact(state, value, events);
    expect(state.units["ger-269"].ammunition).toBeLessThan(before);
    expect(events).toContainEqual({
      type: "AMMUNITION_SPENT",
      unitId: "ger-269",
      amount: 4,
    });
  });

  it("6. support cannot be used twice in one impulse", () => {
    const state = createRaseiniaiWegoTestState();
    readySupport(state, "ger-269");
    state.supportUsage.push({
      unitId: "ger-269",
      impulse: 0,
      contactId: "first",
    });
    const result = getEligibleSupportUnits(
      state,
      "germany",
      "17_29",
      undefined,
      0,
    ).find((entry) => entry.unitId === "ger-269");
    expect(result?.eligible).toBe(false);
  });

  it("7. support outside range is rejected", () => {
    const state = createRaseiniaiWegoTestState();
    readySupport(state, "ger-269");
    state.units["ger-269"].hexId = "5_5";
    const result = getEligibleSupportUnits(
      state,
      "germany",
      "17_29",
      undefined,
      0,
    ).find((entry) => entry.unitId === "ger-269");
    expect(result?.reasons).toContain("Цель находится вне дальности поддержки.");
  });

  it("8. heavy-AT support penetrates heavy armor", () => {
    const state = createRaseiniaiWegoTestState();
    state.units["ger-1pz"].traits = ["tracked"];
    const model = buildCombatModel(state, {
      attackerIds: ["ger-1pz"],
      defenderIds: ["sov-2td"],
      defenderHexId: "17_29",
      supportIds: ["ger-269"],
    });
    expect(model.penetratesHeavyArmor).toBe(true);
  });

  it("9. defender heavy-AT does not help the attacker", () => {
    const state = createRaseiniaiWegoTestState();
    state.units["ger-1pz"].traits = ["tracked"];
    state.units["sov-48sd"].traits.push("heavy_at");
    const model = buildCombatModel(state, {
      attackerIds: ["ger-1pz"],
      defenderIds: ["sov-2td"],
      defenderHexId: "17_29",
      defenderSupportIds: ["sov-48sd"],
    });
    expect(model.penetratesHeavyArmor).toBe(false);
  });
});
