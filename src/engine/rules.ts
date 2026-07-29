/**
 * Pure game rules. No React, no DOM, no renderer. Everything here is a pure
 * function of the GameState and is deterministic, so the same state + command
 * always yields the same result — the foundation for replay and server-side
 * authority.
 */

import type {
  CombatResolution,
  GameState,
  HexState,
  HeadquartersState,
  Side,
  SupplyState,
  UnitState,
  GameEvent,
  ObjectiveState,
  SideScore,
} from "@/engine/types";
import {
  DIRECTION_TO_EDGE,
  distance,
  keyOf,
  neighbor,
  neighbors,
  sharedEdge,
  type Axial,
} from "@/engine/hex";
import { buildCombatModel } from "@/engine/combat";
import { awardScoreEvent, scoreHistoricalDeadline } from "@/engine/scoring";

const INFINITY = Number.POSITIVE_INFINITY;

export const STACK_BASE_LIMIT = 4;

export function stackingPoints(hex: HexState, units: Record<string, UnitState>): number {
  return hex.stackUnitIds.reduce((sum, id) => sum + (units[id]?.stackingCost ?? 0), 0);
}

export function stackLimitOf(hex: HexState): number {
  let limit = STACK_BASE_LIMIT;
  if (hex.terrain === "major_city") limit += 2;
  else if (hex.terrain === "city") limit += 1;
  if (hex.terrain === "fortified") limit += 1;
  if (hex.terrain === "swamp") limit -= 2;
  else if (hex.terrain === "forest" || hex.terrain === "dense_forest") limit -= 1;
  return Math.max(1, limit);
}

/** A combat-capable unit exerts a zone of control unless explicitly excluded. */
export function canExertZOC(unit: UnitState): boolean {
  if (unit.eliminated) return false;
  if (unit.commandState === "disorganized") return false;
  if (unit.supplyState === "none" || unit.supplyState === "isolated") return false;
  if (unit.currentSteps <= 0) return false;
  if (
    unit.echelon === "corps_hq" ||
    unit.echelon === "army_hq" ||
    unit.echelon === "front_hq" ||
    unit.unitType === "headquarters" ||
    unit.unitType === "air" ||
    unit.unitType === "security"
  )
    return false;
  if (unit.maxSteps >= 2 && unit.currentSteps === 1) return true; // still fights
  return unit.currentSteps >= 1;
}

const enemyOf = (s: Side): Side => (s === "germany" ? "ussr" : "germany");

function parseHex(id: string): Axial {
  const [q, r] = id.split("_").map(Number);
  return { q, r };
}

/** Which sides exert a ZOC into the given hex (via adjacent combat units). */
export function zocOwners(state: GameState, hexId: string): Set<Side> {
  const owners = new Set<Side>();
  const a = parseHex(hexId);
  for (let dir = 0; dir < 6; dir++) {
    const nId = keyOf(neighbor(a, dir).q, neighbor(a, dir).r);
    const nh = state.hexes[nId];
    if (!nh) continue;
    for (const uid of nh.stackUnitIds) {
      const u = state.units[uid];
      if (u && canExertZOC(u)) owners.add(u.side);
    }
  }
  return owners;
}

export function isInEnemyZOC(state: GameState, hexId: string, side: Side): boolean {
  return zocOwners(state, hexId).has(enemyOf(side));
}

function hasIntactBridge(hex: HexState, edge: number): boolean {
  return hex.bridgeEdges.some(
    (b) =>
      b.edge === edge &&
      (b.state === "intact" ||
        b.state === "prepared_for_demolition" ||
        b.state === "pontoon"),
  );
}

interface TerrainCosts {
  foot: number;
  mot: number;
  trk: number;
}

const TERRAIN_MOVE: Record<string, TerrainCosts> = {
  clear: { foot: 1, mot: 1, trk: 1 },
  coast: { foot: 1, mot: 1, trk: 1 },
  city: { foot: 1, mot: 1, trk: 1 },
  major_city: { foot: 1, mot: 1, trk: 1 },
  forest: { foot: 1, mot: 2, trk: 2 },
  dense_forest: { foot: 2, mot: 3, trk: 3 },
  swamp: { foot: 2, mot: 4, trk: 4 },
  fortified: { foot: 1, mot: 2, trk: 2 },
};

