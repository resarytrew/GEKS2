/**
 * Core type system for Baltic Front 1941.
 *
 * These interfaces are intentionally framework-agnostic. The game engine
 * (rules, command/event, reducer) operates purely on these shapes and has no
 * dependency on React, the DOM, or any renderer. This keeps it runnable in
 * Node.js, fully testable, deterministic and replayable.
 */

export type Side = "germany" | "ussr";

export type EntityStatus =
  | "active"
  | "disrupted"
  | "retreated"
  | "captured"
  | "eliminated";

export interface MapEntity {
  id: string;
  side: Side;
  hexId: string;
  entityType: "combat_unit" | "headquarters" | "support" | "depot";
  stackingCost: number;
  status: EntityStatus;
}

export type Terrain =
  | "clear"
  | "forest"
  | "dense_forest"
  | "swamp"
  | "city"
  | "major_city"
  | "fortified"
  | "coast"
  | "lake"
  | "sea";

export type Control = "germany" | "ussr" | "contested" | "neutral";

export type BridgeType = "road" | "railway" | "combined";
export type BridgeState =
  | "intact"
  | "damaged"
  | "prepared_for_demolition"
  | "destroyed"
  | "pontoon";

export interface Bridge {
  edge: number;
  type: BridgeType;
  state: BridgeState;
}

export interface Settlement {
  id: string;
  name: string;
  importance: "minor" | "regional" | "major" | "strategic";
  victoryPoints: number;
  supplyCapacity: number;
}

export interface HistoricalSourceReference {
  sourceId: string;
  title: string;
  author?: string;
  archive?: string;
  url?: string;
  page?: string;
  confidence:
    | "confirmed"
    | "probable"
    | "reconstructed"
    | "disputed"
    | "placeholder";
  notes?: string;
}

export type HistoricalSourceKind =
  | "primary_document"
  | "archive_collection"
  | "academic_study"
  | "reference_work"
  | "open_oob"
  | "modern_geodata";

/**
 * Machine-readable editorial record. A source can support the existence of an
 * event without confirming every unit coordinate or gameplay abstraction.
 */
export interface HistoricalSourceRecord extends HistoricalSourceReference {
  kind: HistoricalSourceKind;
  publisher?: string;
  accessedOn: string;
  supports: string[];
  limitations: string[];
}

export interface HexState {
  id: string;
  q: number;
  r: number;
  terrain: Terrain;
  elevation?: number;
  riverEdges: number[];
  roadEdges: number[];
  majorRoadEdges: number[];
  railwayEdges: number[];
  bridgeEdges: Bridge[];
  settlement?: Settlement;
  control: Control;
  fortificationLevel: number;
  interdictionLevel: number;
  stackUnitIds: string[];
  /** geographic anchor used for educational labels */
  lon?: number;
  lat?: number;
}

export type Echelon =
  | "division"
  | "brigade"
  | "regiment"
  | "corps_hq"
  | "army_hq"
  | "front_hq"
  | "support";

export type UnitType =
  | "infantry"
  | "rifle"
  | "motorized"
  | "tank"
  | "mechanized"
  | "cavalry"
  | "artillery"
  | "engineer"
  | "air"
  | "headquarters"
  | "security";

export type SupplyState = "full" | "limited" | "low" | "isolated" | "none";

export type CommandState =
  | "in_command"
  | "delayed"
  | "out_of_command"
  | "disorganized";

export type MovementClass = "foot" | "motorized" | "tracked" | "rail" | "air";

export type AmmunitionState = "normal" | "low" | "critical" | "empty";

export interface DefensivePosture {
  level: 0 | 1 | 2 | 3;
  establishedAtImpulse: number;
  fallbackHexId?: string;
}

export interface SupplyExplanation {
  state: SupplyState;
  sourceId?: string;
  route?: string[];
  limitingFactors: string[];
}

export type UnitOrderType =
  | "move"
  | "attack"
  | "defend"
  | "delay"
  | "withdraw"
  | "hold"
  | "reserve"
  | "none";

export interface UnitOrder {
  type: UnitOrderType;
  targetHexId?: string;
  assignedAtTurn: number;
}

export interface StatusEffect {
  id: string;
  kind: string;
  label: string;
  turnsRemaining: number;
  data?: Record<string, unknown>;
}

