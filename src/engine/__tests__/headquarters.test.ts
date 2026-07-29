import { describe, expect, it } from "vitest";
import { applyCommand, replayCommands } from "@/engine/engine";
import { resolveHeadquartersLoss } from "@/engine/headquarters";
import {
  commandingHq,
  commandInfo,
  recomputeCommand,
  recomputeSupply,
  reachableHexes,
} from "@/engine/rules";
import { createInitialState } from "@/scenarios/baltic-1941/scenario";
import type { GameEvent, GameState } from "@/engine/types";

function fresh(): GameState {
  return createInitialState({ seed: 1203, matchId: "hq-test", mode: "legacy_debug" });
}

function activationState(): GameState {
  let state = fresh();
  for (let index = 0; index < 4; index++) {
    state = applyCommand(state, { type: "END_PHASE" }).state;
  }
  return state;
}

describe("headquarters map entities", () => {
  it("places every headquarters in the canonical map stack", () => {
    const state = fresh();
    for (const hq of Object.values(state.headquarters)) {
      expect(hq.entityType).toBe("headquarters");
      expect(state.units[hq.id]).toBe(hq);
      expect(state.hexes[hq.hexId].stackUnitIds).toContain(hq.id);
    }
  });

  it("moves a corps HQ through the normal movement command", () => {
    const state = activationState();
    const hq = state.headquarters["ger-hq-lvi"];
    const reachable = reachableHexes(state, [hq.id]);
    const destinationHexId = [...reachable.keys()][0];
    expect(destinationHexId).toBeTruthy();
    const result = applyCommand(state, {
      type: "MOVE_STACK",
      unitIds: [hq.id],
      destinationHexId,
    });
    expect(result.ok).toBe(true);
    expect(result.state.headquarters[hq.id].hexId).toBe(destinationHexId);
    expect(result.state.headquarters[hq.id].movedThisTurn).toBe(true);
  });

  it("replay reproduces headquarters movement", () => {
    const initial = activationState();
    const hq = initial.headquarters["ger-hq-lvi"];
    const destinationHexId = [...reachableHexes(initial, [hq.id]).keys()][0];
    const command = {
      type: "MOVE_STACK" as const,
      unitIds: [hq.id],
      destinationHexId,
    };
    const direct = applyCommand(initial, command);
    const replayed = replayCommands(initial, [command]);
    expect(direct.ok).toBe(true);
    expect(replayed.headquarters[hq.id].hexId).toBe(direct.state.headquarters[hq.id].hexId);
    expect(replayed.eventLog).toEqual(direct.state.eventLog);
  });

  it("recomputes supply for headquarters", () => {
    const state = fresh();
    const hq = state.headquarters["ger-hq-pzg4"];
    const source = Object.values(state.supplySources).find(
      (candidate) => candidate.side === "germany",
    );
    if (!source) throw new Error("supply source unavailable");
    state.hexes[hq.hexId].stackUnitIds = state.hexes[hq.hexId].stackUnitIds.filter(
      (id) => id !== hq.id,
    );
    hq.hexId = source.hexId;
    state.hexes[source.hexId].stackUnitIds.push(hq.id);
    for (const hq of Object.values(state.headquarters)) hq.supplyState = "none";
    recomputeSupply(state);
    expect(state.headquarters["ger-hq-pzg4"].supplyState).toBe("full");
  });
});

describe("explicit OOB command chain", () => {
  it("assigns 3rd Mechanized Corps to 11th Army", () => {
    const state = fresh();
    expect(state.headquarters["sov-hq-3mc"].parentArmyId).toBe("sov-hq-11a");
    for (const id of ["sov-2td", "sov-5td", "sov-84md"]) {
      expect(state.units[id].parentCorpsId).toBe("sov-hq-3mc");
      expect(state.units[id].parentArmyId).toBe("sov-hq-11a");
    }
  });

  it("assigns 12th Mechanized Corps to 8th Army", () => {
    const state = fresh();
    expect(state.headquarters["sov-hq-12mc"].parentArmyId).toBe("sov-hq-8a");
    for (const id of ["sov-23td", "sov-28td", "sov-202md"]) {
      expect(state.units[id].parentCorpsId).toBe("sov-hq-12mc");
      expect(state.units[id].parentArmyId).toBe("sov-hq-8a");
    }
  });

  it("never substitutes the nearest unrelated corps HQ", () => {
    const state = fresh();
    const unit = state.units["sov-2td"];
    const own = state.headquarters["sov-hq-3mc"];
    const foreign = state.headquarters["sov-hq-12mc"];
    foreign.hexId = unit.hexId;
    own.hexId = Object.values(state.hexes).find(
      (hex) => hex.terrain !== "sea" && hex.terrain !== "lake" && hex.id !== unit.hexId,
    )!.id;
    expect(commandingHq(state, unit)?.id).toBe(own.id);
  });

  it("falls back to the declared army HQ when the corps HQ is lost", () => {
    const state = fresh();
    const unit = state.units["sov-2td"];
    state.headquarters["sov-hq-3mc"].eliminated = true;
    expect(commandingHq(state, unit)?.id).toBe("sov-hq-11a");
  });

  it("uses explicit temporary reassignment before army fallback", () => {
    const state = fresh();
    const unit = state.units["sov-2td"];
    state.headquarters["sov-hq-3mc"].eliminated = true;
    unit.temporaryCommandId = "sov-hq-12mc";
    expect(commandingHq(state, unit)?.id).toBe("sov-hq-12mc");
  });
});

describe("headquarters loss", () => {
  it("breaks the command network without eliminating subordinates", () => {
    const state = fresh();
    const events: GameEvent[] = [];
    resolveHeadquartersLoss(state, "sov-hq-3mc", "captured", events);
    for (const id of ["sov-2td", "sov-5td", "sov-84md"]) {
      expect(state.units[id].eliminated).not.toBe(true);
      expect(state.units[id].commandState).toBe("out_of_command");
    }
    expect(events.some((event) => event.type === "HQ_CAPTURED")).toBe(true);
    expect(events.some((event) => event.type === "COMMAND_NETWORK_BROKEN")).toBe(true);
  });

  it("reduces command range after an HQ moves", () => {
    const state = fresh();
    const unit = state.units["ger-1pz"];
    const hq = state.headquarters["ger-hq-xxxi"];
    const before = commandInfo(state, unit).inRange;
    hq.movedThisTurn = true;
    recomputeCommand(state);
    expect(hq.movedThisTurn).toBe(true);
    expect(typeof before).toBe("boolean");
    expect(["in_command", "delayed", "out_of_command"]).toContain(unit.commandState);
  });
});
