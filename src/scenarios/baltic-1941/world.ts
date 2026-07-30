/**
 * Geographic world generator for the Baltic theatre.
 *
 * Real city coordinates (longitude / latitude) are projected onto the flat-top
 * axial hex grid. Land, coastlines, lakes and river centrelines use a checked-in
 * Natural Earth 1:10m scenario clip. Scenario roads and railways follow the
 * historically relevant operational corridors. Bridges are generated wherever
 * a transport line crosses a river edge.
 *
 * Unit placement and 1941 infrastructure remain scenario reconstructions and
 * keep their source-confidence tags. The physical geography is authoritative
 * at the display scale. The projection
 * yields hexes of roughly 11–13 km (≈ the 10 km design scale).
 */

import type { HexState, Terrain, Control, Settlement, Bridge } from "@/engine/types";
import {
  HEX_SIZE,
  SQRT3,
  EDGE_TO_DIRECTION,
  keyOf,
  axialToPixel,
  distance,
  neighbors,
  hexLine,
  sharedEdge,
  type Axial,
} from "@/engine/hex";
import { LAKE_POLYGONS, LAND_POLYGONS, type GeoPath } from "./geography";

export const MAP = {
  cols: 52,
  rows: 52,
  lonMin: 19.4,
  lonMax: 30.6,
  latMin: 53.7,
  latMax: 59.85,
};

const LON_SPAN = MAP.lonMax - MAP.lonMin;
const LAT_SPAN = MAP.latMax - MAP.latMin;

function offsetToAxial(col: number, row: number): Axial {
  const q = col;
  const r = row - (col - (col & 1)) / 2;
  return { q, r };
}

export function lonLatToAxial(lon: number, lat: number): Axial {
  const u = (lon - MAP.lonMin) / LON_SPAN;
  const v = (MAP.latMax - lat) / LAT_SPAN;
  const col = Math.max(0, Math.min(MAP.cols - 1, Math.round(u * (MAP.cols - 1))));
  const row = Math.max(0, Math.min(MAP.rows - 1, Math.round(v * (MAP.rows - 1))));
  return offsetToAxial(col, row);
}

/**
 * Smooth theatre projection for cartographic vectors. Hex centres retain their
 * odd-column stagger, while coastlines and rivers must not zig-zag between
 * those centres.
 */
export function lonLatToWorldPixel(lon: number, lat: number): { x: number; y: number } {
  const u = (lon - MAP.lonMin) / LON_SPAN;
  const v = (MAP.latMax - lat) / LAT_SPAN;
  return {
    x: HEX_SIZE * 1.5 * u * (MAP.cols - 1),
    y: HEX_SIZE * SQRT3 * (v * (MAP.rows - 1) + 0.25),
  };
}

function pointInPoly(lon: number, lat: number, poly: GeoPath): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0];
    const yi = poly[i][1];
    const xj = poly[j][0];
    const yj = poly[j][1];
    const intersect =
      yi > lat !== yj > lat &&
      lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function pointInPolygons(lon: number, lat: number, polygons: readonly GeoPath[]): boolean {
  return polygons.some((polygon) => pointInPoly(lon, lat, polygon));
}

export interface CityDef {
  id: string;
  name: string;
  lon: number;
  lat: number;
  importance: Settlement["importance"];
  victoryPoints: number;
  supplyCapacity: number;
}

