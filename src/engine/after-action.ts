import type {
  DailyAfterActionReport,
  GameEvent,
  GameState,
  Side,
} from "@/engine/types";

export function buildAfterActionReport(
  state: GameState,
  currentEvents: GameEvent[] = [],
): DailyAfterActionReport {
  const events = [...state.eventLog, ...currentEvents];
  const turnEvents = events.slice(
    Math.max(0, state.turnStartedAtEventIndex),
  );
  const destroyedUnits = turnEvents
    .filter(
      (event): event is Extract<GameEvent, { type: "UNIT_ELIMINATED" }> =>
        event.type === "UNIT_ELIMINATED",
    )
    .map((event) => event.unitId);
  const damagedThisTurn = [
    ...new Set(
      turnEvents
        .filter(
          (
            event,
          ): event is Extract<GameEvent, { type: "UNIT_LOST_STEP" }> =>
            event.type === "UNIT_LOST_STEP",
        )
        .map((event) => event.unitId),
    ),
  ].sort();
  const understrengthUnits = Object.values(state.units)
    .filter(
      (unit) =>
        !unit.eliminated &&
        unit.entityType === "combat_unit" &&
        unit.currentSteps < unit.maxSteps,
    )
    .map((unit) => unit.id)
    .sort();
  const capturedObjectives = turnEvents
    .filter(
      (
        event,
      ): event is Extract<GameEvent, { type: "OBJECTIVE_COMPLETED" }> =>
        event.type === "OBJECTIVE_COMPLETED",
    )
    .map((event) => event.objectiveId);
  const bridgesDestroyed = turnEvents
    .filter(
      (event): event is Extract<GameEvent, { type: "BRIDGE_DESTROYED" }> =>
        event.type === "BRIDGE_DESTROYED",
    )
    .map((event) => `${event.hexId}:${event.edge}`);
  const commandFailures = turnEvents
    .filter(
      (event): event is Extract<GameEvent, { type: "ORDER_FAILED" }> =>
        event.type === "ORDER_FAILED",
    )
    .map((event) => `${event.orderId}: ${event.reason}`);
  const supplyChanges = turnEvents
    .filter(
      (event): event is Extract<GameEvent, { type: "SUPPLY_UPDATED" }> =>
        event.type === "SUPPLY_UPDATED",
    )
    .map((event) => `${event.unitId}: ${event.state}`);
  const scoreChanges = turnEvents
    .filter(
      (event): event is Extract<GameEvent, { type: "SCORE_AWARDED" }> =>
        event.type === "SCORE_AWARDED",
    )
    .map((event) => ({
      side: event.side,
      category: event.category,
      points: event.points,
      eventId: event.scoreEventId,
    }));
  const orderSummary = Object.fromEntries(
    (["germany", "ussr"] as Side[]).map((side) => [
      side,
      state.plans[side].orders.map((order) => ({
        orderId: order.id,
        orderType: order.orderType,
        status: order.status,
        visible: true,
      })),
    ]),
  ) as DailyAfterActionReport["orderSummary"];
  return {
    turn: state.turn,
    date: state.date,
    impulses: structuredClone(state.impulseReports),
    combats: structuredClone(
      state.combatResolutions.filter((combat) =>
        combat.id.startsWith(`combat:${state.turn}:`),
      ),
    ),
    destroyedUnits: [...new Set(destroyedUnits)],
    damagedThisTurn,
    understrengthUnits,
    damagedUnits: damagedThisTurn,
    capturedObjectives: [...new Set(capturedObjectives)],
    bridgesDestroyed: [...new Set(bridgesDestroyed)],
    commandFailures,
    supplyChanges,
    scoreChanges,
    orderSummary,
  };
}
