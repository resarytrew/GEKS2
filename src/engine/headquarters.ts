import type {
  GameEvent,
  GameState,
  HeadquartersState,
  Side,
} from "@/engine/types";

export type HeadquartersLoss = "disrupted" | "retreated" | "captured" | "eliminated";

function enemyOf(side: Side): Side {
  return side === "germany" ? "ussr" : "germany";
}

export function resolveHeadquartersLoss(
  state: GameState,
  hqId: string,
  loss: HeadquartersLoss,
  events: GameEvent[],
  retreatPath: string[] = [],
): HeadquartersState | undefined {
  const hq = state.headquarters[hqId];
  if (!hq) return undefined;
  const subordinateIds = Object.values(state.units)
    .filter(
      (unit) =>
        unit.id !== hqId &&
        !unit.eliminated &&
        (unit.parentCorpsId === hqId ||
          unit.parentArmyId === hqId ||
          unit.temporaryCommandId === hqId),
    )
    .map((unit) => unit.id);

  if (loss === "disrupted") {
    hq.status = "disrupted";
    hq.commandState = "disorganized";
    hq.commandPoints = 0;
    hq.throughput = Math.max(0, hq.throughput - 1);
    events.push({ type: "HQ_DISRUPTED", hqId });
  } else if (loss === "retreated") {
    hq.status = "retreated";
    hq.commandPoints = 0;
    if (retreatPath.length > 1) {
      const destination = retreatPath[retreatPath.length - 1];
      state.hexes[hq.hexId].stackUnitIds = state.hexes[hq.hexId].stackUnitIds.filter(
        (id) => id !== hq.id,
      );
      hq.hexId = destination;
      if (!state.hexes[destination].stackUnitIds.includes(hq.id)) {
        state.hexes[destination].stackUnitIds.push(hq.id);
      }
    }
    events.push({ type: "HQ_RETREATED", hqId, path: retreatPath });
  } else {
    hq.status = loss === "captured" ? "captured" : "eliminated";
    hq.captured = loss === "captured";
    hq.eliminated = true;
    hq.commandPoints = 0;
    hq.currentSteps = 0;
    state.hexes[hq.hexId].stackUnitIds = state.hexes[hq.hexId].stackUnitIds.filter(
      (id) => id !== hq.id,
    );
    if (loss === "captured") {
      events.push({ type: "HQ_CAPTURED", hqId, by: enemyOf(hq.side) });
    }
  }

  for (const unitId of subordinateIds) {
    state.units[unitId].commandState = "out_of_command";
  }
  events.push({ type: "COMMAND_NETWORK_BROKEN", hqId });
  events.push({ type: "SUBORDINATES_OUT_OF_COMMAND", hqId, unitIds: subordinateIds });
  return hq;
}