export interface UnitState extends MapEntity {
  id: string;
  historicalName: string;
  shortName: string;
  side: Side;
  echelon: Echelon;
  unitType: UnitType;
  parentCorpsId?: string;
  parentArmyId?: string;
  parentFrontId?: string;
  temporaryCommandId?: string;
  hexId: string;
  attack: number;
  defense: number;
  movement: number;
  quality: number; // 1..5
  morale: number; // 0..100
  organization: number; // 0..100
  maxSteps: number;
  currentSteps: number;
  stackingCost: number;
  fuel: number; // 0..100
  ammunition: number; // 0..100
  supplyState: SupplyState;
  commandState: CommandState;
  fatigue: number; // 0..100
  movementClass: MovementClass;
  traits: string[];
  commanderId?: string;
  order?: UnitOrder;
  statusEffects: StatusEffect[];
  historicalSources: HistoricalSourceReference[];
  /** runtime: already used its action this turn */
  acted?: boolean;
  eliminated?: boolean;
  encirclementState?:
    | "none"
    | "threatened_with_encirclement"
    | "partially_encircled"
    | "encircled"
    | "isolated";
  defensivePosture?: DefensivePosture;
  supplyExplanation?: SupplyExplanation;
  lastMovedAtImpulse?: number;
}

export type HqEchelon = "corps_hq" | "army_hq" | "front_hq";

export interface HeadquartersState extends UnitState {
  name: string;
  echelon: HqEchelon;
  unitType: "headquarters";
  entityType: "headquarters";
  commandRange: number; // hexes
  commandPoints: number; // pool available this turn
  maxCommandPoints: number;
  throughput: number;
  commQuality: number; // 1..5
  initiative: number; // 1..5
  parentArmyId?: string;
  unitIds: string[];
  movedThisTurn: boolean;
  captured?: boolean;
}

export type GameEntity = UnitState | HeadquartersState;

export type CardType =
  | "operational"
  | "staff"
  | "air"
  | "engineer"
  | "political"
  | "directive"
  | "opportunity"
  | "problem"
  | "commander"
  | "recon"
  | "logistics";

export interface CardEffect {
  kind:
    | "destroy_bridge"
    | "add_trait"
    | "air_support"
    | "extra_advance"
    | "activate_ooc"
    | "restore_org"
    | "recon_reveal"
    | "temp_initiative"
    | "reinforce_org"
    | "build_pontoon";
  durationTurns?: number;
  value?: number;
  trait?: string;
}

export interface CardDefinition {
  defId: string;
  side: Side;
  type: CardType;
  title: string;
  text: string;
  commandCost: number;
  effects: CardEffect[];
  /** turn window in which the card may be drawn/played */
  availableFromTurn?: number;
  availableToTurn?: number;
  mandatory?: boolean;
  reaction?: boolean;
  conditionNote?: string;
  historicalSources: HistoricalSourceReference[];
}

export interface CardInstance {
  id: string;
  defId: string;
  state: "deck" | "hand" | "committed" | "resolved" | "discard" | "removed";
  resolvedAtTurn?: number;
}

export interface HistoricalDeadline {
  historicalDate: string;
  targetTurn: number;
  scoringCurve: {
    earlyPerTurn: number;
    latePerTurn: number;
    minimum: number;
    maximum: number;
  };
}

export type ObjectiveKind =
  | "capture_hex"
  | "hold_hex"
  | "delay_until_turn"
  | "destroy_units"
  | "preserve_units"
  | "destroy_bridges"
  | "reach_turn";

export interface ObjectiveState {
  id: string;
  side: Side;
  kind: ObjectiveKind;
  description: string;
  targetHexId?: string;
  targetTypeSide?: Side;
  requiredTurn?: number;
  points: number;
  status: "active" | "completed" | "failed";
  historicalBaseline?: string;
  deadline?: HistoricalDeadline;
}

export interface SideScore {
  operationalPoints: number;
  territorialPoints: number;
  delayPoints: number;
  preservationPoints: number;
  destructionPoints: number;
  objectivePoints: number;
  penalties: number;
}

export interface WeatherState {
  condition: "clear" | "overcast" | "rain" | "storm" | "mud";
  label: string;
  movementModifier: number; // added to cost
  airPointsModifier: number;
}

export interface AirOperationsState {
  germanyAirPoints: number;
  sovietAirPoints: number;
  reconRevealedHexIds: string[];
  interdictedHexIds: string[];
}