const classKey = (u: UnitState): "foot" | "mot" | "trk" =>
  u.movementClass === "foot" ? "foot" : u.movementClass === "tracked" ? "trk" : "mot";

/**
 * Cost for `unit` to cross from `fromId` to an adjacent `toId`.
 * Returns INFINITY when the move is illegal (water, no bridge, full stack...).
 */
export function edgeCost(state: GameState, unit: UnitState, fromId: string, toId: string): number {
  const from = state.hexes[fromId];
  const to = state.hexes[toId];
  if (!from || !to) return INFINITY;
  if (to.terrain === "sea" || to.terrain === "lake") return INFINITY;

  // Enemy-occupied hex cannot be entered by movement (must attack).
  const enemyOnTo = to.stackUnitIds.some((uid) => state.units[uid]?.side === enemyOf(unit.side));
  if (enemyOnTo) return INFINITY;

  const tc = TERRAIN_MOVE[to.terrain] ?? TERRAIN_MOVE.clear;
  const ck = classKey(unit);
  let cost = tc[ck];

  const edge = sharedEdge(parseHex(fromId), parseHex(toId));
  if (edge != null) {
    // Roads ease movement.
    const hasMajor = from.majorRoadEdges.includes(edge) || to.majorRoadEdges.includes(edge);
    const hasMinor = from.roadEdges.includes(edge) || to.roadEdges.includes(edge);
    if (hasMajor) cost = Math.min(cost, ck === "foot" ? 0.75 : 0.5);
    else if (hasMinor) cost = Math.min(cost, 1);
    // Strategic rail move along controlled, intact line.
    const hasRail = from.railwayEdges.includes(edge) && to.railwayEdges.includes(edge);
    if (hasRail && to.control !== enemyOf(unit.side) && (ck === "foot" || ck === "mot")) {
      cost = Math.min(cost, 0.5);
    }
    // River crossing.
    const riverHere = from.riverEdges.includes(edge) || to.riverEdges.includes(edge);
    if (riverHere) {
      const bridged = hasIntactBridge(from, edge) || hasIntactBridge(to, edge);
      if (!bridged) {
        if (ck === "foot" || unit.traits.includes("engineer")) cost += 3;
        else return INFINITY; // motors/tracks need a bridge or engineers
      }
    }
  }

  // Zones of control.
  if (isInEnemyZOC(state, fromId, unit.side)) cost += 1; // leaving a ZOC
  if (isInEnemyZOC(state, toId, unit.side)) cost += 2; // entering a ZOC
  if (to.interdictionLevel > 0) cost += to.interdictionLevel;
  cost += state.weather.movementModifier;

  // Supply & fuel drag.
  if (unit.supplyState === "low") cost += 1;
  else if (unit.supplyState === "isolated") cost += 3;
  else if (unit.supplyState === "none") {
    if (ck !== "foot") return INFINITY;
    cost += 4;
  }
  if ((ck === "mot" || ck === "trk") && unit.fuel < 15) cost += 1;

  return cost;
}

/** Stacking capacity check for a stack moving into `toId`. */
export function canStackInto(state: GameState, unitIds: string[], toId: string): boolean {
  const to = state.hexes[toId];
  if (!to) return false;
  const movingPoints = unitIds.reduce((s, id) => s + (state.units[id]?.stackingCost ?? 0), 0);
  const existing = to.stackUnitIds.filter((id) => !unitIds.includes(id));
  const existingPoints = existing.reduce((s, id) => s + (state.units[id]?.stackingCost ?? 0), 0);
  return existingPoints + movingPoints <= stackLimitOf(to);
}

export interface Reachable {
  cost: number;
  path: string[];
}

/**
 * Dijkstra over reachable hexes for a moving stack. The stack moves as the
 * slowest unit: per-edge cost is the max across the stack, allowance is the
 * min movement value. Entering an enemy ZOC ends the move (terminal nodes are
 * not expanded further).
 */
