import type {
  CommandValidationResult,
  GameCommand,
  GameEvent,
  GameState,
  PlannedOrder,
  PlannedOrderType,
  Side,
} from "@/engine/types";
import { edgeCost, commandInfo, canStackInto } from "@/engine/rules";
import { canSpendFromAllocations, spendCommandPoints } from "@/engine/resources";
import { rollInt } from "@/engine/rng";
import { parseKey, sharedEdge } from "@/engine/hex";
import { setBridgeState, sharedEdgeKey } from "@/engine/edges";

export const IMPULSE_LABELS = [
  "06:00–09:00",
  "09:00–12:00",
  "12:00–15:00",
  "15:00–18:00",
  "18:00–21:00",
  "NIGHT",
] as const;

const ORDER_COST: Record<PlannedOrderType, number> = {
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

const enemyOf = (side: Side): Side => (side === "germany" ? "ussr" : "germany");

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

export function assessOrderReliability(state: GameState, order: PlannedOrder): OrderReliability {
  const lead = state.units[order.entityIds[0]];
  const reasons: string[] = [];
  let maximum = 0;
  if (!lead) {
    return { level: "low", delay: { minimum: 2, maximum: 3 }, reasons: ["Соединение не найдено."] };
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
  if (order.orderType === "prepared_attack" || order.waitForEntityIds?.length) {
    maximum += 1;
    reasons.push("Сложная координация приказа.");
  }
  if ((order.route?.length ?? 0) > 4) {
    maximum += 1;
    reasons.push("Длинный маршрут.");
  }
  maximum = Math.min(3, maximum);
  const minimum = lead.commandState === "out_of_command" ? 1 : 0;
  return {
    level: maximum === 0 ? "high" : maximum <= 1 ? "medium" : "low",
    delay: { minimum: Math.min(minimum, maximum), maximum },
    reasons: reasons.length ? reasons : ["Собственный штаб на связи; приказ простой."],
  };
}

function validateOrder(state: GameState, side: Side, order: PlannedOrder): CommandValidationResult {
  if (order.side !== side) return invalid("NOT_OWNER", "Нельзя изменить план другой стороны.");
  if (!Number.isInteger(order.startImpulse) || order.startImpulse < 0 || order.startImpulse >= IMPULSE_LABELS.length) {
    return invalid("INVALID_START_IMPULSE", "Импульс начала должен быть от 0 до 5.");
  }
  if (order.entityIds.length === 0) return invalid("NO_ENTITIES", "В приказе нет соединений.");
  for (const entityId of order.entityIds) {
    const entity = state.units[entityId];
    if (!entity) return invalid("NO_ENTITY", `Сущность ${entityId} не найдена.`);
    if (entity.side !== side) return invalid("NOT_OWNER", "В приказ включено чужое соединение.");
    if (entity.eliminated) return invalid("ENTITY_ELIMINATED", "Уничтоженная сущность не может получить приказ.");
  }
  if (
    (order.orderType === "march" ||
      order.orderType === "advance" ||
      order.orderType === "withdraw") &&
    (!order.route || order.route.length < 2)
  ) {
    return invalid("INVALID_ROUTE", "Для движения нужен маршрут минимум из двух гексов.");
  }
  if (order.route && order.route[0] !== state.units[order.entityIds[0]].hexId) {
    return invalid("INVALID_ROUTE_ORIGIN", "Маршрут должен начинаться в текущем гексе.");
  }
  return valid();
}

export function validateWegoCommand(state: GameState, command: GameCommand): CommandValidationResult {
  const side = command.side ?? state.activeSide;
  if (
    command.type === "UPSERT_PLANNED_ORDER" ||
    command.type === "REMOVE_PLANNED_ORDER" ||
    command.type === "UPSERT_REACTION" ||
    command.type === "COMMIT_PLAN"
  ) {
    if (state.phase !== "planning") return invalid("WRONG_PHASE", "Планы меняются только в фазе планирования.");
    if (state.plans[side].committed) return invalid("PLAN_ALREADY_COMMITTED", "Зафиксированный план нельзя изменить.");
  }
  if (command.type === "UPSERT_PLANNED_ORDER") {
    if (!command.plannedOrder) return invalid("NO_ORDER", "Запланированный приказ отсутствует.");
    return validateOrder(state, side, command.plannedOrder);
  }
  if (command.type === "REMOVE_PLANNED_ORDER") {
    if (!command.plannedOrderId) return invalid("NO_ORDER", "Не указан приказ для удаления.");
    if (!state.plans[side].orders.some((order) => order.id === command.plannedOrderId)) {
      return invalid("NO_ORDER", "Приказ не найден в собственном плане.");
    }
  }
  if (command.type === "UPSERT_REACTION") {
    if (!command.reaction) return invalid("NO_REACTION", "Реакция отсутствует.");
    if (command.reaction.side !== side) return invalid("NOT_OWNER", "Нельзя назначить реакцию другой стороны.");
    if (command.reaction.maxUses < 1) return invalid("INVALID_REACTION_LIMIT", "Реакция должна иметь хотя бы одно применение.");
  }
  if (command.type === "COMMIT_PLAN") {
    const allocations = state.plans[side].orders.map((order) => {
      const lead = state.units[order.entityIds[0]];
      return {
        side,
        amount: ORDER_COST[order.orderType],
        hqId: lead ? commandInfo(state, lead).hq?.id : undefined,
      };
    });
    allocations.push(
      ...state.plans[side].reactions.map((reaction) => ({
        side,
        amount: reaction.commandCost,
        hqId: undefined,
      })),
    );
    const check = canSpendFromAllocations(state, allocations);
    if (!check.ok) return { valid: false, errors: check.error ? [check.error] : [] };
  }
  if (command.type === "EXECUTE_IMPULSE" && state.phase !== "execution") {
    return invalid("WRONG_PHASE", "Импульс исполняется только после фиксации обоих планов.");
  }
  return valid();
}

function moveEntity(state: GameState, entityId: string, to: string, events: GameEvent[]): void {
  const entity = state.units[entityId];
  const from = entity.hexId;
  state.hexes[from].stackUnitIds = state.hexes[from].stackUnitIds.filter((id) => id !== entityId);
  entity.hexId = to;
  if (!state.hexes[to].stackUnitIds.includes(entityId)) state.hexes[to].stackUnitIds.push(entityId);
  if (entity.entityType === "headquarters") state.headquarters[entity.id].movedThisTurn = true;
  events.push({ type: "UNIT_MOVED", unitId: entityId, from, to, fuelSpent: 0 });
}

interface MovementIntent {
  order: PlannedOrder;
  from: string;
  to: string;
}

function triggerBridgeReaction(
  state: GameState,
  intent: MovementIntent,
  events: GameEvent[],
): boolean {
  const edge = sharedEdge(parseKey(intent.from), parseKey(intent.to));
  if (edge == null) return false;
  const key = sharedEdgeKey(state, intent.from, edge);
  if (!key || !state.preparedBridgeDemolitions[key]) return false;
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
    .sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id))
    .find((candidate) => {
      if (candidate.targetHexId == null || candidate.edge == null) return true;
      return sharedEdgeKey(state, candidate.targetHexId, candidate.edge) === key;
    });
  if (!reaction) return false;
  setBridgeState(state, intent.from, edge, "destroyed");
  delete state.preparedBridgeDemolitions[key];
  reaction.uses += 1;
  reaction.status = reaction.uses >= reaction.maxUses ? "resolved" : "committed";
  events.push({ type: "REACTION_TRIGGERED", reactionId: reaction.id });
  events.push({ type: "BRIDGE_DESTROYED", hexId: intent.from, edge });
  intent.order.status = "failed";
  events.push({ type: "ORDER_FAILED", orderId: intent.order.id, reason: "Мост подорван реакцией противника." });
  return true;
}

