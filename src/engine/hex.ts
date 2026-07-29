/**
 * Flat-top axial hex math.
 *
 * Edge convention (0..5): edge `e` sits between corner `e` and `e+1`,
 * with corners at angles 60*e degrees (0 = east, CCW). Edge midpoints are at
 * 60*e + 30 degrees. The top (edge 1) and bottom (edge 4) edges are flat.
 *
 * Direction -> shared-edge mapping for the six axial neighbours is captured in
 * DIRECTION_TO_EDGE so rivers / roads / bridges use a single consistent rule.
 */

export interface Axial {
  q: number;
  r: number;
}

/** Base circumradius in CSS pixels used for default rendering. */
export const HEX_SIZE = 34;
export const SQRT3 = Math.sqrt(3);

/** Six axial neighbour directions. */
export const DIRECTIONS: Axial[] = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];

/** Direction index -> the edge of `from` hex shared with that neighbour. */
export const DIRECTION_TO_EDGE: number[] = [5, 0, 1, 2, 3, 4];

/** Edge index -> the neighbour direction across that edge. */
export const EDGE_TO_DIRECTION: number[] = [1, 2, 3, 4, 5, 0];

export function keyOf(q: number, r: number): string {
  return `${q}_${r}`;
}

export function parseKey(id: string): Axial {
  const [q, r] = id.split("_").map(Number);
  return { q, r };
}

export function add(a: Axial, b: Axial): Axial {
  return { q: a.q + b.q, r: a.r + b.r };
}

export function neighbor(a: Axial, dir: number): Axial {
  const d = DIRECTIONS[dir];
  return { q: a.q + d.q, r: a.r + d.r };
}

export function neighbors(a: Axial): Axial[] {
  return DIRECTIONS.map((d) => ({ q: a.q + d.q, r: a.r + d.r }));
}

export function areAdjacent(a: Axial, b: Axial): boolean {
  return distance(a, b) === 1;
}

/** Distance between two axial hexes via cube coordinates. */
export function distance(a: Axial, b: Axial): number {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

/** Which edge of hex `a` is shared with adjacent hex `b` (or null). */
export function sharedEdge(a: Axial, b: Axial): number | null {
  for (let dir = 0; dir < 6; dir++) {
    if (neighbor(a, dir).q === b.q && neighbor(a, dir).r === b.r) {
      return DIRECTION_TO_EDGE[dir];
    }
  }
  return null;
}

interface Cube {
  x: number;
  y: number;
  z: number;
}

function axialToCube(a: Axial): Cube {
  return { x: a.q, y: -a.q - a.r, z: a.r };
}

function cubeRound(c: Cube): Cube {
  let rx = Math.round(c.x);
  let ry = Math.round(c.y);
  let rz = Math.round(c.z);
  const xDiff = Math.abs(rx - c.x);
  const yDiff = Math.abs(ry - c.y);
  const zDiff = Math.abs(rz - c.z);
  if (xDiff > yDiff && xDiff > zDiff) rx = -ry - rz;
  else if (yDiff > zDiff) ry = -rx - rz;
  else rz = -rx - ry;
  return { x: rx, y: ry, z: rz };
}

/** Flat-top axial -> pixel centre. */
export function axialToPixel(q: number, r: number, size = HEX_SIZE): { x: number; y: number } {
  return {
    x: size * (1.5 * q),
    y: size * (SQRT3 * (r + q / 2)),
  };
}

/** Pixel -> flat-top axial (fractional, rounded). */
export function pixelToAxial(x: number, y: number, size = HEX_SIZE): Axial {
  const q = (2 / 3) * (x / size);
  const r = (-1 / 3) * (x / size) + (SQRT3 / 3) * (y / size);
  const cube = cubeRound({ x: q, y: -q - r, z: r });
  return { q: cube.x, r: cube.z };
}

/** The six corner points of a flat-top hex (for polygon drawing). */
export function hexCorners(q: number, r: number, size = HEX_SIZE): { x: number; y: number }[] {
  const c = axialToPixel(q, r, size);
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i);
    out.push({ x: c.x + size * Math.cos(angle), y: c.y + size * Math.sin(angle) });
  }
  return out;
}

/** Midpoint of a given edge (for drawing rivers / roads through edges). */
export function edgeMidpoint(q: number, r: number, edge: number, size = HEX_SIZE): { x: number; y: number } {
  const c = axialToPixel(q, r, size);
  const angle = (Math.PI / 180) * (60 * edge + 30);
  return { x: c.x + size * Math.cos(angle), y: c.y + size * Math.sin(angle) };
}

/**
 * Trace a line of hexes between two axial coordinates (cube lerp + round).
 * Used to lay rivers / roads along hex boundaries between waypoints.
 */
export function hexLine(a: Axial, b: Axial): Axial[] {
  const N = distance(a, b);
  if (N === 0) return [a];
  const ca = axialToCube(a);
  const cb = axialToCube(b);
  const out: Axial[] = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const cube = cubeRound({
      x: ca.x + (cb.x - ca.x) * t,
      y: ca.y + (cb.y - ca.y) * t,
      z: ca.z + (cb.z - ca.z) * t,
    });
    out.push({ q: cube.x, r: cube.z });
  }
  return out;
}
