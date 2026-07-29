/**
 * Command/event engine. applyCommand validates a player intent, and if legal
 * produces a NEW state (via structuredClone) plus the events it generated. The
 * engine is pure, deterministic and free of UI/React/DOM concerns, so it runs
 * identically on the server, in tests, and during replay.
 */

import type {
  CommandResult,
  CommandValidationResult,
  CombatResolution,
  CombatStep,
  GameCommand,
  GameEvent,
  GamePhase,
  GameState,
  Side,
  UnitState,
} from "@/engine/types";
import { roll } from "@/engine/rng";
import { keyOf, neighbor, neighbors, parseKey, sharedEdge } from "@/engine/hex";
import {
  COMMAND_COST,
  bestPath,
  canStackInto,
  commandCostFor,
  commandInfo,
  computeResult,
  defensiveStrength,
  defenderHasHeavyArmor,
  attackersCanPenetrate,
  eligibleForAdvance,
  endOfDayScoring,
  evaluateObjectives,
  offensiveStrength,
  predictCombat,
  recomputeCommand,
  recomputeSupply,
  retreatPath,
  STACK_BASE_LIMIT,
  type Cell,
} from "@/engine/rules";
import { CARD_DEFS, EVENTS, SCENARIO, dateForTurn } from "@/scenarios/baltic-1941/scenario";
import {
  canSpendCommandPoints,
  canSpendFromAllocations,
  spendCommandPoints,
} from "@/engine/resources";
import {
  directionForEdge,
  setBridgeState,
  sharedEdgeKey,
  updateSharedEdge,
} from "@/engine/edges";
import { awardScoreEvent } from "@/engine/scoring";
import { applyWegoCommand, validateWegoCommand } from "@/engine/wego";

const PHASE_ORDER: GamePhase[] = [
  "morning_report",
  "events",
  "command",
  "air",
  "activation",
  "exploitation",
  "supply",
  "end_of_day",
];

const WEGO_PHASE_ORDER: GamePhase[] = [
  "morning_report",
  "events",
  "planning",
  "plans_locked",
  "execution",
  "reaction",
  "supply",
  "after_action",
  "end_of_day",
];

const enemyOf = (s: Side): Side => (s === "germany" ? "ussr" : "germany");

function err(code: string, message: string, related?: string[]): CommandValidationResult {
  return { valid: false, errors: [{ code, message, relatedEntityIds: related }] };
}

function ok(): CommandValidationResult {
  return { valid: true, errors: [] };
}

function cpValidation(
  state: GameState,
  side: Side,
  amount: number,
  hqId?: string,
): CommandValidationResult {
  const check = canSpendCommandPoints(state, side, amount, hqId);
  return check.ok
    ? ok()
    : { valid: false, errors: check.error ? [check.error] : [] };
}

function engineerNearBridge(
  state: GameState,
  side: Side,
  hexId: string,
): UnitState | undefined {
  const near = [hexId, ...neighbors(parseKey(hexId)).map((n) => keyOf(n.q, n.r))];
  for (const id of near) {
    const unit = (state.hexes[id]?.stackUnitIds ?? [])
      .map((unitId) => state.units[unitId])
      .find(
        (candidate) =>
          candidate?.side === side &&
          !candidate.eliminated &&
          (candidate.unitType === "engineer" ||
            candidate.traits.includes("engineer") ||
            candidate.traits.includes("demolition")),
      );
    if (unit) return unit;
  }
  return undefined;
}