export interface CombatStep {
  phase: string;
  description: string;
  attackerLosses: number;
  defenderLosses: number;
  roll?: number;
}

export interface CombatResolution {
  id: string;
  attackerIds: string[];
  defenderIds: string[];
  defenderHexId: string;
  odds: number;
  attackerStrength: number;
  defenderStrength: number;
  outcome:
    | "no_effect"
    | "defender_disorganized"
    | "attacker_step_loss"
    | "defender_step_loss"
    | "defender_retreat"
    | "exchange"
    | "attacker_repulsed"
    | "defender_destroyed"
    | "breakthrough";
  steps: CombatStep[];
  attackerLossSteps: number;
  defenderLossSteps: number;
  retreatPath: string[];
  advanceHexId?: string;
  contactId?: string;
  roll?: number;
  lossAllocations?: LossAllocation[];
  ammunitionSpent?: Record<string, number>;
}

export interface LossAllocation {
  mandatory: Array<{
    unitId: string;
    steps: number;
  }>;
  selectable?: {
    side: Side;
    steps: number;
    eligibleUnitIds: string[];
  };
}

export interface DecisionState {
  id: string;
  kind: string;
  prompt: string;
  options: Array<{ id: string; label: string; effect?: string }>;
}

export type LegacyGamePhase =
  | "morning_report"
  | "events"
  | "command"
  | "air"
  | "activation"
  | "combat"
  | "exploitation"
  | "supply"
  | "end_of_day";

export type GamePhase =
  | "morning_report"
  | "events"
  | "planning"
  | "plans_locked"
  | "execution"
  | "reaction"
  | "supply"
  | "after_action"
  | "end_of_day"
  | "command"
  | "air"
  | "activation"
  | "combat"
  | "exploitation";

export type PlannedOrderType =
  | "march"
  | "advance"
  | "prepared_attack"
  | "defend"
  | "delay"
  | "withdraw"
  | "reserve"
  | "recover"
  | "prepare_demolition"
  | "build_pontoon";

export interface PlannedOrder {
  id: string;
  side: Side;
  entityIds: string[];
  orderType: PlannedOrderType;
  route?: string[];
  targetHexId?: string;
  targetEntityIds?: string[];
  startImpulse: number;
  actualStartImpulse?: number;
  priority: number;
  contactPolicy: "avoid" | "recon" | "fix" | "attack" | "assault";
  lossTolerance: "low" | "normal" | "high";
  waitForEntityIds?: string[];
  supportIds?: string[];
  cardIds?: string[];
  status:
    | "draft"
    | "committed"
    | "executing"
    | "completed"
    | "delayed"
    | "failed"
    | "cancelled";
  progressIndex?: number;
  delayReasons?: string[];
  movementSpentThisImpulse?: number;
  remainingMovementBudget?: number;
  fallbackHexId?: string;
  fallbackRoute?: string[];
  bridgeHexId?: string;
  bridgeEdge?: number;
  engineeringProgress?: number;
  reserveData?: ReserveOrderData;
  completedAtImpulse?: number;
  failureReason?: string;
}

export interface ReserveOrderData {
  triggerRadius: number;
  triggerConditions: Array<
    | "friendly_contact"
    | "friendly_retreat"
    | "enemy_breakthrough"
    | "meeting_engagement"
    | "objective_threatened"
  >;
  targetPriority: string[];
  maxCommitImpulse: number;
}

export interface ImpulseMovementBudget {
  available: number;
  spent: number;
  remaining: number;
}

export type ReactionCondition =
  | "enemy_approaches_bridge"
  | "encirclement_threat"
  | "contact_created"
  | "friendly_contact"
  | "enemy_breakthrough"
  | "loss_threshold"
  | "route_blocked";

export interface PlannedReaction {
  id: string;
  side: Side;
  entityIds: string[];
  condition: ReactionCondition;
  targetHexId?: string;
  edge?: number;
  commandCost: number;
  priority: number;
  fromImpulse: number;
  toImpulse: number;
  maxUses: number;
  uses: number;
  status: "draft" | "committed" | "resolved" | "expired" | "cancelled";
  fallbackRoute?: string[];
  lossThreshold?: number;
}

export interface SidePlan {
  side: Side;
  orders: PlannedOrder[];
  reactions: PlannedReaction[];
  committed: boolean;
  committedAt?: number;
}

