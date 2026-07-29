import type { PlannedOrder, SupplyState } from "@/engine/types";

/** Canvas and DOM use these symbols so supply is never communicated by colour alone. */
export const SUPPLY_MARK_SHAPES: Record<SupplyState, "circle" | "half-circle" | "triangle" | "slash" | "cross"> = {
  full: "circle",
  limited: "half-circle",
  low: "triangle",
  isolated: "slash",
  none: "cross",
};

export const MAX_VISIBLE_STACK_COUNTERS = 3;

export function hiddenStackCount(total: number): number {
  return Math.max(0, total - MAX_VISIBLE_STACK_COUNTERS);
}

export type OrderRouteStyle = "march" | "advance" | "prepared-attack" | "withdraw" | "defend" | "delay" | "reserve" | "engineering";

/** A visual vocabulary only; order validation/execution stays in the engine. */
export function orderRouteStyle(order: PlannedOrder): OrderRouteStyle {
  switch (order.orderType) {
    case "advance": return "advance";
    case "prepared_attack": return "prepared-attack";
    case "withdraw": return "withdraw";
    case "defend": return "defend";
    case "delay": return "delay";
    case "reserve": return "reserve";
    case "prepare_demolition":
    case "build_pontoon": return "engineering";
    default: return "march";
  }
}