export function validateCommand(state: GameState, cmd: GameCommand): CommandValidationResult {
  switch (cmd.type) {
    case "ASSIGN_ORDER": {
      if (state.phase !== "command" && state.phase !== "activation")
        return err("wrong_phase", "Приказы назначаются в штабной или фазе активаций.");
      const ids = cmd.unitIds ?? [];
      if (ids.length === 0) return err("no_units", "Не выбрано соединение.");
      for (const id of ids) {
        const u = state.units[id];
        if (!u) return err("no_unit", "Соединение не найдено.", [id]);
        if (u.side !== state.activeSide) return err("not_owner", "Это соединение не вашей стороны.", [id]);
      }
      const unit = state.units[ids[0]];
      const hqId = unit ? commandInfo(state, unit).hq?.id : undefined;
      return cpValidation(state, state.activeSide, 1, hqId);
    }
    case "MOVE_STACK": {
      if (state.phase !== "activation" && state.phase !== "exploitation")
        return err("wrong_phase", "Движение возможно в фазе активаций или развития прорыва.");
      const ids = cmd.unitIds ?? [];
      if (ids.length === 0) return err("no_units", "Не выбрано соединение для перемещения.");
      for (const id of ids) {
        const u = state.units[id];
        if (!u) return err("no_unit", "Соединение не найдено.", [id]);
        if (u.side !== state.activeSide) return err("not_owner", "Чужое соединение.", [id]);
        if (u.acted) return err("already_acted", "Соединение уже действовало в эти сутки.", [id]);
        if (u.commandState === "disorganized")
          return err("disorganized", "Дезорганизованное соединение не может наступать.", [id]);
      }
      if (!cmd.destinationHexId) return err("no_dest", "Не указан пункт назначения.");
      const reach = bestPath(state, ids, cmd.destinationHexId);
      if (!reach) return err("unreachable", "Маршрут невозможен: местность, река без моста, зона контроля или перегрузка стека.", [cmd.destinationHexId]);
      const lead = state.units[ids[0]];
      const forced = reach.path.length - 1 >= 3;
      const amount = commandCostFor(state, lead, forced ? "forced_march" : "move");
      return cpValidation(state, lead.side, amount, commandInfo(state, lead).hq?.id);
    }
    case "RESOLVE_COMBAT": {
      if (state.phase !== "activation" && state.phase !== "exploitation")
        return err("wrong_phase", "Атака возможна в фазе активаций.");
      const attackerIds = cmd.unitIds ?? [];
      if (attackerIds.length === 0) return err("no_units", "Не назначены атакующие.");
      const targetHex = cmd.defenderHexId ? state.hexes[cmd.defenderHexId] : undefined;
      if (!targetHex) return err("no_target", "Не выбрана цель атаки.");
      const attSide = state.units[attackerIds[0]]?.side;
      if (attSide !== state.activeSide) return err("not_owner", "Атакуют не вашей стороны.");
      const defenders = targetHex.stackUnitIds.filter((id) => state.units[id]?.side === enemyOf(attSide ?? "germany"));
      if (defenders.length === 0) return err("no_enemy", "В этом гексе нет войск противника.");
      // All attackers must be adjacent to the target.
      for (const id of attackerIds) {
        const u = state.units[id];
        if (!u) continue;
        if (u.acted) return err("already_acted", "Соединение уже участвовало в бою.", [id]);
        const sameHex = u.hexId === cmd.defenderHexId;
        const adj = sharedEdge(parseKey(u.hexId), parseKey(cmd.defenderHexId!)) != null;
        if (!adj && !sameHex) return err("not_adjacent", "Атакующее соединение должно быть рядом с целью.", [id]);
      }
      const action = attackerIds.length > 1 ? "coordinated_attack" : "prepared_attack";
      const allocations = attackerIds.map((id) => {
        const unit = state.units[id];
        return {
          side: unit.side,
          amount: commandCostFor(state, unit, action),
          hqId: commandInfo(state, unit).hq?.id,
        };
      });
      const cp = canSpendFromAllocations(state, allocations);
      return cp.ok ? ok() : { valid: false, errors: cp.error ? [cp.error] : [] };
    }
    case "PLAY_CARD": {
      if (
        state.phase !== "planning" &&
        state.phase !== "command" &&
        state.phase !== "activation" &&
        state.phase !== "air"
      )
        return err("wrong_phase", "Карты разыгрываются в штабной, воздушной фазе или фазе активаций.");
      const cardId = cmd.cardId;
      if (!cardId || !state.playerHands[state.activeSide].includes(cardId))
        return err("not_in_hand", "Такой карты нет на руке.", cardId ? [cardId] : undefined);
      const def = CARD_DEFS.find((d) => d.defId === state.cards[cardId].defId);
      if (!def) return err("no_def", "Определение карты не найдено.");
      if (def.availableFromTurn && state.turn < def.availableFromTurn)
        return err("not_yet", "Карта ещё недоступна по сроку.");
      return cpValidation(state, state.activeSide, def.commandCost);
    }
    case "PREPARE_BRIDGE_DEMOLITION":
    case "DETONATE_BRIDGE":
    case "DESTROY_BRIDGE":
    case "BUILD_PONTOON":
    case "REPAIR_BRIDGE": {
      if (state.phase !== "command" && state.phase !== "activation" && state.phase !== "exploitation")
        return err("wrong_phase", "Подрыв возможен в штабной фазе или фазе активаций.");
      const hexId = cmd.defenderHexId;
      const edge = cmd.edge;
      if (!hexId || edge == null) return err("no_target", "Укажите гекс и грань моста.");
      const h = state.hexes[hexId];
      if (!h || !h.bridgeEdges.some((b) => b.edge === edge))
        return err("no_bridge", "Здесь нет моста.", [hexId]);
      const demolitionKey = sharedEdgeKey(state, hexId, edge);
      if (!demolitionKey) return err("INVALID_SHARED_EDGE", "Грань моста не имеет соседнего гекса.");
      if (
        (cmd.type === "DETONATE_BRIDGE" || cmd.type === "DESTROY_BRIDGE") &&
        !state.preparedBridgeDemolitions[demolitionKey]
      ) {
        return err("BRIDGE_NOT_PREPARED", "Мост не подготовлен к подрыву.", [hexId]);
      }
      const engineer = engineerNearBridge(state, state.activeSide, hexId);
      if (!engineer) return err("ENGINEER_REQUIRED", "Для работы с мостом нужен инженер рядом.", [hexId]);
      const amount =
        cmd.type === "BUILD_PONTOON" || cmd.type === "REPAIR_BRIDGE"
          ? COMMAND_COST.engineer_crossing
          : COMMAND_COST.destroy_bridge;
      return cpValidation(
        state,
        state.activeSide,
        amount,
        commandInfo(state, engineer).hq?.id,
      );
    }
    case "END_ACTIVATION":
    case "END_PHASE":
      return ok();
    case "UPSERT_PLANNED_ORDER":
    case "REMOVE_PLANNED_ORDER":
    case "UPSERT_REACTION":
    case "COMMIT_PLAN":
    case "EXECUTE_IMPULSE":
      return validateWegoCommand(state, cmd);
    default:
      return err("unknown", "Неизвестная команда.");
  }
}

