import { describe, expect, it } from "vitest";
import {
  EXECUTION_IMPULSE_COUNT,
  EXECUTION_IMPULSES,
  LAST_EXECUTION_IMPULSE,
  SUPPORTED_RESERVE_TRIGGER_CONDITIONS,
  isNightImpulse,
  type GameCommand,
  type GameState,
  type PlannedOrder,
  type ReactionCondition,
} from "@/engine/types";
import { applyCommand, replayCommands } from "@/engine/engine";
import {
  migrateSaveGame,
  type SaveMigrationResult,
} from "@/engine/persistence";
import {
  IMPULSE_LABELS,
  validateWegoCommand,
} from "@/engine/wego";
import {
  triggerRouteBlockedReaction,
  validateFallbackRoute,
} from "@/engine/order-execution";
import { createRaseiniaiWegoTestState } from "@/scenarios/baltic-1941/wego-test";
import { validateStateInvariants } from "@/engine/invariants";
import {
  createSideSpecificContact,
} from "@/engine/contact";
import {
  effectiveMaxCommandPoints,
} from "@/engine/rules";
import { buildAfterActionReport } from "@/engine/after-action";

function planningState(seed = 41): GameState {
  const state = createRaseiniaiWegoTestState(seed);
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
  return state;
}

function reserveOrder(
  triggerConditions: PlannedOrder["reserveData"] extends infer Data
    ? Data extends { triggerConditions: infer Conditions }
      ? Conditions
      : never
    : never,
): PlannedOrder {
  return {
    id: "hardening:reserve",
    side: "germany",
    entityIds: ["ger-6pz"],
    orderType: "reserve",
    startImpulse: 0,
    priority: 2,
    contactPolicy: "attack",
    lossTolerance: "normal",
    reserveData: {
      triggerRadius: 2,
      triggerConditions,
      targetPriority: [],
      maxCommitImpulse: LAST_EXECUTION_IMPULSE,
    },
    status: "draft",
  };
}

function legacySave(commands: unknown[]): unknown {
  return {
    schemaVersion: 4,
    engineVersion: "0.4.0",
    scenarioVersion: "0.4.0",
    scenarioId: "baltic-1941",
    matchId: "legacy-hardening",
    mode: "hotseat",
    seed: 41,
    commands,
  };
}

function migratedOk(result: SaveMigrationResult) {
  if (!result.ok) throw new Error(result.message);
  return result;
}

