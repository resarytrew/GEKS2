import type {
  ContactState,
  GameEvent,
  GameState,
  ImpulseMovementBudget,
  PlannedOrder,
  PlannedOrderType,
  Side,
  UnitState,
} from "@/engine/types";
import {
  canStackInto,
  commandInfo,
  edgeCost,
  isInEnemyZOC,
} from "@/engine/rules";
import { distance, parseKey, sharedEdge } from "@/engine/hex";
import {
  directionForEdge,
  getSharedEdge,
  setBridgeState,
  sharedEdgeKey,
  updateSharedEdge,
} from "@/engine/edges";

export interface ImpulseExecutionContext {
  impulse: number;
  events: GameEvent[];
  createdContactIds: string[];
}

export interface OrderExecutionResult {
  status:
    | "progressed"
    | "completed"
    | "delayed"
    | "blocked"
    | "contact"
    | "failed";
  events: GameEvent[];
  consumedMovement?: number;
  consumedFuel?: number;
  createdContactIds?: string[];
  reason?: string;
}

const enemyOf = (side: Side): Side =>
  side === "germany" ? "ussr" : "germany";

export const ORDER_COST: Record<PlannedOrderType, number> = {
  march: 1,
  advance: 1,
  prepared_attack: 2,
  defend: 0,
  delay: 1,
  withdraw: 1,
  reserve: 2,
  recover: 1,
  prepare_demolition: 1,
  build_pontoon: 2,
};

function result(
  status: OrderExecutionResult["status"],
  events: GameEvent[],
  extra: Omit<OrderExecutionResult, "status" | "events"> = {},
): OrderExecutionResult {
  return { status, events, ...extra };
}

function complete(
  order: PlannedOrder,
  context: ImpulseExecutionContext,
): OrderExecutionResult {
  order.status = "completed";
  order.completedAtImpulse = context.impulse;
  const event: GameEvent = {
    type: "ORDER_COMPLETED",
    orderId: order.id,
    orderType: order.orderType,
  };
  context.events.push(event);
  return result("completed", [event]);
}

function fail(
  order: PlannedOrder,
  context: ImpulseExecutionContext,
  reason: string,
): OrderExecutionResult {
  order.status = "failed";
  order.failureReason = reason;
  const event: GameEvent = { type: "ORDER_FAILED", orderId: order.id, reason };
  context.events.push(event);
  return result("failed", [event], { reason });
}

function unitsForOrder(
  state: GameState,
  order: PlannedOrder,
): UnitState[] {
  return order.entityIds
    .map((id) => state.units[id])
    .filter(
      (unit): unit is UnitState =>
        !!unit && !unit.eliminated && unit.side === order.side,
    );
}

function removeFromHex(state: GameState, unit: UnitState): void {
  const from = state.hexes[unit.hexId];
  if (from) from.stackUnitIds = from.stackUnitIds.filter((id) => id !== unit.id);
}

function moveToHex(
  state: GameState,
  unit: UnitState,
  destination: string,
  impulse: number,
): void {
  removeFromHex(state, unit);
  unit.hexId = destination;
  unit.lastMovedAtImpulse = impulse;
  unit.defensivePosture = undefined;
  if (!state.hexes[destination].stackUnitIds.includes(unit.id)) {
    state.hexes[destination].stackUnitIds.push(unit.id);
  }
  if (unit.entityType === "headquarters") {
    state.headquarters[unit.id].movedThisTurn = true;
  }
}

function classFactor(unit: UnitState): number {
  if (unit.movementClass === "tracked") return 1;
  if (unit.movementClass === "motorized") return 0.95;
  if (unit.movementClass === "foot") return 0.8;
  return 1;
}

function orderFactor(orderType: PlannedOrderType): number {
  if (orderType === "march") return 1.35;
  if (orderType === "advance") return 0.9;
  if (orderType === "withdraw") return 1.1;
  return 1;
}

function readinessFactor(unit: UnitState): number {
  const organization = Math.max(0.45, unit.organization / 100);
  const supply = {
    full: 1,
    limited: 0.9,
    low: 0.75,
    isolated: 0.55,
    none: 0.35,
  }[unit.supplyState];
  const command = {
    in_command: 1,
    delayed: 0.9,
    out_of_command: 0.75,
    disorganized: 0.55,
  }[unit.commandState];
  return organization * supply * command;
}

