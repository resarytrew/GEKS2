import type {
  GameState,
  Side,
  SupportType,
  UnitState,
} from "@/engine/types";
import { distance, parseKey } from "@/engine/hex";

export const SUPPORT_RANGE: Readonly<Record<SupportType, number>> = {
  artillery: 2,
  heavy_at: 1,
  air: Number.POSITIVE_INFINITY,
};

export interface SupportEligibility {
  unitId: string;
  eligible: boolean;
  supportType: SupportType;
  distance: number;
  reasons: string[];
}

export function supportTypeForUnit(unit: UnitState): SupportType | undefined {
  if (unit.unitType === "air" || unit.movementClass === "air") return "air";
  if (unit.traits.includes("heavy_at")) return "heavy_at";
  if (unit.unitType === "artillery") return "artillery";
  return undefined;
}

export function getEligibleSupportUnits(
  state: GameState,
  side: Side,
  targetHexId: string,
  supportType: SupportType | undefined,
  impulse: number,
): SupportEligibility[] {
  if (!state.hexes[targetHexId]) return [];
  return Object.values(state.units)
    .filter((unit) => unit.side === side)
    .map((unit): SupportEligibility | undefined => {
      const actualType = supportTypeForUnit(unit);
      if (!actualType || (supportType && actualType !== supportType)) {
        return undefined;
      }
      const reasons: string[] = [];
      const supportDistance = distance(
        parseKey(unit.hexId),
        parseKey(targetHexId),
      );
      if (unit.eliminated || unit.currentSteps <= 0) {
        reasons.push("Соединение уничтожено.");
      }
      if (supportDistance > SUPPORT_RANGE[actualType]) {
        reasons.push("Цель находится вне дальности поддержки.");
      }
      if (unit.ammunition <= 0) reasons.push("Нет боеприпасов.");
      if (
        unit.commandState === "out_of_command" ||
        unit.commandState === "disorganized"
      ) {
        reasons.push("Соединение не готово к командному взаимодействию.");
      }
      if (unit.supplyState === "none" || unit.supplyState === "isolated") {
        reasons.push("Снабжение не позволяет оказать поддержку.");
      }
      if (
        state.supportUsage.some(
          (usage) =>
            usage.unitId === unit.id &&
            usage.impulse === impulse &&
            !unit.traits.includes("multiple_support"),
        )
      ) {
        reasons.push("Поддержка уже использована в этом импульсе.");
      }
      const conflictingOrder = (["germany", "ussr"] as Side[])
        .flatMap((candidateSide) => state.plans[candidateSide].orders)
        .find(
          (order) =>
            order.entityIds.includes(unit.id) &&
            (order.status === "committed" ||
              order.status === "delayed" ||
              order.status === "executing"),
        );
      if (conflictingOrder) {
        reasons.push(`Соединение занято приказом ${conflictingOrder.id}.`);
      }
      return {
        unitId: unit.id,
        eligible: reasons.length === 0,
        supportType: actualType,
        distance: supportDistance,
        reasons,
      };
    })
    .filter(
      (eligibility): eligibility is SupportEligibility => !!eligibility,
    )
    .sort((left, right) => left.unitId.localeCompare(right.unitId));
}

export function eligibleSupportIds(
  state: GameState,
  side: Side,
  targetHexId: string,
  impulse: number,
): Set<string> {
  return new Set(
    getEligibleSupportUnits(state, side, targetHexId, undefined, impulse)
      .filter((entry) => entry.eligible)
      .map((entry) => entry.unitId),
  );
}