export function reachableHexes(state: GameState, unitIds: string[]): Map<string, Reachable> {
  const result = new Map<string, Reachable>();
  if (unitIds.length === 0) return result;
  const units = unitIds.map((id) => state.units[id]).filter(Boolean) as UnitState[];
  if (units.length === 0) return result;
  const start = units[0].hexId;
  const allowance = Math.min(...units.map((u) => u.movement));
  const side = units[0].side;

  const dist = new Map<string, number>();
  dist.set(start, 0);
  result.set(start, { cost: 0, path: [start] });
  const visited = new Set<string>();

  // Simple bounded Dijkstra (reachable set is small).
  while (visited.size < dist.size) {
    let current: string | null = null;
    let best = INFINITY;
    for (const [id, d] of dist) {
      if (!visited.has(id) && d < best) {
        best = d;
        current = id;
      }
    }
    if (current === null || best > allowance + 6) break;
    visited.add(current);

    // Entering an enemy ZOC ends movement for the stack.
    if (current !== start && isInEnemyZOC(state, current, side)) continue;

    const a = parseHex(current);
    for (let dir = 0; dir < 6; dir++) {
      const nId = keyOf(neighbor(a, dir).q, neighbor(a, dir).r);
      if (!state.hexes[nId]) continue;
      let step = 0;
      for (const u of units) {
        const c = edgeCost(state, u, current, nId);
        if (!isFinite(c)) {
          step = INFINITY;
          break;
        }
        step = Math.max(step, c);
      }
      if (!isFinite(step)) continue;
      if (!canStackInto(state, unitIds, nId) && nId !== start) continue;
      const nd = best + step;
      if (nd <= allowance + 6 && (!dist.has(nId) || nd < dist.get(nId)!)) {
        dist.set(nId, nd);
        const prevPath = result.get(current)!.path;
        result.set(nId, { cost: nd, path: [...prevPath, nId] });
      }
    }
  }
  // Drop the origin and over-budget hexes.
  result.delete(start);
  for (const [id, info] of result) if (info.cost > allowance) result.delete(id);
  return result;
}

export function bestPath(state: GameState, unitIds: string[], destId: string): Reachable | null {
  return reachableHexes(state, unitIds).get(destId) ?? null;
}

/** Choose a retreat hex for a defender, away from the attackers. Returns null if none. */
export function retreatPath(state: GameState, defenderId: string, attackerHexIds: string[]): string[] | null {
  const unit = state.units[defenderId];
  if (!unit) return null;
  const from = unit.hexId;
  const a = parseHex(from);
  const candidates: Array<{ id: string; score: number }> = [];
  for (let dir = 0; dir < 6; dir++) {
    const nId = keyOf(neighbor(a, dir).q, neighbor(a, dir).r);
    const nh = state.hexes[nId];
    if (!nh) continue;
    if (nh.terrain === "sea" || nh.terrain === "lake") continue;
    const enemyOn = nh.stackUnitIds.some((uid) => state.units[uid]?.side === enemyOf(unit.side));
    if (enemyOn) continue;
    if (!canStackInto(state, [defenderId], nId)) continue;
    // Prefer hexes far from attackers and not in enemy ZOC.
    const distToAttackers = Math.min(...attackerHexIds.map((h) => distance(parseHex(h), parseHex(nId))));
    const inZoc = isInEnemyZOC(state, nId, unit.side) ? 3 : 0;
    const tc = (TERRAIN_MOVE[nh.terrain] ?? TERRAIN_MOVE.clear)[classKey(unit)];
    candidates.push({ id: nId, score: -(distToAttackers) + inZoc - tc * 0.1 });
  }
  if (candidates.length === 0) return null;
  candidates.sort((x, y) => x.score - y.score);
  return [from, candidates[0].id];
}

// ---------------------------------------------------------------------------
// Supply (network based, not a fixed radius).
// ---------------------------------------------------------------------------

function supplyEdgeCost(state: GameState, side: Side, fromId: string, toId: string): number {
  const from = state.hexes[fromId];
  const to = state.hexes[toId];
  if (!from || !to) return INFINITY;
  if (to.terrain === "sea" || to.terrain === "lake") return INFINITY;
  if (to.control === enemyOf(side)) return INFINITY; // enemy-held hex blocks the line
  const tc = TERRAIN_MOVE[to.terrain] ?? TERRAIN_MOVE.clear;
  let cost = Math.min(tc.foot, tc.mot, tc.trk);
  const edge = sharedEdge(parseHex(fromId), parseHex(toId));
  if (edge != null) {
    if (to.railwayEdges.includes(edge) && state.hexes[fromId].railwayEdges.includes(edge)) cost = Math.min(cost, 0.4);
    else if (to.majorRoadEdges.includes(edge)) cost = Math.min(cost, 0.6);
    const reverseEdge = sharedEdge(parseHex(toId), parseHex(fromId));
    const river =
      to.riverEdges.includes(reverseEdge ?? edge) ||
      from.riverEdges.includes(edge);
    const bridged =
      hasIntactBridge(from, edge) ||
      (reverseEdge != null && hasIntactBridge(to, reverseEdge));
    if (river && !bridged) return INFINITY;
  }
  if (isInEnemyZOC(state, toId, side)) return INFINITY;
  return cost;
}