export const CITIES: CityDef[] = [
  { id: "konigsberg", name: "Кёнигсберг", lon: 20.51, lat: 54.7, importance: "major", victoryPoints: 0, supplyCapacity: 6 },
  { id: "tilsit", name: "Тильзит", lon: 21.78, lat: 55.08, importance: "regional", victoryPoints: 2, supplyCapacity: 3 },
  { id: "memel", name: "Мемель", lon: 21.12, lat: 55.72, importance: "regional", victoryPoints: 3, supplyCapacity: 3 },
  { id: "taurage", name: "Таураге", lon: 22.29, lat: 55.25, importance: "regional", victoryPoints: 3, supplyCapacity: 2 },
  { id: "kaunas", name: "Каунас", lon: 23.9, lat: 54.9, importance: "major", victoryPoints: 6, supplyCapacity: 5 },
  { id: "alytus", name: "Алитус", lon: 24.05, lat: 54.4, importance: "regional", victoryPoints: 2, supplyCapacity: 2 },
  { id: "vilnius", name: "Вильнюс", lon: 25.28, lat: 54.69, importance: "major", victoryPoints: 6, supplyCapacity: 5 },
  { id: "raseiniai", name: "Расейняй", lon: 23.12, lat: 55.38, importance: "regional", victoryPoints: 3, supplyCapacity: 2 },
  { id: "siauliai", name: "Шяуляй", lon: 23.31, lat: 55.93, importance: "major", victoryPoints: 5, supplyCapacity: 4 },
  { id: "panevezys", name: "Паневежис", lon: 24.35, lat: 55.73, importance: "regional", victoryPoints: 3, supplyCapacity: 3 },
  { id: "ukmerge", name: "Укмерге", lon: 24.77, lat: 55.25, importance: "regional", victoryPoints: 2, supplyCapacity: 2 },
  { id: "jelgava", name: "Елгава", lon: 23.71, lat: 56.65, importance: "regional", victoryPoints: 3, supplyCapacity: 3 },
  { id: "liepaja", name: "Лиепая", lon: 21.01, lat: 56.51, importance: "regional", victoryPoints: 4, supplyCapacity: 3 },
  { id: "riga", name: "Рига", lon: 24.11, lat: 56.95, importance: "strategic", victoryPoints: 10, supplyCapacity: 7 },
  { id: "daugavpils", name: "Даугавпилс", lon: 26.52, lat: 55.88, importance: "strategic", victoryPoints: 8, supplyCapacity: 5 },
  { id: "rezekne", name: "Резекне", lon: 27.34, lat: 56.51, importance: "regional", victoryPoints: 3, supplyCapacity: 3 },
  { id: "tallinn", name: "Таллин", lon: 24.75, lat: 59.44, importance: "strategic", victoryPoints: 8, supplyCapacity: 6 },
  { id: "parnu", name: "Пярну", lon: 24.5, lat: 58.39, importance: "regional", victoryPoints: 2, supplyCapacity: 2 },
  { id: "valga", name: "Валга", lon: 26.05, lat: 57.78, importance: "regional", victoryPoints: 2, supplyCapacity: 2 },
  { id: "ostrov", name: "Остров", lon: 28.35, lat: 57.35, importance: "major", victoryPoints: 5, supplyCapacity: 3 },
  { id: "pskov", name: "Псков", lon: 28.34, lat: 57.82, importance: "strategic", victoryPoints: 8, supplyCapacity: 6 },
  { id: "tartu", name: "Тарту", lon: 26.73, lat: 58.38, importance: "regional", victoryPoints: 3, supplyCapacity: 3 },
  { id: "narva", name: "Нарва", lon: 28.19, lat: 59.38, importance: "regional", victoryPoints: 3, supplyCapacity: 2 },
  { id: "ventspils", name: "Вентспилс", lon: 21.56, lat: 57.39, importance: "regional", victoryPoints: 3, supplyCapacity: 2 },
  { id: "kedainiai", name: "Кедайняй", lon: 23.98, lat: 55.62, importance: "minor", victoryPoints: 1, supplyCapacity: 1 },
  { id: "jonava", name: "Ионава", lon: 24.28, lat: 55.08, importance: "minor", victoryPoints: 1, supplyCapacity: 1 },
  { id: "kretinga", name: "Кретинга", lon: 21.24, lat: 55.87, importance: "minor", victoryPoints: 1, supplyCapacity: 1 },
  { id: "roksikis", name: "Рокишкис", lon: 25.58, lat: 55.95, importance: "minor", victoryPoints: 1, supplyCapacity: 1 },
  { id: "jekabpils", name: "Екабпилс", lon: 25.86, lat: 56.3, importance: "minor", victoryPoints: 1, supplyCapacity: 1 },
  { id: "gulbene", name: "Гулбене", lon: 26.76, lat: 57.17, importance: "minor", victoryPoints: 1, supplyCapacity: 1 },
];

