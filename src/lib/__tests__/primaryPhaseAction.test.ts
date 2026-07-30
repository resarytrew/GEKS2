import { describe, expect, it } from "vitest";
import { createInitialState } from "@/scenarios/baltic-1941/scenario";
import { getPrimaryPhaseAction } from "@/lib/primaryPhaseAction";

describe("getPrimaryPhaseAction", () => {
  it("creates the engine command for planning without dispatching it", () => {
    const state = createInitialState({ mode: "hotseat", seed: 11 });
    state.phase = "planning";
    const action = getPrimaryPhaseAction(state);
    expect(action.command).toEqual({ type: "COMMIT_PLAN", side: state.activeSide });
    expect(action.label).toBe("Запечатать приказы");
    expect(state.plans[state.activeSide].committed).toBe(false);
  });

  it("uses execution command and the completed-game disabled state", () => {
    const state = createInitialState({ mode: "hotseat", seed: 12 });
    state.phase = "execution";
    expect(getPrimaryPhaseAction(state).command).toEqual({ type: "EXECUTE_IMPULSE" });
    state.status = "completed";
    const complete = getPrimaryPhaseAction(state);
    expect(complete.disabled).toBe(true);
    expect(complete.command).toBeUndefined();
  });
});
