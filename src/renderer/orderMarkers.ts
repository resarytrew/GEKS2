import type { PlannedOrder } from "@/engine/types";

export type PositionOrderMarker = "attack" | "defend" | "reserve" | "recover" | "engineering" | null;

/** Pure visual projection; it deliberately requires existing target/bridge fields. */
export function positionOrderMarker(order: PlannedOrder): PositionOrderMarker {
  if (order.orderType === "prepared_attack" && order.targetHexId) return "attack";
  if ((order.orderType === "defend" || order.orderType === "delay") && (order.targetHexId || order.entityIds.length)) return "defend";
  if (order.orderType === "reserve" && (order.targetHexId || order.entityIds.length)) return "reserve";
  if (order.orderType === "recover" && order.entityIds.length) return "recover";
  if ((order.orderType === "prepare_demolition" || order.orderType === "build_pontoon") && order.bridgeHexId != null && order.bridgeEdge != null) return "engineering";
  return null;
}
