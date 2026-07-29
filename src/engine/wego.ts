import type {
  CommandValidationResult,
  ContactState,
  GameCommand,
  GameEvent,
  GameState,
  PlannedOrder,
  Side,
} from "@/engine/types";
import {
  commandInfo,
  endOfDayScoring,
  evaluateObjectives,
  recomputeCommand,
  recomputeSupply,
} from "@/engine/rules";
import {
  canSpendFromAllocations,
  spendCommandPoints,
} from "@/engine/resources";
import { rollInt } from "@/engine/rng";
import { parseKey, sharedEdge } from "@/engine/hex";
import {
  directionForEdge,
  setBridgeState,
  sharedEdgeKey,
  updateSharedEdge,
} from "@/engine/edges";
import {
  executePlannedOrder,
  ORDER_COST,
  type ImpulseExecutionContext,
} from "@/engine/order-execution";
import { resolveContact } from "@/engine/wego-combat";
import { buildAfterActionReport } from "@/engine/after-action";
import { CARD_DEFS } from "@/scenarios/baltic-1941/scenario";

export const IMPULSE_LABELS = [
  "06:00–09:00",
  "09:00–12:00",
  "12:00–15:00",
  "15:00–18:00",
  "18:00–21:00",
  "NIGHT",
] as const;

const enemyOf = (side: Side): Side =>
  side === "germany" ? "ussr" : "germany";

function invalid(code: string, message: string): CommandValidationResult {
  return { valid: false, errors: [{ code, message }] };
}

function valid(): CommandValidationResult {
  return { valid: true, errors: [] };
}

export interface OrderReliability {
  level: "high" | "medium" | "low";
  delay: { minimum: number; maximum: number };
  reasons: string[];
}

export function assessOrderReliability(
  state: GameState,
  order: PlannedOrder,
): OrderReliability {
  const lead = state.units[order.entityIds[0]];
  const reasons: string[] = [];
  let maximum = 0;
  if (!lead) {
    return {
      level: "low",
      delay: { minimum: 2, maximum: 3 },
      reasons: ["Соединение не найдено."],
    };
  }
  const info = commandInfo(state, lead);
  if (!info.hq) {
    maximum += 2;
    reasons.push("Нет доступного штаба.");
  } else {
    if (!info.inRange) {
      maximum += 2;
      reasons.push("Соединение вне командной дальности.");
    }
    if (info.hq.movedThisTurn) {
      maximum += 1;
      reasons.push("Штаб перемещался в текущих сутках.");
    }
    if (info.hq.commQuality <= 2) {
      maximum += 1;
      reasons.push("Низкое качество связи.");
    }
  }
  if (
    order.orderType === "prepared_attack" ||
    (order.waitForEntityIds?.length ?? 0) > 0 ||
    (order.supportIds?.length ?? 0) > 1
  ) {
    maximum += 1;
    reasons.push("Сложная координация приказа.");
  }
  if ((order.route?.length ?? 0) > 4) {
    maximum += 1;
    reasons.push("Длинный маршрут.");
  }
  if (order.orderType === "withdraw" && info.hq) {
    const withdrawalDelay = state.temporaryCommandEffects
      .filter(
        (effect) =>
          effect.targetHqId === info.hq!.id &&
          effect.startsAtTurn <= state.turn &&
          effect.expiresAfterTurn >= state.turn,
      )
      .reduce(
        (sum, effect) => sum + (effect.withdrawalDelayModifier ?? 0),
        0,
      );
    if (withdrawalDelay > 0) {
      maximum += withdrawalDelay;
      reasons.push("Директива затрудняет организованный отход.");
    }
  }
  maximum = Math.min(3, maximum);
  const minimum = lead.commandState === "out_of_command" ? 1 : 0;
  return {
    level: maximum === 0 ? "high" : maximum <= 1 ? "medium" : "low",
    delay: { minimum: Math.min(minimum, maximum), maximum },
    reasons:
      reasons.length > 0
        ? reasons
        : ["Собственный штаб на связи; приказ простой."],
  };
}

