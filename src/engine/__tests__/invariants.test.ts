import { describe, expect, it } from "vitest";
import { applyCommand } from "@/engine/engine";
import { buildCombatModel } from "@/engine/combat";
import {
  directionForEdge,
  getSharedEdge,
  setBridgeState,
  sharedEdgeKey,
  updateSharedEdge,
} from "@/engine/edges";
import { neighbors, parseKey } from "@/engine/hex";
import {
  commandInfo,
  endOfDayScoring,
  evaluateObjectives,
  predictCombat,
  reachableHexes,
} from "@/engine/rules";
import {
  canSpendCommandPoints,
  spendCommandPoints,
} from "@/engine/resources";
import { awardScoreEvent, scoreHistoricalDeadline } from "@/engine/scoring";
import { roll } from "@/engine/rng";
import {
  CARD_DEFS,
  createInitialState,
} from "@/scenarios/baltic-1941/scenario";
import type {
  GameEvent,
  GameState,
  HistoricalDeadline,
  Side,
  UnitState,
} from "@/engine/types";

function fresh(seed = 91041): GameState {
  return createInitialState({ seed, matchId: "invariant-test", mode: "legacy_debug" });
}

function enterLegacyPhase(state: GameState, count: number): GameState {
  let current = state;
  for (let index = 0; index < count; index++) {
    current = applyCommand(current, { type: "END_PHASE" }).state;
  }
  return current;
}

function moveUnit(state: GameState, unit: UnitState, hexId: string): void {
  const oldHex = state.hexes[unit.hexId];
  if (oldHex) oldHex.stackUnitIds = oldHex.stackUnitIds.filter((id) => id !== unit.id);
  unit.hexId = hexId;
  const nextHex = state.hexes[hexId];
  if (nextHex && !nextHex.stackUnitIds.includes(unit.id)) nextHex.stackUnitIds.push(unit.id);
}

function seedForRoll(minimum: number, maximum = minimum): number {
  for (let seed = 1; seed < 10000; seed++) {
    const die = 1 + Math.floor(roll(seed, 0).value * 6);
    if (die >= minimum && die <= maximum) return seed;
  }
  throw new Error("deterministic seed not found");
}

function combatFixture(die: number, strongAttack: boolean): {
  state: GameState;
  attacker: UnitState;
  defender: UnitState;
} {
  const state = fresh(seedForRoll(die));
  state.phase = "activation";
  state.activeSide = "germany";
  const attacker = Object.values(state.units).find(
    (unit) => unit.side === "germany" && unit.unitType === "tank",
  );
  const defender = Object.values(state.units).find(
    (unit) => unit.side === "ussr" && unit.unitType === "tank",
  );
  if (!attacker || !defender) throw new Error("fixture units unavailable");
  const targetHex = state.hexes[defender.hexId];
  const adjacent = neighbors(parseKey(defender.hexId))
    .map(({ q, r }) => state.hexes[`${q}_${r}`])
    .find((hex) => hex && hex.terrain !== "sea" && hex.terrain !== "lake");
  if (!targetHex || !adjacent) throw new Error("fixture hex unavailable");
  for (const unitId of [...targetHex.stackUnitIds]) {
    if (unitId !== defender.id) {
      const unit = state.units[unitId];
      if (unit) moveUnit(state, unit, adjacent.id);
    }
  }
  moveUnit(state, attacker, adjacent.id);
  targetHex.control = "ussr";
  attacker.attack = strongAttack ? 100 : 0.1;
  attacker.quality = 5;
  attacker.organization = 100;
  attacker.supplyState = "full";
  attacker.commandState = "in_command";
  attacker.ammunition = 100;
  attacker.acted = false;
  defender.defense = strongAttack ? 0.5 : 100;
  defender.quality = strongAttack ? 1 : 5;
  defender.organization = 100;
  defender.supplyState = "full";
  defender.commandState = "in_command";
  defender.currentSteps = strongAttack ? 1 : defender.maxSteps;
  const hq = commandInfo(state, attacker).hq;
  if (!hq) throw new Error("attacker has no own HQ");
  moveUnit(state, hq, adjacent.id);
  hq.commandPoints = 50;
  return { state, attacker, defender };
}

