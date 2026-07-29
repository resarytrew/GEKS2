import type { GameState, Side, UnitState } from "@/engine/types";

export interface CombatModifier {
  id: string;
  label: string;
  multiplier: number;
  source: "terrain" | "command" | "supply" | "support" | "armor" | "direction";
  public: boolean;
}

export interface CombatParticipant {
  entityId: string;
  baseStrength: number;
  effectiveStrength: number;
}

export interface CombatExpectedRange {
  minimumRatio: number;
  expectedRatio: number;
  maximumRatio: number;
}

export interface CombatHiddenFactor {
  id: string;
  description: string;
}

export interface CombatRngInput {
  tag: string;
  minimum: number;
  maximum: number;
}

export interface CombatDeclaration {
  attackerIds: string[];
  defenderHexId: string;
  airBonus?: number;
}

export interface CombatModel {
  attackers: CombatParticipant[];
  defenders: CombatParticipant[];
  terrainModifiers: CombatModifier[];
  commandModifiers: CombatModifier[];
  supplyModifiers: CombatModifier[];
  supportModifiers: CombatModifier[];
  armorModifiers: CombatModifier[];
  directionModifiers: CombatModifier[];
  expectedRange: CombatExpectedRange;
  hiddenFactors: CombatHiddenFactor[];
  rngInputs: CombatRngInput[];
  attackerStrength: number;
  defenderStrength: number;
  ratio: number;
  penetratesHeavyArmor: boolean;
}

const enemyOf = (side: Side): Side => (side === "germany" ? "ussr" : "germany");

function stepFactor(unit: UnitState): number {
  return 0.5 + 0.5 * (unit.currentSteps / unit.maxSteps);
}

function supplyFactor(unit: UnitState): number {
  return { full: 1, limited: 0.9, low: 0.8, isolated: 0.6, none: 0.4 }[unit.supplyState];
}

function commandFactor(unit: UnitState): number {
  return { in_command: 1, delayed: 0.9, out_of_command: 0.75, disorganized: 0.6 }[
    unit.commandState
  ];
}

function isCombatUnit(unit: UnitState | undefined): unit is UnitState {
  return !!unit && !unit.eliminated && unit.entityType === "combat_unit" && unit.currentSteps > 0;
}

function attackStrength(unit: UnitState): number {
  let strength =
    unit.attack * stepFactor(unit) * supplyFactor(unit) * commandFactor(unit) +
    (unit.quality - 3) * 0.4;
  if (unit.organization < 40) strength *= 0.85;
  return Math.max(0, strength);
}

function defenseStrength(state: GameState, unit: UnitState): number {
  let strength =
    unit.defense * stepFactor(unit) * supplyFactor(unit) * commandFactor(unit) +
    (unit.quality - 3) * 0.3;
  if (unit.organization < 40) strength *= 0.85;
  const hex = state.hexes[unit.hexId];
  if (hex) {
    if (hex.terrain === "forest" || hex.terrain === "city") strength *= 1.2;
    if (hex.terrain === "dense_forest" || hex.terrain === "swamp") strength *= 1.4;
    if (hex.terrain === "major_city" || hex.terrain === "fortified") strength *= 1.5;
    strength *= 1 + hex.fortificationLevel * 0.25;
  }
  return Math.max(0.5, strength);
}

export function buildCombatModel(state: GameState, declaration: CombatDeclaration): CombatModel {
  const attackers = declaration.attackerIds.map((id) => state.units[id]).filter(isCombatUnit);
  const attackerSide = attackers[0]?.side ?? "germany";
  const defenderUnits = (state.hexes[declaration.defenderHexId]?.stackUnitIds ?? [])
    .map((id) => state.units[id])
    .filter((unit): unit is UnitState => isCombatUnit(unit) && unit.side === enemyOf(attackerSide));
  const airBonus = declaration.airBonus ?? 0;
  const penetratesHeavyArmor =
    airBonus > 0 ||
    attackers.some((unit) => unit.traits.includes("combined_arms") || unit.traits.includes("heavy_at")) ||
    attackers.some((unit) => unit.unitType === "engineer");
  const heavyArmor = defenderUnits.some(
    (unit) =>
      unit.traits.includes("heavy_armor") ||
      unit.statusEffects.some(
        (effect) => effect.kind === "add_trait" && effect.data?.trait === "heavy_armor",
      ),
  );
  const armorModifiers: CombatModifier[] =
    heavyArmor && !penetratesHeavyArmor
      ? [
          {
            id: "heavy_armor",
            label: "Тяжёлая броня",
            multiplier: 0.6,
            source: "armor",
            public: true,
          },
        ]
      : [];
  const attackerBase = attackers.reduce((sum, unit) => sum + attackStrength(unit), 0) + airBonus;
  const defenderBase = defenderUnits.reduce((sum, unit) => sum + defenseStrength(state, unit), 0);
  const armorMultiplier = armorModifiers.reduce((value, modifier) => value * modifier.multiplier, 1);
  const ratio = Math.max(0.2, Math.min(6, defenderBase > 0 ? (attackerBase / defenderBase) * armorMultiplier : 6));
  const rounded = (value: number) => Math.round(value * 10) / 10;
  return {
    attackers: attackers.map((unit) => ({
      entityId: unit.id,
      baseStrength: rounded(unit.attack),
      effectiveStrength: rounded(attackStrength(unit)),
    })),
    defenders: defenderUnits.map((unit) => ({
      entityId: unit.id,
      baseStrength: rounded(unit.defense),
      effectiveStrength: rounded(defenseStrength(state, unit)),
    })),
    terrainModifiers: [],
    commandModifiers: [],
    supplyModifiers: [],
    supportModifiers:
      airBonus > 0
        ? [{ id: "air_support", label: "Авиационная поддержка", multiplier: 1, source: "support", public: true }]
        : [],
    armorModifiers,
    directionModifiers: [],
    expectedRange: {
      minimumRatio: rounded(Math.max(0.2, ratio * 0.8)),
      expectedRatio: rounded(ratio),
      maximumRatio: rounded(Math.min(6, ratio * 1.2)),
    },
    hiddenFactors: [],
    rngInputs: [{ tag: "combat", minimum: 1, maximum: 6 }],
    attackerStrength: rounded(attackerBase),
    defenderStrength: rounded(defenderBase),
    ratio: rounded(ratio),
    penetratesHeavyArmor,
  };
}