export type ContactType =
  | "MEETING_ENGAGEMENT"
  | "HASTY_ATTACK"
  | "PREPARED_ATTACK"
  | "DELAYING_ACTION"
  | "PURSUIT"
  | "BLOCKED_ROUTE"
  | "ATTACK";

export interface ContactState {
  id: string;
  hexId: string;
  type: ContactType;
  impulse: number;
  detectedBy: Side[];
  resolved: boolean;
  attackerSide?: Side;
  defenderSide?: Side;
  attackerParticipantIds: string[];
  defenderParticipantIds: string[];
  attackerSupportIds: string[];
  defenderSupportIds: string[];
  attackerReserveIds: string[];
  defenderReserveIds: string[];
  /** @deprecated v0.4 compatibility; normalized on load/use. */
  entityIds?: string[];
  /** @deprecated v0.4 compatibility; normalized on load/use. */
  participantIds?: string[];
  /** @deprecated v0.4 compatibility; normalized on load/use. */
  supportIds?: string[];
  /** @deprecated v0.4 compatibility; normalized on load/use. */
  reserveIds?: string[];
  createdAtImpulse?: number;
  status?: "detected" | "forming" | "ready" | "resolving" | "resolved" | "cancelled";
  resolutionId?: string;
  sourceOrderIds?: string[];
}

export type SupportType = "artillery" | "heavy_at" | "air";

export interface SupportUsage {
  unitId: string;
  impulse: number;
  contactId: string;
}

export interface MovementIntent {
  orderId: string;
  side: Side;
  entityIds: string[];
  fromHexId: string;
  toHexId: string;
}

export interface ValidatedMovementIntent extends MovementIntent {
  movementCost: number;
  fuelCosts: Record<string, number>;
  canEnter: boolean;
  stopAfterEntry: boolean;
  blockingReason?: string;
}

export interface TemporaryCommandEffect {
  id: string;
  targetHqId: string;
  commandPointModifier: number;
  initiativeModifier: number;
  withdrawalDelayModifier?: number;
  startsAtTurn: number;
  expiresAfterTurn: number;
}

export interface ScoreChange {
  side: Side;
  category: keyof SideScore;
  points: number;
  eventId: string;
}

export interface ImpulseReport {
  impulse: number;
  label: string;
  eventStartIndex: number;
  eventEndIndex: number;
  progressedOrderIds: string[];
  completedOrderIds: string[];
  failedOrderIds: string[];
  contactIds: string[];
  combatIds: string[];
}

export interface DailyAfterActionReport {
  turn: number;
  date: string;
  impulses: ImpulseReport[];
  combats: CombatResolution[];
  destroyedUnits: string[];
  damagedThisTurn: string[];
  understrengthUnits: string[];
  /** @deprecated v0.4 compatibility alias for damagedThisTurn. */
  damagedUnits: string[];
  capturedObjectives: string[];
  bridgesDestroyed: string[];
  commandFailures: string[];
  supplyChanges: string[];
  scoreChanges: ScoreChange[];
  orderSummary: Record<
    Side,
    Array<{
      orderId: string;
      orderType: PlannedOrderType;
      status: PlannedOrder["status"];
      visible: boolean;
    }>
  >;
}

export interface SupplySource {
  id: string;
  side: Side;
  hexId: string;
  kind: "map_edge" | "rear_base" | "port" | "scenario";
  capacity: number;
  active: boolean;
  sourceIds: string[];
}

export interface GameCommand {
  type:
    | "ASSIGN_ORDER"
    | "MOVE_STACK"
    | "DECLARE_ATTACK"
    | "PLAY_CARD"
    | "END_ACTIVATION"
    | "END_PHASE"
    | "PREPARE_BRIDGE_DEMOLITION"
    | "DETONATE_BRIDGE"
    | "BUILD_PONTOON"
    | "REPAIR_BRIDGE"
    | "DESTROY_BRIDGE"
    | "CONFIRM_COMBAT"
    | "RESOLVE_COMBAT"
    | "RESOLVE_RETREAT"
    | "UPSERT_PLANNED_ORDER"
    | "REMOVE_PLANNED_ORDER"
    | "UPSERT_REACTION"
    | "COMMIT_PLAN"
    | "EXECUTE_IMPULSE"
    | "NEW_GAME";
  playerId?: string;
  unitIds?: string[];
  order?: UnitOrder;
  destinationHexId?: string;
  path?: string[];
  defenderHexId?: string;
  supportIds?: string[];
  cardIds?: string[];
  cardId?: string;
  targets?: string[];
  edge?: number;
  options?: { seed?: number; scenarioId?: string; mode?: string; name?: string };
  side?: Side;
  plannedOrder?: PlannedOrder;
  reaction?: PlannedReaction;
  plannedOrderId?: string;
  advanceUnitId?: string;
  commandId?: string;
  expectedVersion?: number;
  idempotencyKey?: string;
}

