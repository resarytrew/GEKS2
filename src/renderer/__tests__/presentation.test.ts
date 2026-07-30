import { describe, expect, it } from "vitest";
import { hiddenStackCount, MAX_VISIBLE_STACK_COUNTERS, orderRouteStyle, SUPPLY_MARK_SHAPES } from "@/renderer/presentation";
import type { PlannedOrder } from "@/engine/types";

const order = (orderType: PlannedOrder["orderType"]): PlannedOrder => ({
  id: "order:test", side: "germany", entityIds: ["u1"], orderType, startImpulse: 0, priority: 1,
  contactPolicy: "attack", lossTolerance: "normal", status: "draft",
});

describe("renderer presentation semantics", () => {
  it("uses distinct non-colour supply shapes", () => {
    expect(new Set(Object.values(SUPPLY_MARK_SHAPES)).size).toBe(5);
    expect(SUPPLY_MARK_SHAPES.none).toBe("cross");
    expect(SUPPLY_MARK_SHAPES.limited).toBe("half-circle");
  });

  it("limits stacks to three printed counters", () => {
    expect(MAX_VISIBLE_STACK_COUNTERS).toBe(3);
    expect(hiddenStackCount(0)).toBe(0);
    expect(hiddenStackCount(3)).toBe(0);
    expect(hiddenStackCount(7)).toBe(4);
  });

  it("maps every supported order to a route vocabulary without rules calculation", () => {
    expect(orderRouteStyle(order("march"))).toBe("march");
    expect(orderRouteStyle(order("prepared_attack"))).toBe("prepared-attack");
    expect(orderRouteStyle(order("withdraw"))).toBe("withdraw");
    expect(orderRouteStyle(order("build_pontoon"))).toBe("engineering");
  });
});