function bridgeFixture(): {
  state: GameState;
  hexId: string;
  edge: number;
  engineer: UnitState;
} {
  const state = enterLegacyPhase(fresh(), 2);
  const hex = Object.values(state.hexes).find((candidate) => candidate.bridgeEdges.length > 0);
  const engineer = Object.values(state.units).find(
    (unit) => unit.side === state.activeSide && unit.entityType === "combat_unit",
  );
  if (!hex || !engineer) throw new Error("bridge fixture unavailable");
  moveUnit(state, engineer, hex.id);
  engineer.traits.push("engineer");
  const hq = commandInfo(state, engineer).hq;
  if (hq) hq.commandPoints = 20;
  return { state, hexId: hex.id, edge: hex.bridgeEdges[0].edge, engineer };
}

describe("command point transactions", () => {
  it("rejects a negative command cost", () => {
    const result = canSpendCommandPoints(fresh(), "germany", -1);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("INVALID_COMMAND_COST");
  });

  it("accepts a zero cost without selecting a headquarters", () => {
    const result = canSpendCommandPoints(fresh(), "germany", 0);
    expect(result).toEqual({ ok: true });
  });

  it("accepts an exact balance and never goes negative", () => {
    const state = fresh();
    const hq = state.headquarters["ger-hq-lvi"];
    hq.commandPoints = 2;
    const events: GameEvent[] = [];
    const result = spendCommandPoints(state, events, "germany", 2, hq.id);
    expect(result.ok).toBe(true);
    expect(hq.commandPoints).toBe(0);
    expect(events).toContainEqual({
      type: "COMMAND_POINTS_SPENT",
      side: "germany",
      hqId: hq.id,
      amount: 2,
    });
  });

  it("rejects an insufficient balance without mutation", () => {
    const state = fresh();
    const hq = state.headquarters["ger-hq-lvi"];
    hq.commandPoints = 1;
    const events: GameEvent[] = [];
    const result = spendCommandPoints(state, events, "germany", 2, hq.id);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("INSUFFICIENT_COMMAND_POINTS");
    expect(hq.commandPoints).toBe(1);
    expect(events).toEqual([]);
  });

  it("rejects movement before changing the state when CP are exhausted", () => {
    const state = enterLegacyPhase(fresh(), 4);
    const unit = Object.values(state.units).find(
      (candidate) =>
        candidate.side === "germany" &&
        candidate.entityType === "combat_unit" &&
        reachableHexes(state, [candidate.id]).size > 0,
    );
    if (!unit) throw new Error("movable unit unavailable");
    const destinationHexId = [...reachableHexes(state, [unit.id]).keys()][0];
    for (const hq of Object.values(state.headquarters)) {
      if (hq.side === "germany") hq.commandPoints = 0;
    }
    const result = applyCommand(state, {
      type: "MOVE_STACK",
      unitIds: [unit.id],
      destinationHexId,
    });
    expect(result.ok).toBe(false);
    expect(result.errors[0].code).toBe("INSUFFICIENT_COMMAND_POINTS");
    expect(result.state).toBe(state);
    expect(state.units[unit.id].hexId).toBe(unit.hexId);
  });

  it("spends CP only after a valid order assignment", () => {
    const state = enterLegacyPhase(fresh(), 2);
    const unit = state.units["ger-1pz"];
    const hq = commandInfo(state, unit).hq;
    if (!hq) throw new Error("HQ unavailable");
    const before = hq.commandPoints;
    const invalid = applyCommand(state, {
      type: "ASSIGN_ORDER",
      unitIds: ["missing"],
      order: { type: "hold", assignedAtTurn: 1 },
    });
    expect(invalid.ok).toBe(false);
    expect(hq.commandPoints).toBe(before);
    const valid = applyCommand(state, {
      type: "ASSIGN_ORDER",
      unitIds: [unit.id],
      order: { type: "hold", assignedAtTurn: 1 },
    });
    expect(valid.ok).toBe(true);
    expect(valid.state.headquarters[hq.id].commandPoints).toBe(before - 1);
  });
});