function validateOrder(
  state: GameState,
  side: Side,
  order: PlannedOrder,
): CommandValidationResult {
  if (order.side !== side) {
    return invalid("NOT_OWNER", "Нельзя изменить план другой стороны.");
  }
  if (
    !Number.isInteger(order.startImpulse) ||
    order.startImpulse < 0 ||
    order.startImpulse >= IMPULSE_LABELS.length
  ) {
    return invalid(
      "INVALID_START_IMPULSE",
      "Импульс начала должен быть от 0 до 5.",
    );
  }
  if (order.entityIds.length === 0) {
    return invalid("NO_ENTITIES", "В приказе нет соединений.");
  }
  const plan = state.plans[side];
  const conflicting = plan.orders.find(
    (candidate) =>
      candidate.id !== order.id &&
      candidate.status !== "cancelled" &&
      candidate.status !== "failed" &&
      candidate.entityIds.some((id) => order.entityIds.includes(id)),
  );
  if (conflicting) {
    return invalid(
      "CONFLICTING_ORDER",
      `Соединение уже включено в приказ ${conflicting.id}.`,
    );
  }
  for (const entityId of order.entityIds) {
    const entity = state.units[entityId];
    if (!entity) {
      return invalid("NO_ENTITY", `Сущность ${entityId} не найдена.`);
    }
    if (entity.side !== side) {
      return invalid("NOT_OWNER", "В приказ включено чужое соединение.");
    }
    if (entity.eliminated) {
      return invalid(
        "ENTITY_ELIMINATED",
        "Уничтоженная сущность не может получить приказ.",
      );
    }
  }
  for (const supportId of order.supportIds ?? []) {
    const support = state.units[supportId];
    if (!support || support.side !== side || support.eliminated) {
      return invalid(
        "INVALID_SUPPORT",
        "Поддержка отсутствует или принадлежит другой стороне.",
      );
    }
  }
  const routeOrder =
    order.orderType === "march" ||
    order.orderType === "advance" ||
    order.orderType === "withdraw";
  if (routeOrder && (!order.route || order.route.length < 2)) {
    return invalid(
      "INVALID_ROUTE",
      "Для движения нужен маршрут минимум из двух гексов.",
    );
  }
  if (
    order.route &&
    order.route[0] !== state.units[order.entityIds[0]].hexId
  ) {
    return invalid(
      "INVALID_ROUTE_ORIGIN",
      "Маршрут должен начинаться в текущем гексе.",
    );
  }
  if (order.route) {
    for (let index = 1; index < order.route.length; index++) {
      if (
        !state.hexes[order.route[index]] ||
        sharedEdge(
          parseKey(order.route[index - 1]),
          parseKey(order.route[index]),
        ) == null
      ) {
        return invalid(
          "INVALID_ROUTE",
          "Маршрут содержит отсутствующий или несмежный гекс.",
        );
      }
    }
  }
  if (order.orderType === "prepared_attack") {
    if (!order.targetHexId || !state.hexes[order.targetHexId]) {
      return invalid(
        "INVALID_ATTACK_TARGET",
        "Подготовленной атаке нужен целевой гекс.",
      );
    }
    if (
      order.entityIds.some(
        (id) => (state.units[id]?.ammunition ?? 0) < 15,
      )
    ) {
      return invalid(
        "AMMUNITION_CRITICAL",
        "Критически низкие боеприпасы запрещают подготовленную атаку.",
      );
    }
  }
  if (
    order.orderType === "prepare_demolition" ||
    order.orderType === "build_pontoon"
  ) {
    if (order.bridgeHexId == null || order.bridgeEdge == null) {
      return invalid(
        "INVALID_ENGINEERING_TARGET",
        "Инженерному приказу требуется ребро переправы.",
      );
    }
    const hasEngineer = order.entityIds.some((id) => {
      const unit = state.units[id];
      return (
        unit?.unitType === "engineer" ||
        unit?.traits.includes("engineer") ||
        unit?.traits.includes("demolition")
      );
    });
    if (!hasEngineer) {
      return invalid(
        "ENGINEER_REQUIRED",
        "Инженерный приказ требует инженера.",
      );
    }
  }
  for (const cardId of order.cardIds ?? []) {
    if (
      !state.playerHands[side].includes(cardId) ||
      state.cards[cardId]?.state !== "hand"
    ) {
      return invalid(
        "CARD_NOT_AVAILABLE",
        "Карта приказа отсутствует в руке стороны.",
      );
    }
  }
  return valid();
}

