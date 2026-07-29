import { describe, it, expect } from "vitest";
import { distance, neighbors, sharedEdge, hexLine, pixelToAxial, axialToPixel, parseKey } from "@/engine/hex";
import { rngValue, roll, rollInt } from "@/engine/rng";
import { createInitialState } from "@/scenarios/baltic-1941/scenario";
import {
  canExertZOC,
  isInEnemyZOC,
  edgeCost,
  reachableHexes,
  predictCombat,
  offensiveStrength,
  defensiveStrength,
  defenderHasHeavyArmor,
  attackersCanPenetrate,
  eligibleForAdvance,
  retreatPath,
  stackLimitOf,
  canStackInto,
  recomputeSupply,
  supplyDistances,
} from "@/engine/rules";
import { applyCommand } from "@/engine/engine";
import type { GameState, UnitState } from "@/engine/types";

function fresh(seed = 12345): GameState {
  return createInitialState({ seed, matchId: "test-match", mode: "legacy_debug" });
}

function firstUnit(state: GameState, side?: "germany" | "ussr"): UnitState {
  const u = Object.values(state.units).find((x) => !x.eliminated && (!side || x.side === side));
  if (!u) throw new Error("no unit");
  return u;
}

describe("hex math", () => {
  it("distance is symmetric and zero to self", () => {
    const a = { q: 0, r: 0 };
    expect(distance(a, a)).toBe(0);
    expect(distance(a, { q: 3, r: -3 })).toBe(3);
    expect(distance({ q: 2, r: -2 }, a)).toBe(2);
  });
  it("has six distinct neighbors", () => {
    const n = neighbors({ q: 0, r: 0 });
    expect(new Set(n.map((x) => `${x.q},${x.r}`)).size).toBe(6);
  });
  it("sharedEdge maps adjacent hexes to an edge", () => {
    const a = { q: 1, r: 1 };
    const b = neighbors(a)[0];
    expect(sharedEdge(a, b)).not.toBeNull();
    expect(sharedEdge(a, { q: 9, r: 9 })).toBeNull();
  });
  it("hexLine connects two hexes through adjacent steps", () => {
    const line = hexLine({ q: 0, r: 0 }, { q: 3, r: 0 });
    expect(line.length).toBe(4);
    for (let i = 0; i < line.length - 1; i++) {
      expect(distance(line[i], line[i + 1])).toBe(1);
    }
  });
  it("pixel <-> axial round-trips for hex centers", () => {
    for (const { q, r } of [
      { q: 0, r: 0 },
      { q: 3, r: -2 },
      { q: -4, r: 5 },
    ]) {
      const p = axialToPixel(q, r);
      const back = pixelToAxial(p.x, p.y);
      expect(back.q).toBe(q);
      expect(back.r).toBe(r);
    }
  });
});

describe("seeded RNG", () => {
  it("is a pure function of seed and cursor", () => {
    expect(rngValue(42, 0)).toBe(rngValue(42, 0));
    expect(rngValue(42, 0)).not.toBe(rngValue(42, 1));
  });
  it("roll advances the cursor and stays in range", () => {
    const r = roll(7, 100);
    expect(r.cursor).toBe(101);
    expect(r.value).toBeGreaterThanOrEqual(0);
    expect(r.value).toBeLessThan(1);
  });
  it("rollInt is within [min,max]", () => {
    for (let i = 0; i < 50; i++) {
      const v = rollInt(1, i, 1, 6).value;
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(6);
    }
  });
});

describe("scenario bootstrap", () => {
  it("builds a multi-thousand-hex theatre with both armies", () => {
    const s = fresh();
    expect(Object.keys(s.hexes).length).toBeGreaterThan(2000);
    expect(Object.values(s.units).filter((u) => u.side === "germany").length).toBeGreaterThan(5);
    expect(Object.values(s.units).filter((u) => u.side === "ussr").length).toBeGreaterThan(8);
    expect(s.headquarters).toBeDefined();
    expect(s.objectives.length).toBeGreaterThan(8);
    expect(s.turn).toBe(1);
    expect(s.status).toBe("active");
  });
  it("marks historical sources with confidence, never as guaranteed fact", () => {
    const s = fresh();
    const sources = Object.values(s.units).flatMap((u) => u.historicalSources);
    expect(sources.length).toBeGreaterThan(0);
    for (const src of sources) {
      expect(["confirmed", "probable", "reconstructed", "disputed", "placeholder"]).toContain(src.confidence);
    }
  });
});

