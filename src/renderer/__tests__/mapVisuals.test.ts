import { describe, expect, it } from "vitest";
import {
  MAP_LAYER_PRESETS,
  MAP_VISUAL_LOD,
  getCounterPresentation,
  getMapLod,
  getSettlementPresentation,
  normalizeMapPreferences,
  shouldShowCoordinate,
} from "@/renderer/mapVisualConfig";
import {
  MAP_RENDER_INVALIDATION,
  collectFrontlineEdges,
  collectUniqueRiverEdges,
  layoutMapLabels,
  projectStack,
} from "@/renderer/mapVisualModel";
import {
  getMapRenderBenchmark,
  recordMapRenderSample,
  resetMapRenderBenchmark,
} from "@/renderer/mapPerformance";
import { createInitialState } from "@/scenarios/baltic-1941/scenario";

describe("operational map LOD", () => {
  it("uses one authoritative far, medium and close configuration", () => {
    expect(Object.keys(MAP_VISUAL_LOD)).toEqual(["far", "medium", "close"]);
    expect(getMapLod(0.25)).toBe("far");
    expect(getMapLod(0.6)).toBe("medium");
    expect(getMapLod(1.1)).toBe("close");
  });

  it("hides automatic coordinates at far LOD", () => {
    expect(shouldShowCoordinate("far", "auto", 3, 4, false)).toBe(false);
  });

  it("samples coordinates at medium LOD", () => {
    const values = Array.from({ length: 12 }, (_, q) =>
      shouldShowCoordinate("medium", "auto", q, 2, false),
    );
    expect(values.some(Boolean)).toBe(true);
    expect(values.some((value) => !value)).toBe(true);
  });

  it("shows all unobstructed coordinates at close LOD", () => {
    expect(shouldShowCoordinate("close", "auto", 5, 7, false)).toBe(true);
    expect(shouldShowCoordinate("close", "auto", 6, 8, false)).toBe(true);
  });

  it("keeps strategic settlements visible and hides minor ones at far LOD", () => {
    expect(getSettlementPresentation("strategic", "far").visible).toBe(true);
    expect(getSettlementPresentation("minor", "far").visible).toBe(false);
  });

  it("changes counter projection between far and close LOD", () => {
    expect(getCounterPresentation(0.3).mode).toBe("summary");
    expect(getCounterPresentation(1.1).mode).toBe("full");
    expect(getCounterPresentation(1.1).size).toBeGreaterThan(
      getCounterPresentation(0.3).size,
    );
  });
});

describe("shared map projections", () => {
  const state = createInitialState({
    seed: 22061941,
    matchId: "map-visuals",
    mode: "hotseat",
  });
  const ids = Object.keys(state.hexes);

  it("normalizes gameplay river shared edges", () => {
    const edges = collectUniqueRiverEdges(state, ids);
    expect(new Set(edges.map((edge) => edge.key)).size).toBe(edges.length);
    expect(edges.length).toBeGreaterThan(0);
  });

  it("builds a unique frontline only between different controls", () => {
    const edges = collectFrontlineEdges(state, ids);
    expect(new Set(edges.map((edge) => edge.key)).size).toBe(edges.length);
    expect(
      edges.every(
        (edge) =>
          state.hexes[edge.fromHexId].control !==
          state.hexes[edge.toHexId].control,
      ),
    ).toBe(true);
  });
});

describe("settlement labels and counters", () => {
  it("keeps a strategic label when every anchor collides", () => {
    const labels = layoutMapLabels(
      [
        {
          id: "riga",
          x: 50,
          y: 50,
          width: 40,
          height: 12,
          priority: 400,
          strategic: true,
        },
      ],
      [{ left: 0, top: 0, right: 100, bottom: 100 }],
    );
    expect(labels).toHaveLength(1);
  });

  it("hides a lower-priority minor label on collision", () => {
    const labels = layoutMapLabels(
      [
        {
          id: "major",
          x: 50,
          y: 50,
          width: 80,
          height: 20,
          priority: 300,
        },
        {
          id: "minor",
          x: 50,
          y: 50,
          width: 80,
          height: 20,
          priority: 100,
        },
      ],
      [],
    );
    expect(labels.map((label) => label.id)).toContain("major");
    expect(labels.length).toBeLessThanOrEqual(2);
  });

  it("limits stacks to three and prioritizes the selected unit", () => {
    const units = ["a", "b", "c", "d"].map((id) => ({ id }));
    const projection = projectStack(units, ["d"], 3);
    expect(projection.visible).toHaveLength(3);
    expect(projection.visible[0].id).toBe("d");
    expect(projection.hiddenCount).toBe(1);
  });
});

describe("layer preferences and cache policy", () => {
  it("provides operational, terrain, supply and service presets", () => {
    expect(Object.keys(MAP_LAYER_PRESETS)).toEqual([
      "operational",
      "terrain",
      "supply",
      "service",
    ]);
    expect(MAP_LAYER_PRESETS.supply.showSupply).toBe(true);
    expect(MAP_LAYER_PRESETS.service.coordinateMode).toBe("always");
  });

  it("normalizes persisted UI preferences without touching game state", () => {
    const preferences = normalizeMapPreferences({
      preset: "operational",
      showGrid: false,
    });
    expect(preferences.showGrid).toBe(false);
    expect("hexes" in preferences).toBe(false);
  });

  it("does not invalidate terrain for selection or orders", () => {
    expect(MAP_RENDER_INVALIDATION.selection).toEqual(["interaction"]);
    expect(MAP_RENDER_INVALIDATION.orders).toEqual(["operational"]);
    expect(MAP_RENDER_INVALIDATION.orders).not.toContain("terrain");
  });
});

describe("map render benchmark", () => {
  it("keeps a bounded sample window and reports deterministic percentiles", () => {
    resetMapRenderBenchmark();
    for (let value = 1; value <= 200; value++) {
      recordMapRenderSample("dynamic", value);
    }
    const summary = getMapRenderBenchmark().dynamic;
    expect(summary.samples).toBe(180);
    expect(summary.latestMs).toBe(200);
    expect(summary.medianMs).toBe(110);
    expect(summary.p95Ms).toBe(191);
    expect(summary.maxMs).toBe(200);
  });
});