export function movementBudgetForOrder(
  state: GameState,
  order: PlannedOrder,
): ImpulseMovementBudget {
  const units = unitsForOrder(state, order);
  if (units.length === 0) return { available: 0, spent: 0, remaining: 0 };
  const base = Math.min(
    ...units.map(
      (unit) =>
        (unit.movement / 3) *
        classFactor(unit) *
        readinessFactor(unit),
    ),
  );
  const night = state.impulse === 5 ? 0.7 : 1;
  const carry = order.remainingMovementBudget ?? 0;
  const available = Math.max(
    0,
    base * orderFactor(order.orderType) * night + carry,
  );
  return { available, spent: 0, remaining: available };
}

function fuelCostForEdge(
  unit: UnitState,
  movementCost: number,
  orderType: PlannedOrderType,
): number {
  if (unit.movementClass === "foot" || unit.movementClass === "rail") return 0;
  const classCost = unit.movementClass === "tracked" ? 3 : 2;
  const tempo = orderType === "march" ? 1.15 : orderType === "withdraw" ? 1.1 : 1;
  return Math.max(1, Math.ceil(movementCost * classCost * tempo));
}

function claimAfterMovement(
  state: GameState,
  from: string,
  to: string,
  side: Side,
  hasCombatUnit: boolean,
  events: GameEvent[],
): void {
  const origin = state.hexes[from];
  const destination = state.hexes[to];
  if (!origin || !destination || !hasCombatUnit) return;
  if (
    origin.control === enemyOf(side) &&
    !origin.stackUnitIds.some(
      (id) =>
        state.units[id]?.side === side &&
        state.units[id]?.entityType === "combat_unit",
    )
  ) {
    origin.control = "contested";
    events.push({
      type: "HEX_CONTROL_CHANGED",
      hexId: origin.id,
      side: "contested",
    });
  }
  if (
    !destination.stackUnitIds.some(
      (id) => state.units[id]?.side === enemyOf(side),
    ) &&
    destination.control !== side
  ) {
    destination.control = side;
    events.push({
      type: "HEX_CONTROL_CHANGED",
      hexId: destination.id,
      side,
    });
  }
}

function createContact(
  state: GameState,
  order: PlannedOrder,
  hexId: string,
  type: ContactState["type"],
  context: ImpulseExecutionContext,
): ContactState {
  const enemyIds = state.hexes[hexId].stackUnitIds.filter(
    (id) =>
      state.units[id]?.side === enemyOf(order.side) &&
      !state.units[id]?.eliminated,
  );
  const entityIds = [...new Set([...order.entityIds, ...enemyIds])].sort();
  const id = `contact:${state.turn}:${context.impulse}:${type}:${entityIds.join(":")}`;
  const existing = state.contacts.find((contact) => contact.id === id);
  if (existing) return existing;
  const contact: ContactState = {
    id,
    type,
    hexId,
    attackerSide: order.side,
    entityIds,
    participantIds: entityIds,
    supportIds: [...(order.supportIds ?? [])],
    reserveIds: [],
    sourceOrderIds: [order.id],
    impulse: context.impulse,
    createdAtImpulse: context.impulse,
    detectedBy: ["germany", "ussr"],
    status: "ready",
    resolved: false,
  };
  state.contacts.push(contact);
  context.createdContactIds.push(contact.id);
  context.events.push({
    type: "CONTACT_CREATED",
    contactId: contact.id,
    contactType: contact.type,
    hexId,
  });
  return contact;
}