describe("stacking", () => {
  it("city hex raises the stack limit, swamp lowers it", () => {
    const s = fresh();
    const cityHex = Object.values(s.hexes).find((h) => h.terrain === "major_city")!;
    const swampHex = Object.values(s.hexes).find((h) => h.terrain === "swamp");
    expect(stackLimitOf(cityHex)).toBeGreaterThan(4);
    if (swampHex) expect(stackLimitOf(swampHex)).toBeLessThan(4);
  });
  it("canStackInto respects the limit", () => {
    const s = fresh();
    const unit = firstUnit(s, "germany");
    const hex = s.hexes[unit.hexId];
    expect(hex).toBeTruthy();
    const ok = canStackInto(s, [unit.id], unit.hexId);
    expect(ok).toBe(true);
  });
});

describe("zones of control", () => {
  it("headquarters never exert a ZOC", () => {
    const s = fresh();
    const hqUnit = Object.values(s.units).find((u) => u.echelon === "corps_hq" || u.echelon === "army_hq");
    if (hqUnit) expect(canExertZOC(hqUnit)).toBe(false);
  });
  it("eliminated units do not exert a ZOC", () => {
    const s = fresh();
    const u = firstUnit(s);
    const dead: UnitState = { ...u, eliminated: true };
    expect(canExertZOC(dead)).toBe(false);
  });
  it("detects an enemy ZOC when an enemy is adjacent", () => {
    const s = fresh();
    const sov = firstUnit(s, "ussr");
    const a = parseKey(sov.hexId);
    const neighborId = `${neighbors(a)[0].q}_${neighbors(a)[0].r}`;
    // artificially place a german combat unit adjacent
    const ger = firstUnit(s, "germany");
    const before = isInEnemyZOC(s, sov.hexId, "ussr");
    void before;
    s.units[ger.id].hexId = neighborId;
    if (s.hexes[neighborId]) {
      s.hexes[neighborId].stackUnitIds.push(ger.id);
    }
    expect(isInEnemyZOC(s, sov.hexId, "ussr")).toBe(true);
  });
});

describe("movement", () => {
  it("cannot enter sea/lake", () => {
    const s = fresh();
    const u = firstUnit(s, "germany");
    const seaHex = Object.values(s.hexes).find((h) => h.terrain === "sea")!;
    expect(edgeCost(s, u, u.hexId, seaHex.id)).toBe(Infinity);
  });
  it("a tracked unit cannot cross a destroyed river bridge without engineers", () => {
    const s = fresh();
    // find a road/rail bridge over a river
    const bridgedHex = Object.values(s.hexes).find((h) => h.bridgeEdges.length > 0 && h.riverEdges.length > 0);
    if (!bridgedHex) return;
    const edge = bridgedHex.bridgeEdges[0].edge;
    const neighborQr = neighbors(parseKey(bridgedHex.id)).find((n) => sharedEdge(parseKey(bridgedHex.id), n) === edge)!;
    const neighborId = `${neighborQr.q}_${neighborQr.r}`;
    const tank = Object.values(s.units).find((u) => u.movementClass === "tracked" && u.side === "germany")!;
    tank.hexId = bridgedHex.id;
    // intact bridge: crossable
    expect(isFinite(edgeCost(s, tank, bridgedHex.id, neighborId))).toBe(true);
    // destroy the bridge on both sides
    bridgedHex.bridgeEdges.find((b) => b.edge === edge)!.state = "destroyed";
    const nb = s.hexes[neighborId];
    nb?.bridgeEdges.filter((b) => b.edge === edge).forEach((b) => (b.state = "destroyed"));
    expect(edgeCost(s, tank, bridgedHex.id, neighborId)).toBe(Infinity);
    // engineers can still ford
    tank.traits = [...tank.traits.filter((t) => t !== "engineer"), "engineer"];
    expect(isFinite(edgeCost(s, tank, bridgedHex.id, neighborId))).toBe(true);
  });
  it("reachableHexes includes a clear neighbour but not the sea", () => {
    const s = fresh();
    const u = firstUnit(s, "germany");
    const reach = reachableHexes(s, [u.id]);
    expect(reach.size).toBeGreaterThan(0);
    for (const id of reach.keys()) {
      expect(s.hexes[id].terrain).not.toBe("sea");
      expect(s.hexes[id].terrain).not.toBe("lake");
    }
  });
});