// ---------------------------------------------------------------------------
// State mutation helpers (operate on an already-cloned state).
// ---------------------------------------------------------------------------

function pushEvents(s: GameState, events: GameEvent[]): void {
  for (const e of events) s.eventLog.push(e);
}

function removeFromHex(s: GameState, unit: UnitState): void {
  const hex = s.hexes[unit.hexId];
  if (hex) hex.stackUnitIds = hex.stackUnitIds.filter((id) => id !== unit.id);
}

function addToHex(s: GameState, unit: UnitState, hexId: string): void {
  unit.hexId = hexId;
  const hex = s.hexes[hexId];
  if (hex && !hex.stackUnitIds.includes(unit.id)) hex.stackUnitIds.push(unit.id);
}

function setControl(s: GameState, hexId: string, side: Side, events: GameEvent[]): void {
  const hex = s.hexes[hexId];
  if (!hex) return;
  if (hex.control !== side) {
    hex.control = side;
    events.push({ type: "HEX_CONTROL_CHANGED", hexId, side });
  }
}

function draw(s: GameState, events: GameEvent[], tag?: string): number {
  const r = roll(s.seed, s.rngCursor);
  s.rngCursor = r.cursor;
  events.push({ type: "DICE_ROLLED", value: Math.round(r.value * 6), rngCursor: r.cursor - 1, tag });
  return 1 + Math.floor(r.value * 6);
}

function fuelForMove(unit: UnitState, hexesMoved: number): number {
  if (unit.movementClass === "foot") return 0;
  return Math.ceil(hexesMoved * (unit.movementClass === "tracked" ? 5 : 4));
}

// ---------------------------------------------------------------------------
// Command application.
// ---------------------------------------------------------------------------

function applyMove(s: GameState, cmd: GameCommand, events: GameEvent[]): void {
  const ids = cmd.unitIds!;
  const reach = bestPath(s, ids, cmd.destinationHexId!)!;
  const path = reach.path;
  const units = ids.map((id) => s.units[id]);
  const dest = path[path.length - 1];
  const hexesMoved = path.length - 1;
  const forced = hexesMoved >= 3;
  // Command points: per stack, from the commanding HQ of the "lead" unit.
  const cost = commandCostFor(s, units[0], forced ? "forced_march" : "move");
  spendCommandPoints(s, events, units[0].side, cost, commandInfo(s, units[0]).hq?.id);
  for (const u of units) {
    removeFromHex(s, u);
    addToHex(s, u, dest);
    const f = fuelForMove(u, hexesMoved);
    if (f > 0) {
      u.fuel = Math.max(0, u.fuel - f);
      events.push({ type: "FUEL_SPENT", unitId: u.id, amount: f });
    }
    u.acted = true;
    if (u.entityType === "headquarters") {
      const hq = s.headquarters[u.id];
      if (hq) hq.movedThisTurn = true;
    }
    events.push({ type: "UNIT_MOVED", unitId: u.id, from: path[0], to: dest, fuelSpent: f });
  }
  // Movement claims territory.
  setControl(s, dest, units[0].side, events);
  for (const id of path) setControl(s, id, units[0].side, events);
  pushEvents(s, evaluateObjectives(s));
}

