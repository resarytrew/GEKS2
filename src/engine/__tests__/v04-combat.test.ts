import { describe, expect, it } from "vitest";
import type {
  ContactState,
  GameEvent,
  GameState,
  UnitState,
} from "@/engine/types";
import {
  allocateLosses,
  findRetreatRoute,
  resolveContact,
} from "@/engine/wego-combat";
import { resolveCombatCell } from "@/engine/rules";
import { createRaseiniaiWegoTestState } from "@/scenarios/baltic-1941/wego-test";

function testContact(state: GameState): ContactState {
  const contact: ContactState = {
    id: `contact:test:${state.seed}`,
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
  state.contacts.push(contact);
  return contact;
}

describe("canonical CRT reuse", () => {
  it.each([
    [0.5, 0],
    [0.75, 1],
    [1.0, 2],
    [1.5, 3],
    [2.0, 4],
    [3.0, 5],
    [4.0, 6],
  ])("maps ratio %s to canonical column %s", (ratio, expectedColumn) => {
    const low = resolveCombatCell(ratio, 1);
    const high = resolveCombatCell(ratio, 6);
    expect(low).toBeDefined();
    expect(high).toBeDefined();
    expect(expectedColumn).toBeGreaterThanOrEqual(0);
    expect(low).not.toBe(high);
  });

  it.each([1, 2, 3, 4, 5, 6])(
    "returns a defined deterministic outcome for die roll %s",
    (die) => {
      expect(resolveCombatCell(2, die)).toEqual(resolveCombatCell(2, die));
    },
  );
});

describe("distributed combat losses", () => {
  const units = (): UnitState[] => {
    const state = createRaseiniaiWegoTestState();
    return [
      state.units["ger-1pz"],
      state.units["ger-6pz"],
      state.units["ger-hq-pzg4"],
    ];
  };

  it.each([0, 1, 2, 3, 4, 5, 6])(
    "allocates %s steps without assigning HQ losses",
    (steps) => {
      const allocation = allocateLosses(units(), steps);
      expect(
        allocation.mandatory.some((item) => item.unitId === "ger-hq-pzg4"),
      ).toBe(false);
      expect(
        allocation.mandatory.reduce((sum, item) => sum + item.steps, 0),
      ).toBe(Math.min(steps, 6));
    },
  );

  it("spreads two losses across two equal formations", () => {
    const allocation = allocateLosses(units(), 2);
    expect(allocation.mandatory).toHaveLength(2);
    expect(allocation.mandatory.every((item) => item.steps === 1)).toBe(true);
  });
});

describe("contact resolution", () => {
  it.each([11, 22, 33, 44, 55, 66, 77, 88])(
    "resolves seeded contact %s into a stored combat result",
    (seed) => {
      const state = createRaseiniaiWegoTestState(seed);
      const contact = testContact(state);
      const beforeAmmo = state.units["ger-1pz"].ammunition;
      const events: GameEvent[] = [];
      const resolution = resolveContact(state, contact, events);
      expect(resolution).toBeDefined();
      expect(contact.resolved).toBe(true);
      expect(contact.resolutionId).toBe(resolution?.id);
      expect(state.combatResolutions).toContain(resolution);
      expect(state.units["ger-1pz"].ammunition).toBeLessThanOrEqual(beforeAmmo);
    },
  );

  it("does not resolve an already resolved contact twice", () => {
    const state = createRaseiniaiWegoTestState();
    const contact = testContact(state);
    resolveContact(state, contact, []);
    const cursor = state.rngCursor;
    expect(resolveContact(state, contact, [])).toBeUndefined();
    expect(state.rngCursor).toBe(cursor);
  });

  it("consumes pending air support in the next contact", () => {
    const state = createRaseiniaiWegoTestState();
    state.pendingAirSupport = { side: "germany", value: 2 };
    const contact = testContact(state);
    const resolution = resolveContact(state, contact, []);
    expect(resolution).toBeDefined();
    expect(state.pendingAirSupport).toBeUndefined();
  });

  it("retreat search honors an adjacent explicit fallback route", () => {
    const state = createRaseiniaiWegoTestState();
    const unit = state.units["sov-2td"];
    const route = findRetreatRoute(
      state,
      unit.id,
      ["16_29"],
      1,
      ["17_29", "18_29"],
    );
    expect(route).toEqual(["17_29", "18_29"]);
  });

  it("retreat search can find a two-hex route", () => {
    const state = createRaseiniaiWegoTestState();
    moveAway(state, "sov-5td");
    const route = findRetreatRoute(state, "sov-2td", ["16_29"], 2);
    expect(route?.length).toBe(3);
  });
});

function moveAway(state: GameState, unitId: string): void {
  const unit = state.units[unitId];
  state.hexes[unit.hexId].stackUnitIds = state.hexes[
    unit.hexId
  ].stackUnitIds.filter((id) => id !== unitId);
  unit.hexId = "20_31";
  state.hexes["20_31"].stackUnitIds.push(unitId);
}
