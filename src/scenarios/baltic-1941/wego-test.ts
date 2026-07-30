import type { GameState, UnitState } from "@/engine/types";
import { recomputeCommand, recomputeSupply } from "@/engine/rules";
import { parseKey, sharedEdge } from "@/engine/hex";
import { directionForEdge, updateSharedEdge } from "@/engine/edges";
import { createInitialState } from "@/scenarios/baltic-1941/scenario";

export function relocateWegoFixtureUnit(
  state: GameState,
  unitId: string,
  hexId: string,
): UnitState {
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
 * This is an engineering test fixture, not a historically exact scenario.
 * Every role/trait/resource mutation remains local to this state builder.
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

  relocateWegoFixtureUnit(state, "ger-1pz", "16_29");
  relocateWegoFixtureUnit(state, "ger-6pz", "16_30");
  relocateWegoFixtureUnit(state, "ger-3mot", "16_28");
  relocateWegoFixtureUnit(state, "ger-hq-pzg4", "16_29");
  relocateWegoFixtureUnit(state, "ger-hq-xxxi", "16_29");
  relocateWegoFixtureUnit(state, "ger-hq-lvi", "16_28");
  const germanArtillery = relocateWegoFixtureUnit(
    state,
    "ger-269",
    "16_29",
  );
  germanArtillery.unitType = "artillery";
  germanArtillery.echelon = "support";
  germanArtillery.traits = [
    ...new Set([...germanArtillery.traits, "artillery", "heavy_at"]),
  ];
  relocateWegoFixtureUnit(state, "sov-2td", "17_29");
  relocateWegoFixtureUnit(state, "sov-5td", "18_29");
  relocateWegoFixtureUnit(state, "sov-hq-3mc", "17_28");
  const engineer = relocateWegoFixtureUnit(state, "sov-10sd", "18_28");
  engineer.traits = [...new Set([...engineer.traits, "engineer", "demolition"])];
  const sovietArtillery = relocateWegoFixtureUnit(
    state,
    "sov-48sd",
    "17_30",
  );
  sovietArtillery.unitType = "artillery";
  sovietArtillery.echelon = "support";
  sovietArtillery.traits = [
    ...new Set([...sovietArtillery.traits, "artillery"]),
  ];
  const noFuelUnit = relocateWegoFixtureUnit(state, "ger-8pz", "15_29");
  noFuelUnit.fuel = 0;
  noFuelUnit.commandState = "in_command";
  noFuelUnit.supplyState = "full";
  const noMovementUnit = relocateWegoFixtureUnit(
    state,
    "sov-84md",
    "18_30",
  );
  noMovementUnit.movement = 0;
  noMovementUnit.commandState = "in_command";
  noMovementUnit.supplyState = "full";

  for (const id of [
    "16_29",
    "16_30",
    "16_28",
    "17_29",
    "17_28",
    "18_28",
    "18_29",
    "15_29",
    "17_30",
    "18_30",
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
  const bridgeEdge = sharedEdge(parseKey("16_29"), parseKey("17_29"));
  if (bridgeEdge != null) {
    updateSharedEdge(
      state,
      "16_29",
      directionForEdge(bridgeEdge)!,
      (bridge) => ({
        edge: bridgeEdge,
        type: bridge?.type ?? "road",
        state: "intact",
      }),
    );
  }
  recomputeSupply(state);
  recomputeCommand(state);
  for (const readyId of [
    "ger-1pz",
    "ger-6pz",
    "ger-3mot",
    "sov-2td",
    "sov-5td",
    "ger-269",
    "sov-48sd",
  ]) {
    state.units[readyId].supplyState = "full";
    state.units[readyId].commandState = "in_command";
    state.units[readyId].ammunition = 80;
  }
  return state;
}