export function validateWegoCommand(
  state: GameState,
  command: GameCommand,
): CommandValidationResult {
  const side = command.side ?? state.activeSide;
  if (
    command.type === "UPSERT_PLANNED_ORDER" ||
    command.type === "REMOVE_PLANNED_ORDER" ||
    command.type === "UPSERT_REACTION" ||
    command.type === "COMMIT_PLAN"
  ) {
    if (state.phase !== "planning") {
      return invalid(
        "WRONG_PHASE",
        "Планы меняются только в фазе планирования.",
      );
    }
    if (state.plans[side].committed) {
      return invalid(
        "PLAN_ALREADY_COMMITTED",
        "Зафиксированный план нельзя изменить.",
      );
    }
  }
  if (command.type === "UPSERT_PLANNED_ORDER") {
    if (!command.plannedOrder) {
      return invalid("NO_ORDER", "Запланированный приказ отсутствует.");
    }
    return validateOrder(state, side, command.plannedOrder);
  }
  if (command.type === "REMOVE_PLANNED_ORDER") {
    if (!command.plannedOrderId) {
      return invalid("NO_ORDER", "Не указан приказ для удаления.");
    }
    if (
      !state.plans[side].orders.some(
        (order) => order.id === command.plannedOrderId,
      )
    ) {
      return invalid("NO_ORDER", "Приказ не найден в собственном плане.");
    }
  }
  if (command.type === "UPSERT_REACTION") {
    if (!command.reaction) {
      return invalid("NO_REACTION", "Реакция отсутствует.");
    }
    if (command.reaction.side !== side) {
      return invalid(
        "NOT_OWNER",
        "Нельзя назначить реакцию другой стороны.",
      );
    }
    if (command.reaction.maxUses < 1) {
      return invalid(
        "INVALID_REACTION_LIMIT",
        "Реакция должна иметь хотя бы одно применение.",
      );
    }
    if (
      command.reaction.fromImpulse < 0 ||
      command.reaction.toImpulse > 5 ||
      command.reaction.fromImpulse > command.reaction.toImpulse
    ) {
      return invalid(
        "INVALID_REACTION_WINDOW",
        "Некорректное окно реакции.",
      );
    }
  }
  if (command.type === "COMMIT_PLAN") {
    const assignedCards = state.plans[side].orders.flatMap(
      (order) => order.cardIds ?? [],
    );
    if (new Set(assignedCards).size !== assignedCards.length) {
      return invalid(
        "CARD_ASSIGNED_TWICE",
        "Одна карта не может поддерживать несколько приказов.",
      );
    }
    for (const order of state.plans[side].orders) {
      const validation = validateOrder(state, side, order);
      if (!validation.valid) return validation;
    }
    const allocations = state.plans[side].orders.map((order) => {
      const lead = state.units[order.entityIds[0]];
      return {
        side,
        amount: ORDER_COST[order.orderType],
        hqId: lead ? commandInfo(state, lead).hq?.id : undefined,
      };
    });
    for (const order of state.plans[side].orders) {
      const lead = state.units[order.entityIds[0]];
      for (const cardId of order.cardIds ?? []) {
        const definition = CARD_DEFS.find(
          (candidate) => candidate.defId === state.cards[cardId]?.defId,
        );
        if (definition) {
          allocations.push({
            side,
            amount: definition.commandCost,
            hqId: lead ? commandInfo(state, lead).hq?.id : undefined,
          });
        }
      }
    }
    allocations.push(
      ...state.plans[side].reactions.map((reaction) => ({
        side,
        amount: reaction.commandCost,
        hqId: undefined,
      })),
    );
    const check = canSpendFromAllocations(state, allocations);
    if (!check.ok) {
      return {
        valid: false,
        errors: check.error ? [check.error] : [],
      };
    }
  }
  if (command.type === "EXECUTE_IMPULSE" && state.phase !== "execution") {
    return invalid(
      "WRONG_PHASE",
      "Импульс исполняется только после фиксации обоих планов.",
    );
  }
  return valid();
}