function triggerRouteBlockedReaction(
  state: GameState,
  order: PlannedOrder,
  blockedHexId: string,
  context: ImpulseExecutionContext,
): OrderExecutionResult | undefined {
  const reaction = state.plans[order.side].reactions
    .filter(
      (candidate) =>
        candidate.condition === "route_blocked" &&
        candidate.status === "committed" &&
        candidate.uses < candidate.maxUses &&
        context.impulse >= candidate.fromImpulse &&
        context.impulse <= candidate.toImpulse &&
        candidate.entityIds.some((id) => order.entityIds.includes(id)) &&
        (!candidate.targetHexId || candidate.targetHexId === blockedHexId) &&
        (candidate.fallbackRoute?.length ?? 0) >= 2,
    )
    .sort(
      (left, right) =>
        right.priority - left.priority || left.id.localeCompare(right.id),
    )[0];
  const lead = unitsForOrder(state, order)[0];
  if (!reaction || !lead || reaction.fallbackRoute![0] !== lead.hexId) {
    return undefined;
  }
  reaction.uses += 1;
  reaction.status =
    reaction.uses >= reaction.maxUses ? "resolved" : "committed";
  order.route = [...reaction.fallbackRoute!];
  order.progressIndex = 0;
  order.status = "delayed";
  order.actualStartImpulse = Math.min(5, context.impulse + 1);
  const triggered: GameEvent = {
    type: "REACTION_TRIGGERED",
    reactionId: reaction.id,
  };
  const delayed: GameEvent = {
    type: "ORDER_DELAYED",
    orderId: order.id,
    untilImpulse: order.actualStartImpulse,
    reasons: ["Заблокированный маршрут заменён запасным."],
  };
  context.events.push(triggered, delayed);
  return result("delayed", [triggered, delayed], {
    reason: "Маршрут заменён реакцией.",
  });
}

function alignProgressToUnit(
  state: GameState,
  order: PlannedOrder,
): number {
  const route = order.route ?? [];
  const lead = state.units[order.entityIds[0]];
  if (!lead) return order.progressIndex ?? 0;
  const currentIndex = route.indexOf(lead.hexId);
  if (currentIndex >= 0) order.progressIndex = currentIndex;
  return order.progressIndex ?? 0;
}