/** Multi-source Dijkstra giving every hex its supply distance from a source. */
export function supplyDistances(state: GameState, side: Side): Map<string, number> {
  const dist = new Map<string, number>();
  const sources = Object.values(state.supplySources)
    .filter((source) => source.side === side && source.active)
    .map((source) => source.hexId);
  for (const id of sources) {
    if (state.hexes[id]?.control === side) dist.set(id, 0);
  }
  const visited = new Set<string>();
  while (visited.size < dist.size) {
    let current: string | null = null;
    let best = INFINITY;
    for (const [id, d] of dist) {
      if (!visited.has(id) && d < best) {
        best = d;
        current = id;
      }
    }
    if (current === null) break;
    visited.add(current);
    const a = parseHex(current);
    for (let dir = 0; dir < 6; dir++) {
      const nId = keyOf(neighbor(a, dir).q, neighbor(a, dir).r);
      if (!state.hexes[nId]) continue;
      const c = supplyEdgeCost(state, side, current, nId);
      if (!isFinite(c)) continue;
      const nd = best + c;
      if (!dist.has(nId) || nd < dist.get(nId)!) dist.set(nId, nd);
    }
  }
  return dist;
}

function levelFromDistance(d: number | undefined, surrounded: boolean): SupplyState {
  if (surrounded) return "none";
  if (d == null) return "isolated";
  if (d <= 8) return "full";
  if (d <= 14) return "limited";
  if (d <= 22) return "low";
  return "isolated";
}