function executeImpulse(state: GameState, events: GameEvent[]): void {
  const impulse = state.impulse;
  events.push({ type: "IMPULSE_STARTED", impulse, label: IMPULSE_LABELS[impulse] });
  const activeOrders = (["germany", "ussr"] as Side[])
    .flatMap((side) => state.plans[side].orders)
    .filter(
      (order) =>
        (order.status === "committed" || order.status === "delayed" || order.status === "executing") &&
        (order.actualStartImpulse ?? order.startImpulse) <= impulse,
    )
    .sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
  const intents: MovementIntent[] = [];
  for (const order of activeOrders) {
    const waiting = (order.waitForEntityIds ?? []).some((entityId) => {
      const dependency = (["germany", "ussr"] as Side[])
        .flatMap((side) => state.plans[side].orders)
        .find((candidate) => candidate.entityIds.includes(entityId));
      return dependency && dependency.status !== "completed";
    });
    if (waiting) {
      order.status = "delayed";
      order.delayReasons = ["Ожидание зависимого соединения."];
      events.push({
        type: "ORDER_DELAYED",
        orderId: order.id,
        untilImpulse: Math.min(5, impulse + 1),
        reasons: order.delayReasons,
      });
      continue;
    }
    if (!order.route || order.route.length < 2) {
      order.status = "completed";
      continue;
    }
    const progress = order.progressIndex ?? 0;
    const from = order.route[progress];
    const to = order.route[progress + 1];
    if (!to) {
      order.status = "completed";
      continue;
    }
    const entities = order.entityIds.map((id) => state.units[id]).filter(Boolean);
    if (
      entities.some((entity) => !Number.isFinite(edgeCost(state, entity, from, to))) ||
      !canStackInto(state, order.entityIds, to)
    ) {
      order.status = "failed";
      events.push({ type: "ORDER_FAILED", orderId: order.id, reason: "Маршрут заблокирован." });
      continue;
    }
    order.status = "executing";
    intents.push({ order, from, to });
  }

  const blocked = new Set<string>();
  for (let left = 0; left < intents.length; left++) {
    for (let right = left + 1; right < intents.length; right++) {
      const a = intents[left];
      const b = intents[right];
      if (
        a.order.side !== b.order.side &&
        (a.to === b.to || (a.from === b.to && a.to === b.from))
      ) {
        const entityIds = [...a.order.entityIds, ...b.order.entityIds].sort();
        const contactId = `contact:${state.turn}:${impulse}:${entityIds.join(":")}`;
        state.contacts.push({
          id: contactId,
          hexId: a.to,
          entityIds,
          type: "MEETING_ENGAGEMENT",
          impulse,
          detectedBy: ["germany", "ussr"],
          resolved: false,
        });
        events.push({ type: "MEETING_ENGAGEMENT", contactId, hexId: a.to, entityIds });
        blocked.add(a.order.id);
        blocked.add(b.order.id);
        a.order.status = "completed";
        b.order.status = "completed";
      }
    }
  }

  for (const intent of intents) {
    if (blocked.has(intent.order.id) || triggerBridgeReaction(state, intent, events)) continue;
    for (const entityId of intent.order.entityIds) moveEntity(state, entityId, intent.to, events);
    intent.order.progressIndex = (intent.order.progressIndex ?? 0) + 1;
    if ((intent.order.progressIndex ?? 0) >= (intent.order.route?.length ?? 1) - 1) {
      intent.order.status = "completed";
    }
  }

  state.impulse += 1;
  if (state.impulse >= IMPULSE_LABELS.length) {
    state.phase = "reaction";
    events.push({ type: "PHASE_CHANGED", phase: "reaction" });
  }
}