function executeRouteOrder(
  state: GameState,
  order: PlannedOrder,
  context: ImpulseExecutionContext,
): OrderExecutionResult {
  const route = order.route;
  const units = unitsForOrder(state, order);
  if (!route || route.length < 2 || units.length === 0) {
    return fail(order, context, "Для движения отсутствует допустимый маршрут.");
  }
  if (
    units.some(
      (unit) =>
        unit.movementClass !== "foot" &&
        unit.movementClass !== "rail" &&
        unit.fuel <= 0,
    )
  ) {
    const haltedEvents: GameEvent[] = [];
    for (const unit of units) {
      if (
        unit.movementClass !== "foot" &&
        unit.movementClass !== "rail" &&
        unit.fuel <= 0
      ) {
        const event: GameEvent = {
          type: "UNIT_HALTED_NO_FUEL",
          unitId: unit.id,
          orderId: order.id,
        };
        context.events.push(event);
        haltedEvents.push(event);
      }
    }
    order.status = "delayed";
    return result("delayed", haltedEvents, { reason: "Нет топлива." });
  }
  order.status = "executing";
  const budget = movementBudgetForOrder(state, order);
  let progress = alignProgressToUnit(state, order);
  let moved = false;
  let consumedFuel = 0;
  const ownEvents: GameEvent[] = [];
  while (progress < route.length - 1) {
    const from = route[progress];
    const to = route[progress + 1];
    const enemyOnTarget = state.hexes[to]?.stackUnitIds.some(
      (id) => state.units[id]?.side === enemyOf(order.side),
    );
    if (enemyOnTarget) {
      if (
        order.contactPolicy === "attack" ||
        order.contactPolicy === "assault" ||
        order.orderType === "advance"
      ) {
        const contact = createContact(
          state,
          order,
          to,
          order.orderType === "advance" ? "HASTY_ATTACK" : "BLOCKED_ROUTE",
          context,
        );
        return result("contact", ownEvents, {
          consumedMovement: budget.spent,
          consumedFuel,
          createdContactIds: [contact.id],
        });
      }
      const rerouted = triggerRouteBlockedReaction(
        state,
        order,
        to,
        context,
      );
      if (rerouted) return rerouted;
      const event: GameEvent = {
        type: "ORDER_BLOCKED",
        orderId: order.id,
        hexId: to,
        reason: "Маршрут занят противником.",
      };
      context.events.push(event);
      order.status = "failed";
      order.failureReason = event.reason;
      return result("blocked", [...ownEvents, event], {
        consumedMovement: budget.spent,
        consumedFuel,
        reason: event.reason,
      });
    }
    const stepCost = Math.max(
      ...units.map((unit) => edgeCost(state, unit, from, to)),
    );
    if (!Number.isFinite(stepCost) || !canStackInto(state, order.entityIds, to)) {
      const rerouted = triggerRouteBlockedReaction(
        state,
        order,
        to,
        context,
      );
      if (rerouted) return rerouted;
      const event: GameEvent = {
        type: "ORDER_BLOCKED",
        orderId: order.id,
        hexId: to,
        reason: "Местность, переправа или стэкинг блокируют маршрут.",
      };
      context.events.push(event);
      order.status = order.contactPolicy === "avoid" ? "failed" : "delayed";
      order.failureReason = event.reason;
      return result("blocked", [...ownEvents, event], {
        consumedMovement: budget.spent,
        consumedFuel,
        reason: event.reason,
      });
    }
    if (stepCost > budget.remaining + 0.001) break;
    const fuelCosts = units.map((unit) => ({
      unit,
      amount: fuelCostForEdge(unit, stepCost, order.orderType),
    }));
    if (fuelCosts.some(({ unit, amount }) => amount > unit.fuel)) {
      for (const { unit } of fuelCosts) {
        if (unit.fuel < 15) {
          const critical: GameEvent = {
            type: "FUEL_CRITICAL",
            unitId: unit.id,
          };
          context.events.push(critical);
          ownEvents.push(critical);
        }
      }
      order.status = "delayed";
      return result("delayed", ownEvents, {
        consumedMovement: budget.spent,
        consumedFuel,
        reason: "Топлива недостаточно для следующего участка.",
      });
    }
    for (const { unit, amount } of fuelCosts) {
      const origin = unit.hexId;
      moveToHex(state, unit, to, context.impulse);
      if (amount > 0) {
        unit.fuel = Math.max(0, unit.fuel - amount);
        consumedFuel += amount;
        const fuelEvent: GameEvent = {
          type: "FUEL_SPENT",
          unitId: unit.id,
          amount,
        };
        context.events.push(fuelEvent);
        ownEvents.push(fuelEvent);
        if (unit.fuel < 15) {
          const critical: GameEvent = {
            type: "FUEL_CRITICAL",
            unitId: unit.id,
          };
          context.events.push(critical);
          ownEvents.push(critical);
        }
      }
      const moveEvent: GameEvent = {
        type: "UNIT_MOVED",
        unitId: unit.id,
        from: origin,
        to,
        fuelSpent: amount,
      };
      context.events.push(moveEvent);
      ownEvents.push(moveEvent);
      if (order.orderType === "march") {
        unit.fatigue = Math.min(100, unit.fatigue + Math.ceil(stepCost * 2));
      } else if (order.orderType === "advance") {
        unit.organization = Math.max(0, unit.organization - 1);
      }
    }
    claimAfterMovement(
      state,
      from,
      to,
      order.side,
      units.some((unit) => unit.entityType === "combat_unit"),
      context.events,
    );
    budget.spent += stepCost;
    budget.remaining = Math.max(0, budget.available - budget.spent);
    progress += 1;
    order.progressIndex = progress;
    moved = true;
    if (isInEnemyZOC(state, to, order.side)) break;
  }
  order.movementSpentThisImpulse = budget.spent;
  order.remainingMovementBudget = Math.min(4, budget.remaining);
  if (progress >= route.length - 1) return complete(order, context);
  const progressEvent: GameEvent = {
    type: "ORDER_PROGRESS",
    orderId: order.id,
    status: order.status,
    reason: moved ? undefined : "Накапливается импульсный бюджет движения.",
  };
  context.events.push(progressEvent);
  ownEvents.push(progressEvent);
  return result(moved ? "progressed" : "delayed", ownEvents, {
    consumedMovement: budget.spent,
    consumedFuel,
  });
}

export function executeMarchOrder(
  state: GameState,
  order: PlannedOrder,
  context: ImpulseExecutionContext,
): OrderExecutionResult {
  return executeRouteOrder(state, order, context);
}

export function executeAdvanceOrder(
  state: GameState,
  order: PlannedOrder,
  context: ImpulseExecutionContext,
): OrderExecutionResult {
  return executeRouteOrder(state, order, context);
}

export function executeWithdrawOrder(
  state: GameState,
  order: PlannedOrder,
  context: ImpulseExecutionContext,
): OrderExecutionResult {
  const before = unitsForOrder(state, order).map((unit) => unit.organization);
  const execution = executeRouteOrder(state, order, context);
  unitsForOrder(state, order).forEach((unit, index) => {
    if (
      execution.status === "progressed" ||
      execution.status === "completed"
    ) {
      unit.organization = Math.max(unit.organization, before[index] - 2);
    }
  });
  return execution;
}