function hash2(x: number, y: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function noise2(q: number, r: number): number {
  const xiq = Math.floor(q);
  const yiq = Math.floor(r);
  const fx = q - xiq;
  const fy = r - yiq;
  const a = hash2(xiq, yiq);
  const b = hash2(xiq + 1, yiq);
  const c = hash2(xiq, yiq + 1);
  const d = hash2(xiq + 1, yiq + 1);
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  return a * (1 - ux) * (1 - uy) + b * ux * (1 - uy) + c * (1 - ux) * uy + d * ux * uy;
}

function forestDensity(lon: number, lat: number): number {
  let d = 0.16;
  if (lat < 55.45 && lon > 22 && lon < 26.6) d += 0.22;
  if (lat > 55.4 && lat < 56.5 && lon > 23 && lon < 27) d += 0.12;
  if (lat > 57.4 && lon < 27) d += 0.2;
  if (lon > 27 && lat < 58) d += 0.12;
  if (lat > 56.6 && lat < 57.6 && lon > 27 && lon < 29.5) d += 0.08;
  return Math.min(0.56, d);
}

function swampDensity(lon: number, lat: number): number {
  let d = 0.04;
  if (lon > 27.4 && lon < 29.6 && lat > 56.6 && lat < 57.7) d += 0.32;
  if (lon > 21 && lon < 21.9 && lat > 55.2 && lat < 55.7) d += 0.16;
  if (lat > 57.9 && lon > 24 && lon < 27) d += 0.1;
  return Math.min(0.42, d);
}

// River waypoint arrays (Neman, Daugava, Velikaya).
const RIVER_WAYS: number[][][] = [
  [
    [24.2, 53.7], [23.95, 54.2], [23.9, 54.9], [23.5, 55.1], [22.9, 55.2],
    [22.3, 55.25], [21.8, 55.42], [21.4, 55.55], [21.15, 55.7],
  ],
  [
    [27.2, 55.5], [26.6, 55.7], [26.52, 55.88], [25.9, 56.1], [25.3, 56.35],
    [24.7, 56.6], [24.3, 56.8], [24.11, 56.95],
  ],
  [
    [28.1, 56.3], [28.2, 56.8], [28.35, 57.35], [28.34, 57.82], [27.9, 58.0],
    [27.6, 58.1],
  ],
];

const ROAD_MAJOR_WAYS: string[][] = [
  ["konigsberg", "tilsit", "memel"],
  ["memel", "taurage", "siauliai", "jelgava", "riga"],
  ["kaunas", "kedainiai", "siauliai"],
  ["kaunas", "ukmerge", "panevezys", "siauliai"],
  ["kaunas", "alytus", "vilnius"],
  ["riga", "jelgava", "panevezys"],
  ["riga", "valga", "tartu", "parnu", "tallinn"],
  ["riga", "daugavpils"],
  ["daugavpils", "rezekne", "ostrov", "pskov"],
  ["liepaja", "taurage"],
];

const ROAD_MINOR_WAYS: string[][] = [
  ["tilsit", "taurage"],
  ["memel", "kretinga", "liepaja"],
  ["panevezys", "roksikis"],
  ["ukmerge", "jonava", "kaunas"],
  ["jelgava", "jekabpils", "daugavpils"],
  ["tartu", "valga"],
  ["valga", "gulbene", "rezekne"],
  ["ostrov", "pskov"],
  ["tallinn", "narva"],
];

const RAIL_WAYS: string[][] = [
  ["konigsberg", "tilsit", "memel", "siauliai", "daugavpils"],
  ["kaunas", "jonava", "siauliai"],
  ["kaunas", "vilnius"],
  ["riga", "jelgava", "siauliai"],
  ["daugavpils", "vilnius"],
  ["pskov", "ostrov", "rezekne", "daugavpils"],
  ["tallinn", "tartu", "valga", "riga"],
  ["riga", "daugavpils"],
];

function cityByName(name: string): CityDef | undefined {
  return CITIES.find((c) => c.id === name);
}

const TRANSPORT_ROUTE_CACHE = new Map<string, Axial[]>();

function transportLandRoute(
  start: Axial,
  end: Axial,
  hexes: Record<string, HexState>,
): Axial[] {
  const startId = keyOf(start.q, start.r);
  const endId = keyOf(end.q, end.r);
  const cacheKey = `${startId}>${endId}`;
  const cached = TRANSPORT_ROUTE_CACHE.get(cacheKey);
  if (cached) return cached;
  const open = new Set<string>([startId]);
  const previous = new Map<string, string>();
  const cost = new Map<string, number>([[startId, 0]]);

  while (open.size > 0) {
    let currentId = "";
    let currentScore = Infinity;
    for (const candidateId of open) {
      const candidate = hexes[candidateId];
      if (!candidate) continue;
      const score = (cost.get(candidateId) ?? Infinity) + distance(candidate, end) * 0.75;
      if (score < currentScore) {
        currentId = candidateId;
        currentScore = score;
      }
    }
    if (!currentId) break;
    if (currentId === endId) {
      const route: Axial[] = [];
      let cursor: string | undefined = endId;
      while (cursor) {
        const hex = hexes[cursor];
        if (hex) route.push({ q: hex.q, r: hex.r });
        cursor = previous.get(cursor);
      }
      route.reverse();
      TRANSPORT_ROUTE_CACHE.set(cacheKey, route);
      return route;
    }
    open.delete(currentId);
    const current = hexes[currentId];
    if (!current) continue;
    for (const adjacent of neighbors(current)) {
      const adjacentId = keyOf(adjacent.q, adjacent.r);
      const hex = hexes[adjacentId];
      if (!hex || hex.terrain === "sea" || hex.terrain === "lake") continue;
      const terrainCost =
        hex.terrain === "swamp"
          ? 1.8
          : hex.terrain === "dense_forest"
            ? 1.45
            : hex.terrain === "forest"
              ? 1.2
              : 1;
      const nextCost = (cost.get(currentId) ?? 0) + terrainCost;
      if (nextCost >= (cost.get(adjacentId) ?? Infinity)) continue;
      cost.set(adjacentId, nextCost);
      previous.set(adjacentId, currentId);
      open.add(adjacentId);
    }
  }

  // Both scenario endpoints are force-cleared settlement hexes, so this is
  // only a defensive fallback for malformed custom geography.
  const fallback = hexLine(start, end);
  TRANSPORT_ROUTE_CACHE.set(cacheKey, fallback);
  return fallback;
}

function traceWaypoints(points: Axial[], hexes: Record<string, HexState>, kind: "river" | "major" | "minor" | "rail"): void {
  for (let i = 0; i < points.length - 1; i++) {
    const line =
      kind === "river"
        ? hexLine(points[i], points[i + 1])
        : transportLandRoute(points[i], points[i + 1], hexes);
    for (let j = 0; j < line.length - 1; j++) {
      const a = line[j];
      const b = line[j + 1];
      const ea = sharedEdge(a, b);
      const eb = sharedEdge(b, a);
      if (ea == null || eb == null) continue;
      const ha = hexes[keyOf(a.q, a.r)];
      const hb = hexes[keyOf(b.q, b.r)];
      if (!ha || !hb) continue;
      if (kind === "river") {
        if (!ha.riverEdges.includes(ea)) ha.riverEdges.push(ea);
        if (!hb.riverEdges.includes(eb)) hb.riverEdges.push(eb);
      } else if (kind === "major") {
        if (!ha.majorRoadEdges.includes(ea)) ha.majorRoadEdges.push(ea);
        if (!hb.majorRoadEdges.includes(eb)) hb.majorRoadEdges.push(eb);
      } else if (kind === "minor") {
        if (!ha.roadEdges.includes(ea)) ha.roadEdges.push(ea);
        if (!hb.roadEdges.includes(eb)) hb.roadEdges.push(eb);
      } else if (kind === "rail") {
        if (!ha.railwayEdges.includes(ea)) ha.railwayEdges.push(ea);
        if (!hb.railwayEdges.includes(eb)) hb.railwayEdges.push(eb);
      }
    }
  }
}

export interface BuiltWorld {
  hexes: Record<string, HexState>;
  cityHex: Record<string, string>;
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
}

export function buildWorld(): BuiltWorld {
  const hexes: Record<string, HexState> = {};
  const cityHex: Record<string, string> = {};

  for (let col = 0; col < MAP.cols; col++) {
    for (let row = 0; row < MAP.rows; row++) {
      const { q, r } = offsetToAxial(col, row);
      const u = col / (MAP.cols - 1);
      const v = row / (MAP.rows - 1);
      const lon = MAP.lonMin + u * LON_SPAN;
      const lat = MAP.latMax - v * LAT_SPAN;
      const id = keyOf(q, r);

      const isLake = LAKE_POLYGONS.some((lake) =>
        pointInPolygons(lon, lat, lake.rings),
      );
      let terrain: Terrain;
      if (isLake) terrain = "lake";
      else if (!pointInPolygons(lon, lat, LAND_POLYGONS)) terrain = "sea";
      else terrain = "clear";

      let control: Control = lon < 21.3 ? "germany" : "ussr";

      const hex: HexState = {
        id,
        q,
        r,
        terrain,
        riverEdges: [],
        roadEdges: [],
        majorRoadEdges: [],
        railwayEdges: [],
        bridgeEdges: [],
        control,
        fortificationLevel: 0,
        interdictionLevel: 0,
        stackUnitIds: [],
        lon,
        lat,
      };
      hexes[id] = hex;
    }
  }

  // City overrides
  for (const city of CITIES) {
    const a = lonLatToAxial(city.lon, city.lat);
    const id = keyOf(a.q, a.r);
    const hex = hexes[id];
    if (!hex) continue;
    cityHex[city.id] = id;
    if (hex.terrain === "sea" || hex.terrain === "lake") hex.terrain = "clear";
    hex.terrain = city.importance === "strategic" || city.importance === "major" ? "major_city" : "city";
    hex.settlement = {
      id: city.id,
      name: city.name,
      importance: city.importance,
      victoryPoints: city.victoryPoints,
      supplyCapacity: city.supplyCapacity,
    };
  }

  // Forest / swamp terrain by noise + region
  for (const id in hexes) {
    const hex = hexes[id];
    if (hex.terrain === "sea" || hex.terrain === "lake" || hex.terrain === "city" || hex.terrain === "major_city") continue;
    const nv = noise2(hex.q * 0.16, hex.r * 0.16);
    const sw = swampDensity(hex.lon!, hex.lat!);
    if (nv < sw) {
      hex.terrain = "swamp";
    } else {
      const fn = (nv - sw) / (1 - sw);
      const fd = forestDensity(hex.lon!, hex.lat!);
      if (fn < fd) hex.terrain = fn < fd * 0.32 ? "dense_forest" : "forest";
    }
  }

  // Coast detection: land adjacent to water becomes coast (unless a settlement)
  for (const id in hexes) {
    const hex = hexes[id];
    if (hex.settlement) continue;
    if (hex.terrain === "sea" || hex.terrain === "lake") continue;
    const nearWater = neighbors(hex).some((n) => {
      const nh = hexes[keyOf(n.q, n.r)];
      return nh && (nh.terrain === "sea" || nh.terrain === "lake");
    });
    if (nearWater) hex.terrain = "coast";
  }

  // A few Soviet fortified hexes near the Dvina / Riga approach (placeholder UR)
  for (const fid of [cityHex["daugavpils"], cityHex["ostrov"], cityHex["rezekne"]]) {
    const f = fid ? hexes[fid] : undefined;
    if (f && f.terrain !== "major_city") f.terrain = "fortified";
  }

  // Rivers
  for (const way of RIVER_WAYS) {
    const pts = way.map((p) => lonLatToAxial(p[0], p[1]));
    traceWaypoints(pts, hexes, "river");
  }
  // Roads (resolve city names -> axial)
  const toPts = (names: string[]): Axial[] =>
    names.map((n) => cityByName(n)).filter(Boolean).map((c) => lonLatToAxial(c!.lon, c!.lat));
  for (const way of ROAD_MAJOR_WAYS) traceWaypoints(toPts(way), hexes, "major");
  for (const way of ROAD_MINOR_WAYS) traceWaypoints(toPts(way), hexes, "minor");
  for (const way of RAIL_WAYS) traceWaypoints(toPts(way), hexes, "rail");

  // Rear-area map-edge connections represent the off-map Königsberg and
  // Leningrad/Pskov logistics corridors. They also ensure the physical
  // coastline clip cannot accidentally sever a scenario supply source from
  // the historical transport network.
  const westernRear = offsetToAxial(0, 47);
  const easternRear = offsetToAxial(MAP.cols - 1, 0);
  const germanStaging = lonLatToAxial(21.6, 55.15);
  const konigsberg = cityByName("konigsberg");
  const taurage = cityByName("taurage");
  const pskov = cityByName("pskov");
  if (konigsberg) {
    traceWaypoints([westernRear, lonLatToAxial(konigsberg.lon, konigsberg.lat)], hexes, "major");
  }
  if (taurage) {
    traceWaypoints(
      [westernRear, germanStaging, lonLatToAxial(taurage.lon, taurage.lat)],
      hexes,
      "major",
    );
  }
  if (pskov) {
    traceWaypoints([easternRear, lonLatToAxial(pskov.lon, pskov.lat)], hexes, "major");
  }

  // Auto-generate bridges where road/rail crosses a river edge
  for (const id in hexes) {
    const hex = hexes[id];
    const crossEdges = new Set<number>([...hex.majorRoadEdges, ...hex.roadEdges, ...hex.railwayEdges]);
    for (const e of crossEdges) {
      if (!hex.riverEdges.includes(e)) continue;
      const opposite = neighbors(hex)[EDGE_TO_DIRECTION[e]];
      const other = opposite ? hexes[keyOf(opposite.q, opposite.r)] : undefined;
      if (
        !other ||
        hex.terrain === "sea" ||
        hex.terrain === "lake" ||
        other.terrain === "sea" ||
        other.terrain === "lake"
      ) {
        continue;
      }
      if (hex.bridgeEdges.some((b) => b.edge === e)) continue;
      const hasRoad = hex.majorRoadEdges.includes(e) || hex.roadEdges.includes(e);
      const hasRail = hex.railwayEdges.includes(e);
      const type: Bridge["type"] = hasRoad && hasRail ? "combined" : hasRail ? "railway" : "road";
      hex.bridgeEdges.push({ edge: e, type, state: "intact" });
    }
  }

  // Pixel bounds for camera framing
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const id in hexes) {
    const h = hexes[id];
    const p = axialToPixel(h.q, h.r, HEX_SIZE);
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }

  return { hexes, cityHex, bounds: { minX, minY, maxX, maxY } };
}

/** Snap a lon/lat to the nearest existing hex id (with an axial nudge). */
export function placeNear(hexes: Record<string, HexState>, lon: number, lat: number, qOff = 0, rOff = 0): string {
  const a = lonLatToAxial(lon, lat);
  const target = { q: a.q + qOff, r: a.r + rOff };
  if (hexes[keyOf(target.q, target.r)]) return keyOf(target.q, target.r);
  // spiral search for nearest real hex
  for (let radius = 1; radius <= 6; radius++) {
    for (const d of [
      { dq: radius, dr: 0 },
      { dq: -radius, dr: 0 },
      { dq: 0, dr: radius },
      { dq: 0, dr: -radius },
      { dq: radius, dr: -radius },
      { dq: -radius, dr: radius },
    ]) {
      const id = keyOf(target.q + d.dq, target.r + d.dr);
      if (hexes[id]) return id;
    }
  }
  return keyOf(a.q, a.r);
}
