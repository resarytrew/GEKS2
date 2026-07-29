import type { Bridge, BridgeState, GameState, HexState } from "@/engine/types";
import { EDGE_TO_DIRECTION, keyOf, neighbor, parseKey, sharedEdge } from "@/engine/hex";

export interface SharedEdge {
  from: HexState;
  to: HexState;
  fromEdge: number;
  toEdge: number;
  bridge?: Bridge;
}

export function getSharedEdge(state: GameState, hexId: string, direction: number): SharedEdge | undefined {
  if (!Number.isInteger(direction) || direction < 0 || direction > 5) return undefined;
  const from = state.hexes[hexId];
  if (!from) return undefined;
  const toAxial = neighbor(parseKey(hexId), direction);
  const to = state.hexes[keyOf(toAxial.q, toAxial.r)];
  if (!to) return undefined;
  const fromEdge = sharedEdge(parseKey(from.id), parseKey(to.id));
  const toEdge = sharedEdge(parseKey(to.id), parseKey(from.id));
  if (fromEdge == null || toEdge == null) return undefined;
  return {
    from,
    to,
    fromEdge,
    toEdge,
    bridge:
      from.bridgeEdges.find((bridge) => bridge.edge === fromEdge) ??
      to.bridgeEdges.find((bridge) => bridge.edge === toEdge),
  };
}

export function directionForEdge(edge: number): number | undefined {
  return EDGE_TO_DIRECTION[edge];
}

export function sharedEdgeKey(
  state: GameState,
  hexId: string,
  edgeNumber: number,
): string | undefined {
  const direction = directionForEdge(edgeNumber);
  const edge = direction == null ? undefined : getSharedEdge(state, hexId, direction);
  if (!edge) return undefined;
  return [edge.from.id, edge.to.id].sort().join("|");
}

export function updateSharedEdge(
  state: GameState,
  hexId: string,
  direction: number,
  updater: (bridge: Bridge | undefined) => Bridge | undefined,
): SharedEdge | undefined {
  const edge = getSharedEdge(state, hexId, direction);
  if (!edge) return undefined;
  const next = updater(edge.bridge ? { ...edge.bridge, edge: edge.fromEdge } : undefined);
  edge.from.bridgeEdges = edge.from.bridgeEdges.filter((bridge) => bridge.edge !== edge.fromEdge);
  edge.to.bridgeEdges = edge.to.bridgeEdges.filter((bridge) => bridge.edge !== edge.toEdge);
  if (next) {
    edge.from.bridgeEdges.push({ ...next, edge: edge.fromEdge });
    edge.to.bridgeEdges.push({ ...next, edge: edge.toEdge });
  }
  return getSharedEdge(state, hexId, direction);
}

export function setBridgeState(
  state: GameState,
  hexId: string,
  edgeNumber: number,
  bridgeState: BridgeState,
): SharedEdge | undefined {
  const direction = directionForEdge(edgeNumber);
  if (direction == null) return undefined;
  return updateSharedEdge(state, hexId, direction, (bridge) =>
    bridge ? { ...bridge, state: bridgeState } : undefined,
  );
}