describe("card zones and costs", () => {
  it("keeps deck and hand zones mutually exclusive", () => {
    const state = fresh();
    for (const cardId of state.playerHands.germany) {
      expect(state.cards[cardId].state).toBe("hand");
      expect(state.cardDeck).not.toContain(cardId);
    }
    for (const cardId of state.cardDeck) {
      expect(state.cards[cardId].state).toBe("deck");
    }
  });

  it("spends the declared card cost and moves the card to discard", () => {
    const state = enterLegacyPhase(fresh(), 2);
    const cardId = state.playerHands.germany[0];
    const definition = CARD_DEFS.find((candidate) => candidate.defId === state.cards[cardId].defId);
    if (!definition) throw new Error("card definition unavailable");
    const before = Object.values(state.headquarters)
      .filter((hq) => hq.side === "germany")
      .reduce((sum, hq) => sum + hq.commandPoints, 0);
    const result = applyCommand(state, { type: "PLAY_CARD", cardId });
    expect(result.ok).toBe(true);
    const after = Object.values(result.state.headquarters)
      .filter((hq) => hq.side === "germany")
      .reduce((sum, hq) => sum + hq.commandPoints, 0);
    expect(after).toBe(before - definition.commandCost);
    expect(result.state.cards[cardId].state).toBe("discard");
    expect(result.state.playerHands.germany).not.toContain(cardId);
  });

  it("cannot apply one card twice", () => {
    const state = enterLegacyPhase(fresh(), 2);
    const cardId = state.playerHands.germany[0];
    const first = applyCommand(state, { type: "PLAY_CARD", cardId });
    const second = applyCommand(first.state, { type: "PLAY_CARD", cardId });
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(false);
    expect(second.errors[0].code).toBe("not_in_hand");
  });

  it("does not spend CP for a card absent from hand", () => {
    const state = enterLegacyPhase(fresh(), 2);
    const deckCard = state.cardDeck[0];
    const before = JSON.stringify(
      Object.fromEntries(
        Object.entries(state.headquarters).map(([id, hq]) => [id, hq.commandPoints]),
      ),
    );
    const result = applyCommand(state, { type: "PLAY_CARD", cardId: deckCard });
    expect(result.ok).toBe(false);
    expect(
      JSON.stringify(
        Object.fromEntries(
          Object.entries(state.headquarters).map(([id, hq]) => [id, hq.commandPoints]),
        ),
      ),
    ).toBe(before);
  });
});

describe("shared edge integrity and demolition", () => {
  it("reads one bridge consistently from both adjacent hexes", () => {
    const { state, hexId, edge } = bridgeFixture();
    const direction = directionForEdge(edge);
    if (direction == null) throw new Error("direction unavailable");
    const first = getSharedEdge(state, hexId, direction);
    if (!first) throw new Error("shared edge unavailable");
    const reverseEdge = first.toEdge;
    const reverseDirection = directionForEdge(reverseEdge);
    if (reverseDirection == null) throw new Error("reverse direction unavailable");
    const second = getSharedEdge(state, first.to.id, reverseDirection);
    expect(second?.bridge?.state).toBe(first.bridge?.state);
    expect(sharedEdgeKey(state, hexId, edge)).toBe(
      sharedEdgeKey(state, first.to.id, reverseEdge),
    );
  });

  it("updates destruction symmetrically", () => {
    const { state, hexId, edge } = bridgeFixture();
    const direction = directionForEdge(edge);
    if (direction == null) throw new Error("direction unavailable");
    const shared = setBridgeState(state, hexId, edge, "destroyed");
    expect(shared?.from.bridgeEdges.find((bridge) => bridge.edge === shared.fromEdge)?.state).toBe(
      "destroyed",
    );
    expect(shared?.to.bridgeEdges.find((bridge) => bridge.edge === shared.toEdge)?.state).toBe(
      "destroyed",
    );
  });

  it("updates repair symmetrically", () => {
    const { state, hexId, edge } = bridgeFixture();
    setBridgeState(state, hexId, edge, "destroyed");
    const shared = setBridgeState(state, hexId, edge, "intact");
    expect(shared?.bridge?.state).toBe("intact");
    expect(shared?.to.bridgeEdges.find((bridge) => bridge.edge === shared.toEdge)?.state).toBe(
      "intact",
    );
  });

  it("builds a pontoon on both sides of a shared edge", () => {
    const { state, hexId, edge } = bridgeFixture();
    const direction = directionForEdge(edge);
    if (direction == null) throw new Error("direction unavailable");
    const shared = updateSharedEdge(state, hexId, direction, (bridge) => ({
      edge,
      type: bridge?.type ?? "combined",
      state: "pontoon",
    }));
    expect(shared?.bridge?.state).toBe("pontoon");
    expect(shared?.to.bridgeEdges.find((bridge) => bridge.edge === shared.toEdge)?.state).toBe(
      "pontoon",
    );
  });

  it("does not let an ordinary division prepare a bridge", () => {
    const { state, hexId, edge, engineer } = bridgeFixture();
    engineer.traits = engineer.traits.filter((trait) => trait !== "engineer");
    const result = applyCommand(state, {
      type: "PREPARE_BRIDGE_DEMOLITION",
      defenderHexId: hexId,
      edge,
    });
    expect(result.ok).toBe(false);
    expect(result.errors[0].code).toBe("ENGINEER_REQUIRED");
  });

  it("requires preparation before detonation", () => {
    const { state, hexId, edge } = bridgeFixture();
    const result = applyCommand(state, {
      type: "DETONATE_BRIDGE",
      defenderHexId: hexId,
      edge,
    });
    expect(result.ok).toBe(false);
    expect(result.errors[0].code).toBe("BRIDGE_NOT_PREPARED");
  });

  it("prepares and detonates a bridge as two events", () => {
    const { state, hexId, edge } = bridgeFixture();
    const prepared = applyCommand(state, {
      type: "PREPARE_BRIDGE_DEMOLITION",
      defenderHexId: hexId,
      edge,
    });
    expect(prepared.ok).toBe(true);
    expect(prepared.events.some((event) => event.type === "BRIDGE_PREPARED")).toBe(true);
    const detonated = applyCommand(prepared.state, {
      type: "DETONATE_BRIDGE",
      defenderHexId: hexId,
      edge,
    });
    expect(detonated.ok).toBe(true);
    expect(detonated.events.some((event) => event.type === "BRIDGE_DESTROYED")).toBe(true);
    const direction = directionForEdge(edge);
    expect(direction == null ? undefined : getSharedEdge(detonated.state, hexId, direction)?.bridge?.state).toBe(
      "destroyed",
    );
  });
});

