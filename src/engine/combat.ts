import type {
  AmmunitionState,
  ContactType,
  GameState,
  PlannedOrderType,
  Side,
  UnitState,
} from "@/engine/types";

export interface CombatModifier {
  id: string;
  label: string;
  multiplier: number;
  source:
    | "terrain"
    | "command"
    | "supply"
    | "support"
    | "armor"
    | "direction"
    | "posture"
    | "order";
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
  defenderIds?: string[];
  airBonus?: number;
  supportIds?: string[];
  contactType?: ContactType;
  attackerOrderTypes?: PlannedOrderType[];
  defenderOrderTypes?: PlannedOrderType[];
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
  postureModifiers: CombatModifier[];
  orderModifiers: CombatModifier[];
  expectedRange: CombatExpectedRange;
  hiddenFactors: CombatHiddenFactor[];
  rngInputs: CombatRngInput[];
  attackerStrength: number;
  defenderStrength: number;
  ratio: number;
  penetratesHeavyArmor: boolean;
}

const enemyOf = (side: Side): Side =>
  side === "germany" ? "ussr" : "germany";

const round1 = (value: number): number => Math.round(value * 10) / 10;

function stepFactor(unit: UnitState): number {
  return 0.5 + 0.5 * (unit.currentSteps / unit.maxSteps);
}

function supplyFactor(unit: UnitState): number {
  return {
    full: 1,
    limited: 0.9,
    low: 0.8,
    isolated: 0.6,
    none: 0.4,
  }[unit.supplyState];
}

function commandFactor(unit: UnitState): number {
  return {
    in_command: 1,
    delayed: 0.9,
    out_of_command: 0.75,
    disorganized: 0.6,
  }[unit.commandState];
}

export function ammunitionState(unit: UnitState): AmmunitionState {
  if (unit.ammunition <= 0) return "empty";
  if (unit.ammunition < 15) return "critical";
  if (unit.ammunition < 35) return "low";
  return "normal";
}

function ammunitionFactor(unit: UnitState, attacking: boolean): number {
  const state = ammunitionState(unit);
  if (state === "normal") return 1;
  if (state === "low") return attacking ? 0.85 : 0.9;
  if (state === "critical") return attacking ? 0.55 : 0.7;
  return attacking ? 0 : 0.35;
}

function isCombatUnit(unit: UnitState | undefined): unit is UnitState {
  return (
    !!unit &&
    !unit.eliminated &&
    unit.entityType === "combat_unit" &&
    unit.currentSteps > 0
  );
}

function attackStrength(unit: UnitState): number {
  let strength =
    unit.attack *
      stepFactor(unit) *
      supplyFactor(unit) *
      commandFactor(unit) *
      ammunitionFactor(unit, true) +
    (unit.quality - 3) * 0.4;
  if (unit.organization < 40) strength *= 0.85;
  return Math.max(0, strength);
}

function defenseStrength(state: GameState, unit: UnitState): number {
  let strength =
    unit.defense *
      stepFactor(unit) *
      supplyFactor(unit) *
      commandFactor(unit) *
      ammunitionFactor(unit, false) +
    (unit.quality - 3) * 0.3;
  if (unit.organization < 40) strength *= 0.85;
  const hex = state.hexes[unit.hexId];
  if (hex) {
    if (hex.terrain === "forest" || hex.terrain === "city") strength *= 1.2;
    if (hex.terrain === "dense_forest" || hex.terrain === "swamp") {
      strength *= 1.4;
    }
    if (hex.terrain === "major_city" || hex.terrain === "fortified") {
      strength *= 1.5;
    }
    strength *= 1 + hex.fortificationLevel * 0.25;
  }
  strength *= 1 + (unit.defensivePosture?.level ?? 0) * 0.1;
  return Math.max(0.5, strength);
}

function terrainMultiplier(state: GameState, hexId: string): number {
  const terrain = state.hexes[hexId]?.terrain;
  if (terrain === "major_city" || terrain === "fortified") return 1.5;
  if (terrain === "dense_forest" || terrain === "swamp") return 1.4;
  if (terrain === "forest" || terrain === "city") return 1.2;
  return 1;
}

