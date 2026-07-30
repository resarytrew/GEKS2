import type { GameState, HexState } from "@/engine/types";
import {
  EDGE_TO_DIRECTION,
  keyOf,
  neighbor,
  parseKey,
  sharedEdge,
} from "@/engine/hex";

export interface ProjectedSharedEdge {
  key: string;
  fromHexId: string;
  toHexId: string;
  edge: number;
  reverseEdge: number;
}

function sharedEdgeProjection(
  state: GameState,
  from: HexState,
  edge: number,
): ProjectedSharedEdge | null {
  const direction = EDGE_TO_DIRECTION[edge];
  const otherAxial = neighbor(from, direction);
  const toHexId = keyOf(otherAxial.q, otherAxial.r);
  const to = state.hexes[toHexId];
  if (!to) return null;
  const reverseEdge = sharedEdge(parseKey(toHexId), parseKey(from.id));
  if (reverseEdge == null) return null;
  const [first, second] = [from.id, toHexId].sort();
  return {
    key: `${first}|${second}`,
    fromHexId: from.id,
    toHexId,
    edge,
    reverseEdge,
  };
}

export function collectUniqueRiverEdges(
  state: GameState,
  visibleHexIds: readonly string[],
): ProjectedSharedEdge[] {
  const visible = new Set(visibleHexIds);
  const found = new Map<string, ProjectedSharedEdge>();
  for (const id of visibleHexIds) {
    const hex = state.hexes[id];
    if (!hex) continue;
    for (const edge of hex.riverEdges) {
      const projection = sharedEdgeProjection(state, hex, edge);
      if (!projection || !visible.has(projection.toHexId)) continue;
      if (!found.has(projection.key)) found.set(projection.key, projection);
    }
  }
  return [...found.values()];
}

export function collectFrontlineEdges(
  state: GameState,
  visibleHexIds: readonly string[],
): ProjectedSharedEdge[] {
  const visible = new Set(visibleHexIds);
  const found = new Map<string, ProjectedSharedEdge>();
  for (const id of visibleHexIds) {
    const hex = state.hexes[id];
    if (
      !hex ||
      hex.control === "neutral" ||
      hex.terrain === "sea" ||
      hex.terrain === "lake"
    ) {
      continue;
    }
    for (let direction = 0; direction < 6; direction++) {
      const otherAxial = neighbor(hex, direction);
      const toHexId = keyOf(otherAxial.q, otherAxial.r);
      const to = state.hexes[toHexId];
      if (
        !to ||
        !visible.has(toHexId) ||
        to.control === "neutral" ||
        to.control === hex.control ||
        to.terrain === "sea" ||
        to.terrain === "lake"
      ) {
        continue;
      }
      const edge = sharedEdge(parseKey(hex.id), otherAxial);
      if (edge == null) continue;
      const projection = sharedEdgeProjection(state, hex, edge);
      if (projection && !found.has(projection.key)) {
        found.set(projection.key, projection);
      }
    }
  }
  return [...found.values()];
}

export interface LabelBox {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface LabelCandidate {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  priority: number;
  strategic?: boolean;
}

export interface PlacedLabel extends LabelCandidate {
  anchor: "below" | "above" | "right" | "left";
  box: LabelBox;
}

function intersects(a: LabelBox, b: LabelBox, padding = 2): boolean {
  return !(
    a.right + padding < b.left ||
    a.left - padding > b.right ||
    a.bottom + padding < b.top ||
    a.top - padding > b.bottom
  );
}

function boxFor(
  candidate: LabelCandidate,
  anchor: PlacedLabel["anchor"],
): LabelBox {
  const gap = 8;
  if (anchor === "above") {
    return {
      left: candidate.x - candidate.width / 2,
      right: candidate.x + candidate.width / 2,
      top: candidate.y - gap - candidate.height,
      bottom: candidate.y - gap,
    };
  }
  if (anchor === "right") {
    return {
      left: candidate.x + gap,
      right: candidate.x + gap + candidate.width,
      top: candidate.y - candidate.height / 2,
      bottom: candidate.y + candidate.height / 2,
    };
  }
  if (anchor === "left") {
    return {
      left: candidate.x - gap - candidate.width,
      right: candidate.x - gap,
      top: candidate.y - candidate.height / 2,
      bottom: candidate.y + candidate.height / 2,
    };
  }
  return {
    left: candidate.x - candidate.width / 2,
    right: candidate.x + candidate.width / 2,
    top: candidate.y + gap,
    bottom: candidate.y + gap + candidate.height,
  };
}

export function layoutMapLabels(
  candidates: readonly LabelCandidate[],
  fixedObstacles: readonly LabelBox[],
): PlacedLabel[] {
  const occupied = [...fixedObstacles];
  const placed: PlacedLabel[] = [];
  const sorted = [...candidates].sort(
    (a, b) => b.priority - a.priority || a.id.localeCompare(b.id),
  );
  for (const candidate of sorted) {
    const anchors: PlacedLabel["anchor"][] = [
      "below",
      "above",
      "right",
      "left",
    ];
    let chosen: PlacedLabel["anchor"] | null = null;
    let box: LabelBox | null = null;
    for (const anchor of anchors) {
      const proposed = boxFor(candidate, anchor);
      if (!occupied.some((other) => intersects(proposed, other))) {
        chosen = anchor;
        box = proposed;
        break;
      }
    }
    if (!chosen || !box) {
      if (!candidate.strategic) continue;
      chosen = "above";
      box = boxFor(candidate, chosen);
    }
    const result: PlacedLabel = { ...candidate, anchor: chosen, box };
    placed.push(result);
    occupied.push(box);
  }
  return placed;
}

export function projectStack<T extends { id: string }>(
  units: readonly T[],
  selectedUnitIds: readonly string[],
  maxVisible = 3,
): { visible: T[]; hiddenCount: number } {
  const selected = units.filter((unit) => selectedUnitIds.includes(unit.id));
  const remaining = units.filter((unit) => !selectedUnitIds.includes(unit.id));
  const ordered = [...selected, ...remaining];
  return {
    visible: ordered.slice(0, maxVisible),
    hiddenCount: Math.max(0, ordered.length - maxVisible),
  };
}

export const MAP_RENDER_INVALIDATION = {
  viewport: ["terrain", "context", "operational", "interaction"],
  layerPreferences: ["terrain", "context", "operational"],
  gameState: ["context", "operational"],
  orders: ["operational"],
  selection: ["interaction"],
  hover: ["interaction"],
} as const;