interface MovementIntent {
  order: PlannedOrder;
  from: string;
  to: string;
}

function nextMovementIntent(
  state: GameState,
  order: PlannedOrder,
): MovementIntent | undefined {
  if (
    order.orderType !== "march" &&
    order.orderType !== "advance" &&
    order.orderType !== "withdraw"
  ) {
    return undefined;
  }
  const route = order.route;
  const lead = state.units[order.entityIds[0]];
  if (!route || !lead) return undefined;
  const current = route.indexOf(lead.hexId);
  const progress = current >= 0 ? current : order.progressIndex ?? 0;
  const to = route[progress + 1];
  return to ? { order, from: lead.hexId, to } : undefined;
}

function createMeetingContact(
  state: GameState,
  left: MovementIntent,
  right: MovementIntent,
  context: ImpulseExecutionContext,
): ContactState {
  const entityIds = [
    ...new Set([...left.order.entityIds, ...right.order.entityIds]),
  ].sort();
  const id = `contact:${state.turn}:${context.impulse}:meeting:${entityIds.join(":")}`;
  const existing = state.contacts.find((contact) => contact.id === id);
  if (existing) return existing;
  const contact: ContactState = {
    id,
    type: "MEETING_ENGAGEMENT",
    hexId: left.to,
    entityIds,
    participantIds: entityIds,
    supportIds: [
      ...new Set([
        ...(left.order.supportIds ?? []),
        ...(right.order.supportIds ?? []),
      ]),
    ],
    reserveIds: [],
    sourceOrderIds: [left.order.id, right.order.id],
    impulse: context.impulse,
    createdAtImpulse: context.impulse,
    detectedBy: ["germany", "ussr"],
    status: "ready",
    resolved: false,
  };
  state.contacts.push(contact);
  context.createdContactIds.push(id);
  context.events.push({
    type: "MEETING_ENGAGEMENT",
    contactId: id,
    hexId: contact.hexId,
    entityIds,
  });
  context.events.push({
    type: "CONTACT_CREATED",
    contactId: id,
    contactType: contact.type,
    hexId: contact.hexId,
  });
  return contact;
}

function triggerBridgeReaction(
  state: GameState,
  intent: MovementIntent,
  events: GameEvent[],
): boolean {
  const edge = sharedEdge(parseKey(intent.from), parseKey(intent.to));
  if (edge == null) return false;
  const key = sharedEdgeKey(state, intent.from, edge);
  const prepared = key ? state.preparedBridgeDemolitions[key] : undefined;
  if (!key || !prepared || prepared.side === intent.order.side) return false;
  const plan = state.plans[enemyOf(intent.order.side)];
  const reaction = plan.reactions
    .filter(
      (candidate) =>
        candidate.status === "committed" &&
        candidate.condition === "enemy_approaches_bridge" &&
        candidate.uses < candidate.maxUses &&
        state.impulse >= candidate.fromImpulse &&
        state.impulse <= candidate.toImpulse,
    )
    .sort(
      (left, right) =>
        right.priority - left.priority || left.id.localeCompare(right.id),
    )
    .find((candidate) => {
      if (candidate.targetHexId == null || candidate.edge == null) return true;
      return (
        sharedEdgeKey(state, candidate.targetHexId, candidate.edge) === key
      );
    });
  if (!reaction) return false;
  setBridgeState(state, intent.from, edge, "destroyed");
  delete state.preparedBridgeDemolitions[key];
  reaction.uses += 1;
  reaction.status =
    reaction.uses >= reaction.maxUses ? "resolved" : "committed";
  events.push({ type: "REACTION_TRIGGERED", reactionId: reaction.id });
  events.push({ type: "BRIDGE_DESTROYED", hexId: intent.from, edge });
  intent.order.status = "failed";
  intent.order.failureReason = "Мост подорван реакцией противника.";
  events.push({
    type: "ORDER_FAILED",
    orderId: intent.order.id,
    reason: intent.order.failureReason,
  });
  return true;
}

