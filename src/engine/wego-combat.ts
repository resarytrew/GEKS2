import type {
  CombatResolution,
  CombatStep,
  ContactState,
  GameEvent,
  GameState,
  LossAllocation,
  PlannedOrder,
  Side,
  UnitState,
} from "@/engine/types";
import { buildCombatModel } from "@/engine/combat";
import {
  canStackInto,
  commandInfo,
  effectiveHqInitiative,
  eligibleForAdvance,
  isInEnemyZOC,
  resolveCombatCell,
} from "@/engine/rules";
import { keyOf, neighbor, parseKey, sharedEdge } from "@/engine/hex";
import { rollInt } from "@/engine/rng";
import { resolveHeadquartersLoss } from "@/engine/headquarters";

const enemyOf = (side: Side): Side =>
  side === "germany" ? "ussr" : "germany";

function activeOrderFor(
  state: GameState,
  entityId: string,
): PlannedOrder | undefined {
  return (["germany", "ussr"] as Side[])
    .flatMap((side) => state.plans[side].orders)
    .find(
      (order) =>
        order.entityIds.includes(entityId) &&
        (order.status === "committed" ||
          order.status === "delayed" ||
          order.status === "executing"),
    );
}

function removeFromHex(state: GameState, unit: UnitState): void {
  const hex = state.hexes[unit.hexId];
  if (hex) {
    hex.stackUnitIds = hex.stackUnitIds.filter((id) => id !== unit.id);
  }
}

function moveToHex(
  state: GameState,
  unit: UnitState,
  destination: string,
): void {
  removeFromHex(state, unit);
  unit.hexId = destination;
  if (!state.hexes[destination].stackUnitIds.includes(unit.id)) {
    state.hexes[destination].stackUnitIds.push(unit.id);
  }
}

function combatUnits(
  state: GameState,
  entityIds: string[],
  side: Side,
): UnitState[] {
  return entityIds
    .map((id) => state.units[id])
    .filter(
      (unit): unit is UnitState =>
        !!unit &&
        unit.side === side &&
        !unit.eliminated &&
        unit.entityType === "combat_unit" &&
        unit.currentSteps > 0,
    );
}

function initiativeScore(state: GameState, units: UnitState[]): number {
  return units.reduce((sum, unit) => {
    const hq = commandInfo(state, unit).hq;
    const order = activeOrderFor(state, unit.id);
    const readiness =
      order?.orderType === "advance"
        ? 1
        : order?.orderType === "march"
          ? -1
          : order?.orderType === "defend"
            ? 0.5
            : 0;
    return (
      sum +
      unit.quality +
      unit.organization / 50 +
      (hq ? effectiveHqInitiative(state, hq) : 0) * 0.4 +
      readiness
    );
  }, 0);
}

export function allocateLosses(
  units: UnitState[],
  totalSteps: number,
): LossAllocation {
  const eligible = units
    .filter(
      (unit) =>
        !unit.eliminated &&
        unit.entityType === "combat_unit" &&
        unit.currentSteps > 0,
    )
    .sort(
      (left, right) =>
        right.currentSteps - left.currentSteps ||
        left.id.localeCompare(right.id),
    );
  const assigned = new Map<string, number>();
  let remaining = Math.max(0, totalSteps);
  let index = 0;
  while (remaining > 0 && eligible.length > 0) {
    const unit = eligible[index % eligible.length];
    const already = assigned.get(unit.id) ?? 0;
    if (already < unit.currentSteps) {
      assigned.set(unit.id, already + 1);
      remaining -= 1;
    }
    index += 1;
    if (
      index > eligible.length * 10 &&
      eligible.every(
        (unit) => (assigned.get(unit.id) ?? 0) >= unit.currentSteps,
      )
    ) {
      break;
    }
  }
  return {
    mandatory: [...assigned.entries()].map(([unitId, steps]) => ({
      unitId,
      steps,
    })),
  };
}