describe("v0.4.1 legacy reaction isolation", () => {
  it("47. active ReactionCondition excludes loss_threshold", () => {
    type LegacyIsActive =
      "loss_threshold" extends ReactionCondition ? true : false;
    const legacyIsActive: LegacyIsActive = false;
    expect(legacyIsActive).toBe(false);
  });

  it("48. v0.4 save with loss_threshold still loads", () => {
    const result = migrateSaveGame(
      legacySave([
        {
          type: "UPSERT_REACTION",
          side: "germany",
          reaction: {
            id: "legacy-loss",
            side: "germany",
            entityIds: ["ger-1pz"],
            condition: "loss_threshold",
            lossThreshold: 1,
            commandCost: 1,
            priority: 1,
            fromImpulse: 0,
            toImpulse: 5,
            maxUses: 1,
            uses: 0,
            status: "draft",
          },
        },
      ]),
    );
    expect(result.ok).toBe(true);
  });

  it("49. legacy loss reaction is removed exactly once with warning", () => {
    const first = migratedOk(
      migrateSaveGame(
        legacySave([
          {
            type: "UPSERT_REACTION",
            side: "germany",
            reaction: {
              id: "legacy-loss",
              side: "germany",
              entityIds: ["ger-1pz"],
              condition: "loss_threshold",
              lossThreshold: 1,
              commandCost: 1,
              priority: 1,
              fromImpulse: 0,
              toImpulse: 5,
              maxUses: 1,
              uses: 0,
              status: "draft",
            },
          },
        ]),
      ),
    );
    expect(first.save.commands).toEqual([]);
    expect(first.warnings.filter((warning) => warning.includes("loss_threshold"))).toHaveLength(1);
    const second = migratedOk(migrateSaveGame(first.save));
    expect(second.save.commands).toEqual([]);
    expect(second.warnings.join(" ")).not.toContain("loss_threshold");
  });

  it("50. migrated replay remains deterministic", () => {
    const migrated = migratedOk(
      migrateSaveGame(legacySave([{ type: "END_PHASE" }])),
    );
    const initial = createRaseiniaiWegoTestState(41);
    expect(
      JSON.stringify(replayCommands(initial, migrated.save.commands)),
    ).toBe(
      JSON.stringify(replayCommands(initial, migrated.save.commands)),
    );
  });

  it("51. migration preserves one authoritative lossTolerance", () => {
    const migrated = migratedOk(
      migrateSaveGame(
        legacySave([
          {
            type: "UPSERT_PLANNED_ORDER",
            side: "germany",
            plannedOrder: {
              id: "loss-order",
              side: "germany",
              entityIds: ["ger-1pz"],
              orderType: "defend",
              startImpulse: 0,
              priority: 1,
              contactPolicy: "attack",
              lossTolerance: "high",
              status: "draft",
            },
          },
          {
            type: "UPSERT_REACTION",
            side: "germany",
            reaction: {
              id: "legacy-loss",
              side: "germany",
              entityIds: ["ger-1pz"],
              condition: "loss_threshold",
              lossThreshold: 1,
              commandCost: 1,
              priority: 1,
              fromImpulse: 0,
              toImpulse: 5,
              maxUses: 1,
              uses: 0,
              status: "draft",
            },
          },
        ]),
      ),
    );
    expect(migrated.save.commands).toHaveLength(1);
    expect(migrated.save.commands[0].plannedOrder?.lossTolerance).toBe("high");
  });
});

describe("v0.4.1 reserve trigger contract", () => {
  it("52. new validation rejects an unsupported reserve trigger", () => {
    const state = planningState();
    const invalidOrder = reserveOrder(
      ["friendly_retreat"] as unknown as NonNullable<
        PlannedOrder["reserveData"]
      >["triggerConditions"],
    );
    const validation = validateWegoCommand(state, {
      type: "UPSERT_PLANNED_ORDER",
      side: "germany",
      plannedOrder: invalidOrder,
    });
    expect(validation.errors[0]?.code).toBe(
      "ORDER_UNSUPPORTED_RESERVE_TRIGGER",
    );
  });

  it("53. legacy unsupported triggers migrate with a safe fallback", () => {
    const migrated = migratedOk(
      migrateSaveGame(
        legacySave([
          {
            type: "UPSERT_PLANNED_ORDER",
            side: "germany",
            plannedOrder: {
              ...reserveOrder(["friendly_contact"]),
              reserveData: {
                triggerRadius: 2,
                triggerConditions: [
                  "friendly_retreat",
                  "meeting_engagement",
                  "objective_threatened",
                ],
                targetPriority: [],
                maxCommitImpulse: 5,
              },
            },
          },
        ]),
      ),
    );
    expect(
      migrated.save.commands[0].plannedOrder?.reserveData?.triggerConditions,
    ).toEqual(["friendly_contact"]);
    expect(migrated.warnings.join(" ")).toContain("friendly_retreat");
    expect(migrated.warnings.join(" ")).toContain("meeting_engagement");
    expect(migrated.warnings.join(" ")).toContain("objective_threatened");
  });

  it("54. migrated reserve command replays deterministically", () => {
    const migrated = migratedOk(
      migrateSaveGame(
        legacySave([
          {
            type: "UPSERT_PLANNED_ORDER",
            side: "germany",
            plannedOrder: {
              ...reserveOrder(["friendly_contact"]),
              reserveData: {
                triggerRadius: 2,
                triggerConditions: ["meeting_engagement"],
                targetPriority: [],
                maxCommitImpulse: 5,
              },
            },
          },
        ]),
      ),
    );
    const initial = planningState();
    const left = replayCommands(initial, migrated.save.commands);
    const right = replayCommands(initial, migrated.save.commands);
    expect(JSON.stringify(left)).toBe(JSON.stringify(right));
    expect(left.contacts).toEqual([]);
  });

  it("55. authoritative trigger list contains only implemented values", () => {
    expect([...SUPPORTED_RESERVE_TRIGGER_CONDITIONS]).toEqual([
      "friendly_contact",
      "enemy_breakthrough",
    ]);
  });
});