export type GameEvent =
  | { type: "ORDER_ASSIGNED"; unitId: string; order: UnitOrder }
  | { type: "UNIT_MOVED"; unitId: string; from: string; to: string; fuelSpent: number }
  | { type: "FUEL_SPENT"; unitId: string; amount: number }
  | { type: "COMBAT_DECLARED"; combatId: string }
  | { type: "DICE_ROLLED"; value: number; rngCursor: number; tag?: string }
  | { type: "UNIT_LOST_STEP"; unitId: string; amount: number }
  | { type: "UNIT_ELIMINATED"; unitId: string }
  | { type: "UNIT_RETREATED"; unitId: string; path: string[] }
  | { type: "UNIT_ADVANCED"; unitId: string; to: string }
  | { type: "UNIT_DISORGANIZED"; unitId: string }
  | { type: "HEX_CONTROL_CHANGED"; hexId: string; side: Control }
  | { type: "BRIDGE_DESTROYED"; hexId: string; edge: number }
  | { type: "BRIDGE_DAMAGED"; hexId: string; edge: number }
  | { type: "BRIDGE_PREPARED"; hexId: string; edge: number; side: Side }
  | { type: "BRIDGE_REPAIRED"; hexId: string; edge: number }
  | { type: "PONTOON_BUILT"; hexId: string; edge: number }
  | { type: "CARD_PLAYED"; cardId: string; defId: string }
  | { type: "CARD_DRAWN"; cardId: string; defId: string; side: Side }
  | { type: "COMMAND_POINTS_SPENT"; side: Side; hqId: string; amount: number }
  | { type: "OBJECTIVE_COMPLETED"; objectiveId: string; side: Side; points: number }
  | { type: "OBJECTIVE_FAILED"; objectiveId: string; side: Side }
  | { type: "PHASE_CHANGED"; phase: GamePhase }
  | { type: "TURN_ADVANCED"; turn: number; date: string }
  | { type: "SUPPLY_UPDATED"; unitId: string; state: SupplyState }
  | { type: "WEATHER_CHANGED"; condition: WeatherState["condition"] }
  | { type: "EVENT_TRIGGERED"; eventId: string; title: string }
  | { type: "GAME_COMPLETED"; winner: Side; resultType: string }
  | { type: "SCORE_AWARDED"; scoreEventId: string; side: Side; category: keyof SideScore; points: number }
  | { type: "HQ_DISRUPTED"; hqId: string }
  | { type: "HQ_RETREATED"; hqId: string; path: string[] }
  | { type: "HQ_CAPTURED"; hqId: string; by: Side }
  | { type: "COMMAND_NETWORK_BROKEN"; hqId: string }
  | { type: "SUBORDINATES_OUT_OF_COMMAND"; hqId: string; unitIds: string[] }
  | { type: "PLAN_COMMITTED"; side: Side }
  | { type: "PLANS_LOCKED" }
  | { type: "ORDER_DELAYED"; orderId: string; untilImpulse: number; reasons: string[] }
  | { type: "ORDER_FAILED"; orderId: string; reason: string }
  | { type: "ORDER_PROGRESS"; orderId: string; status: PlannedOrder["status"]; reason?: string }
  | { type: "ORDER_BLOCKED"; orderId: string; hexId: string; reason: string }
  | { type: "ORDER_COMPLETED"; orderId: string; orderType: PlannedOrderType }
  | { type: "IMPULSE_STARTED"; impulse: number; label: string }
  | { type: "IMPULSE_COMPLETED"; impulse: number }
  | { type: "MEETING_ENGAGEMENT"; contactId: string; hexId: string; entityIds: string[] }
  | { type: "CONTACT_CREATED"; contactId: string; contactType: ContactType; hexId: string }
  | { type: "CONTACT_RESOLVED"; contactId: string; resolutionId: string }
  | { type: "COMBAT_RESOLVED"; combatId: string; contactId?: string; outcome: CombatResolution["outcome"] }
  | { type: "AMMUNITION_SPENT"; unitId: string; amount: number }
  | { type: "FUEL_CRITICAL"; unitId: string }
  | { type: "UNIT_HALTED_NO_FUEL"; unitId: string; orderId: string }
  | { type: "ADVANCE_AFTER_COMBAT"; unitId: string; to: string; contactId: string }
  | { type: "BREAKTHROUGH_CONTINUED"; orderId: string; unitId: string }
  | { type: "ADVANCE_HALTED"; orderId: string; reason: string }
  | { type: "DELAYING_ACTION_STARTED"; contactId: string; unitIds: string[] }
  | { type: "ENEMY_ADVANCE_DELAYED"; orderId: string; untilImpulse: number }
  | { type: "DELAYING_FORCE_WITHDREW"; unitId: string; path: string[] }
  | { type: "DELAYING_FORCE_PINNED"; unitId: string }
  | { type: "RESERVE_COMMITTED"; orderId: string; contactId: string; unitIds: string[] }
  | { type: "RESERVE_NOT_COMMITTED"; orderId: string }
  | { type: "ORDER_ABORTED_BY_LOSSES"; orderId: string; lossSteps: number; threshold: number }
  | { type: "PONTOON_COMPLETED"; orderId: string; hexId: string; edge: number }
  | { type: "RECOVERY_PROGRESS"; orderId: string; unitId: string; organizationGained: number }
  | { type: "REACTION_FAILED"; reactionId: string; reason: string }
  | { type: "REACTION_TRIGGERED"; reactionId: string }
  | { type: "AFTER_ACTION_REPORT_CREATED"; turn: number }
  | { type: "EFFECT_EXPIRED"; effectId: string; entityId?: string };