function applyLosses(
  state: GameState,
  allocation: LossAllocation,
  events: GameEvent[],
): void {
  for (const item of allocation.mandatory) {
    const unit = state.units[item.unitId];
    if (!unit || unit.eliminated || unit.entityType === "headquarters") continue;
    unit.currentSteps = Math.max(0, unit.currentSteps - item.steps);
    unit.organization = Math.max(0, unit.organization - item.steps * 15);
    events.push({
      type: "UNIT_LOST_STEP",
      unitId: unit.id,
      amount: item.steps,
    });
    if (unit.currentSteps === 0) {
      unit.eliminated = true;
      unit.status = "eliminated";
      removeFromHex(state, unit);
      events.push({ type: "UNIT_ELIMINATED", unitId: unit.id });
    }
  }
}

function retreatStepAllowed(
  state: GameState,
  unit: UnitState,
  from: string,
  to: string,
): boolean {
  const target = state.hexes[to];
  if (!target || target.terrain === "sea" || target.terrain === "lake") {
    return false;
  }
  if (
    target.stackUnitIds.some(
      (id) => state.units[id]?.side === enemyOf(unit.side),
    )
  ) {
    return false;
  }
  if (isInEnemyZOC(state, to, unit.side)) return false;
  if (!canStackInto(state, [unit.id], to)) return false;
  return sharedEdge(parseKey(from), parseKey(to)) != null;
}

function validFallback(
  state: GameState,
  unit: UnitState,
  fallbackRoute: string[] | undefined,
  distanceRequired: number,
): string[] | undefined {
  if (
    !fallbackRoute ||
    fallbackRoute[0] !== unit.hexId ||
    fallbackRoute.length < distanceRequired + 1
  ) {
    return undefined;
  }
  for (let index = 1; index < fallbackRoute.length; index++) {
    if (
      !retreatStepAllowed(
        state,
        unit,
        fallbackRoute[index - 1],
        fallbackRoute[index],
      )
    ) {
      return undefined;
    }
  }
  return fallbackRoute.slice(0, distanceRequired + 1);
}

export function findRetreatRoute(
  state: GameState,
  unitId: string,
  attackerHexIds: string[],
  distanceRequired = 1,
  fallbackRoute?: string[],
): string[] | null {
  const unit = state.units[unitId];
  if (!unit || unit.eliminated) return null;
  const preferred = validFallback(
    state,
    unit,
    fallbackRoute,
    distanceRequired,
  );
  if (preferred) return preferred;
  const queue: string[][] = [[unit.hexId]];
  const visited = new Set<string>([unit.hexId]);
  const candidates: string[][] = [];
  while (queue.length > 0) {
    const path = queue.shift()!;
    if (path.length === distanceRequired + 1) {
      candidates.push(path);
      continue;
    }
    const current = path[path.length - 1];
    const axial = parseKey(current);
    for (let direction = 0; direction < 6; direction++) {
      const nextAxial = neighbor(axial, direction);
      const next = keyOf(nextAxial.q, nextAxial.r);
      if (visited.has(next)) continue;
      if (!retreatStepAllowed(state, unit, current, next)) continue;
      visited.add(next);
      queue.push([...path, next]);
    }
  }
  candidates.sort((left, right) => {
    const distanceScore = (path: string[]) =>
      Math.min(
        ...attackerHexIds.map((attackerHexId) => {
          const from = parseKey(path[path.length - 1]);
          const attacker = parseKey(attackerHexId);
          return (
            Math.abs(from.q - attacker.q) +
            Math.abs(from.r - attacker.r) +
            Math.abs(from.q + from.r - attacker.q - attacker.r)
          );
        }),
      );
    return (
      distanceScore(right) - distanceScore(left) ||
      left.join("|").localeCompare(right.join("|"))
    );
  });
  return candidates[0] ?? null;
}

function spendAmmunition(
  units: UnitState[],
  amount: number,
  events: GameEvent[],
  spent: Record<string, number>,
): void {
  for (const unit of units) {
    const actual = Math.min(unit.ammunition, amount);
    unit.ammunition -= actual;
    spent[unit.id] = actual;
    if (actual > 0) {
      events.push({
        type: "AMMUNITION_SPENT",
        unitId: unit.id,
        amount: actual,
      });
    }
  }
}