export function triggerEncirclementWithdrawals(
  state: GameState,
  context: ImpulseExecutionContext,
): void {
  for (const side of ["germany", "ussr"] as Side[]) {
    const reactions = state.plans[side].reactions
      .filter(
        (reaction) =>
          reaction.status === "committed" &&
          reaction.condition === "encirclement_threat" &&
          reaction.uses < reaction.maxUses &&
          state.impulse >= reaction.fromImpulse &&
          state.impulse <= reaction.toImpulse,
      )
      .sort(
        (left, right) =>
          right.priority - left.priority || left.id.localeCompare(right.id),
      );
    for (const reaction of reactions) {
      const threatened = reaction.entityIds.filter((id) => {
        const unit = state.units[id];
        return (
          unit &&
          unit.side === side &&
          (unit.encirclementState === "threatened_with_encirclement" ||
            unit.encirclementState === "partially_encircled" ||
            unit.encirclementState === "encircled")
        );
      });
      if (threatened.length === 0 || !reaction.fallbackRoute) continue;
      const temporaryOrder: PlannedOrder = {
        id: `reaction-order:${reaction.id}:${state.impulse}`,
        side,
        entityIds: threatened,
        orderType: "withdraw",
        route: reaction.fallbackRoute,
        targetHexId:
          reaction.fallbackRoute[reaction.fallbackRoute.length - 1],
        startImpulse: state.impulse,
        priority: reaction.priority,
        contactPolicy: "avoid",
        lossTolerance: "low",
        status: "executing",
      };
      const execution = executePlannedOrder(state, temporaryOrder, context);
      if (
        execution.status === "progressed" ||
        execution.status === "completed"
      ) {
        reaction.uses += 1;
        reaction.status =
          reaction.uses >= reaction.maxUses ? "resolved" : "committed";
        context.events.push({
          type: "REACTION_TRIGGERED",
          reactionId: reaction.id,
        });
      } else {
        context.events.push({
          type: "REACTION_FAILED",
          reactionId: reaction.id,
          reason: execution.reason ?? "Fallback route недоступен.",
        });
      }
    }
  }
}

