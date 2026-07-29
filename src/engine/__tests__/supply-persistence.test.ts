import { describe, expect, it } from "vitest";
import { setBridgeState } from "@/engine/edges";
import { directionForEdge } from "@/engine/edges";
import { neighbors, parseKey } from "@/engine/hex";
import {
  createSaveGame,
  migrateSaveGame,
  restoreSaveGame,
} from "@/engine/persistence";
import { recomputeSupply, supplyDistances } from "@/engine/rules";
import { createInitialState } from "@/scenarios/baltic-1941/scenario";
import type { GameState, HexState, UnitState } from "@/engine/types";

function fresh(): GameState {
  return createInitialState({
    seed: 8080,
    matchId: "supply-persistence",
    mode: "legacy_debug",
  });
}

function narrowBridgeNetwork(): {
  state: GameState;
  from: HexState;
  to: HexState;
  edge: number;
} {
  const state = fresh();
  const from = Object.values(state.hexes).find((hex) => hex.bridgeEdges.length > 0);
  if (!from) throw new Error("bridge unavailable");
  const edge = from.bridgeEdges[0].edge;
  const direction = directionForEdge(edge);
  if (direction == null) throw new Error("bridge direction unavailable");
  const next = neighbors(parseKey(from.id))[direction];
  const to = state.hexes[`${next.q}_${next.r}`];
  if (!to) throw new Error("bridge neighbor unavailable");
  from.control = "germany";
  to.control = "germany";
  from.stackUnitIds = [];
  to.stackUnitIds = [];
  state.hexes = { [from.id]: from, [to.id]: to };
  state.units = {};
  state.headquarters = {};
  state.supplySources = {
    source: {
      id: "source",
      side: "germany",
      hexId: from.id,
      kind: "map_edge",
      capacity: 10,
      active: true,
      sourceIds: ["geo"],
    },
  };
  return { state, from, to, edge };
}

function moveUnit(state: GameState, unit: UnitState, hexId: string): void {
  const old = state.hexes[unit.hexId];
  if (old) old.stackUnitIds = old.stackUnitIds.filter((id) => id !== unit.id);
  unit.hexId = hexId;
  state.hexes[hexId].stackUnitIds.push(unit.id);
}

