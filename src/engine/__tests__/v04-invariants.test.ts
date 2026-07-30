import { describe, expect, it } from "vitest";
import { validateStateInvariants } from "@/engine/invariants";
import { createRaseiniaiWegoTestState } from "@/scenarios/baltic-1941/wego-test";

function codes(state = createRaseiniaiWegoTestState()): string[] {
  return validateStateInvariants(state).map((violation) => violation.code);
}

describe("v0.4 state invariants", () => {
  it("accepts the Raseiniai fixture", () => {
    expect(codes()).toEqual([]);
  });

  it("detects negative fuel", () => {
    const state = createRaseiniaiWegoTestState();
    state.units["ger-1pz"].fuel = -1;
    expect(codes(state)).toContain("NEGATIVE_FUEL");
  });

  it("detects negative ammunition", () => {
    const state = createRaseiniaiWegoTestState();
    state.units["ger-1pz"].ammunition = -1;
    expect(codes(state)).toContain("NEGATIVE_AMMUNITION");
  });

  it("detects negative steps", () => {
    const state = createRaseiniaiWegoTestState();
    state.units["ger-1pz"].currentSteps = -1;
    expect(codes(state)).toContain("NEGATIVE_STEPS");
  });

  it("detects negative command points", () => {
    const state = createRaseiniaiWegoTestState();
    state.headquarters["ger-hq-pzg4"].commandPoints = -1;
    expect(codes(state)).toContain("NEGATIVE_COMMAND_POINTS");
  });

  it("detects a unit in two stacks", () => {
    const state = createRaseiniaiWegoTestState();
    state.hexes["16_30"].stackUnitIds.push("ger-1pz");
    expect(codes(state)).toContain("UNIT_STACK_CARDINALITY");
  });

  it("detects a hex referencing a missing unit", () => {
    const state = createRaseiniaiWegoTestState();
    state.hexes["16_30"].stackUnitIds.push("missing-unit");
    expect(codes(state)).toContain("STACK_REFERENCES_MISSING_UNIT");
  });

  it("detects a unit/hex mismatch", () => {
    const state = createRaseiniaiWegoTestState();
    state.units["ger-1pz"].hexId = "16_30";
    expect(codes(state)).toContain("UNIT_HEX_STACK_MISMATCH");
  });

  it("detects an eliminated unit left on the map", () => {
    const state = createRaseiniaiWegoTestState();
    state.units["ger-1pz"].eliminated = true;
    expect(codes(state)).toContain("ELIMINATED_UNIT_IN_STACK");
  });

  it("detects a non-canonical HQ object", () => {
    const state = createRaseiniaiWegoTestState();
    state.headquarters["ger-hq-pzg4"] = {
      ...state.headquarters["ger-hq-pzg4"],
    };
    expect(codes(state)).toContain("HQ_NOT_CANONICAL");
  });

  it("detects incompatible simultaneous orders", () => {
    const state = createRaseiniaiWegoTestState();
    const common = {
      side: "germany" as const,
      entityIds: ["ger-1pz"],
      orderType: "defend" as const,
      startImpulse: 0,
      priority: 1,
      contactPolicy: "fix" as const,
      lossTolerance: "normal" as const,
      status: "committed" as const,
    };
    state.plans.germany.orders = [
      { ...common, id: "one" },
      { ...common, id: "two" },
    ];
    expect(codes(state)).toContain("INCOMPATIBLE_SIMULTANEOUS_ORDERS");
  });

  it("detects a resolved contact without a resolution id", () => {
    const state = createRaseiniaiWegoTestState();
    state.contacts.push({
      id: "broken",
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
      impulse: 0,
      detectedBy: ["germany", "ussr"],
      resolved: true,
      status: "resolved",
    });
    expect(codes(state)).toContain("RESOLVED_CONTACT_WITHOUT_RESOLUTION");
  });

  it("detects an asymmetric bridge edge", () => {
    const state = createRaseiniaiWegoTestState();
    const hex = Object.values(state.hexes).find(
      (candidate) => candidate.bridgeEdges.length > 0,
    );
    if (!hex) throw new Error("No bridge in fixture");
    hex.bridgeEdges[0].state = "destroyed";
    expect(codes(state)).toContain("ASYMMETRIC_SHARED_EDGE");
  });
});