function executeImpulse(state: GameState, events: GameEvent[]): void {
  const impulse = state.impulse;
  const eventStartIndex = state.eventLog.length;
  events.push({
    type: "IMPULSE_STARTED",
    impulse,
    label: IMPULSE_LABELS[impulse],
  });
  const context: ImpulseExecutionContext = {
    impulse,
    events,
    createdContactIds: [],
  };
  const activeOrders = (["germany", "ussr"] as Side[])
    .flatMap((side) => state.plans[side].orders)
    .filter(
      (order) =>
        (order.status === "committed" ||
          order.status === "delayed" ||
          order.status === "executing") &&
        (order.actualStartImpulse ?? order.startImpulse) <= impulse,
    )
    .sort(
      (left, right) =>
        right.priority - left.priority || left.id.localeCompare(right.id),
    );
  const statusesBefore = new Map(
    activeOrders.map((order) => [order.id, order.status]),
  );
  const waitingIds = new Set<string>();
  for (const order of activeOrders) {
    const waiting = (order.waitForEntityIds ?? []).some((entityId) => {
      const dependency = (["germany", "ussr"] as Side[])
        .flatMap((side) => state.plans[side].orders)
        .find((candidate) => candidate.entityIds.includes(entityId));
      return (
        dependency &&
        dependency.status !== "completed" &&
        dependency.status !== "failed"
      );
    });
    if (waiting) {
      waitingIds.add(order.id);
      order.status = "delayed";
      order.delayReasons = ["Ожидание зависимого соединения."];
      events.push({
        type: "ORDER_DELAYED",
        orderId: order.id,
        untilImpulse: Math.min(5, impulse + 1),
        reasons: order.delayReasons,
      });
    }
  }
  for (const order of activeOrders) {
    if (!waitingIds.has(order.id)) {
      resolveCommittedCardsForOrder(state, order, events);
    }
  }

  const intents = activeOrders
    .filter((order) => !waitingIds.has(order.id))
    .map((order) => nextMovementIntent(state, order))
    .filter((intent): intent is MovementIntent => !!intent);
  const meetingOrderIds = new Set<string>();
  for (let leftIndex = 0; leftIndex < intents.length; leftIndex++) {
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < intents.length;
      rightIndex++
    ) {
      const left = intents[leftIndex];
      const right = intents[rightIndex];
      if (
        left.order.side !== right.order.side &&
        (left.to === right.to ||
          (left.from === right.to && left.to === right.from))
      ) {
        createMeetingContact(state, left, right, context);
        meetingOrderIds.add(left.order.id);
        meetingOrderIds.add(right.order.id);
        left.order.status = "executing";
        right.order.status = "executing";
      }
    }
  }

  const bridgeStopped = new Set<string>();
  for (const intent of intents) {
    if (
      !meetingOrderIds.has(intent.order.id) &&
      triggerBridgeReaction(state, intent, events)
    ) {
      bridgeStopped.add(intent.order.id);
    }
  }

  const reserveOrders: PlannedOrder[] = [];
  for (const order of activeOrders) {
    if (
      waitingIds.has(order.id) ||
      meetingOrderIds.has(order.id) ||
      bridgeStopped.has(order.id)
    ) {
      continue;
    }
    if (order.orderType === "reserve") {
      reserveOrders.push(order);
      continue;
    }
    executePlannedOrder(state, order, context);
  }
  for (const reserveOrder of reserveOrders) {
    executePlannedOrder(state, reserveOrder, context);
  }
  const readyContacts = state.contacts
    .filter(
      (contact) =>
        !contact.resolved &&
        contact.status !== "cancelled" &&
        (contact.createdAtImpulse ?? contact.impulse) <= impulse,
    )
    .sort((left, right) => left.id.localeCompare(right.id));
  for (const contact of readyContacts) {
    resolveContact(state, contact, events);
  }

  const supplyBefore = new Map(
    Object.values(state.units).map((unit) => [unit.id, unit.supplyState]),
  );
  recomputeSupply(state);
  recomputeCommand(state);
  for (const unit of Object.values(state.units)) {
    if (supplyBefore.get(unit.id) !== unit.supplyState) {
      events.push({
        type: "SUPPLY_UPDATED",
        unitId: unit.id,
        state: unit.supplyState,
      });
    }
  }
  triggerEncirclementWithdrawals(state, context);
  events.push(...evaluateObjectives(state));
  events.push({ type: "IMPULSE_COMPLETED", impulse });
  const progressedOrderIds = activeOrders
    .filter(
      (order) =>
        statusesBefore.get(order.id) !== order.status &&
        order.status === "executing",
    )
    .map((order) => order.id);
  const completedOrderIds = activeOrders
    .filter((order) => order.status === "completed")
    .map((order) => order.id);
  const failedOrderIds = activeOrders
    .filter((order) => order.status === "failed")
    .map((order) => order.id);
  const combatIds = state.combatResolutions
    .filter(
      (combat) =>
        combat.id.startsWith(`combat:${state.turn}:${impulse}:`),
    )
    .map((combat) => combat.id);
  state.impulseReports.push({
    impulse,
    label: IMPULSE_LABELS[impulse],
    eventStartIndex,
    eventEndIndex: eventStartIndex + events.length,
    progressedOrderIds,
    completedOrderIds,
    failedOrderIds,
    contactIds: [...context.createdContactIds],
    combatIds,
  });

  state.impulse += 1;
  if (state.impulse >= IMPULSE_LABELS.length) {
    events.push(...endOfDayScoring(state));
    events.push(...evaluateObjectives(state));
    state.afterActionReport = buildAfterActionReport(state, events);
    events.push({ type: "AFTER_ACTION_REPORT_CREATED", turn: state.turn });
    state.phase = "after_action";
    events.push({ type: "PHASE_CHANGED", phase: "after_action" });
  }
}

function commitCardsForOrder(
  state: GameState,
  order: PlannedOrder,
): void {
  for (const cardId of order.cardIds ?? []) {
    const card = state.cards[cardId];
    if (!card || card.state !== "hand") continue;
    card.state = "committed";
    state.playerHands[order.side] = state.playerHands[order.side].filter(
      (id) => id !== cardId,
    );
  }
}

