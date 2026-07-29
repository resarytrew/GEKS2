import type { GameState } from "@/engine/types";
import { directionForEdge, getSharedEdge } from "@/engine/edges";

export interface StateInvariantViolation {
  code: string;
  message: string;
  entityIds?: string[];
  hexIds?: string[];
}

export function validateStateInvariants(
  state: GameState,
): StateInvariantViolation[] {
  const violations: StateInvariantViolation[] = [];
  const stackLocations = new Map<string, string[]>();

  for (const hex of Object.values(state.hexes)) {
    for (const unitId of hex.stackUnitIds) {
      const locations = stackLocations.get(unitId) ?? [];
      locations.push(hex.id);
      stackLocations.set(unitId, locations);
      const unit = state.units[unitId];
      if (!unit) {
        violations.push({
          code: "STACK_REFERENCES_MISSING_UNIT",
          message: `Hex ${hex.id} references missing unit ${unitId}.`,
          entityIds: [unitId],
          hexIds: [hex.id],
        });
      } else if (!unit.eliminated && unit.hexId !== hex.id) {
        violations.push({
          code: "UNIT_HEX_STACK_MISMATCH",
          message: `${unitId}.hexId does not match its stack.`,
          entityIds: [unitId],
          hexIds: [unit.hexId, hex.id],
        });
      }
    }
    for (const bridge of hex.bridgeEdges) {
      const direction = directionForEdge(bridge.edge);
      const shared =
        direction == null ? undefined : getSharedEdge(state, hex.id, direction);
      const reverse = shared?.to.bridgeEdges.find(
        (candidate) => candidate.edge === shared.toEdge,
      );
      if (
        !shared ||
        !reverse ||
        reverse.state !== bridge.state ||
        reverse.type !== bridge.type
      ) {
        violations.push({
          code: "ASYMMETRIC_SHARED_EDGE",
          message: `Bridge edge ${hex.id}:${bridge.edge} is not symmetric.`,
          hexIds: shared ? [hex.id, shared.to.id] : [hex.id],
        });
      }
    }
  }

  for (const unit of Object.values(state.units)) {
    if (unit.fuel < 0) {
      violations.push({
        code: "NEGATIVE_FUEL",
        message: `${unit.id} has negative fuel.`,
        entityIds: [unit.id],
      });
    }
    if (unit.ammunition < 0) {
      violations.push({
        code: "NEGATIVE_AMMUNITION",
        message: `${unit.id} has negative ammunition.`,
        entityIds: [unit.id],
      });
    }
    if (unit.currentSteps < 0) {
      violations.push({
        code: "NEGATIVE_STEPS",
        message: `${unit.id} has negative steps.`,
        entityIds: [unit.id],
      });
    }
    const locations = stackLocations.get(unit.id) ?? [];
    if (unit.eliminated && locations.length > 0) {
      violations.push({
        code: "ELIMINATED_UNIT_IN_STACK",
        message: `${unit.id} is eliminated but remains on the map.`,
        entityIds: [unit.id],
        hexIds: locations,
      });
    } else if (!unit.eliminated && locations.length !== 1) {
      violations.push({
        code: "UNIT_STACK_CARDINALITY",
        message: `${unit.id} must exist in exactly one hex stack.`,
        entityIds: [unit.id],
        hexIds: locations,
      });
    }
  }

  for (const hq of Object.values(state.headquarters)) {
    if (state.units[hq.id] !== hq) {
      violations.push({
        code: "HQ_NOT_CANONICAL",
        message: `${hq.id} is not the canonical object shared by units and headquarters.`,
        entityIds: [hq.id],
      });
    }
    if (hq.commandPoints < 0) {
      violations.push({
        code: "NEGATIVE_COMMAND_POINTS",
        message: `${hq.id} has negative command points.`,
        entityIds: [hq.id],
      });
    }
  }

  const executingByEntity = new Map<string, string[]>();
  for (const side of ["germany", "ussr"] as const) {
    for (const order of state.plans[side].orders) {
      if (
        order.status !== "committed" &&
        order.status !== "delayed" &&
        order.status !== "executing"
      ) {
        continue;
      }
      for (const entityId of order.entityIds) {
        const orders = executingByEntity.get(entityId) ?? [];
        orders.push(order.id);
        executingByEntity.set(entityId, orders);
      }
    }
  }
  for (const [entityId, orderIds] of executingByEntity) {
    if (orderIds.length > 1) {
      violations.push({
        code: "INCOMPATIBLE_SIMULTANEOUS_ORDERS",
        message: `${entityId} is assigned to multiple active orders.`,
        entityIds: [entityId],
      });
    }
  }

  for (const contact of state.contacts) {
    const attackerSide = contact.attackerSide;
    const defenderSide = contact.defenderSide;
    const attackerParticipants = contact.attackerParticipantIds ?? [];
    const defenderParticipants = contact.defenderParticipantIds ?? [];
    const attackerSupport = contact.attackerSupportIds ?? [];
    const defenderSupport = contact.defenderSupportIds ?? [];
    const attackerReserve = contact.attackerReserveIds ?? [];
    const defenderReserve = contact.defenderReserveIds ?? [];
    const participantIds = [
      ...attackerParticipants,
      ...defenderParticipants,
    ];
    if (new Set(participantIds).size !== participantIds.length) {
      violations.push({
        code: "CONTACT_DUPLICATE_PARTICIPANT",
        message: `${contact.id} contains a duplicate combat participant.`,
        entityIds: participantIds,
      });
    }
    if (
      attackerParticipants.some((id) => defenderParticipants.includes(id))
    ) {
      violations.push({
        code: "CONTACT_CROSS_SIDE_PARTICIPANT",
        message: `${contact.id} assigns one unit to both sides.`,
        entityIds: participantIds,
      });
    }
    const supportIds = [...attackerSupport, ...defenderSupport];
    if (supportIds.some((id) => participantIds.includes(id))) {
      violations.push({
        code: "CONTACT_SUPPORT_DUPLICATES_PARTICIPANT",
        message: `${contact.id} uses a participant as support.`,
        entityIds: supportIds.filter((id) => participantIds.includes(id)),
      });
    }
    if (
      attackerSupport.some((id) => state.units[id]?.side !== attackerSide) ||
      defenderSupport.some((id) => state.units[id]?.side !== defenderSide)
    ) {
      violations.push({
        code: "CONTACT_SUPPORT_WRONG_SIDE",
        message: `${contact.id} contains support assigned to the wrong side.`,
        entityIds: supportIds,
      });
    }
    const nonReserveRoles = new Set([...participantIds, ...supportIds]);
    const reserveIds = [...attackerReserve, ...defenderReserve];
    if (
      reserveIds.some((id) => nonReserveRoles.has(id)) ||
      new Set(reserveIds).size !== reserveIds.length
    ) {
      violations.push({
        code: "CONTACT_RESERVE_DUPLICATE_ROLE",
        message: `${contact.id} assigns a reserve to multiple roles.`,
        entityIds: reserveIds,
      });
    }
    if (
      (contact.resolved || contact.status === "resolved") &&
      !contact.resolutionId
    ) {
      violations.push({
        code: "RESOLVED_CONTACT_WITHOUT_RESOLUTION",
        message: `${contact.id} is resolved without a resolution id.`,
      });
    }
  }

  const supportUsageKeys = new Set<string>();
  for (const usage of state.supportUsage) {
    const unit = state.units[usage.unitId];
    const key = `${usage.unitId}:${usage.impulse}`;
    if (
      supportUsageKeys.has(key) &&
      !unit?.traits.includes("multiple_support")
    ) {
      violations.push({
        code: "SUPPORT_USED_MULTIPLE_TIMES",
        message: `${usage.unitId} supports multiple contacts in impulse ${usage.impulse}.`,
        entityIds: [usage.unitId],
      });
    }
    supportUsageKeys.add(key);
  }

  return violations;
}