export function buildCombatModel(
  state: GameState,
  declaration: CombatDeclaration,
): CombatModel {
  const attackers = declaration.attackerIds
    .map((id) => state.units[id])
    .filter(isCombatUnit);
  const attackerSide = attackers[0]?.side ?? "germany";
  const defenders = (
    declaration.defenderIds ??
    state.hexes[declaration.defenderHexId]?.stackUnitIds ??
    []
  )
    .map((id) => state.units[id])
    .filter(
      (unit): unit is UnitState =>
        isCombatUnit(unit) && unit.side === enemyOf(attackerSide),
    );
  const supportUnits = (declaration.supportIds ?? [])
    .map((id) => state.units[id])
    .filter(isCombatUnit);
  const airBonus = declaration.airBonus ?? 0;
  const penetratesHeavyArmor =
    airBonus > 0 ||
    attackers.some(
      (unit) =>
        unit.traits.includes("combined_arms") ||
        unit.traits.includes("heavy_at"),
    ) ||
    attackers.some((unit) => unit.unitType === "engineer");
  const heavyArmor = defenders.some(
    (unit) =>
      unit.traits.includes("heavy_armor") ||
      unit.statusEffects.some(
        (effect) =>
          effect.kind === "add_trait" &&
          effect.data?.trait === "heavy_armor",
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
  const orderMultiplier =
    declaration.contactType === "MEETING_ENGAGEMENT"
      ? declaration.attackerOrderTypes?.includes("march")
        ? 0.8
        : declaration.attackerOrderTypes?.includes("advance")
          ? 0.95
          : 0.9
      : declaration.attackerOrderTypes?.includes("prepared_attack")
        ? 1.1
        : 1;
  const supportStrength = supportUnits.reduce(
    (sum, unit) => sum + Math.max(0.5, attackStrength(unit) * 0.35),
    0,
  );
  const attackerStrength =
    (attackers.reduce((sum, unit) => sum + attackStrength(unit), 0) +
      supportStrength +
      airBonus) *
    orderMultiplier;
  const defenderStrength = defenders.reduce(
    (sum, unit) => sum + defenseStrength(state, unit),
    0,
  );
  const armorMultiplier = armorModifiers.reduce(
    (value, modifier) => value * modifier.multiplier,
    1,
  );
  const ratio = Math.max(
    0.2,
    Math.min(
      6,
      defenderStrength > 0
        ? (attackerStrength / defenderStrength) * armorMultiplier
        : 6,
    ),
  );
  const allParticipants = [...attackers, ...defenders];
  const terrainFactor = terrainMultiplier(state, declaration.defenderHexId);
  const commandModifiers = allParticipants
    .filter((unit) => commandFactor(unit) !== 1)
    .map((unit) => ({
      id: `command:${unit.id}`,
      label: `${unit.shortName}: ${unit.commandState}`,
      multiplier: commandFactor(unit),
      source: "command" as const,
      public: true,
    }));
  const supplyModifiers = allParticipants
    .filter(
      (unit) =>
        supplyFactor(unit) !== 1 ||
        ammunitionFactor(unit, unit.side === attackerSide) !== 1,
    )
    .map((unit) => ({
      id: `supply:${unit.id}`,
      label: `${unit.shortName}: снабжение ${unit.supplyState}, боеприпасы ${ammunitionState(unit)}`,
      multiplier:
        supplyFactor(unit) *
        ammunitionFactor(unit, unit.side === attackerSide),
      source: "supply" as const,
      public: true,
    }));
  const postureModifiers = defenders
    .filter((unit) => (unit.defensivePosture?.level ?? 0) > 0)
    .map((unit) => ({
      id: `posture:${unit.id}`,
      label: `${unit.shortName}: подготовленная оборона ${unit.defensivePosture!.level}`,
      multiplier: 1 + unit.defensivePosture!.level * 0.1,
      source: "posture" as const,
      public: true,
    }));
  const orderModifiers: CombatModifier[] =
    orderMultiplier === 1
      ? []
      : [
          {
            id: "attacker_order",
            label:
              declaration.contactType === "MEETING_ENGAGEMENT"
                ? declaration.attackerOrderTypes?.includes("march")
                  ? "Маршевый порядок во встречном бою"
                  : "Готовность к встречному бою"
                : "Подготовленная атака",
            multiplier: orderMultiplier,
            source: "order",
            public: true,
          },
        ];

  return {
    attackers: attackers.map((unit) => ({
      entityId: unit.id,
      baseStrength: round1(unit.attack),
      effectiveStrength: round1(attackStrength(unit)),
    })),
    defenders: defenders.map((unit) => ({
      entityId: unit.id,
      baseStrength: round1(unit.defense),
      effectiveStrength: round1(defenseStrength(state, unit)),
    })),
    terrainModifiers:
      terrainFactor === 1
        ? []
        : [
            {
              id: `terrain:${state.hexes[declaration.defenderHexId]?.terrain}`,
              label: `Местность: ${state.hexes[declaration.defenderHexId]?.terrain}`,
              multiplier: terrainFactor,
              source: "terrain",
              public: true,
            },
          ],
    commandModifiers,
    supplyModifiers,
    supportModifiers: [
      ...(airBonus > 0
        ? [
            {
              id: "air_support",
              label: "Авиационная поддержка",
              multiplier: 1,
              source: "support" as const,
              public: true,
            },
          ]
        : []),
      ...supportUnits.map((unit) => ({
        id: `support:${unit.id}`,
        label: `${unit.shortName}: поддержка`,
        multiplier: 1,
        source: "support" as const,
        public: true,
      })),
    ],
    armorModifiers,
    directionModifiers: [],
    postureModifiers,
    orderModifiers,
    expectedRange: {
      minimumRatio: round1(Math.max(0.2, ratio * 0.8)),
      expectedRatio: round1(ratio),
      maximumRatio: round1(Math.min(6, ratio * 1.2)),
    },
    hiddenFactors: [],
    rngInputs: [{ tag: "combat", minimum: 1, maximum: 6 }],
    attackerStrength: round1(attackerStrength),
    defenderStrength: round1(defenderStrength),
    ratio: round1(ratio),
    penetratesHeavyArmor,
  };
}