export function executePreparedAttackOrder(
  state: GameState,
  order: PlannedOrder,
  context: ImpulseExecutionContext,
): OrderExecutionResult {
  const units = unitsForOrder(state, order).filter(
    (unit) => unit.entityType === "combat_unit",
  );
  if (!order.targetHexId || !state.hexes[order.targetHexId]) {
    return fail(order, context, "Не задан целевой гекс атаки.");
  }
  if (units.length === 0) {
    return fail(order, context, "Атакующая группировка отсутствует.");
  }
  if (units.some((unit) => unit.ammunition < 15)) {
    return fail(
      order,
      context,
      "Критически низкий уровень боеприпасов запрещает подготовленную атаку.",
    );
  }
  const notArrived = units.filter(
    (unit) =>
      unit.hexId !== order.targetHexId &&
      sharedEdge(parseKey(unit.hexId), parseKey(order.targetHexId!)) == null,
  );
  if (notArrived.length > 0) {
    const mustWait = notArrived.some((unit) =>
      order.waitForEntityIds?.includes(unit.id),
    );
    if (mustWait && context.impulse < 5) {
      order.status = "delayed";
      const event: GameEvent = {
        type: "ORDER_DELAYED",
        orderId: order.id,
        untilImpulse: context.impulse + 1,
        reasons: ["Ожидание назначенной части."],
      };
      context.events.push(event);
      return result("delayed", [event]);
    }
    if (order.lossTolerance === "low" || units.length === notArrived.length) {
      return fail(order, context, "Атакующие не прибыли к цели.");
    }
  }
  const enemyIds = state.hexes[order.targetHexId].stackUnitIds.filter(
    (id) => state.units[id]?.side === enemyOf(order.side),
  );
  if (enemyIds.length === 0) {
    return fail(order, context, "В целевом гексе нет противника.");
  }
  const contact = createContact(
    state,
    order,
    order.targetHexId,
    "PREPARED_ATTACK",
    context,
  );
  order.status = "executing";
  return result("contact", [], { createdContactIds: [contact.id] });
}

export function executeDefendOrder(
  state: GameState,
  order: PlannedOrder,
  context: ImpulseExecutionContext,
): OrderExecutionResult {
  const units = unitsForOrder(state, order);
  if (units.length === 0) return fail(order, context, "Защитники отсутствуют.");
  for (const unit of units) {
    const prior = unit.defensivePosture?.level ?? 0;
    const next = Math.min(3, prior + 1) as 0 | 1 | 2 | 3;
    unit.defensivePosture = {
      level: next,
      establishedAtImpulse:
        unit.defensivePosture?.establishedAtImpulse ?? context.impulse,
      fallbackHexId: order.fallbackHexId,
    };
  }
  order.status = "executing";
  if (units.every((unit) => unit.defensivePosture?.level === 3)) {
    return complete(order, context);
  }
  const event: GameEvent = {
    type: "ORDER_PROGRESS",
    orderId: order.id,
    status: order.status,
    reason: `Оборонительная подготовка: уровень ${units[0].defensivePosture?.level}.`,
  };
  context.events.push(event);
  return result("progressed", [event]);
}

export function executeDelayOrder(
  state: GameState,
  order: PlannedOrder,
  context: ImpulseExecutionContext,
): OrderExecutionResult {
  const units = unitsForOrder(state, order);
  if (units.length === 0) {
    return fail(order, context, "Отряд сдерживания отсутствует.");
  }
  for (const unit of units) {
    const prior = unit.defensivePosture?.level ?? 0;
    unit.defensivePosture = {
      level: Math.min(2, prior + 1) as 0 | 1 | 2,
      establishedAtImpulse:
        unit.defensivePosture?.establishedAtImpulse ?? context.impulse,
      fallbackHexId: order.fallbackHexId,
    };
  }
  order.status = "executing";
  const event: GameEvent = {
    type: "ORDER_PROGRESS",
    orderId: order.id,
    status: order.status,
    reason: `Рубеж сдерживания подготовлен на уровне ${units[0].defensivePosture?.level}.`,
  };
  context.events.push(event);
  return result("progressed", [event]);
}