function applyCombat(s: GameState, cmd: GameCommand, events: GameEvent[]): void {
  const attackerIds = cmd.unitIds!;
  const defenderHexId = cmd.defenderHexId!;
  const targetHex = s.hexes[defenderHexId];
  const attSide = s.units[attackerIds[0]].side;
  const defenderIds = targetHex.stackUnitIds.filter(
    (id) =>
      s.units[id]?.side === enemyOf(attSide) &&
      s.units[id]?.entityType === "combat_unit",
  );

  const airBonus = s.pendingAirSupport?.side === attSide ? s.pendingAirSupport.value : 0;
  const prediction = predictCombat(s, attackerIds, defenderHexId, { airBonus });
  const attackers = attackerIds.map((id) => s.units[id]);

  const steps: CombatStep[] = [];
  steps.push({ phase: "Воздушная поддержка", description: airBonus ? `Авиация усилила удар (+${airBonus}).` : "Без авиационной поддержки.", attackerLosses: 0, defenderLosses: 0 });
  steps.push({ phase: "Противотанковое взаимодействие", description: defenderHasHeavyArmor(s, defenderIds) ? (prediction.penetrates ? "Тяжёлая броня обнаружена, но пробита средствами поражения." : "Тяжёлая броня (КВ) отражает огонь лёгких ПТО.") : "Броня обычная.", attackerLosses: 0, defenderLosses: 0 });

  // Spend command points (coordinated if multiple attackers).
  const cpAction = attackerIds.length > 1 ? "coordinated_attack" : "prepared_attack";
  for (const a of attackers) {
    spendCommandPoints(
      s,
      events,
      a.side,
      commandCostFor(s, a, cpAction),
      commandInfo(s, a).hq?.id,
    );
  }
  // Ammunition expenditure.
  for (const a of attackers) a.ammunition = Math.max(0, a.ammunition - 10);

  // Resolve via CRT + d6.
  const column = ratioColumn(prediction.ratio);
  const rollVal = draw(s, events, "combat");
  let cell: Cell = CRT[column][rollVal - 1];
  // Heavy armor prevents clean breakthroughs when not penetrated.
  if (defenderHasHeavyArmor(s, defenderIds) && !prediction.penetrates && (cell.outcome === "breakthrough" || cell.outcome === "defender_destroyed")) {
    cell = { ...CRT[column][rollVal - 1], outcome: "defender_retreat", advance: false, defLoss: 1 };
  }

  steps.push({ phase: "Главный бой", description: `Соотношение ${prediction.ratio}:1, бросок d6 = ${rollVal}.`, attackerLosses: cell.attLoss, defenderLosses: Math.min(cell.defLoss, 99), roll: rollVal });

  let attLoss = cell.attLoss;
  let defLoss = cell.defLoss >= 99 ? 99 : cell.defLoss;

  // Apply attacker losses.
  if (attLoss > 0) {
    const victim = [...attackers].sort((a, b) => b.currentSteps - a.currentSteps)[0];
    loseSteps(s, victim, attLoss, events);
  }
  // Apply defender losses.
  if (defLoss >= 99) {
    for (const id of [...defenderIds]) {
      const d = s.units[id];
      loseSteps(s, d, d.currentSteps, events);
    }
    defLoss = 0;
  } else if (defLoss > 0) {
    const victim = [...defenderIds].map((id) => s.units[id]).sort((a, b) => b.currentSteps - a.currentSteps)[0];
    loseSteps(s, victim, defLoss, events);
  }

  // Retreat.
  let retreatPathResult: string[] = [];
  const attackerHexIds = attackers.map((a) => a.hexId);
  const survivors = defenderIds.map((id) => s.units[id]).filter((d) => !d.eliminated);
  if (cell.retreat && survivors.length > 0) {
    const rp = retreatPath(s, survivors[0].id, attackerHexIds);
    if (rp) {
      retreatPathResult = rp;
      for (const d of survivors) {
        removeFromHex(s, d);
        addToHex(s, d, rp[rp.length - 1]);
        events.push({ type: "UNIT_RETREATED", unitId: d.id, path: rp });
      }
    } else {
      // No retreat route through enemy ZOC: extra losses.
      steps.push({ phase: "Отступление", description: "Пути отхода отрезаны — дополнительные потери!", attackerLosses: 0, defenderLosses: survivors.length });
      for (const d of survivors) loseSteps(s, d, 1, events);
    }
  }

  // Defender disorganisation / advance.
  let advanceHexId: string | undefined;
  if (cell.outcome === "defender_disorganized") {
    for (const id of defenderIds) {
      const d = s.units[id];
      if (!d.eliminated) {
        d.commandState = "disorganized";
        events.push({ type: "UNIT_DISORGANIZED", unitId: id });
      }
    }
  }
  const defendersRemoved = survivors.every((d) => d.eliminated || d.hexId !== defenderHexId);
  const defendersEliminated = defenderIds.every((id) => s.units[id]?.eliminated);
  if (
    (cell.advance || defendersEliminated || s.pendingExtraAdvance === attSide) &&
    defendersRemoved
  ) {
    const requestedAdvancer = cmd.advanceUnitId
      ? attackers.find((attacker) => attacker.id === cmd.advanceUnitId)
      : undefined;
    const advancer =
      requestedAdvancer && eligibleForAdvance(requestedAdvancer) && requestedAdvancer.currentSteps > 0
        ? requestedAdvancer
        : undefined;
    if (advancer) {
      removeFromHex(s, advancer);
      addToHex(s, advancer, defenderHexId);
      advanceHexId = defenderHexId;
      events.push({ type: "UNIT_ADVANCED", unitId: advancer.id, to: defenderHexId });
    }
  }
  // Bad attack punishes the attacker.
  if (cell.outcome === "attacker_repulsed" || cell.outcome === "attacker_step_loss") {
    for (const a of attackers) {
      if (!a.eliminated && a.organization > 30) {
        a.organization = Math.max(10, a.organization - 15);
      }
    }
  }

  // Ground changes hands only after the defender has left and an attacker occupies it.
  for (const a of attackers) a.acted = true;
  if (defendersRemoved && advanceHexId) {
    setControl(s, defenderHexId, attSide, events);
  } else if (defendersRemoved && targetHex.control !== "contested") {
    targetHex.control = "contested";
    events.push({ type: "HEX_CONTROL_CHANGED", hexId: defenderHexId, side: "contested" });
  }

  // Clear one-shot bonuses.
  if (s.pendingAirSupport?.side === attSide) s.pendingAirSupport = undefined;
  if (s.pendingExtraAdvance === attSide) s.pendingExtraAdvance = undefined;

  const resolution: CombatResolution = {
    id: `combat-${s.rngCursor}`,
    attackerIds,
    defenderIds,
    defenderHexId,
    odds: prediction.ratio,
    attackerStrength: prediction.attackerStrength,
    defenderStrength: prediction.defenderStrength,
    outcome: cell.outcome,
    steps,
    attackerLossSteps: attLoss,
    defenderLossSteps: defLoss,
    retreatPath: retreatPathResult,
    advanceHexId,
  };
  s.lastCombat = resolution;
  s.pendingCombat = resolution;
  recomputeSupply(s);
  recomputeCommand(s);
  pushEvents(s, evaluateObjectives(s));
}