describe("canonical combat model and control", () => {
  it("uses the exact same model for preview and resolution inputs", () => {
    const { state, attacker, defender } = combatFixture(3, true);
    defender.traits.push("heavy_armor");
    const model = buildCombatModel(state, {
      attackerIds: [attacker.id],
      defenderHexId: defender.hexId,
    });
    const preview = predictCombat(state, [attacker.id], defender.hexId);
    expect(preview.model).toEqual(model);
    expect(preview.ratio).toBe(model.ratio);
  });

  it("applies heavy armor exactly once", () => {
    const { state, attacker, defender } = combatFixture(3, false);
    attacker.traits = attacker.traits.filter(
      (trait) => trait !== "combined_arms" && trait !== "heavy_at",
    );
    defender.traits.push("heavy_armor");
    const model = buildCombatModel(state, {
      attackerIds: [attacker.id],
      defenderHexId: defender.hexId,
    });
    expect(model.armorModifiers.filter((modifier) => modifier.id === "heavy_armor")).toHaveLength(1);
    expect(model.armorModifiers[0].multiplier).toBe(0.6);
  });

  it("air support penetrates heavy armor instead of duplicating its modifier", () => {
    const { state, attacker, defender } = combatFixture(3, false);
    attacker.traits = [];
    defender.traits.push("heavy_armor");
    const model = buildCombatModel(state, {
      attackerIds: [attacker.id],
      defenderHexId: defender.hexId,
      airBonus: 3,
    });
    expect(model.penetratesHeavyArmor).toBe(true);
    expect(model.armorModifiers).toEqual([]);
  });

  it("isolation still weakens a heavy-armored defender", () => {
    const { state, attacker, defender } = combatFixture(3, false);
    attacker.traits = [];
    defender.traits.push("heavy_armor");
    defender.supplyState = "full";
    const supplied = buildCombatModel(state, {
      attackerIds: [attacker.id],
      defenderHexId: defender.hexId,
    });
    defender.supplyState = "isolated";
    const isolated = buildCombatModel(state, {
      attackerIds: [attacker.id],
      defenderHexId: defender.hexId,
    });
    expect(isolated.defenderStrength).toBeLessThan(supplied.defenderStrength);
  });

  it("does not change control after a failed attack", () => {
    const { state, attacker, defender } = combatFixture(3, false);
    const before = state.hexes[defender.hexId].control;
    const result = applyCommand(state, {
      type: "RESOLVE_COMBAT",
      unitIds: [attacker.id],
      defenderHexId: defender.hexId,
    });
    expect(result.ok).toBe(true);
    expect(result.state.hexes[defender.hexId].control).toBe(before);
  });

  it("marks an evacuated hex contested when no attacker advances", () => {
    const { state, attacker, defender } = combatFixture(1, true);
    const result = applyCommand(state, {
      type: "RESOLVE_COMBAT",
      unitIds: [attacker.id],
      defenderHexId: defender.hexId,
    });
    expect(result.ok).toBe(true);
    expect(result.state.units[defender.id].hexId).not.toBe(defender.hexId);
    expect(result.state.hexes[defender.hexId].control).toBe("contested");
  });

  it("changes control only when the selected attacker actually advances", () => {
    const { state, attacker, defender } = combatFixture(3, true);
    const result = applyCommand(state, {
      type: "RESOLVE_COMBAT",
      unitIds: [attacker.id],
      defenderHexId: defender.hexId,
      advanceUnitId: attacker.id,
    });
    expect(result.ok).toBe(true);
    expect(result.state.units[attacker.id].hexId).toBe(defender.hexId);
    expect(result.state.hexes[defender.hexId].control).toBe("germany");
  });

  it("makes advance available after all defenders are eliminated", () => {
    const { state, attacker, defender } = combatFixture(6, true);
    const result = applyCommand(state, {
      type: "RESOLVE_COMBAT",
      unitIds: [attacker.id],
      defenderHexId: defender.hexId,
      advanceUnitId: attacker.id,
    });
    expect(result.ok).toBe(true);
    expect(result.state.units[defender.id].eliminated).toBe(true);
    expect(result.state.lastCombat?.advanceHexId).toBe(defender.hexId);
  });
});