export function recomputeSupply(state: GameState): void {
  for (const side of ["germany", "ussr"] as Side[]) {
    const dist = supplyDistances(state, side);
    for (const hq of Object.values(state.headquarters)) {
      if (hq.side !== side || hq.eliminated) continue;
      hq.supplyState = levelFromDistance(dist.get(hq.hexId), false);
    }
    for (const id in state.units) {
      const u = state.units[id];
      if (u.side !== side || u.eliminated || u.entityType === "headquarters") continue;
      const a = parseHex(u.hexId);
      const openRetreats = neighbors(a).filter((n) => {
        const nh = state.hexes[keyOf(n.q, n.r)];
        if (!nh || nh.terrain === "sea" || nh.terrain === "lake") return false;
        const occupied = nh.stackUnitIds.some(
          (uid) => state.units[uid]?.side === enemyOf(side) && canExertZOC(state.units[uid]),
        );
        return !occupied && !isInEnemyZOC(state, nh.id, side);
      }).length;
      const hasSupplyRoute = dist.has(u.hexId);
      const hq = commandingHq(state, u);
      const hqConnected =
        !!hq && hq.supplyState !== "none" && hq.supplyState !== "isolated";
      const surrounded = openRetreats === 0;
      const base = levelFromDistance(dist.get(u.hexId), surrounded);
      if (!hqConnected) {
        u.supplyState = hasSupplyRoute ? "isolated" : "none";
      } else if (hq.supplyState === "low" || hq.supplyState === "limited") {
        u.supplyState =
          base === "none" || base === "isolated" ? base : hq.supplyState;
      } else {
        u.supplyState = base;
      }
      if (!hasSupplyRoute && surrounded) {
        u.encirclementState = "isolated";
      } else if (!hasSupplyRoute && openRetreats <= 1) {
        u.encirclementState = "encircled";
      } else if (!hasSupplyRoute || surrounded) {
        u.encirclementState = "partially_encircled";
      } else if (openRetreats <= 2 || (dist.get(u.hexId) ?? 0) > 20) {
        u.encirclementState = "threatened_with_encirclement";
      } else {
        u.encirclementState = "none";
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Command.
// ---------------------------------------------------------------------------

export function commandingHq(state: GameState, unit: UnitState): HeadquartersState | undefined {
  const available = (id: string | undefined) => {
    const hq = id ? state.headquarters[id] : undefined;
    return hq && hq.side === unit.side && !hq.eliminated && !hq.captured ? hq : undefined;
  };
  return (
    available(unit.parentCorpsId) ??
    available(unit.temporaryCommandId) ??
    available(unit.parentArmyId)
  );
}

export interface CommandInfo {
  hq?: HeadquartersState;
  dist: number;
  inRange: boolean;
}

export function commandInfo(state: GameState, unit: UnitState): CommandInfo {
  const hq = commandingHq(state, unit);
  if (!hq) return { dist: INFINITY, inRange: false };
  const dist = distance(parseHex(hq.hexId), parseHex(unit.hexId));
  const effectiveRange = Math.max(1, hq.commandRange - (hq.movedThisTurn ? 1 : 0));
  return { hq, dist, inRange: dist <= effectiveRange };
}

export function recomputeCommand(state: GameState): void {
  for (const id in state.units) {
    const u = state.units[id];
    if (u.eliminated) continue;
    if (u.commandState === "disorganized") continue; // set by combat, cleared at supply phase
    const info = commandInfo(state, u);
    if (u.statusEffects.some((e) => e.kind === "activate_ooc")) {
      u.commandState = "in_command";
      continue;
    }
    if (!info.hq || !info.inRange) {
      u.commandState = info.hq && info.dist <= info.hq.commandRange + 1 ? "delayed" : "out_of_command";
    } else if (info.hq.commQuality <= 2 && info.dist > info.hq.commandRange - 1) {
      u.commandState = "delayed";
    } else {
      u.commandState = "in_command";
    }
  }
}

export const COMMAND_COST = {
  move: 1,
  forced_march: 2,
  prepared_attack: 2,
  coordinated_attack: 3,
  organized_withdraw: 1,
  restore_comm: 1,
  commit_reserve: 2,
  destroy_bridge: 1,
  engineer_crossing: 2,
  restore_org: 1,
} as const;

export function commandCostFor(state: GameState, unit: UnitState, action: keyof typeof COMMAND_COST): number {
  let base = COMMAND_COST[action];
  if (unit.commandState === "delayed") base += 1;
  if (unit.commandState === "out_of_command") base += 2;
  // Soviet command friction in the opening days.
  if (unit.side === "ussr" && state.turn <= 4) base += 1;
  return base;
}

// ---------------------------------------------------------------------------
// Combat.
// ---------------------------------------------------------------------------

function supplyFactor(u: UnitState): number {
  switch (u.supplyState) {
    case "full":
      return 1;
    case "limited":
      return 0.9;
    case "low":
      return 0.8;
    case "isolated":
      return 0.6;
    case "none":
      return 0.4;
  }
}

function commandFactor(u: UnitState): number {
  switch (u.commandState) {
    case "in_command":
      return 1;
    case "delayed":
      return 0.9;
    case "out_of_command":
      return 0.75;
    case "disorganized":
      return 0.6;
  }
}

export function offensiveStrength(state: GameState, unitId: string, modifiers: { airBonus?: number } = {}): number {
  const u = state.units[unitId];
  if (!u || u.eliminated) return 0;
  const steps = 0.5 + 0.5 * (u.currentSteps / u.maxSteps);
  let str = u.attack * steps * supplyFactor(u) * commandFactor(u);
  if (u.organization < 40) str *= 0.85;
  str += (u.quality - 3) * 0.4;
  if (modifiers.airBonus) str += modifiers.airBonus;
  return Math.max(0, str);
}

export function defensiveStrength(state: GameState, unitId: string): number {
  const u = state.units[unitId];
  if (!u || u.eliminated) return 0;
  const hex = state.hexes[u.hexId];
  const steps = 0.5 + 0.5 * (u.currentSteps / u.maxSteps);
  let str = u.defense * steps * supplyFactor(u) * commandFactor(u);
  if (u.organization < 40) str *= 0.85;
  str += (u.quality - 3) * 0.3;
  // Terrain & fortifications.
  if (hex) {
    if (hex.terrain === "forest" || hex.terrain === "city") str *= 1.2;
    if (hex.terrain === "dense_forest" || hex.terrain === "swamp") str *= 1.4;
    if (hex.terrain === "major_city" || hex.terrain === "fortified") str *= 1.5;
    str *= 1 + hex.fortificationLevel * 0.25;
  }
  return Math.max(0.5, str);
}

export function attackersCanPenetrate(attackers: UnitState[], hasAirSupport: boolean): boolean {
  return (
    hasAirSupport ||
    attackers.some((u) => u.traits.includes("combined_arms") || u.traits.includes("heavy_at")) ||
    attackers.some((u) => u.unitType === "engineer")
  );
}

export function defenderHasHeavyArmor(state: GameState, defenderIds: string[]): boolean {
  return defenderIds.some((id) => {
    const u = state.units[id];
    return u && (u.traits.includes("heavy_armor") || u.statusEffects.some((e) => e.kind === "add_trait"));
  });
}

type Outcome =
  | "no_effect"
  | "defender_disorganized"
  | "attacker_step_loss"
  | "attacker_repulsed"
  | "exchange"
  | "defender_step_loss"
  | "defender_retreat"
  | "breakthrough"
  | "defender_destroyed";

export interface Cell {
  outcome: Outcome;
  attLoss: number;
  defLoss: number;
  retreat: boolean;
  advance: boolean;
}

// Rows = odds columns (index by ratio bucket), columns = d6 roll 1..6.
const CRT: Cell[][] = [
  // <0.6
  [
    { outcome: "attacker_step_loss", attLoss: 1, defLoss: 0, retreat: false, advance: false },
    { outcome: "attacker_step_loss", attLoss: 1, defLoss: 0, retreat: false, advance: false },
    { outcome: "attacker_repulsed", attLoss: 0, defLoss: 0, retreat: false, advance: false },
    { outcome: "attacker_repulsed", attLoss: 0, defLoss: 0, retreat: false, advance: false },
    { outcome: "no_effect", attLoss: 0, defLoss: 0, retreat: false, advance: false },
    { outcome: "no_effect", attLoss: 0, defLoss: 0, retreat: false, advance: false },
  ],
  // 0.6-0.99
  [
    { outcome: "attacker_step_loss", attLoss: 1, defLoss: 0, retreat: false, advance: false },
    { outcome: "attacker_repulsed", attLoss: 0, defLoss: 0, retreat: false, advance: false },
    { outcome: "attacker_repulsed", attLoss: 0, defLoss: 0, retreat: false, advance: false },
    { outcome: "no_effect", attLoss: 0, defLoss: 0, retreat: false, advance: false },
    { outcome: "defender_disorganized", attLoss: 0, defLoss: 0, retreat: false, advance: false },
    { outcome: "exchange", attLoss: 1, defLoss: 1, retreat: false, advance: false },
  ],
  // 1.0-1.49
  [
    { outcome: "attacker_repulsed", attLoss: 0, defLoss: 0, retreat: false, advance: false },
    { outcome: "no_effect", attLoss: 0, defLoss: 0, retreat: false, advance: false },
    { outcome: "defender_disorganized", attLoss: 0, defLoss: 0, retreat: false, advance: false },
    { outcome: "exchange", attLoss: 1, defLoss: 1, retreat: false, advance: false },
    { outcome: "defender_step_loss", attLoss: 0, defLoss: 1, retreat: false, advance: false },
    { outcome: "defender_step_loss", attLoss: 0, defLoss: 1, retreat: false, advance: false },
  ],
  // 1.5-1.99
  [
    { outcome: "no_effect", attLoss: 0, defLoss: 0, retreat: false, advance: false },
    { outcome: "defender_disorganized", attLoss: 0, defLoss: 0, retreat: false, advance: false },
    { outcome: "exchange", attLoss: 1, defLoss: 1, retreat: false, advance: false },
    { outcome: "defender_step_loss", attLoss: 0, defLoss: 1, retreat: false, advance: false },
    { outcome: "defender_step_loss", attLoss: 0, defLoss: 1, retreat: true, advance: false },
    { outcome: "defender_retreat", attLoss: 0, defLoss: 0, retreat: true, advance: false },
  ],
  // 2.0-2.99
  [
    { outcome: "defender_disorganized", attLoss: 0, defLoss: 0, retreat: false, advance: false },
    { outcome: "defender_step_loss", attLoss: 0, defLoss: 1, retreat: false, advance: false },
    { outcome: "defender_step_loss", attLoss: 0, defLoss: 1, retreat: true, advance: false },
    { outcome: "defender_retreat", attLoss: 0, defLoss: 0, retreat: true, advance: false },
    { outcome: "defender_retreat", attLoss: 0, defLoss: 1, retreat: true, advance: false },
    { outcome: "breakthrough", attLoss: 0, defLoss: 1, retreat: true, advance: true },
  ],
  // 3.0-3.99
  [
    { outcome: "defender_step_loss", attLoss: 0, defLoss: 1, retreat: false, advance: false },
    { outcome: "defender_step_loss", attLoss: 0, defLoss: 1, retreat: true, advance: false },
    { outcome: "defender_retreat", attLoss: 0, defLoss: 0, retreat: true, advance: false },
    { outcome: "defender_retreat", attLoss: 0, defLoss: 1, retreat: true, advance: false },
    { outcome: "breakthrough", attLoss: 0, defLoss: 1, retreat: true, advance: true },
    { outcome: "defender_destroyed", attLoss: 0, defLoss: 99, retreat: false, advance: false },
  ],
  // >=4
  [
    { outcome: "defender_retreat", attLoss: 0, defLoss: 0, retreat: true, advance: false },
    { outcome: "defender_retreat", attLoss: 0, defLoss: 1, retreat: true, advance: false },
    { outcome: "breakthrough", attLoss: 0, defLoss: 1, retreat: true, advance: true },
    { outcome: "breakthrough", attLoss: 0, defLoss: 1, retreat: true, advance: true },
    { outcome: "defender_destroyed", attLoss: 0, defLoss: 99, retreat: false, advance: false },
    { outcome: "defender_destroyed", attLoss: 0, defLoss: 99, retreat: false, advance: false },
  ],
];

function oddsColumn(ratio: number): number {
  if (ratio < 0.6) return 0;
  if (ratio < 1.0) return 1;
  if (ratio < 1.5) return 2;
  if (ratio < 2.0) return 3;
  if (ratio < 3.0) return 4;
  if (ratio < 4.0) return 5;
  return 6;
}

export interface CombatPrediction {
  attackerStrength: number;
  defenderStrength: number;
  ratio: number;
  column: number;
  /** mean expected roll 3.5 -> gives central outcome label */
  expected: Cell;
  penetrates: boolean;
  model: ReturnType<typeof buildCombatModel>;
}

export function predictCombat(
  state: GameState,
  attackerIds: string[],
  defenderHexId: string,
  support: { airBonus?: number } = {},
): CombatPrediction {
  const model = buildCombatModel(state, {
    attackerIds,
    defenderHexId,
    airBonus: support.airBonus,
  });
  const ratio = model.ratio;
  const column = oddsColumn(ratio);
  return {
    attackerStrength: model.attackerStrength,
    defenderStrength: model.defenderStrength,
    ratio,
    column,
    expected: CRT[column][3],
    penetrates: model.penetratesHeavyArmor,
    model,
  };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function eligibleForAdvance(u: UnitState): boolean {
  return (
    !u.eliminated &&
    (u.movementClass === "motorized" || u.movementClass === "tracked") &&
    u.commandState !== "disorganized" &&
    u.supplyState !== "none" &&
    u.supplyState !== "isolated"
  );
}

// ---------------------------------------------------------------------------
// Scoring & objectives.
// ---------------------------------------------------------------------------

export function totalScore(s: SideScore): number {
  return (
    s.operationalPoints +
    s.territorialPoints +
    s.delayPoints +
    s.preservationPoints +
    s.destructionPoints +
    s.objectivePoints -
    s.penalties
  );
}

function destroyedBridgeCount(state: GameState): number {
  let n = 0;
  for (const id in state.hexes) {
    for (const b of state.hexes[id].bridgeEdges) if (b.state === "destroyed") n++;
  }
  // each bridge is stored on two hexes; halve.
  return Math.floor(n / 2);
}

function eliminatedCount(state: GameState, side: Side): number {
  return Object.values(state.units).filter((u) => u.side === side && u.eliminated).length;
}

/** Evaluate objective status and award points (idempotent: only completes once). */
export function evaluateObjectives(state: GameState, final = false): GameEvent[] {
  const events: GameEvent[] = [];
  for (const obj of state.objectives) {
    if (obj.status !== "active") continue;
    let done = false;
    let failed = false;
    const target = obj.targetHexId ? state.hexes[obj.targetHexId] : undefined;

    if (obj.kind === "capture_hex" && target) {
      if (target.control === obj.side) done = true;
      else if (obj.requiredTurn && state.turn > obj.requiredTurn) failed = true;
    } else if (obj.kind === "hold_hex" && target) {
      if (obj.requiredTurn && state.turn >= obj.requiredTurn && target.control === obj.side) done = true;
      else if (target.control !== obj.side && target.control !== "neutral") failed = true;
    } else if (obj.kind === "destroy_units") {
      const need = obj.id.includes("destroy") && obj.side === "germany" ? 3 : 1;
      if (eliminatedCount(state, obj.targetTypeSide ?? enemyOf(obj.side)) >= need) done = true;
    } else if (obj.kind === "destroy_bridges") {
      if (destroyedBridgeCount(state) >= 2) done = true;
    } else if (obj.kind === "reach_turn") {
      if (obj.requiredTurn && state.turn >= obj.requiredTurn) done = true;
    } else if (obj.kind === "preserve_units") {
      if (final) {
        if (obj.id === "s-preserve2td") done = !state.units["sov-2td"]?.eliminated;
        else if (obj.id === "g-mobile") {
          const alive = Object.values(state.units).filter(
            (u) => u.side === "germany" && !u.eliminated && (u.unitType === "tank" || u.unitType === "motorized"),
          ).length;
          done = alive >= 3;
        }
      }
    }

    if (done) {
      obj.status = "completed";
      const points = obj.deadline
        ? scoreHistoricalDeadline(obj.deadline, state.turn, obj.points)
        : obj.points;
      awardScoreEvent(state, events, `objective:${obj.id}`, obj.side, "objectivePoints", points);
      events.push({ type: "OBJECTIVE_COMPLETED", objectiveId: obj.id, side: obj.side, points });
    } else if (failed) {
      obj.status = "failed";
      events.push({ type: "OBJECTIVE_FAILED", objectiveId: obj.id, side: obj.side });
    }
  }
  return events;
}

/** Event-idempotent end-of-day scoring: territory and tempo. */
export function endOfDayScoring(state: GameState): GameEvent[] {
  const events: GameEvent[] = [];
  // Territory: settlements controlled.
  for (const id in state.hexes) {
    const h = state.hexes[id];
    if (h.settlement && h.control !== "neutral") {
      awardScoreEvent(
        state,
        events,
        `territory:${state.turn}:${h.settlement.id}`,
        h.control as Side,
        "territorialPoints",
        Math.round(h.settlement.victoryPoints * 0.15),
      );
    }
  }
  // Delay: every survived day the USSR banks delay points; Germany banks tempo.
  awardScoreEvent(state, events, `delay:${state.turn}`, "ussr", "delayPoints", 1);
  return events;
}

export interface GameResult {
  winner: Side;
  resultType: string;
  germanTotal: number;
  sovietTotal: number;
}

export function computeResult(state: GameState): GameResult {
  for (const id in state.units) {
    // ensure mobile preservation evaluated
  }
  evaluateObjectives(state, true);
  const g = totalScore(state.scores.germany);
  const s = totalScore(state.scores.ussr);
  const diff = g - s;
  let winner: Side;
  let resultType: string;
  if (diff >= 45) {
    winner = "germany";
    resultType = "Решительная победа Германии";
  } else if (diff > 12) {
    winner = "germany";
    resultType = "Оперативная победа Германии";
  } else if (diff > -12) {
    winner = diff >= 0 ? "germany" : "ussr";
    resultType = "Исторический результат";
  } else if (diff > -45) {
    winner = "ussr";
    resultType = "Оперативная победа СССР";
  } else {
    winner = "ussr";
    resultType = "Решительная победа СССР";
  }
  return { winner, resultType, germanTotal: g, sovietTotal: s };
}

/** Hexes a side can see for fog-of-war / reconnaissance (currently full). */
export function visibleHexIds(_state: GameState, _side: Side): Set<string> {
  return new Set();
}

export const DIRECTION_EDGE = DIRECTION_TO_EDGE;