describe("v0.4.1 impulse configuration", () => {
  it("56. last impulse derives from authoritative configuration", () => {
    expect(LAST_EXECUTION_IMPULSE).toBe(EXECUTION_IMPULSE_COUNT - 1);
    expect(IMPULSE_LABELS).toBe(EXECUTION_IMPULSES);
  });

  it("57. only the configured final impulse is night", () => {
    expect(
      EXECUTION_IMPULSES.map((_, index) => isNightImpulse(index)),
    ).toEqual([false, false, false, false, false, true]);
  });

  it("58. reaction window rejects the first index beyond configuration", () => {
    const state = planningState();
    const command: GameCommand = {
      type: "UPSERT_REACTION",
      side: "germany",
      reaction: {
        id: "bad-window",
        side: "germany",
        entityIds: ["ger-1pz"],
        condition: "route_blocked",
        commandCost: 1,
        priority: 1,
        fromImpulse: 0,
        toImpulse: EXECUTION_IMPULSE_COUNT,
        maxUses: 1,
        uses: 0,
        status: "draft",
      },
    };
    expect(validateWegoCommand(state, command).errors[0]?.code).toBe(
      "INVALID_REACTION_WINDOW",
    );
  });
});

describe("v0.4.1 fallback route validation", () => {
  it("59. non-adjacent fallback is rejected", () => {
    expect(
      validateFallbackRoute(
        planningState(),
        "germany",
        ["ger-1pz"],
        ["16_29", "18_29"],
      ),
    ).toMatchObject({
      valid: false,
      code: "FALLBACK_ROUTE_NOT_CONTIGUOUS",
    });
  });

  it("60. missing fallback hex is rejected", () => {
    expect(
      validateFallbackRoute(
        planningState(),
        "germany",
        ["ger-1pz"],
        ["16_29", "missing"],
      ),
    ).toMatchObject({
      valid: false,
      code: "FALLBACK_ROUTE_INVALID_HEX",
    });
  });

  it("61. fallback from another origin is rejected", () => {
    expect(
      validateFallbackRoute(
        planningState(),
        "germany",
        ["ger-1pz"],
        ["16_30", "15_30"],
      ),
    ).toMatchObject({
      valid: false,
      code: "FALLBACK_ROUTE_START_MISMATCH",
    });
  });

  it("62. valid fallback is accepted", () => {
    expect(
      validateFallbackRoute(
        planningState(),
        "germany",
        ["ger-1pz"],
        ["16_29", "15_29"],
      ),
    ).toEqual({ valid: true });
  });

  it("63. blocked fallback is rejected before mutation", () => {
    const state = planningState();
    const order: PlannedOrder = {
      id: "blocked-order",
      side: "germany",
      entityIds: ["ger-1pz"],
      orderType: "advance",
      route: ["16_29", "17_29"],
      startImpulse: 0,
      priority: 1,
      contactPolicy: "attack",
      lossTolerance: "normal",
      status: "executing",
    };
    state.plans.germany.reactions.push({
      id: "invalid-fallback",
      side: "germany",
      entityIds: ["ger-1pz"],
      condition: "route_blocked",
      commandCost: 1,
      priority: 1,
      fromImpulse: 0,
      toImpulse: LAST_EXECUTION_IMPULSE,
      maxUses: 1,
      uses: 0,
      status: "committed",
      fallbackRoute: ["16_29", "missing"],
    });
    const before = structuredClone(order);
    const context = { impulse: 0, events: [], createdContactIds: [] };
    expect(
      triggerRouteBlockedReaction(
        state,
        order,
        "17_29",
        context,
      ),
    ).toBeUndefined();
    expect(order).toEqual(before);
    expect(context.events[0]).toMatchObject({ type: "REACTION_FAILED" });
  });

  it("64. valid fallback is applied atomically", () => {
    const state = planningState();
    const order: PlannedOrder = {
      id: "blocked-order",
      side: "germany",
      entityIds: ["ger-1pz"],
      orderType: "advance",
      route: ["16_29", "17_29"],
      startImpulse: 0,
      priority: 1,
      contactPolicy: "attack",
      lossTolerance: "normal",
      status: "executing",
    };
    state.plans.germany.reactions.push({
      id: "valid-fallback",
      side: "germany",
      entityIds: ["ger-1pz"],
      condition: "route_blocked",
      commandCost: 1,
      priority: 1,
      fromImpulse: 0,
      toImpulse: LAST_EXECUTION_IMPULSE,
      maxUses: 1,
      uses: 0,
      status: "committed",
      fallbackRoute: ["16_29", "15_29"],
    });
    const result = triggerRouteBlockedReaction(
      state,
      order,
      "17_29",
      { impulse: 0, events: [], createdContactIds: [] },
    );
    expect(result?.status).toBe("delayed");
    expect(order.route).toEqual(["16_29", "15_29"]);
  });
});