function defendersAllGone(s: GameState, defenderIds: string[]): boolean {
  return defenderIds.every((id) => s.units[id]?.eliminated);
}

function loseSteps(s: GameState, unit: UnitState | undefined, amount: number, events: GameEvent[]): void {
  if (!unit || unit.eliminated) return;
  unit.currentSteps = Math.max(0, unit.currentSteps - amount);
  unit.organization = Math.max(0, unit.organization - 15);
  events.push({ type: "UNIT_LOST_STEP", unitId: unit.id, amount });
  if (unit.currentSteps <= 0) {
    unit.eliminated = true;
    removeFromHex(s, unit);
    events.push({ type: "UNIT_ELIMINATED", unitId: unit.id });
    awardScoreEvent(
      s,
      events,
      `unit-eliminated:${unit.id}`,
      enemyOf(unit.side),
      "destructionPoints",
      unit.side === "germany" ? 4 : 3,
    );
  }
}

function applyCard(s: GameState, cmd: GameCommand, events: GameEvent[]): void {
  const cardId = cmd.cardId!;
  const def = CARD_DEFS.find((d) => d.defId === s.cards[cardId].defId)!;
  const side = s.activeSide;
  const targets = cmd.targets ?? [];
  spendCommandPoints(s, events, side, def.commandCost);
  s.cards[cardId].state = "committed";

  for (const eff of def.effects) {
    switch (eff.kind) {
      case "destroy_bridge": {
        const hexId = targets[0];
        const edge = Number(targets[1]);
        const h = s.hexes[hexId];
        if (h) {
          const b = h.bridgeEdges.find((x) => x.edge === edge);
          if (b) {
            setBridgeState(s, hexId, edge, "destroyed");
            events.push({ type: "BRIDGE_DESTROYED", hexId, edge });
          }
        }
        break;
      }
      case "build_pontoon": {
        const hexId = targets[0];
        const edge = Number(targets[1]);
        const direction = directionForEdge(edge);
        if (direction != null) {
          updateSharedEdge(s, hexId, direction, (bridge) => ({
            edge,
            type: bridge?.type ?? "combined",
            state: "pontoon",
          }));
          events.push({ type: "PONTOON_BUILT", hexId, edge });
        }
        break;
      }
      case "add_trait": {
        const u = s.units[targets[0]];
        if (u) {
          u.statusEffects.push({ id: `eff-${s.rngCursor}`, kind: "add_trait", label: eff.trait ?? "heavy_armor", turnsRemaining: eff.durationTurns ?? 2, data: { trait: eff.trait } });
          if (eff.trait && !u.traits.includes(eff.trait)) u.traits.push(eff.trait);
        }
        break;
      }
      case "air_support": {
        s.pendingAirSupport = { side, value: eff.value ?? 2 };
        break;
      }
      case "extra_advance": {
        s.pendingExtraAdvance = side;
        break;
      }
      case "activate_ooc": {
        const u = s.units[targets[0]];
        if (u) {
          u.statusEffects.push({ id: `eff-${s.rngCursor}`, kind: "activate_ooc", label: "Местная инициатива", turnsRemaining: 1 });
          u.commandState = "in_command";
        }
        break;
      }
      case "restore_org": {
        const u = s.units[targets[0]];
        if (u) {
          u.organization = Math.min(100, u.organization + (eff.value ?? 30));
          u.commandState = u.commandState === "disorganized" ? "in_command" : u.commandState;
          u.fatigue = Math.max(0, u.fatigue - 20);
        }
        break;
      }
      case "temp_initiative": {
        const hq = s.headquarters[targets[0]];
        if (hq) hq.commandPoints += eff.value ?? 2;
        break;
      }
      case "recon_reveal": {
        const hexId = targets[0];
        if (hexId && !s.airState.reconRevealedHexIds.includes(hexId)) {
          s.airState.reconRevealedHexIds.push(hexId);
        }
        break;
      }
      case "reinforce_org": {
        const unit = s.units[targets[0]];
        if (unit) unit.organization = Math.min(100, unit.organization + (eff.value ?? 20));
        break;
      }
    }
  }

  s.cards[cardId].state = "resolved";
  s.cards[cardId].resolvedAtTurn = s.turn;
  s.cards[cardId].state = "discard";
  s.playerHands[side] = s.playerHands[side].filter((id) => id !== cardId);
  events.push({ type: "CARD_PLAYED", cardId, defId: def.defId });
}

