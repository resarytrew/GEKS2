import type { GameEvent, GameState, PlannedOrder, PlannedOrderType, Side } from "@/engine/types";
import type { OrderReliability } from "@/engine/wego";

export const ORDER_TYPE_LABELS: Record<PlannedOrderType, string> = {
  march: "Марш",
  advance: "Наступление",
  prepared_attack: "Подготовленная атака",
  defend: "Оборона",
  delay: "Сдерживание",
  withdraw: "Организованный отход",
  reserve: "Резерв",
  recover: "Восстановление",
  prepare_demolition: "Подготовить подрыв",
  build_pontoon: "Навести понтон",
};

export const ORDER_STATUS_LABELS: Record<PlannedOrder["status"], string> = {
  draft: "черновик",
  committed: "передан",
  executing: "исполняется",
  completed: "выполнен",
  delayed: "задержан",
  failed: "сорван",
  cancelled: "отменён",
};

export const ORDER_RELIABILITY_LABELS: Record<
  OrderReliability["level"],
  string
> = {
  high: "высокая",
  medium: "средняя",
  low: "низкая",
};

/** Conservative player-facing event projection. Private planning and internal diagnostics stay out. */
export function getVisibleEventLog(state: GameState, side: Side): GameEvent[] {
  const ownOrderIds = new Set(state.plans[side].orders.map((order) => order.id));
  const detectedContacts = new Set(state.contacts.filter((contact) => contact.detectedBy.includes(side)).map((contact) => contact.id));
  const visibleUnits = new Set(Object.values(state.units).filter((unit) => unit.side === side).map((unit) => unit.id));
  for (const contact of state.contacts) {
    if (!contact.detectedBy.includes(side)) continue;
    for (const unitId of [...contact.attackerParticipantIds, ...contact.defenderParticipantIds]) visibleUnits.add(unitId);
  }
  return state.eventLog.filter((event) => {
    switch (event.type) {
      case "PHASE_CHANGED": case "TURN_ADVANCED": case "WEATHER_CHANGED": case "EVENT_TRIGGERED": case "GAME_COMPLETED": case "PLANS_LOCKED": case "IMPULSE_STARTED": case "IMPULSE_COMPLETED": case "AFTER_ACTION_REPORT_CREATED": return true;
      case "CARD_DRAWN": case "COMMAND_POINTS_SPENT": case "OBJECTIVE_COMPLETED": case "OBJECTIVE_FAILED": case "SCORE_AWARDED": case "PLAN_COMMITTED": return event.side === side;
      case "CONTACT_CREATED": case "MEETING_ENGAGEMENT": case "CONTACT_RESOLVED": return detectedContacts.has(event.contactId);
      case "COMBAT_RESOLVED": return !event.contactId || detectedContacts.has(event.contactId);
      case "ORDER_DELAYED": case "ORDER_FAILED": case "ORDER_PROGRESS": case "ORDER_BLOCKED": case "ORDER_COMPLETED": case "ORDER_ABORTED_BY_LOSSES": case "RESERVE_COMMITTED": case "RESERVE_NOT_COMMITTED": case "ENEMY_ADVANCE_DELAYED": case "ADVANCE_HALTED": case "BREAKTHROUGH_CONTINUED": case "PONTOON_COMPLETED": case "RECOVERY_PROGRESS": return ownOrderIds.has(event.orderId);
      case "UNIT_MOVED": case "FUEL_SPENT": case "UNIT_LOST_STEP": case "UNIT_ELIMINATED": case "UNIT_RETREATED": case "UNIT_ADVANCED": case "UNIT_DISORGANIZED": case "SUPPLY_UPDATED": case "AMMUNITION_SPENT": case "FUEL_CRITICAL": case "UNIT_HALTED_NO_FUEL": case "DELAYING_FORCE_WITHDREW": case "DELAYING_FORCE_PINNED": return visibleUnits.has(event.unitId);
      default: return false;
    }
  });
}
