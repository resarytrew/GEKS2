import type { PlannedOrder, PlannedOrderType } from "@/engine/types";

export const ORDER_TYPE_LABELS: Record<PlannedOrderType, string> = {
  march: "Марш", advance: "Наступление", prepared_attack: "Подготовленная атака", defend: "Оборона", delay: "Сдерживание", withdraw: "Организованный отход", reserve: "Резерв", recover: "Восстановление", prepare_demolition: "Подготовить подрыв", build_pontoon: "Навести понтон",
};
export const ORDER_STATUS_LABELS: Record<PlannedOrder["status"], string> = {
  draft: "Черновик", committed: "Зафиксирован", executing: "Исполняется", completed: "Выполнен", delayed: "Задержан", failed: "Сорван", cancelled: "Отменён",
};
export const CONTACT_POLICY_LABELS: Record<PlannedOrder["contactPolicy"], string> = { avoid: "Избегать контакта", recon: "Разведать", fix: "Связать боем", attack: "Атаковать", assault: "Штурмовать" };
export const LOSS_TOLERANCE_LABELS: Record<PlannedOrder["lossTolerance"], string> = { low: "Низкий порог", normal: "Обычный", high: "Высокий порог" };
export const ORDER_RELIABILITY_LABELS: Record<string, string> = { high: "Высокая", medium: "Средняя", low: "Низкая" };
export const HEX_EDGE_LABELS = ["Северо-восток", "Восток", "Юго-восток", "Юго-запад", "Запад", "Северо-запад"] as const;