function applyDestroyBridge(s: GameState, cmd: GameCommand, events: GameEvent[]): void {
  const hexId = cmd.defenderHexId!;
  const edge = cmd.edge!;
  const h = s.hexes[hexId];
  const b = h.bridgeEdges.find((x) => x.edge === edge);
  if (b && setBridgeState(s, hexId, edge, "destroyed")) {
    events.push({ type: "BRIDGE_DESTROYED", hexId, edge });
  }
  const key = sharedEdgeKey(s, hexId, edge);
  if (key) delete s.preparedBridgeDemolitions[key];
  pushEvents(s, evaluateObjectives(s));
}

function applyBridgeCommand(s: GameState, cmd: GameCommand, events: GameEvent[]): void {
  const hexId = cmd.defenderHexId!;
  const edge = cmd.edge!;
  const key = sharedEdgeKey(s, hexId, edge);
  const engineer = engineerNearBridge(s, s.activeSide, hexId);
  const amount =
    cmd.type === "BUILD_PONTOON" || cmd.type === "REPAIR_BRIDGE"
      ? COMMAND_COST.engineer_crossing
      : COMMAND_COST.destroy_bridge;
  spendCommandPoints(
    s,
    events,
    s.activeSide,
    amount,
    engineer ? commandInfo(s, engineer).hq?.id : undefined,
  );
  if (cmd.type === "PREPARE_BRIDGE_DEMOLITION") {
    if (key) {
      s.preparedBridgeDemolitions[key] = {
        side: s.activeSide,
        preparedById: engineer?.id,
      };
    }
    setBridgeState(s, hexId, edge, "prepared_for_demolition");
    events.push({ type: "BRIDGE_PREPARED", hexId, edge, side: s.activeSide });
  } else if (cmd.type === "DETONATE_BRIDGE" || cmd.type === "DESTROY_BRIDGE") {
    applyDestroyBridge(s, cmd, events);
  } else if (cmd.type === "BUILD_PONTOON") {
    const direction = directionForEdge(edge);
    if (direction != null) {
      updateSharedEdge(s, hexId, direction, (bridge) => ({
        edge,
        type: bridge?.type ?? "combined",
        state: "pontoon",
      }));
      events.push({ type: "PONTOON_BUILT", hexId, edge });
    }
  } else if (cmd.type === "REPAIR_BRIDGE") {
    setBridgeState(s, hexId, edge, "intact");
    events.push({ type: "BRIDGE_REPAIRED", hexId, edge });
  }
}

// ---------------------------------------------------------------------------
// Phase / turn machinery.
// ---------------------------------------------------------------------------

function ratioColumn(ratio: number): number {
  if (ratio < 0.6) return 0;
  if (ratio < 1.0) return 1;
  if (ratio < 1.5) return 2;
  if (ratio < 2.0) return 3;
  if (ratio < 3.0) return 4;
  if (ratio < 4.0) return 5;
  return 6;
}

// CRT mirrors rules.ts (kept here so combat resolution is self-contained & pure).
const CRT: Cell[][] = buildCRT();

function buildCRT(): Cell[][] {
  // Re-export the canonical CRT from rules by reconstructing compactly.
  const c = (outcome: Cell["outcome"], attLoss: number, defLoss: number, retreat: boolean, advance: boolean): Cell => ({ outcome, attLoss, defLoss, retreat, advance });
  return [
    [c("attacker_step_loss", 1, 0, false, false), c("attacker_step_loss", 1, 0, false, false), c("attacker_repulsed", 0, 0, false, false), c("attacker_repulsed", 0, 0, false, false), c("no_effect", 0, 0, false, false), c("no_effect", 0, 0, false, false)],
    [c("attacker_step_loss", 1, 0, false, false), c("attacker_repulsed", 0, 0, false, false), c("attacker_repulsed", 0, 0, false, false), c("no_effect", 0, 0, false, false), c("defender_disorganized", 0, 0, false, false), c("exchange", 1, 1, false, false)],
    [c("attacker_repulsed", 0, 0, false, false), c("no_effect", 0, 0, false, false), c("defender_disorganized", 0, 0, false, false), c("exchange", 1, 1, false, false), c("defender_step_loss", 0, 1, false, false), c("defender_step_loss", 0, 1, false, false)],
    [c("no_effect", 0, 0, false, false), c("defender_disorganized", 0, 0, false, false), c("exchange", 1, 1, false, false), c("defender_step_loss", 0, 1, false, false), c("defender_step_loss", 0, 1, true, false), c("defender_retreat", 0, 0, true, false)],
    [c("defender_disorganized", 0, 0, false, false), c("defender_step_loss", 0, 1, false, false), c("defender_step_loss", 0, 1, true, false), c("defender_retreat", 0, 0, true, false), c("defender_retreat", 0, 1, true, false), c("breakthrough", 0, 1, true, true)],
    [c("defender_step_loss", 0, 1, false, false), c("defender_step_loss", 0, 1, true, false), c("defender_retreat", 0, 0, true, false), c("defender_retreat", 0, 1, true, false), c("breakthrough", 0, 1, true, true), c("defender_destroyed", 0, 99, false, false)],
    [c("defender_retreat", 0, 0, true, false), c("defender_retreat", 0, 1, true, false), c("breakthrough", 0, 1, true, true), c("breakthrough", 0, 1, true, true), c("defender_destroyed", 0, 99, false, false), c("defender_destroyed", 0, 99, false, false)],
  ];
}

