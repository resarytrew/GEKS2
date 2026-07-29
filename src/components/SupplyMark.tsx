import type { SupplyState } from "@/engine/types";
import { SUPPLY_MARK_SHAPES } from "@/renderer/presentation";

const LABELS: Record<SupplyState, string> = {
  full: "Снабжение полное", limited: "Снабжение ограничено", low: "Снабжение низкое", isolated: "Соединение изолировано", none: "Снабжение отсутствует",
};
const COLORS: Record<SupplyState, string> = { full: "#5f7d54", limited: "#b59035", low: "#b85b31", isolated: "#a74032", none: "#54251f" };

/** DOM equivalent of the Canvas supply mark. Shape remains legible without colour. */
export function SupplyMark({ state, className = "h-4 w-4" }: { state: SupplyState; className?: string }) {
  const shape = SUPPLY_MARK_SHAPES[state];
  const common = { stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const };
  return <span role="img" aria-label={LABELS[state]} title={LABELS[state]} className={`inline-flex shrink-0 items-center justify-center ${className}`} style={{ color: COLORS[state] }}>
    <svg viewBox="0 0 20 20" aria-hidden="true" className="h-full w-full" fill="none">
      {shape === "circle" && <circle cx="10" cy="10" r="5.4" fill="currentColor" />}
      {shape === "half-circle" && <path d="M4.6 10a5.4 5.4 0 0 1 10.8 0Z" fill="currentColor" />}
      {shape === "triangle" && <path d="m10 4.2 5.5 10H4.5Z" fill="currentColor" />}
      {shape === "slash" && <path {...common} d="m5 15 10-10" />}
      {shape === "cross" && <path {...common} d="m5 5 10 10m0-10L5 15" />}
    </svg>
  </span>;
}