export function executeReserveOrder(
  state: GameState,
  order: PlannedOrder,
  context: ImpulseExecutionContext,
): OrderExecutionResult {
  const units = unitsForOrder(state, order);
  const data = order.reserveData ?? {
    triggerRadius: 2,
    triggerConditions: ["friendly_contact" as const],
    targetPriority: [],
    maxCommitImpulse: 5,
  };
  if (context.impulse > data.maxCommitImpulse) return complete(order, context);
  const candidate = state.contacts
    .filter(
      (contact) =>
        !contact.resolved &&
        contact.status !== "cancelled" &&
        contact.detectedBy.includes(order.side) &&
        contact.entityIds.some(
          (id) => state.units[id]?.side === order.side,
        ) &&
        units.some(
          (unit) =>
            distance(parseKey(unit.hexId), parseKey(contact.hexId)) <=
            data.triggerRadius,
        ),
    )
    .sort(
      (left, right) =>
        data.targetPriority.indexOf(left.hexId) -
          data.targetPriority.indexOf(right.hexId) ||
        left.id.localeCompare(right.id),
    )[0];
  if (!candidate) {
    order.status = "executing";
    return result("delayed", []);
  }
  candidate.reserveIds = [
    ...new Set([...(candidate.reserveIds ?? []), ...order.entityIds]),
  ];
  candidate.entityIds = [
    ...new Set([...candidate.entityIds, ...order.entityIds]),
  ].sort();
  order.status = "completed";
  order.completedAtImpulse = context.impulse;
  const event: GameEvent = {
    type: "RESERVE_COMMITTED",
    orderId: order.id,
    contactId: candidate.id,
    unitIds: [...order.entityIds],
  };
  context.events.push(event);
  return result("completed", [event]);
}

export function executeRecoverOrder(
  state: GameState,
  order: PlannedOrder,
  context: ImpulseExecutionContext,
): OrderExecutionResult {
  const units = unitsForOrder(state, order);
  if (units.length === 0) {
    return fail(order, context, "Нет частей для восстановления.");
  }
  const ownEvents: GameEvent[] = [];
  for (const unit of units) {
    const base =
      unit.supplyState === "full"
        ? 6
        : unit.supplyState === "limited"
          ? 4
          : unit.supplyState === "low"
            ? 2
            : 0;
    const commandModifier = commandInfo(state, unit).inRange ? 1 : 0.5;
    const gained = Math.floor(base * commandModifier);
    unit.organization = Math.min(100, unit.organization + gained);
    unit.fatigue = Math.max(0, unit.fatigue - 5);
    const event: GameEvent = {
      type: "RECOVERY_PROGRESS",
      orderId: order.id,
      unitId: unit.id,
      organizationGained: gained,
    };
    context.events.push(event);
    ownEvents.push(event);
  }
  order.status = "executing";
  return context.impulse >= 5
    ? complete(order, context)
    : result("progressed", ownEvents);
}

function engineeringUnit(
  state: GameState,
  order: PlannedOrder,
): UnitState | undefined {
  return unitsForOrder(state, order).find(
    (unit) =>
      unit.unitType === "engineer" ||
      unit.traits.includes("engineer") ||
      unit.traits.includes("demolition"),
  );
}

function validateEngineeringEdge(
  state: GameState,
  order: PlannedOrder,
  engineer: UnitState,
): string | undefined {
  if (order.bridgeHexId == null || order.bridgeEdge == null) {
    return "Не выбрано ребро переправы.";
  }
  if (
    engineer.hexId !== order.bridgeHexId &&
    sharedEdge(parseKey(engineer.hexId), parseKey(order.bridgeHexId)) == null
  ) {
    return "Инженер находится слишком далеко от переправы.";
  }
  if (!sharedEdgeKey(state, order.bridgeHexId, order.bridgeEdge)) {
    return "Ребро переправы не существует.";
  }
  return undefined;
}