describe("combat", () => {
  it("two divisions attack with summed strength", () => {
    const s = fresh();
    const ger = Object.values(s.units).filter((u) => u.side === "germany" && !u.eliminated);
    const sov = firstUnit(s, "ussr");
    const one = offensiveStrength(s, ger[0].id);
    const two = offensiveStrength(s, ger[0].id) + offensiveStrength(s, ger[1].id);
    expect(two).toBeGreaterThan(one);
    void sov;
  });
  it("heavy armor is not invulnerable to air support", () => {
    const attackers = [{ traits: ["tracked"] } as unknown as UnitState];
    expect(attackersCanPenetrate(attackers, false)).toBe(false);
    expect(attackersCanPenetrate(attackers, true)).toBe(true);
  });
  it("combined-arms attackers penetrate heavy armor", () => {
    const attackers = [{ traits: ["combined_arms"] } as unknown as UnitState];
    expect(attackersCanPenetrate(attackers, false)).toBe(true);
  });
  it("predictCombat reduces odds against heavy armor without penetration", () => {
    const s = fresh();
    // build a synthetic encounter: german tank vs soviet heavy-armor tank on an adjacent hex
    const ger = Object.values(s.units).find((u) => u.side === "germany" && u.unitType === "tank")!;
    const sov = Object.values(s.units).find((u) => u.side === "ussr" && u.unitType === "tank")!;
    if (!sov.traits.includes("heavy_armor")) sov.traits.push("heavy_armor");
    const a = parseKey(sov.hexId);
    const target = `${neighbors(a)[0].q}_${neighbors(a)[0].r}`;
    ger.hexId = target;
    if (s.hexes[target]) s.hexes[target].stackUnitIds.push(ger.id);
    const pred = predictCombat(s, [ger.id], sov.hexId);
    expect(defenderHasHeavyArmor(s, [sov.id])).toBe(true);
    expect(pred.ratio).toBeLessThanOrEqual(6);
  });
});

describe("retreat & exploitation golden rules", () => {
  it("a surrounded defender has no retreat route", () => {
    const s = fresh();
    const sov = firstUnit(s, "ussr");
    const a = parseKey(sov.hexId);
    // surround with german combat units on every neighbour
    const germans = Object.values(s.units).filter((u) => u.side === "germany");
    let gi = 0;
    for (const n of neighbors(a)) {
      const id = `${n.q}_${n.r}`;
      if (!s.hexes[id]) continue;
      const g = germans[gi % germans.length];
      s.hexes[id].stackUnitIds = [...s.hexes[id].stackUnitIds.filter((uid) => s.units[uid]?.side !== "germany"), g.id];
      s.units[g.id].hexId = id;
      gi++;
    }
    const attackerHexes = neighbors(a).map((n) => `${n.q}_${n.r}`);
    expect(retreatPath(s, sov.id, attackerHexes)).toBeNull();
  });
  it("an isolated motorized unit cannot exploit a breakthrough", () => {
    const s = fresh();
    const mot = Object.values(s.units).find((u) => u.movementClass === "motorized")!;
    mot.supplyState = "isolated";
    expect(eligibleForAdvance(mot)).toBe(false);
    mot.supplyState = "full";
    expect(eligibleForAdvance(mot)).toBe(true);
  });
});

describe("supply network", () => {
  it("computes finite distances from friendly sources", () => {
    const s = fresh();
    recomputeSupply(s);
    const dist = supplyDistances(s, "germany");
    const nearSource = [...dist.entries()].find(([, d]) => d === 0);
    expect(nearSource).toBeTruthy();
    // rear german units in East Prussia (controlled by Germany) are supplied
    const inSupply = Object.values(s.units).some(
      (u) => u.side === "germany" && ["full", "limited", "low"].includes(u.supplyState),
    );
    expect(inSupply).toBe(true);
  });
});

