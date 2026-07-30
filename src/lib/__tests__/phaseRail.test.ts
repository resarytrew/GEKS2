import { describe, expect, it } from "vitest";
import { createInitialState } from "@/scenarios/baltic-1941/scenario";
import { getVisiblePhaseFlow } from "@/lib/phaseRail";

describe("getVisiblePhaseFlow", () => {
  it("projects the current WEGO phase without advancing game state", () => {
    const state = createInitialState({ mode: "hotseat", seed: 41 });
    state.phase = "plans_locked";
    const flow = getVisiblePhaseFlow(state);
    expect(flow.find((item) => item.id === "locked")?.status).toBe("current");
    expect(flow.find((item) => item.id === "execution")?.status).toBe("upcoming");
    expect(state.phase).toBe("plans_locked");
  });

  it("uses the separate legacy projection only for legacy_debug", () => {
    const state = createInitialState({ mode: "legacy_debug", seed: 42 });
    state.phase = "activation";
    const flow = getVisiblePhaseFlow(state);
    expect(flow.some((item) => item.id === "activation" && item.status === "current")).toBe(true);
    expect(flow.some((item) => item.id === "execution")).toBe(false);
  });
});