function resolveCommittedCardsForOrder(
  state: GameState,
  order: PlannedOrder,
  events: GameEvent[],
): void {
  const lead = state.units[order.entityIds[0]];
  for (const cardId of order.cardIds ?? []) {
    const card = state.cards[cardId];
    if (!card || card.state !== "committed") continue;
    const definition = CARD_DEFS.find(
      (candidate) => candidate.defId === card.defId,
    );
    if (!definition) continue;
    for (const effect of definition.effects) {
      switch (effect.kind) {
        case "air_support":
          state.pendingAirSupport = {
            side: order.side,
            value: effect.value ?? 2,
          };
          break;
        case "extra_advance":
          state.pendingExtraAdvance = order.side;
          break;
        case "activate_ooc":
          if (lead) {
            lead.commandState = "in_command";
            lead.statusEffects.push({
              id: `effect:${cardId}:${lead.id}`,
              kind: "activate_ooc",
              label: "Местная инициатива",
              turnsRemaining: effect.durationTurns ?? 1,
            });
          }
          break;
        case "restore_org":
        case "reinforce_org":
          if (lead) {
            lead.organization = Math.min(
              100,
              lead.organization + (effect.value ?? 20),
            );
            lead.fatigue = Math.max(0, lead.fatigue - 10);
          }
          break;
        case "add_trait":
          if (lead && effect.trait) {
            if (!lead.traits.includes(effect.trait)) {
              lead.traits.push(effect.trait);
            }
            lead.statusEffects.push({
              id: `effect:${cardId}:${lead.id}`,
              kind: "add_trait",
              label: effect.trait,
              turnsRemaining: effect.durationTurns ?? 1,
              data: { trait: effect.trait },
            });
          }
          break;
        case "temp_initiative": {
          const hq = lead ? commandInfo(state, lead).hq : undefined;
          if (hq) {
            const value = effect.value ?? 2;
            hq.commandPoints += value;
            state.temporaryCommandEffects.push({
              id: `command-effect:${cardId}:${hq.id}`,
              targetHqId: hq.id,
              commandPointModifier: value,
              initiativeModifier: value,
              withdrawalDelayModifier:
                definition.defId === "sov-directive3" ? 1 : undefined,
              startsAtTurn: state.turn,
              expiresAfterTurn:
                state.turn + (effect.durationTurns ?? 1) - 1,
            });
          }
          break;
        }
        case "recon_reveal":
          if (
            order.targetHexId &&
            !state.airState.reconRevealedHexIds.includes(order.targetHexId)
          ) {
            state.airState.reconRevealedHexIds.push(order.targetHexId);
          }
          break;
        case "destroy_bridge":
          if (order.bridgeHexId != null && order.bridgeEdge != null) {
            if (
              setBridgeState(
                state,
                order.bridgeHexId,
                order.bridgeEdge,
                "destroyed",
              )
            ) {
              events.push({
                type: "BRIDGE_DESTROYED",
                hexId: order.bridgeHexId,
                edge: order.bridgeEdge,
              });
            }
          }
          break;
        case "build_pontoon":
          if (order.bridgeHexId != null && order.bridgeEdge != null) {
            const direction = directionForEdge(order.bridgeEdge);
            if (direction != null) {
              updateSharedEdge(
                state,
                order.bridgeHexId,
                direction,
                (bridge) => ({
                  edge: order.bridgeEdge!,
                  type: bridge?.type ?? "combined",
                  state: "pontoon",
                }),
              );
              events.push({
                type: "PONTOON_BUILT",
                hexId: order.bridgeHexId,
                edge: order.bridgeEdge,
              });
            }
          }
          break;
      }
    }
    card.state = "resolved";
    card.resolvedAtTurn = state.turn;
    card.state = "discard";
    events.push({
      type: "CARD_PLAYED",
      cardId,
      defId: definition.defId,
    });
  }
}