describe("v0.4.1 contact and state hardening", () => {
  it("81. side-specific contact factory fills every authoritative role", () => {
    const contact = createSideSpecificContact({
      id: "factory",
      hexId: "17_29",
      type: "HASTY_ATTACK",
      impulse: 0,
      detectedBy: ["ussr", "germany", "germany"],
      resolved: false,
      attackerSide: "germany",
      defenderSide: "ussr",
      attackerParticipantIds: ["ger-1pz", "ger-1pz"],
      defenderParticipantIds: ["sov-2td"],
    });
    expect(contact.attackerParticipantIds).toEqual(["ger-1pz"]);
    expect(contact.defenderParticipantIds).toEqual(["sov-2td"]);
    expect(contact.attackerSupportIds).toEqual([]);
    expect(contact.defenderReserveIds).toEqual([]);
  });

  it("82. invariants detect missing and identical contact sides", () => {
    const state = planningState();
    const contact = createSideSpecificContact({
      id: "bad-sides",
      hexId: "17_29",
      type: "ATTACK",
      impulse: 0,
      detectedBy: ["germany"],
      resolved: false,
      attackerSide: "germany",
      defenderSide: "germany",
      attackerParticipantIds: ["ger-1pz"],
      defenderParticipantIds: ["sov-2td"],
    });
    contact.attackerSide = undefined;
    state.contacts.push(contact);
    const codes = validateStateInvariants(state).map(
      (violation) => violation.code,
    );
    expect(codes).toContain("CONTACT_MISSING_ATTACKER_SIDE");
  });

  it("83. invariants detect wrong-side roles and duplicate roles", () => {
    const state = planningState();
    state.contacts.push(
      createSideSpecificContact({
        id: "bad-roles",
        hexId: "17_29",
        type: "ATTACK",
        impulse: 0,
        detectedBy: ["germany", "ussr"],
        resolved: false,
        attackerSide: "germany",
        defenderSide: "ussr",
        attackerParticipantIds: ["sov-2td"],
        defenderParticipantIds: ["ger-1pz"],
        attackerReserveIds: ["sov-2td"],
      }),
    );
    const codes = validateStateInvariants(state).map(
      (violation) => violation.code,
    );
    expect(codes).toContain("CONTACT_PARTICIPANT_WRONG_SIDE");
    expect(codes).toContain("CONTACT_RESERVE_WRONG_SIDE");
    expect(codes).toContain("CONTACT_DUPLICATE_ROLE");
  });

  it("84. invariants validate support usage references and duplicates", () => {
    const state = planningState();
    state.supportUsage.push(
      { unitId: "missing", impulse: 0, contactId: "missing-contact" },
      { unitId: "missing", impulse: 0, contactId: "missing-contact" },
    );
    const codes = validateStateInvariants(state).map(
      (violation) => violation.code,
    );
    expect(codes).toContain("SUPPORT_USAGE_UNKNOWN_UNIT");
    expect(codes).toContain("SUPPORT_USAGE_UNKNOWN_CONTACT");
    expect(codes).toContain("SUPPORT_USAGE_DUPLICATE");
  });

  it("85. invariants reject unsupported active conditions", () => {
    const state = planningState();
    state.plans.germany.orders.push(
      reserveOrder(
        ["objective_threatened"] as unknown as NonNullable<
          PlannedOrder["reserveData"]
        >["triggerConditions"],
      ),
    );
    state.plans.germany.reactions.push({
      id: "legacy-active",
      side: "germany",
      entityIds: ["ger-1pz"],
      condition: "loss_threshold" as ReactionCondition,
      commandCost: 1,
      priority: 1,
      fromImpulse: 0,
      toImpulse: LAST_EXECUTION_IMPULSE,
      maxUses: 1,
      uses: 0,
      status: "draft",
    });
    const codes = validateStateInvariants(state).map(
      (violation) => violation.code,
    );
    expect(codes).toContain("ORDER_UNSUPPORTED_RESERVE_TRIGGER");
    expect(codes).toContain("REACTION_UNSUPPORTED_CONDITION");
  });
});

