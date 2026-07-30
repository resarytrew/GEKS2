import { describe, expect, it } from "vitest";
import { createInitialState } from "@/scenarios/baltic-1941/scenario";
import { getVisibleEventLog } from "@/engine/presentation";

describe("player event presentation", () => {
  it("keeps opponent planning events out of the player log", () => {
    const state = createInitialState({ mode: "hotseat", seed: 91 });
    state.eventLog = [
      { type: "PLAN_COMMITTED", side: "germany" },
      { type: "PLAN_COMMITTED", side: "ussr" },
      { type: "PHASE_CHANGED", phase: "execution" },
    ];
    expect(getVisibleEventLog(state, "germany").map((event) => event.type)).toEqual(["PLAN_COMMITTED", "PHASE_CHANGED"]);
    expect(getVisibleEventLog(state, "ussr").map((event) => event.type)).toEqual(["PLAN_COMMITTED", "PHASE_CHANGED"]);
  });

  it("keeps a hidden opponent movement out of the player log", () => {
    const state = createInitialState({ mode: "hotseat", seed: 92 });
    const german = Object.values(state.units).find((unit) => unit.side === "germany")!;
    state.eventLog = [{ type: "UNIT_MOVED", unitId: german.id, from: german.hexId, to: german.hexId, fuelSpent: 0 }];
    expect(getVisibleEventLog(state, "ussr")).toEqual([]);
    expect(getVisibleEventLog(state, "germany")).toHaveLength(1);
  });
});