describe("event scoring and deadlines", () => {
  it("awards a unique score event once", () => {
    const state = fresh();
    const events: GameEvent[] = [];
    expect(awardScoreEvent(state, events, "unique", "ussr", "delayPoints", 3)).toBe(true);
    expect(awardScoreEvent(state, events, "unique", "ussr", "delayPoints", 3)).toBe(false);
    expect(state.scores.ussr.delayPoints).toBe(3);
  });

  it("does not recount the same end-of-day score", () => {
    const state = fresh();
    endOfDayScoring(state);
    const first = JSON.stringify(state.scores);
    endOfDayScoring(state);
    expect(JSON.stringify(state.scores)).toBe(first);
  });

  it("scores early, on-time, late and minimum deadline outcomes", () => {
    const deadline: HistoricalDeadline = {
      historicalDate: "1941-06-26",
      targetTurn: 5,
      scoringCurve: { earlyPerTurn: 1, latePerTurn: 2, minimum: 0, maximum: 16 },
    };
    expect(scoreHistoricalDeadline(deadline, 3, 12)).toBe(14);
    expect(scoreHistoricalDeadline(deadline, 5, 12)).toBe(12);
    expect(scoreHistoricalDeadline(deadline, 7, 12)).toBe(8);
    expect(scoreHistoricalDeadline(deadline, 20, 12)).toBe(0);
  });

  it("evaluates preservation objectives during final calculation", () => {
    const state = fresh();
    state.turn = 18;
    const events = evaluateObjectives(state, true);
    expect(state.objectives.find((objective) => objective.id === "s-preserve2td")?.status).toBe(
      "completed",
    );
    expect(events.some((event) => event.type === "OBJECTIVE_COMPLETED")).toBe(true);
  });

  it.each([
    ["germany", "ussr"],
    ["ussr", "germany"],
  ] as Array<[Side, Side]>)("keeps one-time scoring separate for %s and %s", (first, second) => {
    const state = fresh();
    const events: GameEvent[] = [];
    awardScoreEvent(state, events, "same-subject:first", first, "operationalPoints", 1);
    awardScoreEvent(state, events, "same-subject:second", second, "operationalPoints", 1);
    expect(state.scores[first].operationalPoints).toBe(1);
    expect(state.scores[second].operationalPoints).toBe(1);
  });
});