export function executePrepareDemolitionOrder(
  state: GameState,
  order: PlannedOrder,
  context: ImpulseExecutionContext,
): OrderExecutionResult {
  const engineer = engineeringUnit(state, order);
  if (!engineer) {
    return fail(order, context, "Для подготовки подрыва требуется инженер.");
  }
  const problem = validateEngineeringEdge(state, order, engineer);
  if (problem) return fail(order, context, problem);
  order.engineeringProgress = (order.engineeringProgress ?? 0) + 1;
  order.status = "executing";
  if (order.engineeringProgress < 2) {
    const event: GameEvent = {
      type: "ORDER_PROGRESS",
      orderId: order.id,
      status: order.status,
      reason: "Инженеры готовят заряды.",
    };
    context.events.push(event);
    return result("progressed", [event]);
  }
  const changed = setBridgeState(
    state,
    order.bridgeHexId!,
    order.bridgeEdge!,
    "prepared_for_demolition",
  );
  if (!changed) {
    return fail(order, context, "На выбранном ребре нет моста.");
  }
  const key = sharedEdgeKey(state, order.bridgeHexId!, order.bridgeEdge!);
  if (key) {
    state.preparedBridgeDemolitions[key] = {
      side: order.side,
      preparedById: engineer.id,
    };
  }
  context.events.push({
    type: "BRIDGE_PREPARED",
    hexId: order.bridgeHexId!,
    edge: order.bridgeEdge!,
    side: order.side,
  });
  return complete(order, context);
}

export function executeBuildPontoonOrder(
  state: GameState,
  order: PlannedOrder,
  context: ImpulseExecutionContext,
): OrderExecutionResult {
  const engineer = engineeringUnit(state, order);
  if (!engineer) {
    return fail(order, context, "Для понтона требуется инженер.");
  }
  const problem = validateEngineeringEdge(state, order, engineer);
  if (problem) return fail(order, context, problem);
  if (isInEnemyZOC(state, order.bridgeHexId!, order.side)) {
    order.status = "delayed";
    return result("delayed", [], {
      reason: "Инженерные работы прерваны присутствием противника.",
    });
  }
  order.engineeringProgress = (order.engineeringProgress ?? 0) + 1;
  order.status = "executing";
  if (order.engineeringProgress < 2) {
    const event: GameEvent = {
      type: "ORDER_PROGRESS",
      orderId: order.id,
      status: order.status,
      reason: "Наведение понтона продолжается.",
    };
    context.events.push(event);
    return result("progressed", [event]);
  }
  const direction = directionForEdge(order.bridgeEdge!);
  if (direction == null) {
    return fail(order, context, "Некорректное ребро понтона.");
  }
  const edge = getSharedEdge(state, order.bridgeHexId!, direction);
  const crossesRiver =
    !!edge &&
    (edge.from.riverEdges.includes(edge.fromEdge) ||
      edge.to.riverEdges.includes(edge.toEdge));
  if (!edge || !crossesRiver) {
    return fail(order, context, "Понтон можно навести только через речное ребро.");
  }
  if (
    edge.bridge &&
    edge.bridge.state !== "destroyed" &&
    edge.bridge.state !== "pontoon"
  ) {
    return fail(order, context, "На выбранном ребре уже действует постоянный мост.");
  }
  updateSharedEdge(
    state,
    order.bridgeHexId!,
    direction,
    (bridge) => ({
      edge: order.bridgeEdge!,
      type: bridge?.type ?? "road",
      state: "pontoon",
    }),
  );
  context.events.push({
    type: "PONTOON_COMPLETED",
    orderId: order.id,
    hexId: order.bridgeHexId!,
    edge: order.bridgeEdge!,
  });
  context.events.push({
    type: "PONTOON_BUILT",
    hexId: order.bridgeHexId!,
    edge: order.bridgeEdge!,
  });
  return complete(order, context);
}

export function executePlannedOrder(
  state: GameState,
  order: PlannedOrder,
  context: ImpulseExecutionContext,
): OrderExecutionResult {
  switch (order.orderType) {
    case "march":
      return executeMarchOrder(state, order, context);
    case "advance":
      return executeAdvanceOrder(state, order, context);
    case "prepared_attack":
      return executePreparedAttackOrder(state, order, context);
    case "defend":
      return executeDefendOrder(state, order, context);
    case "delay":
      return executeDelayOrder(state, order, context);
    case "withdraw":
      return executeWithdrawOrder(state, order, context);
    case "reserve":
      return executeReserveOrder(state, order, context);
    case "recover":
      return executeRecoverOrder(state, order, context);
    case "prepare_demolition":
      return executePrepareDemolitionOrder(state, order, context);
    case "build_pontoon":
      return executeBuildPontoonOrder(state, order, context);
  }
}
