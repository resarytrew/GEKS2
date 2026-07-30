import { describe, expect, it } from "vitest";
import { createInitialState } from "@/scenarios/baltic-1941/scenario";
import { normalizeRiverEdges } from "@/renderer/rivers";

describe("normalizeRiverEdges", () => {
  it("emits a shared river edge once", () => {
    const state = createInitialState({ mode: "hotseat", seed: 7 });
    const source = Object.values(state.hexes).find((hex) => hex.riverEdges.length > 0);
    expect(source).toBeDefined();
    const edges = normalizeRiverEdges(state.hexes);
    expect(new Set(edges.map((edge) => edge.key)).size).toBe(edges.length);
  });
});
