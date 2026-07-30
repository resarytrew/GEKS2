import type { HexState } from "@/engine/types";
import { EDGE_TO_DIRECTION, keyOf, neighbors, parseKey } from "@/engine/hex";

export interface NormalizedRiverEdge { hexId: string; edge: number; key: string; neighborHexId?: string; }

/** Canonicalizes shared hex-edge records without inventing continuous geography. */
export function normalizeRiverEdges(hexes: Record<string, HexState>): NormalizedRiverEdge[] {
  const seen = new Set<string>();
  const result: NormalizedRiverEdge[] = [];
  for (const [hexId, hex] of Object.entries(hexes)) {
    const adjacent = neighbors(parseKey(hexId));
    for (const edge of hex.riverEdges) {
      const neighborHexId = keyOf(adjacent[EDGE_TO_DIRECTION[edge]].q, adjacent[EDGE_TO_DIRECTION[edge]].r);
      const reverseEdge = (edge + 3) % 6;
      const other = hexes[neighborHexId];
      const key = other ? [[hexId, edge], [neighborHexId, reverseEdge]].map(([id, value]) => `${id}:${value}`).sort().join("|") : `${hexId}:${edge}`;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push({ hexId, edge, key, neighborHexId: other ? neighborHexId : undefined });
    }
  }
  return result;
}