function enterPhase(s: GameState, phase: GamePhase, events: GameEvent[]): void {
  s.phase = phase;
  events.push({ type: "PHASE_CHANGED", phase });

  if (phase === "events") {
    for (const ev of EVENTS) {
      if (ev.turn !== s.turn) continue;
      events.push({ type: "EVENT_TRIGGERED", eventId: ev.id, title: ev.title });
      if (ev.kind === "weather" && ev.weather) {
        const labels: Record<string, string> = { clear: "Ясно", rain: "Дождь, распутица", storm: "Гроза", mud: "Распутица", overcast: "Пасмурно" };
        const mods: Record<string, [number, number]> = { clear: [0, 0], rain: [1, -2], storm: [2, -4], mud: [2, -2], overcast: [0, -1] };
        const [mm, am] = mods[ev.weather];
        s.weather = { condition: ev.weather, label: labels[ev.weather], movementModifier: mm, airPointsModifier: am };
        s.airState.germanyAirPoints = Math.max(0, 6 + am);
        s.airState.sovietAirPoints = Math.max(0, 3 + am);
        events.push({ type: "WEATHER_CHANGED", condition: ev.weather });
      } else if (ev.kind === "card" && ev.cardDefId) {
        const inst = Object.values(s.cards).find(
          (c) => c.defId === ev.cardDefId && c.state === "deck",
        );
        if (inst && ev.side) {
          inst.state = "hand";
          s.cardDeck = s.cardDeck.filter((cardId) => cardId !== inst.id);
          s.playerHands[ev.side].push(inst.id);
          events.push({ type: "CARD_DRAWN", cardId: inst.id, defId: ev.cardDefId, side: ev.side });
        }
      }
    }
  } else if (phase === "command" || phase === "planning") {
    // Refresh command points and command state for the new day's planning.
    for (const id in s.headquarters) {
      const hq = s.headquarters[id];
      hq.commandPoints = hq.maxCommandPoints;
      hq.movedThisTurn = false;
    }
    recomputeCommand(s);
    if (phase === "planning") {
      s.activeSide = "germany";
      s.plans = {
        germany: { side: "germany", orders: [], reactions: [], committed: false },
        ussr: { side: "ussr", orders: [], reactions: [], committed: false },
      };
    }
  } else if (phase === "activation") {
    s.sideActivationDone = { germany: false, ussr: false };
    s.activeSide = s.initiativeSide;
  } else if (phase === "supply") {
    // Recovery: organisation, fatigue, fuel/ammo resupply, effect durations.
    for (const id in s.units) {
      const u = s.units[id];
      if (u.eliminated) continue;
      if (u.commandState === "disorganized") u.commandState = "out_of_command";
      const recover = u.supplyState === "full" ? 18 : u.supplyState === "limited" ? 10 : u.supplyState === "low" ? 5 : 0;
      u.organization = Math.min(100, u.organization + recover);
      u.fatigue = Math.max(0, u.fatigue - 10);
      if (u.supplyState === "full") {
        if (u.movementClass !== "foot") u.fuel = Math.min(100, u.fuel + 40);
        u.ammunition = Math.min(100, u.ammunition + 50);
      } else if (u.supplyState === "limited") {
        if (u.movementClass !== "foot") u.fuel = Math.min(100, u.fuel + 20);
        u.ammunition = Math.min(100, u.ammunition + 25);
      }
      // Tick status effects.
      u.statusEffects = u.statusEffects
        .map((e) => ({ ...e, turnsRemaining: e.turnsRemaining - 1 }))
        .filter((e) => {
          if (e.turnsRemaining <= 0) {
            if (e.kind === "add_trait" && e.data?.trait) {
              u.traits = u.traits.filter((t) => t !== e.data!.trait);
            }
            return false;
          }
          return true;
        });
    }
    recomputeSupply(s);
    recomputeCommand(s);
    for (const id in s.units) {
      const u = s.units[id];
      if (!u.eliminated) events.push({ type: "SUPPLY_UPDATED", unitId: id, state: u.supplyState });
    }
  } else if (phase === "end_of_day") {
    pushEvents(s, endOfDayScoring(s));
    pushEvents(s, evaluateObjectives(s));
    if (s.turn >= SCENARIO.totalTurns) {
      pushEvents(s, evaluateObjectives(s, true));
      const result = computeResult(s);
      s.status = "completed";
      s.winner = result.winner;
      s.resultType = result.resultType;
      events.push({ type: "GAME_COMPLETED", winner: result.winner, resultType: result.resultType });
    }
  } else if (phase === "morning_report") {
    for (const id in s.units) s.units[id].acted = false;
  }
}