export function applyWegoCommand(
  state: GameState,
  command: GameCommand,
  events: GameEvent[],
): void {
  const side = command.side ?? state.activeSide;
  const plan = state.plans[side];
  if (command.type === "UPSERT_PLANNED_ORDER" && command.plannedOrder) {
    const index = plan.orders.findIndex(
      (order) => order.id === command.plannedOrder!.id,
    );
    if (index >= 0) {
      plan.orders[index] = structuredClone(command.plannedOrder);
    } else {
      plan.orders.push(structuredClone(command.plannedOrder));
    }
  } else if (
    command.type === "REMOVE_PLANNED_ORDER" &&
    command.plannedOrderId
  ) {
    plan.orders = plan.orders.filter(
      (order) => order.id !== command.plannedOrderId,
    );
  } else if (command.type === "UPSERT_REACTION" && command.reaction) {
    const index = plan.reactions.findIndex(
      (reaction) => reaction.id === command.reaction!.id,
    );
    if (index >= 0) {
      plan.reactions[index] = structuredClone(command.reaction);
    } else {
      plan.reactions.push(structuredClone(command.reaction));
    }
  } else if (command.type === "COMMIT_PLAN") {
    for (const order of plan.orders) {
      const lead = state.units[order.entityIds[0]];
      spendCommandPoints(
        state,
        events,
        side,
        ORDER_COST[order.orderType],
        lead ? commandInfo(state, lead).hq?.id : undefined,
      );
      for (const cardId of order.cardIds ?? []) {
        const definition = CARD_DEFS.find(
          (candidate) => candidate.defId === state.cards[cardId]?.defId,
        );
        if (definition) {
          spendCommandPoints(
            state,
            events,
            side,
            definition.commandCost,
            lead ? commandInfo(state, lead).hq?.id : undefined,
          );
        }
      }
      commitCardsForOrder(state, order);
      const reliability = assessOrderReliability(state, order);
      const delay = rollInt(
        state.seed,
        state.rngCursor,
        reliability.delay.minimum,
        reliability.delay.maximum,
      );
      state.rngCursor = delay.cursor;
      order.actualStartImpulse = Math.min(
        5,
        order.startImpulse + delay.value,
      );
      order.delayReasons = reliability.reasons;
      order.status = delay.value > 0 ? "delayed" : "committed";
      if (delay.value > 0) {
        events.push({
          type: "ORDER_DELAYED",
          orderId: order.id,
          untilImpulse: order.actualStartImpulse,
          reasons: reliability.reasons,
        });
      }
    }
    for (const reaction of plan.reactions) {
      spendCommandPoints(state, events, side, reaction.commandCost);
      reaction.status = "committed";
    }
    plan.committed = true;
    plan.committedAt = state.turn * 10 + (side === "germany" ? 1 : 2);
    events.push({ type: "PLAN_COMMITTED", side });
    if (state.plans.germany.committed && state.plans.ussr.committed) {
      state.phase = "execution";
      state.impulse = 0;
      state.impulseReports = [];
      state.combatResolutions = [];
      state.afterActionReport = undefined;
      events.push({ type: "PLANS_LOCKED" });
      events.push({ type: "PHASE_CHANGED", phase: "execution" });
    } else {
      state.activeSide = enemyOf(side);
    }
  } else if (command.type === "EXECUTE_IMPULSE") {
    executeImpulse(state, events);
  }
}

export function sanitizeStateForSide(
  state: GameState,
  side: Side,
): GameState {
  const view = structuredClone(state);
  const opponent = enemyOf(side);
  const visibleEntityIds = new Set(
    state.contacts
      .filter((contact) => contact.detectedBy.includes(side))
      .flatMap((contact) => contact.entityIds),
  );
  view.plans[opponent].orders = view.plans[opponent].orders
    .filter((order) =>
      order.entityIds.some((entityId) => visibleEntityIds.has(entityId)),
    )
    .map((order) => ({
      ...order,
      route: undefined,
      supportIds: undefined,
      waitForEntityIds: undefined,
      cardIds: undefined,
      reserveData: undefined,
      fallbackRoute: undefined,
      actualStartImpulse: undefined,
      remainingMovementBudget: undefined,
      movementSpentThisImpulse: undefined,
      delayReasons: undefined,
    }));
  view.plans[opponent].reactions = [];
  const hiddenCardIds = new Set(state.playerHands[opponent]);
  view.playerHands[opponent] = [];
  for (const cardId of hiddenCardIds) delete view.cards[cardId];
  if (view.afterActionReport) {
    view.afterActionReport.orderSummary[opponent] =
      view.afterActionReport.orderSummary[opponent].filter(
        (summary) =>
          view.plans[opponent].orders.some(
            (order) => order.id === summary.orderId,
          ),
      );
  }
  return view;
}