export function applyWegoCommand(state: GameState, command: GameCommand, events: GameEvent[]): void {
  const side = command.side ?? state.activeSide;
  const plan = state.plans[side];
  if (command.type === "UPSERT_PLANNED_ORDER" && command.plannedOrder) {
    const index = plan.orders.findIndex((order) => order.id === command.plannedOrder!.id);
    if (index >= 0) plan.orders[index] = structuredClone(command.plannedOrder);
    else plan.orders.push(structuredClone(command.plannedOrder));
  } else if (command.type === "REMOVE_PLANNED_ORDER" && command.plannedOrderId) {
    plan.orders = plan.orders.filter((order) => order.id !== command.plannedOrderId);
  } else if (command.type === "UPSERT_REACTION" && command.reaction) {
    const index = plan.reactions.findIndex((reaction) => reaction.id === command.reaction!.id);
    if (index >= 0) plan.reactions[index] = structuredClone(command.reaction);
    else plan.reactions.push(structuredClone(command.reaction));
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
      const reliability = assessOrderReliability(state, order);
      const delay = rollInt(
        state.seed,
        state.rngCursor,
        reliability.delay.minimum,
        reliability.delay.maximum,
      );
      state.rngCursor = delay.cursor;
      order.actualStartImpulse = Math.min(5, order.startImpulse + delay.value);
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
      events.push({ type: "PLANS_LOCKED" });
      events.push({ type: "PHASE_CHANGED", phase: "execution" });
    } else {
      state.activeSide = enemyOf(side);
    }
  } else if (command.type === "EXECUTE_IMPULSE") {
    executeImpulse(state, events);
  }
}

export function sanitizeStateForSide(state: GameState, side: Side): GameState {
  const view = structuredClone(state);
  const opponent = enemyOf(side);
  const visibleEntityIds = new Set(
    state.contacts
      .filter((contact) => contact.detectedBy.includes(side))
      .flatMap((contact) => contact.entityIds),
  );
  view.plans[opponent].orders = view.plans[opponent].orders.filter((order) =>
    order.entityIds.some((entityId) => visibleEntityIds.has(entityId)),
  );
  view.plans[opponent].reactions = [];
  return view;
}
