import { describe, expect, it } from "vitest";
import { positionOrderMarker } from "@/renderer/orderMarkers";
import type { PlannedOrder } from "@/engine/types";

const order = (orderType: PlannedOrder["orderType"], extra: Partial<PlannedOrder> = {}): PlannedOrder => ({ id: "o", side: "germany", entityIds: ["u"], orderType, startImpulse: 0, priority: 1, contactPolicy: "attack", lossTolerance: "normal", status: "draft", ...extra });

describe("position order markers", () => {
  it("renders target and position orders without requiring a route", () => {
    expect(positionOrderMarker(order("prepared_attack", { targetHexId: "1_1" }))).toBe("attack");
    expect(positionOrderMarker(order("defend"))).toBe("defend");
    expect(positionOrderMarker(order("reserve"))).toBe("reserve");
    expect(positionOrderMarker(order("recover"))).toBe("recover");
  });
  it("requires real bridge geometry for engineering marker", () => {
    expect(positionOrderMarker(order("build_pontoon"))).toBeNull();
    expect(positionOrderMarker(order("build_pontoon", { bridgeHexId: "1_1", bridgeEdge: 2 }))).toBe("engineering");
  });
});
