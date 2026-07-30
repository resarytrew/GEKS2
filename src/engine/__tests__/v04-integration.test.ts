import { describe, expect, it } from "vitest";
import { applyCommand, replayCommands } from "@/engine/engine";
import { migrateSaveGame } from "@/engine/persistence";
import {
  sanitizeStateForSide,
  triggerEncirclementWithdrawals,
} from "@/engine/wego";
import { resolveContact } from "@/engine/wego-combat";
import { validateStateInvariants } from "@/engine/invariants";
import type {
  GameCommand,
  GameEvent,
  GameState,
  PlannedOrder,
} from "@/engine/types";
import {
  EXECUTION_IMPULSE_COUNT,
  LAST_EXECUTION_IMPULSE,
} from "@/engine/types";
import { createRaseiniaiWegoTestState } from "@/scenarios/baltic-1941/wego-test";

function planning(state = createRaseiniaiWegoTestState()): GameState {
  state = applyCommand(state, { type: "END_PHASE" }).state;
  state = applyCommand(state, { type: "END_PHASE" }).state;
  return state;
}

function defendOrder(side: "germany" | "ussr", unitId: string): PlannedOrder {
  return {
    id: `defend:${side}`,
    side,
    entityIds: [unitId],
    orderType: "defend",
    startImpulse: 0,
    priority: 1,
    contactPolicy: "fix",
    lossTolerance: "normal",
    status: "draft",
  };
}