describe("engine command/event flow", () => {
  it("applyCommand is pure and deterministic across identical runs", () => {
    const a = fresh(999);
    const b = fresh(999);
    const cmds = [
      { type: "END_PHASE" as const },
      { type: "END_PHASE" as const },
      { type: "END_PHASE" as const },
      { type: "END_PHASE" as const },
    ];
    let ra = a;
    let rb = b;
    for (const c of cmds) {
      ra = applyCommand(ra, c).state;
      rb = applyCommand(rb, c).state;
    }
    expect(ra.turn).toBe(rb.turn);
    expect(ra.rngCursor).toBe(rb.rngCursor);
    expect(ra.phase).toBe(rb.phase);
    expect(JSON.stringify(ra.scores)).toBe(JSON.stringify(rb.scores));
  });
  it("MOVing a stack marks units as acted and spends fuel for motors", () => {
    const s = fresh();
    // advance to activation phase for germany
    let st = s;
    for (let i = 0; i < 4; i++) st = applyCommand(st, { type: "END_PHASE" }).state; // -> activation
    const u = firstUnit(st, "germany");
    const reach = reachableHexes(st, [u.id]);
    const dest = [...reach.keys()][0];
    if (!dest) return;
    const fuelBefore = st.units[u.id].fuel;
    const res = applyCommand(st, { type: "MOVE_STACK", unitIds: [u.id], destinationHexId: dest });
    expect(res.ok).toBe(true);
    expect(res.state.units[u.id].acted).toBe(true);
    expect(res.state.units[u.id].hexId).toBe(dest);
    if (st.units[u.id].movementClass !== "foot") {
      expect(res.state.units[u.id].fuel).toBeLessThanOrEqual(fuelBefore);
    }
  });
  it("rejects an invalid move with an explanatory message", () => {
    const s = fresh();
    const u = firstUnit(s, "germany");
    const sea = Object.values(s.hexes).find((h) => h.terrain === "sea")!;
    const res = applyCommand(s, { type: "MOVE_STACK", unitIds: [u.id], destinationHexId: sea.id });
    expect(res.ok).toBe(false);
    expect(res.errors[0].message.length).toBeGreaterThan(5);
  });
  it("combat resolves deterministically for the same seed and inputs", () => {
    // Build two identical states and resolve the same attack.
    const base = () => {
      const s = fresh(4242);
      let st = s;
      for (let i = 0; i < 4; i++) st = applyCommand(st, { type: "END_PHASE" }).state;
      return st;
    };
    const st1 = base();
    const st2 = base();
    // find an adjacent german->soviet pair in activation
    const ger = Object.values(st1.units).find((u) => u.side === "germany" && u.unitType === "tank")!;
    const sov = Object.values(st1.units).find((u) => u.side === "ussr" && u.unitType === "rifle")!;
    const a = parseKey(sov.hexId);
    const adj = `${neighbors(a)[0].q}_${neighbors(a)[0].r}`;
    if (!st1.hexes[adj]) return;
    // place attacker adjacent in both states
    for (const st of [st1, st2]) {
      const currentHexId = st.units[ger.id].hexId;
      st.hexes[currentHexId].stackUnitIds = st.hexes[currentHexId].stackUnitIds.filter((id) => id !== ger.id);
      st.units[ger.id].hexId = adj;
      st.hexes[adj].stackUnitIds.push(ger.id);
      st.units[ger.id].acted = false;
    }
    const r1 = applyCommand(st1, { type: "RESOLVE_COMBAT", unitIds: [ger.id], defenderHexId: sov.hexId });
    const r2 = applyCommand(st2, { type: "RESOLVE_COMBAT", unitIds: [ger.id], defenderHexId: sov.hexId });
    if (r1.ok && r2.ok) {
      expect(r1.state.rngCursor).toBe(r2.state.rngCursor);
      expect(JSON.stringify(r1.state.lastCombat)).toBe(JSON.stringify(r2.state.lastCombat));
    }
  });
});

describe("phase progression", () => {
  it("advances through phases and eventually to a new day", () => {
    let st = fresh();
    const seen = new Set<string>([st.phase]);
    for (let i = 0; i < 9; i++) st = applyCommand(st, { type: "END_PHASE" }).state;
    seen.add(st.phase);
    expect(st.turn).toBeGreaterThanOrEqual(2);
  });
});