export interface GameState {
  schemaVersion: number;
  engineVersion: string;
  scenarioVersion: string;
  version: number;
  scenarioId: string;
  matchId: string;
  mode: string;
  turn: number;
  date: string;
  phase: GamePhase;
  activeSide: Side;
  initiativeSide: Side;
  seed: number;
  rngCursor: number;
  hexes: Record<string, HexState>;
  units: Record<string, UnitState>;
  headquarters: Record<string, HeadquartersState>;
  cards: Record<string, CardInstance>;
  playerHands: Record<Side, string[]>;
  cardDeck: string[];
  objectives: ObjectiveState[];
  scores: Record<Side, SideScore>;
  weather: WeatherState;
  airState: AirOperationsState;
  pendingCombat?: CombatResolution;
  pendingDecisions: DecisionState[];
  /** transient combat-report the UI reads after a battle is resolved */
  lastCombat?: CombatResolution;
  /** one-shot bonuses queued by event cards, consumed by the next combat */
  pendingAirSupport?: { side: Side; value: number };
  pendingExtraAdvance?: Side;
  sideActivationDone: Record<Side, boolean>;
  eventLog: GameEvent[];
  status: "lobby" | "active" | "completed" | "abandoned";
  winner?: Side;
  resultType?: string;
  /** transient per-turn bookkeeping for the engine */
  activationsThisPhase: Record<Side, number>;
  maxActivationsPerPhase: number;
  plans: Record<Side, SidePlan>;
  impulse: number;
  contacts: ContactState[];
  supplySources: Record<string, SupplySource>;
  scoreEventIds: string[];
  processedCommandIds: string[];
  preparedBridgeDemolitions: Record<string, { side: Side; preparedById?: string }>;
  temporaryCommandEffects: TemporaryCommandEffect[];
  supportUsage: SupportUsage[];
  turnStartedAtEventIndex: number;
  impulseReports: ImpulseReport[];
  combatResolutions: CombatResolution[];
  afterActionReport?: DailyAfterActionReport;
}

export interface CommandValidationError {
  code: string;
  message: string;
  relatedEntityIds?: string[];
}

export interface CommandValidationResult {
  valid: boolean;
  errors: CommandValidationError[];
}

export interface CommandResult {
  ok: boolean;
  errors: CommandValidationError[];
  events: GameEvent[];
}

export interface SaveGame {
  schemaVersion: number;
  engineVersion: string;
  scenarioVersion: string;
  stateVersion: number;
  scenarioId: string;
  matchId: string;
  mode: string;
  seed: number;
  commands: GameCommand[];
}
