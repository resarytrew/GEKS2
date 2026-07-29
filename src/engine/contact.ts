import type { ContactState, GameState, Side } from "@/engine/types";

export const opposingSide = (side: Side): Side =>
  side === "germany" ? "ussr" : "germany";

function unique(ids: readonly string[]): string[] {
  return [...new Set(ids)].sort();
}

function idsForSide(
  state: GameState,
  ids: readonly string[],
  side: Side,
): string[] {
  return unique(ids.filter((id) => state.units[id]?.side === side));
}

export function normalizeContactState(
  state: GameState,
  source: ContactState,
): ContactState {
  const attackerSide = source.attackerSide ?? state.initiativeSide;
  const defenderSide = source.defenderSide ?? opposingSide(attackerSide);
  const legacyParticipants =
    source.participantIds ?? source.entityIds ?? [];
  const attackerParticipants = unique(
    source.attackerParticipantIds?.length
      ? source.attackerParticipantIds
      : idsForSide(state, legacyParticipants, attackerSide),
  );
  const defenderParticipants = unique(
    source.defenderParticipantIds?.length
      ? source.defenderParticipantIds
      : idsForSide(state, legacyParticipants, defenderSide),
  );
  const participantSet = new Set([
    ...attackerParticipants,
    ...defenderParticipants,
  ]);
  const legacySupport = source.supportIds ?? [];
  const attackerSupport = unique(
    (source.attackerSupportIds?.length
      ? source.attackerSupportIds
      : idsForSide(state, legacySupport, attackerSide)
    ).filter((id) => !participantSet.has(id)),
  );
  const defenderSupport = unique(
    (source.defenderSupportIds?.length
      ? source.defenderSupportIds
      : idsForSide(state, legacySupport, defenderSide)
    ).filter((id) => !participantSet.has(id)),
  );
  const supportSet = new Set([...attackerSupport, ...defenderSupport]);
  const legacyReserve = source.reserveIds ?? [];
  const attackerReserve = unique(
    (source.attackerReserveIds?.length
      ? source.attackerReserveIds
      : idsForSide(state, legacyReserve, attackerSide)
    ).filter((id) => !participantSet.has(id) && !supportSet.has(id)),
  );
  const defenderReserve = unique(
    (source.defenderReserveIds?.length
      ? source.defenderReserveIds
      : idsForSide(state, legacyReserve, defenderSide)
    ).filter((id) => !participantSet.has(id) && !supportSet.has(id)),
  );

  return {
    ...source,
    attackerSide,
    defenderSide,
    attackerParticipantIds: attackerParticipants,
    defenderParticipantIds: defenderParticipants,
    attackerSupportIds: attackerSupport,
    defenderSupportIds: defenderSupport,
    attackerReserveIds: attackerReserve,
    defenderReserveIds: defenderReserve,
    entityIds: undefined,
    participantIds: undefined,
    supportIds: undefined,
    reserveIds: undefined,
  };
}

export function contactParticipantIds(
  contact: ContactState,
  side: Side,
): string[] {
  return side === contact.attackerSide
    ? contact.attackerParticipantIds
    : contact.defenderParticipantIds;
}

export function contactSupportIds(
  contact: ContactState,
  side: Side,
): string[] {
  return side === contact.attackerSide
    ? contact.attackerSupportIds
    : contact.defenderSupportIds;
}

export function contactReserveIds(
  contact: ContactState,
  side: Side,
): string[] {
  return side === contact.attackerSide
    ? contact.attackerReserveIds
    : contact.defenderReserveIds;
}

export function allContactEntityIds(contact: ContactState): string[] {
  return unique([
    ...contact.attackerParticipantIds,
    ...contact.defenderParticipantIds,
    ...contact.attackerSupportIds,
    ...contact.defenderSupportIds,
    ...contact.attackerReserveIds,
    ...contact.defenderReserveIds,
  ]);
}
