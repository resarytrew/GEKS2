import type { PlannedOrder, PlannedOrderType } from "@/engine/types";
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
