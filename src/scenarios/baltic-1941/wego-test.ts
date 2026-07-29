import type { GameState, UnitState } from "@/engine/types";
import { recomputeCommand, recomputeSupply } from "@/engine/rules";
import { createInitialState } from "@/scenarios/baltic-1941/scenario";

function relocate(state: GameState, unitId: string, hexId: string): UnitState {
  const unit = state.units[unitId];
  if (!unit) throw new Error(`Fixture unit ${unitId} is missing.`);
  const origin = state.hexes[unit.hexId];
  origin.stackUnitIds = origin.stackUnitIds.filter((id) => id !== unitId);
  unit.hexId = hexId;
  if (!state.hexes[hexId].stackUnitIds.includes(unitId)) {
    state.hexes[hexId].stackUnitIds.push(unitId);
  }
  return unit;
}

/**
 * Compact, deterministic acceptance fixture around Raseiniai. It retains the
 * historical scenario data but places both mobile groups, their HQs, and an
 * engineer inside a small test area suitable for one-day WEGO walkthroughs.
 */
export function createRaseiniaiWegoTestState(
  seed = 22061941,
): GameState {
  const state = createInitialState({
    seed,
    matchId: "raseiniai-wego-test",
    mode: "hotseat",
  });
  state.scenarioId = "baltic-1941-raseiniai-wego-test";

  relocate(state, "ger-1pz", "16_29");
  relocate(state, "ger-6pz", "16_30");
  relocate(state, "ger-hq-pzg4", "16_29");
  relocate(state, "sov-2td", "17_29");
  relocate(state, "sov-5td", "18_29");
  relocate(state, "sov-hq-3mc", "17_28");
  const engineer = relocate(state, "sov-10sd", "18_28");
  engineer.traits = [...new Set([...engineer.traits, "engineer", "demolition"])];

  for (const id of [
    "16_29",
    "16_30",
    "17_29",
    "17_28",
    "18_28",
    "18_29",
  ]) {
    const hasGerman = state.hexes[id].stackUnitIds.some(
      (unitId) => state.units[unitId]?.side === "germany",
    );
    const hasSoviet = state.hexes[id].stackUnitIds.some(
      (unitId) => state.units[unitId]?.side === "ussr",
    );
    state.hexes[id].control = hasGerman
      ? "germany"
      : hasSoviet
        ? "ussr"
        : state.hexes[id].control;
  }
  recomputeSupply(state);
  recomputeCommand(state);
  return state;
}