function triggerLossThreshold(
  state: GameState,
  side: Side,
  lossSteps: number,
  contact: ContactState,
  events: GameEvent[],
): void {
  const attackingOrders = state.plans[side].orders.filter(
    (order) =>
      contact.entityIds.some((entityId) => order.entityIds.includes(entityId)) &&
      (order.orderType === "prepared_attack" ||
        order.orderType === "advance" ||
        order.orderType === "march"),
  );
  for (const order of attackingOrders) {
    const threshold =
      order.lossTolerance === "low"
        ? 1
        : order.lossTolerance === "normal"
          ? 2
          : 3;
    if (lossSteps < threshold) continue;
    const reaction = state.plans[side].reactions
      .filter(
        (candidate) =>
          candidate.condition === "loss_threshold" &&
          candidate.status === "committed" &&
          candidate.uses < candidate.maxUses &&
          state.impulse >= candidate.fromImpulse &&
          state.impulse <= candidate.toImpulse,
      )
      .sort(
        (left, right) =>
          right.priority - left.priority || left.id.localeCompare(right.id),
      )[0];
    if (reaction) {
      reaction.uses += 1;
      reaction.status =
        reaction.uses >= reaction.maxUses ? "resolved" : "committed";
      events.push({ type: "REACTION_TRIGGERED", reactionId: reaction.id });
    }
    order.status = "failed";
    order.failureReason = "Превышен допустимый уровень потерь.";
    events.push({
      type: "ORDER_FAILED",
      orderId: order.id,
      reason: order.failureReason,
    });
  }
}