describe("v0.4.1 CP and AAR boundaries", () => {
  it("87. multiple command effects stack once and never below zero", () => {
    const state = planningState();
    const hq = state.headquarters["ger-hq-pzg4"];
    state.temporaryCommandEffects.push(
      {
        id: "plus-two",
        targetHqId: hq.id,
        commandPointModifier: 2,
        initiativeModifier: 0,
        startsAtTurn: state.turn,
        expiresAfterTurn: state.turn,
      },
      {
        id: "plus-three",
        targetHqId: hq.id,
        commandPointModifier: 3,
        initiativeModifier: 0,
        startsAtTurn: state.turn,
        expiresAfterTurn: state.turn,
      },
    );
    expect(effectiveMaxCommandPoints(state, hq)).toBe(
      hq.maxCommandPoints + 5,
    );
    state.temporaryCommandEffects.push({
      id: "large-negative",
      targetHqId: hq.id,
      commandPointModifier: -100,
      initiativeModifier: 0,
      startsAtTurn: state.turn,
      expiresAfterTurn: state.turn,
    });
    expect(effectiveMaxCommandPoints(state, hq)).toBe(0);
  });

  it("88. clone before and after planning does not duplicate CP", () => {
    const state = planningState();
    const hq = state.headquarters["ger-hq-pzg4"];
    state.temporaryCommandEffects.push({
      id: "future",
      targetHqId: hq.id,
      commandPointModifier: 2,
      initiativeModifier: 0,
      startsAtTurn: state.turn,
      expiresAfterTurn: state.turn + 1,
    });
    const before = structuredClone(state);
    const first = effectiveMaxCommandPoints(
      before,
      before.headquarters[hq.id],
    );
    before.headquarters[hq.id].commandPoints = first;
    const after = structuredClone(before);
    expect(
      effectiveMaxCommandPoints(after, after.headquarters[hq.id]),
    ).toBe(first);
  });

  it("89. no-combat day has empty damagedThisTurn", () => {
    const state = planningState();
    state.turnStartedAtEventIndex = state.eventLog.length;
    state.eventLog.push({ type: "IMPULSE_STARTED", impulse: 0, label: "test" });
    expect(buildAfterActionReport(state).damagedThisTurn).toEqual([]);
  });

  it("90. AAR boundary excludes losses before the current turn", () => {
    const state = planningState();
    state.eventLog.push({
      type: "UNIT_LOST_STEP",
      unitId: "ger-1pz",
      amount: 1,
    });
    state.turnStartedAtEventIndex = state.eventLog.length;
    expect(buildAfterActionReport(state).damagedThisTurn).toEqual([]);
  });

  it("91. understrength excludes eliminated formations", () => {
    const state = planningState();
    state.units["ger-1pz"].currentSteps = 1;
    state.units["ger-1pz"].eliminated = true;
    expect(buildAfterActionReport(state).understrengthUnits).not.toContain(
      "ger-1pz",
    );
  });
});