describe("explicit supply network", () => {
  it("does not treat an isolated major city as a supply source", () => {
    const state = fresh();
    const city = Object.values(state.hexes).find(
      (hex) => hex.settlement && hex.settlement.supplyCapacity >= 3,
    );
    if (!city) throw new Error("city unavailable");
    state.supplySources = {};
    const distances = supplyDistances(state, city.control === "germany" ? "germany" : "ussr");
    expect(distances.has(city.id)).toBe(false);
  });

  it("traces supply across an intact bridge", () => {
    const { state, to } = narrowBridgeNetwork();
    expect(supplyDistances(state, "germany").has(to.id)).toBe(true);
  });

  it("breaks the only supply route when the bridge is destroyed", () => {
    const { state, from, to, edge } = narrowBridgeNetwork();
    setBridgeState(state, from.id, edge, "destroyed");
    expect(supplyDistances(state, "germany").has(to.id)).toBe(false);
  });

  it("blocks a supply route through enemy ZOC", () => {
    const state = fresh();
    const sourceHex = Object.values(state.hexes).find((hex) => {
      if (hex.terrain !== "clear") return false;
      const adjacent = neighbors(parseKey(hex.id))
        .map(({ q, r }) => state.hexes[`${q}_${r}`])
        .filter((candidate) => candidate?.terrain === "clear");
      return adjacent.length >= 2;
    });
    if (!sourceHex) throw new Error("source fixture unavailable");
    const adjacent = neighbors(parseKey(sourceHex.id))
      .map(({ q, r }) => state.hexes[`${q}_${r}`])
      .filter((hex) => hex?.terrain === "clear");
    const target = adjacent[0];
    const enemyHex = adjacent.find(
      (hex) =>
        hex.id !== target.id &&
        neighbors(parseKey(target.id)).some(({ q, r }) => `${q}_${r}` === hex.id),
    );
    const enemy = Object.values(state.units).find(
      (unit) => unit.side === "ussr" && unit.entityType === "combat_unit",
    );
    if (!target || !enemyHex || !enemy) throw new Error("ZOC fixture unavailable");
    for (const hex of [sourceHex, target, enemyHex]) {
      hex.control = "germany";
      hex.stackUnitIds = [];
    }
    enemyHex.control = "ussr";
    enemy.hexId = enemyHex.id;
    enemyHex.stackUnitIds.push(enemy.id);
    state.hexes = {
      [sourceHex.id]: sourceHex,
      [target.id]: target,
      [enemyHex.id]: enemyHex,
    };
    state.units = { [enemy.id]: enemy };
    state.headquarters = {};
    state.supplySources = {
      source: {
        id: "source",
        side: "germany",
        hexId: sourceHex.id,
        kind: "map_edge",
        capacity: 1,
        active: true,
        sourceIds: ["geo"],
      },
    };
    expect(supplyDistances(state, "germany").has(target.id)).toBe(false);
  });

  it("prevents a disconnected HQ from supplying its divisions", () => {
    const state = fresh();
    state.supplySources = {};
    recomputeSupply(state);
    const unit = state.units["sov-2td"];
    expect(["none", "isolated"]).toContain(state.headquarters["sov-hq-3mc"].supplyState);
    expect(["none", "isolated"]).toContain(unit.supplyState);
  });

  it("classifies encirclement from supply and retreat routes", () => {
    const state = fresh();
    state.supplySources = {};
    const defender = state.units["sov-2td"];
    const enemyUnits = Object.values(state.units).filter(
      (unit) => unit.side === "germany" && unit.entityType === "combat_unit",
    );
    let index = 0;
    for (const neighbor of neighbors(parseKey(defender.hexId))) {
      const hex = state.hexes[`${neighbor.q}_${neighbor.r}`];
      if (!hex) continue;
      const enemy = enemyUnits[index % enemyUnits.length];
      moveUnit(state, enemy, hex.id);
      index += 1;
    }
    recomputeSupply(state);
    expect(["partially_encircled", "encircled", "isolated"]).toContain(
      defender.encirclementState,
    );
  });
});

describe("save migration", () => {
  it("creates a versioned v0.4 save envelope", () => {
    const state = fresh();
    const save = createSaveGame(state, [{ type: "END_PHASE" }]);
    expect(save.schemaVersion).toBe(5);
    expect(save.engineVersion).toBe("0.4.1");
    expect(save.scenarioVersion).toBe("0.4.1");
    expect(save.commands).toEqual([{ type: "END_PHASE" }]);
  });

  it("migrates a v0.2 summary and command log", () => {
    const result = migrateSaveGame({
      summary: { seed: 42, matchId: "old", mode: "legacy_debug" },
      scenarioId: "baltic-1941",
      commands: [{ type: "END_PHASE" }],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.migratedFrom).toBe(2);
      expect(result.save.schemaVersion).toBe(5);
      expect(result.save.seed).toBe(42);
      expect(result.warnings.length).toBeGreaterThan(0);
    }
  });

  it("rejects a future schema with a clear error", () => {
    const result = migrateSaveGame({
      schemaVersion: 99,
      seed: 1,
      commands: [],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("UNSUPPORTED_SCHEMA");
      expect(result.message).toContain("99");
    }
  });

  it("rejects malformed saves without throwing", () => {
    expect(migrateSaveGame(null).ok).toBe(false);
    expect(migrateSaveGame({ seed: 1, commands: "bad" }).ok).toBe(false);
    expect(restoreSaveGame({ seed: "bad", commands: [] }).ok).toBe(false);
  });

  it("restores a migrated command log deterministically", () => {
    const input = {
      summary: { seed: 88, matchId: "old", mode: "legacy_debug" },
      scenarioId: "baltic-1941",
      commands: [{ type: "END_PHASE" }],
    };
    const first = restoreSaveGame(input);
    const second = restoreSaveGame(input);
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (first.ok && second.ok) {
      expect(first.state.phase).toBe(second.state.phase);
      expect(first.state.eventLog).toEqual(second.state.eventLog);
    }
  });
});