describe("v0.4 full-day integration", () => {
  it("runs six impulses and creates an after-action report", () => {
    let state = planning();
    state = applyCommand(state, {
      type: "UPSERT_PLANNED_ORDER",
      side: "germany",
      plannedOrder: defendOrder("germany", "ger-1pz"),
    }).state;
    state = applyCommand(state, {
      type: "UPSERT_PLANNED_ORDER",
      side: "ussr",
      plannedOrder: defendOrder("ussr", "sov-2td"),
    }).state;
    state = applyCommand(state, { type: "COMMIT_PLAN", side: "germany" }).state;
    state = applyCommand(state, { type: "COMMIT_PLAN", side: "ussr" }).state;
    for (let impulse = 0; impulse < EXECUTION_IMPULSE_COUNT; impulse++) {
      state = applyCommand(state, { type: "EXECUTE_IMPULSE" }).state;
    }
    expect(state.phase).toBe("after_action");
    expect(state.impulseReports).toHaveLength(EXECUTION_IMPULSE_COUNT);
    expect(state.afterActionReport?.impulses).toHaveLength(
      EXECUTION_IMPULSE_COUNT,
    );
  });

  it("starts the next day from after-action with one command", () => {
    let state = planning();
    state = applyCommand(state, { type: "COMMIT_PLAN", side: "germany" }).state;
    state = applyCommand(state, { type: "COMMIT_PLAN", side: "ussr" }).state;
    for (let impulse = 0; impulse < EXECUTION_IMPULSE_COUNT; impulse++) {
      state = applyCommand(state, { type: "EXECUTE_IMPULSE" }).state;
    }
    const turn = state.turn;
    state = applyCommand(state, { type: "END_PHASE" }).state;
    expect(state.phase).toBe("morning_report");
    expect(state.turn).toBe(turn + 1);
  }, 15_000);

  it("replay produces byte-identical state for a full quiet day", () => {
    const initial = createRaseiniaiWegoTestState(9876);
    const commands: GameCommand[] = [
      { type: "END_PHASE" },
      { type: "END_PHASE" },
      { type: "COMMIT_PLAN", side: "germany" },
      { type: "COMMIT_PLAN", side: "ussr" },
      ...Array.from({ length: EXECUTION_IMPULSE_COUNT }, () => ({
        type: "EXECUTE_IMPULSE" as const,
      })),
    ];
    const first = replayCommands(initial, commands);
    const second = replayCommands(initial, commands);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  }, 15_000);

  it("opponent view hides undiscovered routes, reactions, and cards", () => {
    const state = planning();
    state.plans.germany.orders.push({
      ...defendOrder("germany", "ger-1pz"),
      route: ["16_29", "16_28"],
      cardIds: [state.playerHands.germany[0]].filter(Boolean),
    });
    state.plans.germany.reactions.push({
      id: "hidden-reaction",
      side: "germany",
      entityIds: ["ger-1pz"],
      condition: "route_blocked",
      commandCost: 1,
      priority: 1,
      fromImpulse: 0,
      toImpulse: LAST_EXECUTION_IMPULSE,
      maxUses: 1,
      uses: 0,
      status: "draft",
    });
    const view = sanitizeStateForSide(state, "ussr");
    expect(view.plans.germany.orders).toEqual([]);
    expect(view.plans.germany.reactions).toEqual([]);
    expect(view.playerHands.germany).toEqual([]);
  });

  it("migrates a legacy march command with a warning", () => {
    const result = migrateSaveGame({
      schemaVersion: 3,
      engineVersion: "0.3.0",
      scenarioVersion: "0.3.0",
      scenarioId: "baltic-1941",
      seed: 1,
      matchId: "legacy",
      mode: "hotseat",
      commands: [
        {
          type: "UPSERT_PLANNED_ORDER",
          side: "germany",
          plannedOrder: {
            id: "old-march",
            side: "germany",
            entityIds: ["ger-1pz"],
            orderType: "march",
            route: ["10_34", "11_34"],
            startImpulse: 0,
            priority: 1,
            contactPolicy: "attack",
            lossTolerance: "normal",
            status: "draft",
          },
        },
      ],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.save.schemaVersion).toBe(5);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(
        result.save.commands[0].plannedOrder?.remainingMovementBudget,
      ).toBe(0);
    }
  });

  it("keeps all state invariants after a quiet full day", () => {
    let state = planning(createRaseiniaiWegoTestState(1234));
    state = applyCommand(state, { type: "COMMIT_PLAN", side: "germany" }).state;
    state = applyCommand(state, { type: "COMMIT_PLAN", side: "ussr" }).state;
    for (let impulse = 0; impulse < EXECUTION_IMPULSE_COUNT; impulse++) {
      state = applyCommand(state, { type: "EXECUTE_IMPULSE" }).state;
    }
    expect(validateStateInvariants(state)).toEqual([]);
  });

  it("encirclement reaction executes its fallback route", () => {
    const state = createRaseiniaiWegoTestState();
    state.units["ger-1pz"].encirclementState = "threatened_with_encirclement";
    state.units["ger-1pz"].supplyState = "full";
    state.hexes["15_29"].control = "germany";
    state.plans.germany.reactions.push({
      id: "encirclement-withdraw",
      side: "germany",
      entityIds: ["ger-1pz"],
      condition: "encirclement_threat",
      targetHexId: "15_29",
      commandCost: 1,
      priority: 3,
      fromImpulse: 0,
      toImpulse: LAST_EXECUTION_IMPULSE,
      maxUses: 1,
      uses: 0,
      status: "committed",
      fallbackRoute: ["16_29", "15_29"],
    });
    const events: GameEvent[] = [];
    triggerEncirclementWithdrawals(state, {
      impulse: 0,
      events,
      createdContactIds: [],
    });
    expect(state.plans.germany.reactions[0].uses).toBe(1);
    expect(events.some((event) => event.type === "REACTION_TRIGGERED")).toBe(
      true,
    );
  });

  it("loss tolerance aborts an attack when seeded losses reach it", () => {
    let observed = false;
    for (let seed = 1; seed <= 20 && !observed; seed++) {
      const state = createRaseiniaiWegoTestState(seed);
      state.units["ger-1pz"].attack = 0.1;
      state.plans.germany.orders.push({
        id: "attack-with-threshold",
        side: "germany",
        entityIds: ["ger-1pz"],
        orderType: "prepared_attack",
        targetHexId: "17_29",
        startImpulse: 0,
        priority: 2,
        contactPolicy: "attack",
        lossTolerance: "low",
        status: "executing",
      });
      const contact = {
        id: `loss-contact:${seed}`,
        type: "PREPARED_ATTACK" as const,
        hexId: "17_29",
        attackerSide: "germany" as const,
        defenderSide: "ussr" as const,
        attackerParticipantIds: ["ger-1pz"],
        defenderParticipantIds: ["sov-2td"],
        attackerSupportIds: [],
        defenderSupportIds: [],
        attackerReserveIds: [],
        defenderReserveIds: [],
        impulse: 0,
        detectedBy: ["germany" as const, "ussr" as const],
        resolved: false,
        status: "ready" as const,
      };
      state.contacts.push(contact);
      const events: GameEvent[] = [];
      const resolution = resolveContact(state, contact, events);
      if ((resolution?.attackerLossSteps ?? 0) >= 1) {
        observed = true;
        expect(state.plans.germany.reactions).toEqual([]);
        expect(state.plans.germany.orders[0].status).toBe("failed");
        expect(
          events.some((event) => event.type === "ORDER_ABORTED_BY_LOSSES"),
        ).toBe(true);
      }
    }
    expect(observed).toBe(true);
  });
});