function advancePhase(s: GameState, events: GameEvent[]): void {
  const phases = s.mode === "legacy_debug" ? PHASE_ORDER : WEGO_PHASE_ORDER;
  const idx = phases.indexOf(s.phase);
  const next = phases[(idx + 1) % phases.length];
  if (next === "morning_report") {
    // New day.
    s.turn += 1;
    s.date = dateForTurn(s.turn);
    events.push({ type: "TURN_ADVANCED", turn: s.turn, date: s.date });
    // Initiative can swing, but Germany holds it early in this scenario.
    if (s.turn >= 5) {
      const r = roll(s.seed, s.rngCursor);
      s.rngCursor = r.cursor;
      if (r.value > 0.6) s.initiativeSide = enemyOf(s.initiativeSide);
    }
    s.pendingAirSupport = undefined;
    s.pendingExtraAdvance = undefined;
  }
  enterPhase(s, next, events);
}

// ---------------------------------------------------------------------------
// Public entry point.
// ---------------------------------------------------------------------------

export function applyCommand(prev: GameState, cmd: GameCommand): { ok: boolean; errors: CommandResult["errors"]; events: GameEvent[]; state: GameState } {
  if (cmd.expectedVersion != null && cmd.expectedVersion !== prev.version) {
    return {
      ok: false,
      errors: [{ code: "VERSION_CONFLICT", message: "Состояние матча уже изменилось." }],
      events: [],
      state: prev,
    };
  }
  if (cmd.commandId && prev.processedCommandIds.includes(cmd.commandId)) {
    return { ok: true, errors: [], events: [], state: prev };
  }
  // Phase-flow commands always succeed and do not require validation.
  if (cmd.type === "END_PHASE") {
    if (prev.mode !== "legacy_debug" && (prev.phase === "planning" || prev.phase === "execution")) {
      return {
        ok: false,
        errors: [{ code: "EXPLICIT_WEGO_COMMAND_REQUIRED", message: "Зафиксируйте план или исполните очередной импульс." }],
        events: [],
        state: prev,
      };
    }
    const s = structuredClone(prev);
    const events: GameEvent[] = [];
    advancePhase(s, events);
    s.version += 1;
    if (cmd.commandId) s.processedCommandIds.push(cmd.commandId);
    pushEvents(s, events);
    return { ok: true, errors: [], events, state: s };
  }
  if (cmd.type === "END_ACTIVATION") {
    const s = structuredClone(prev);
    const events: GameEvent[] = [];
    if (s.phase === "activation") {
      s.sideActivationDone[s.activeSide] = true;
      const other = enemyOf(s.activeSide);
      if (!s.sideActivationDone[other]) {
        s.activeSide = other;
      } else {
        advancePhase(s, events);
      }
    } else {
      advancePhase(s, events);
    }
    pushEvents(s, events);
    s.version += 1;
    if (cmd.commandId) s.processedCommandIds.push(cmd.commandId);
    return { ok: true, errors: [], events, state: s };
  }

  const validation = validateCommand(prev, cmd);
  if (!validation.valid) {
    return { ok: false, errors: validation.errors, events: [], state: prev };
  }

  const s = structuredClone(prev);
  const events: GameEvent[] = [];
  switch (cmd.type) {
    case "ASSIGN_ORDER":
      spendCommandPoints(
        s,
        events,
        s.activeSide,
        1,
        commandInfo(s, s.units[cmd.unitIds![0]]).hq?.id,
      );
      for (const id of cmd.unitIds!) {
        const u = s.units[id];
        u.order = cmd.order ?? { type: "hold", assignedAtTurn: s.turn };
        events.push({ type: "ORDER_ASSIGNED", unitId: id, order: u.order! });
      }
      break;
    case "MOVE_STACK":
      applyMove(s, cmd, events);
      break;
    case "RESOLVE_COMBAT":
      applyCombat(s, cmd, events);
      break;
    case "PLAY_CARD":
      applyCard(s, cmd, events);
      break;
    case "PREPARE_BRIDGE_DEMOLITION":
    case "DETONATE_BRIDGE":
    case "BUILD_PONTOON":
    case "REPAIR_BRIDGE":
    case "DESTROY_BRIDGE":
      applyBridgeCommand(s, cmd, events);
      break;
    case "UPSERT_PLANNED_ORDER":
    case "REMOVE_PLANNED_ORDER":
    case "UPSERT_REACTION":
    case "COMMIT_PLAN":
    case "EXECUTE_IMPULSE":
      applyWegoCommand(s, cmd, events);
      break;
  }
  s.version += 1;
  if (cmd.commandId) s.processedCommandIds.push(cmd.commandId);
  pushEvents(s, events);
  return { ok: true, errors: [], events, state: s };
}

/** Replay a command log from an initial state (for saves / network sync). */
export function replayCommands(initial: GameState, commands: GameCommand[]): GameState {
  let state = initial;
  for (const cmd of commands) {
    const res = applyCommand(state, cmd);
    if (res.ok) state = res.state;
  }
  return state;
}

export { STACK_BASE_LIMIT };
export type { GameCommand, GameState };