export function resolveContact(
  state: GameState,
  contact: ContactState,
  events: GameEvent[],
): CombatResolution | undefined {
  if (contact.resolved || contact.status === "resolved") return undefined;
  contact.status = "resolving";
  const germanUnits = combatUnits(state, contact.entityIds, "germany");
  const sovietUnits = combatUnits(state, contact.entityIds, "ussr");
  if (germanUnits.length === 0 || sovietUnits.length === 0) {
    contact.status = "cancelled";
    return undefined;
  }
  let attackerSide = contact.attackerSide;
  if (!attackerSide) {
    const germanScore = initiativeScore(state, germanUnits);
    const sovietScore = initiativeScore(state, sovietUnits);
    attackerSide =
      germanScore === sovietScore
        ? state.initiativeSide
        : germanScore > sovietScore
          ? "germany"
          : "ussr";
  }
  const defenderSide = enemyOf(attackerSide);
  const attackers =
    attackerSide === "germany" ? germanUnits : sovietUnits;
  const defenders =
    defenderSide === "germany" ? germanUnits : sovietUnits;
  const attackerOrders = attackers
    .map((unit) => activeOrderFor(state, unit.id))
    .filter((order): order is PlannedOrder => !!order);
  const defenderOrders = defenders
    .map((unit) => activeOrderFor(state, unit.id))
    .filter((order): order is PlannedOrder => !!order);
  const supportIds = [
    ...(contact.supportIds ?? []),
    ...(contact.reserveIds ?? []),
  ];
  const model = buildCombatModel(state, {
    attackerIds: attackers.map((unit) => unit.id),
    defenderIds: defenders.map((unit) => unit.id),
    defenderHexId: contact.hexId,
    supportIds,
    contactType: contact.type,
    attackerOrderTypes: attackerOrders.map((order) => order.orderType),
    defenderOrderTypes: defenderOrders.map((order) => order.orderType),
    airBonus:
      state.pendingAirSupport?.side === attackerSide
        ? state.pendingAirSupport.value
        : 0,
  });
  const roll = rollInt(state.seed, state.rngCursor, 1, 6);
  state.rngCursor = roll.cursor;
  events.push({
    type: "DICE_ROLLED",
    value: roll.value,
    rngCursor: roll.cursor - 1,
    tag: `contact:${contact.id}`,
  });
  let cell = resolveCombatCell(model.ratio, roll.value);
  if (
    !model.penetratesHeavyArmor &&
    (cell.outcome === "breakthrough" ||
      cell.outcome === "defender_destroyed")
  ) {
    cell = {
      ...cell,
      outcome: "defender_retreat",
      defLoss: 1,
      retreat: true,
      advance: false,
    };
  }
  const attackerLossSteps = cell.attLoss;
  const defenderLossSteps =
    cell.defLoss >= 99
      ? defenders.reduce((sum, unit) => sum + unit.currentSteps, 0)
      : cell.defLoss;
  const attackerAllocation = allocateLosses(attackers, attackerLossSteps);
  const defenderAllocation = allocateLosses(defenders, defenderLossSteps);
  applyLosses(state, attackerAllocation, events);
  applyLosses(state, defenderAllocation, events);
  const ammunitionSpent: Record<string, number> = {};
  spendAmmunition(
    attackers.filter((unit) => !unit.eliminated),
    contact.type === "PREPARED_ATTACK" ? 12 : 8,
    events,
    ammunitionSpent,
  );
  spendAmmunition(
    defenders.filter((unit) => !unit.eliminated),
    6,
    events,
    ammunitionSpent,
  );
  spendAmmunition(
    supportIds
      .map((id) => state.units[id])
      .filter((unit): unit is UnitState => !!unit && !unit.eliminated),
    4,
    events,
    ammunitionSpent,
  );

  const retreatPaths: string[][] = [];
  const retreatPathByUnit = new Map<string, string[]>();
  const survivors = defenders.filter((unit) => !unit.eliminated);
  if (cell.retreat && survivors.length > 0) {
    const distanceRequired = cell.outcome === "breakthrough" ? 2 : 1;
    for (const defender of survivors) {
      const order = activeOrderFor(state, defender.id);
      const route = findRetreatRoute(
        state,
        defender.id,
        attackers.map((unit) => unit.hexId),
        distanceRequired,
        order?.fallbackRoute ??
          (order?.fallbackHexId
            ? [defender.hexId, order.fallbackHexId]
            : undefined),
      );
      if (route) {
        moveToHex(state, defender, route[route.length - 1]);
        defender.status = "retreated";
        defender.organization = Math.max(0, defender.organization - 8);
        retreatPaths.push(route);
        retreatPathByUnit.set(defender.id, route);
        events.push({
          type: "UNIT_RETREATED",
          unitId: defender.id,
          path: route,
        });
      } else {
        applyLosses(state, allocateLosses([defender], 1), events);
      }
    }
  }

  if (cell.outcome === "defender_disorganized") {
    for (const defender of defenders) {
      if (!defender.eliminated) {
        defender.commandState = "disorganized";
        defender.status = "disrupted";
        events.push({ type: "UNIT_DISORGANIZED", unitId: defender.id });
      }
    }
  }

  let advanceHexId: string | undefined;
  const defendersRemoved = defenders.every(
    (unit) => unit.eliminated || unit.hexId !== contact.hexId,
  );
  const canOccupyContactHex =
    defendersRemoved &&
    !!state.hexes[contact.hexId] &&
    !state.hexes[contact.hexId].stackUnitIds.some(
      (id) => state.units[id]?.side === defenderSide,
    );
  if (
    canOccupyContactHex &&
    (cell.advance ||
      cell.outcome === "defender_destroyed" ||
      state.pendingExtraAdvance === attackerSide ||
      (contact.type === "MEETING_ENGAGEMENT" &&
        cell.outcome !== "attacker_repulsed" &&
        cell.outcome !== "attacker_step_loss" &&
        cell.outcome !== "no_effect"))
  ) {
    const advancer = [...attackers]
      .filter(
        (unit) =>
          !unit.eliminated &&
          eligibleForAdvance(unit) &&
          unit.organization >= 20 &&
          (unit.movementClass === "foot" || unit.fuel >= 2) &&
          canStackInto(state, [unit.id], contact.hexId),
      )
      .sort(
        (left, right) =>
          right.organization - left.organization ||
          left.id.localeCompare(right.id),
      )[0];
    if (advancer) {
      moveToHex(state, advancer, contact.hexId);
      if (advancer.movementClass !== "foot") {
        advancer.fuel = Math.max(0, advancer.fuel - 2);
        events.push({ type: "FUEL_SPENT", unitId: advancer.id, amount: 2 });
      }
      advanceHexId = contact.hexId;
      events.push({
        type: "ADVANCE_AFTER_COMBAT",
        unitId: advancer.id,
        to: contact.hexId,
        contactId: contact.id,
      });
      const hex = state.hexes[contact.hexId];
      if (hex.control !== attackerSide) {
        hex.control = attackerSide;
        events.push({
          type: "HEX_CONTROL_CHANGED",
          hexId: contact.hexId,
          side: attackerSide,
        });
      }
    }
  }
  if (!advanceHexId && canOccupyContactHex) {
    events.push({
      type: "ADVANCE_HALTED",
      orderId: attackerOrders[0]?.id ?? `contact:${contact.id}`,
      reason: "Нет допустимой части для продвижения.",
    });
  }

  for (const hqId of state.hexes[contact.hexId]?.stackUnitIds ?? []) {
    const hq = state.headquarters[hqId];
    if (hq && hq.side === defenderSide && !hq.eliminated) {
      resolveHeadquartersLoss(state, hq.id, "captured", events);
    }
  }

  triggerLossThreshold(
    state,
    attackerSide,
    attackerLossSteps,
    contact,
    events,
  );
  const delayingOrders = defenderOrders.filter(
    (order) => order.orderType === "delay",
  );
  if (delayingOrders.length > 0) {
    for (const attackOrder of attackerOrders) {
      if (attackOrder.status === "executing") {
        attackOrder.status = "delayed";
        attackOrder.actualStartImpulse = Math.min(5, state.impulse + 1);
        events.push({
          type: "ENEMY_ADVANCE_DELAYED",
          orderId: attackOrder.id,
          untilImpulse: attackOrder.actualStartImpulse,
        });
      }
    }
    for (const defender of defenders.filter((unit) => !unit.eliminated)) {
      const path = retreatPathByUnit.get(defender.id);
      if (path) {
        events.push({
          type: "DELAYING_FORCE_WITHDREW",
          unitId: defender.id,
          path,
        });
      } else {
        events.push({ type: "DELAYING_FORCE_PINNED", unitId: defender.id });
      }
    }
  }

  const attackerSucceeded =
    cell.outcome !== "attacker_repulsed" &&
    cell.outcome !== "attacker_step_loss" &&
    cell.outcome !== "no_effect";
  for (const order of attackerOrders) {
    if (order.status === "failed") continue;
    if (order.orderType === "prepared_attack") {
      order.status = "completed";
      order.completedAtImpulse = state.impulse;
      events.push({
        type: "ORDER_COMPLETED",
        orderId: order.id,
        orderType: order.orderType,
      });
    } else if (!attackerSucceeded) {
      order.status = "delayed";
      order.actualStartImpulse = Math.min(5, state.impulse + 1);
      events.push({
        type: "ORDER_DELAYED",
        orderId: order.id,
        untilImpulse: order.actualStartImpulse,
        reasons: ["Атака не достигла цели."],
      });
    }
  }

  const steps: CombatStep[] = [
    {
      phase: "Контакт",
      description: `${contact.type}, соотношение ${model.ratio}:1.`,
      attackerLosses: 0,
      defenderLosses: 0,
    },
    {
      phase: "Главный бой",
      description: `Бросок d6 = ${roll.value}; результат ${cell.outcome}.`,
      attackerLosses: attackerLossSteps,
      defenderLosses: defenderLossSteps,
      roll: roll.value,
    },
  ];
  const resolution: CombatResolution = {
    id: `combat:${state.turn}:${state.impulse}:${contact.id}`,
    contactId: contact.id,
    attackerIds: attackers.map((unit) => unit.id),
    defenderIds: defenders.map((unit) => unit.id),
    defenderHexId: contact.hexId,
    odds: model.ratio,
    attackerStrength: model.attackerStrength,
    defenderStrength: model.defenderStrength,
    outcome: cell.outcome,
    steps,
    attackerLossSteps,
    defenderLossSteps,
    retreatPath: retreatPaths[0] ?? [],
    advanceHexId,
    roll: roll.value,
    lossAllocations: [attackerAllocation, defenderAllocation],
    ammunitionSpent,
  };
  contact.resolved = true;
  contact.status = "resolved";
  contact.resolutionId = resolution.id;
  state.combatResolutions.push(resolution);
  state.lastCombat = resolution;
  events.push({
    type: "COMBAT_RESOLVED",
    combatId: resolution.id,
    contactId: contact.id,
    outcome: resolution.outcome,
  });
  events.push({
    type: "CONTACT_RESOLVED",
    contactId: contact.id,
    resolutionId: resolution.id,
  });
  if (state.pendingAirSupport?.side === attackerSide) {
    state.pendingAirSupport = undefined;
  }
  if (state.pendingExtraAdvance === attackerSide) {
    state.pendingExtraAdvance = undefined;
  }
  return resolution;
}
