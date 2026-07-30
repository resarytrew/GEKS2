import { describe, expect, it } from "vitest";
import { EXECUTION_IMPULSE_COUNT } from "@/engine/types";
import { effectiveMaxCommandPoints } from "@/engine/rules";
import { validateStateInvariants } from "@/engine/invariants";
import {
  runMovementAndCombatAcceptanceFlow,
  runReactionsAndPersistenceAcceptanceFlow,
} from "@/scenarios/baltic-1941/wego-v041-full-acceptance";

const flowA = runMovementAndCombatAcceptanceFlow(77);
const flowB = runReactionsAndPersistenceAcceptanceFlow(4102);

describe("v0.4.1 full acceptance flows", () => {
  it("71. Flow A completes the configured movement and combat day", () => {
    expect(
      flowA.commands.filter((command) => command.type === "EXECUTE_IMPULSE"),
    ).toHaveLength(EXECUTION_IMPULSE_COUNT);
    expect(flowA.state.turn).toBe(2);
    expect(flowA.state.phase).toBe("planning");
  });

  it("72. Flow A keeps support side-specific and single-use", () => {
    const { state } = flowA;
    const contact = state.contacts.find(
      (candidate) => candidate.type === "MEETING_ENGAGEMENT",
    );
    expect(contact?.attackerSupportIds).toEqual(["ger-269"]);
    expect(contact?.defenderSupportIds).toEqual(["sov-48sd"]);
    expect(state.supportUsage).toHaveLength(2);
    expect(new Set(state.supportUsage.map((usage) => usage.unitId)).size).toBe(
      2,
    );
  });

  it("73. Flow A spends support ammunition and produces an event-based AAR", () => {
    const { initialState, state, aar } = flowA;
    expect(state.units["ger-269"].ammunition).toBeLessThan(
      initialState.units["ger-269"].ammunition,
    );
    expect(state.units["sov-48sd"].ammunition).toBeLessThan(
      initialState.units["sov-48sd"].ammunition,
    );
    const damagedFromEvents = new Set(
      state.eventLog
        .filter((event) => event.type === "UNIT_LOST_STEP")
        .map((event) => event.unitId),
    );
    expect(new Set(aar?.damagedThisTurn)).toEqual(damagedFromEvents);
  });

  it("74. Flow B demolishes only the validated bridge attempt and applies fallback", () => {
    const { state } = flowB;
    expect(
      state.eventLog.filter((event) => event.type === "BRIDGE_DESTROYED"),
    ).toHaveLength(1);
    expect(state.units["ger-1pz"].hexId).toBe("15_29");
    expect(
      state.eventLog.some(
        (event) =>
          event.type === "REACTION_TRIGGERED" &&
          event.reactionId === "acceptance:route-blocked",
      ),
    ).toBe(true);
  });

  it("75. Flow B commits reserve exactly once without role overlap", () => {
    const { state } = flowB;
    const reserveEvents = state.eventLog.filter(
      (event) => event.type === "RESERVE_COMMITTED",
    );
    expect(reserveEvents).toHaveLength(1);
    const contact = state.contacts.find(
      (candidate) => candidate.id === reserveEvents[0].contactId,
    );
    expect(
      contact?.attackerParticipantIds.filter((id) => id === "ger-6pz"),
    ).toHaveLength(1);
    expect(validateStateInvariants(state)).toEqual([]);
  });

  it("76. Flow B captures the exposed headquarters and permits advance", () => {
    const { state } = flowB;
    expect(state.headquarters["sov-hq-3mc"].captured).toBe(true);
    expect(
      state.eventLog.some(
        (event) =>
          event.type === "HQ_CAPTURED" &&
          event.hqId === "sov-hq-3mc",
      ),
    ).toBe(true);
    expect(
      state.eventLog.some(
        (event) =>
          event.type === "ADVANCE_AFTER_COMBAT" &&
          event.to === "17_28",
      ),
    ).toBe(true);
  });

  it("77. Flow B applies future CP once in next planning", () => {
    const { state } = flowB;
    const hq = state.headquarters["ger-hq-pzg4"];
    expect(state.turn).toBe(2);
    expect(state.phase).toBe("planning");
    expect(hq.commandPoints).toBe(effectiveMaxCommandPoints(state, hq));
    expect(hq.commandPoints).toBe(hq.maxCommandPoints + 2);
  });

  it("78. Flow B save restore preserves the complete state", () => {
    const { state, restoredState } = flowB;
    expect(restoredState).toBeDefined();
    expect(JSON.stringify(restoredState)).toBe(JSON.stringify(state));
  });

  it("79. Flow B replay hash is deterministic", () => {
    const right = runReactionsAndPersistenceAcceptanceFlow(4102);
    expect(JSON.stringify(flowB.state)).toBe(JSON.stringify(right.state));
    expect(JSON.stringify(flowB.restoredState)).toBe(
      JSON.stringify(right.restoredState),
    );
  }, 15_000);

  it("80. Both flows finish with valid authoritative state", () => {
    expect(
      validateStateInvariants(flowA.state),
    ).toEqual([]);
    expect(
      validateStateInvariants(flowB.state),
    ).toEqual([]);
  }, 15_000);
});
