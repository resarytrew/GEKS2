/**
 * Builds the small, runtime-local geography layer used by the Baltic theatre.
 *
 * Source: Natural Earth 1:10m physical vectors (public domain).
 * The script clips the global datasets to the scenario bounds and applies a
 * light Douglas-Peucker simplification. The game never downloads map data at
 * runtime; rerun this file only when the checked-in vector snapshot is updated.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const BBOX = [19.2, 53.5, 30.8, 60.0];
const SOURCE_ROOT =
  "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson";
const CACHE_DIR = join(tmpdir(), "geks2-natural-earth");
const OUTPUT = new URL("../src/scenarios/baltic-1941/geography.ts", import.meta.url);
const DATASETS = {
  land: "ne_10m_land.geojson",
  coastline: "ne_10m_coastline.geojson",
  lakes: "ne_10m_lakes.geojson",
  rivers: "ne_10m_rivers_lake_centerlines.geojson",
};

await mkdir(CACHE_DIR, { recursive: true });

async function loadDataset(key) {
  const filename = DATASETS[key];
  const cachePath = join(CACHE_DIR, filename.replace("ne_10m_", ""));
  if (!existsSync(cachePath)) {
    const response = await fetch(`${SOURCE_ROOT}/${filename}`);
    if (!response.ok) throw new Error(`Natural Earth download failed: ${response.status}`);
    await writeFile(cachePath, Buffer.from(await response.arrayBuffer()));
  }
  return JSON.parse(await readFile(cachePath, "utf8"));
}

function inside([x, y]) {
  return x >= BBOX[0] && x <= BBOX[2] && y >= BBOX[1] && y <= BBOX[3];
}

function sqSegmentDistance(point, start, end) {
  let x = start[0];
  let y = start[1];
  let dx = end[0] - x;
  let dy = end[1] - y;
  if (dx !== 0 || dy !== 0) {
    const t = ((point[0] - x) * dx + (point[1] - y) * dy) / (dx * dx + dy * dy);
    if (t > 1) {
      x = end[0];
      y = end[1];
    } else if (t > 0) {
      x += dx * t;
      y += dy * t;
    }
  }
  dx = point[0] - x;
  dy = point[1] - y;
  return dx * dx + dy * dy;
}

function simplify(points, tolerance = 0.008) {
  if (points.length <= 2) return points;
  const sqTolerance = tolerance * tolerance;
  const kept = new Uint8Array(points.length);
  kept[0] = 1;
  kept[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop();
    let maxDistance = sqTolerance;
    let index = 0;
    for (let i = first + 1; i < last; i++) {
      const distance = sqSegmentDistance(points[i], points[first], points[last]);
      if (distance > maxDistance) {
        index = i;
        maxDistance = distance;
      }
    }
    if (index) {
      kept[index] = 1;
      stack.push([first, index], [index, last]);
    }
  }
  return points.filter((_, index) => kept[index]);
}

function rounded(points) {
  return points.map(([x, y]) => [Number(x.toFixed(4)), Number(y.toFixed(4))]);
}

function lineGroups(geometry) {
  if (!geometry) return [];
  if (geometry.type === "LineString") return [geometry.coordinates];
  if (geometry.type === "MultiLineString") return geometry.coordinates;
  return [];
}

function ringGroups(geometry) {
  if (!geometry) return [];
  if (geometry.type === "Polygon") return geometry.coordinates;
  if (geometry.type === "MultiPolygon") return geometry.coordinates.flat();
  return [];
}

function clipSegment(a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  let t0 = 0;
  let t1 = 1;
  for (const [p, q] of [
    [-dx, a[0] - BBOX[0]],
    [dx, BBOX[2] - a[0]],
    [-dy, a[1] - BBOX[1]],
    [dy, BBOX[3] - a[1]],
  ]) {
    if (p === 0 && q < 0) return null;
    if (p === 0) continue;
    const t = q / p;
    if (p < 0) {
      if (t > t1) return null;
      if (t > t0) t0 = t;
    } else {
      if (t < t0) return null;
      if (t < t1) t1 = t;
    }
  }
  return [
    [a[0] + t0 * dx, a[1] + t0 * dy],
    [a[0] + t1 * dx, a[1] + t1 * dy],
  ];
}

function clipLine(line) {
  const output = [];
  let current = [];
  for (let i = 1; i < line.length; i++) {
    const segment = clipSegment(line[i - 1], line[i]);
    if (!segment) {
      if (current.length > 1) output.push(current);
      current = [];
      continue;
    }
    const [start, end] = segment;
    if (
      current.length &&
      (Math.abs(current.at(-1)[0] - start[0]) > 1e-7 ||
        Math.abs(current.at(-1)[1] - start[1]) > 1e-7)
    ) {
      output.push(current);
      current = [];
    }
    if (!current.length) current.push(start);
    current.push(end);
  }
  if (current.length > 1) output.push(current);
  return output.map((path) => rounded(simplify(path))).filter((path) => path.length > 1);
}

function clipRing(ring) {
  let output = ring;
  const boundaries = [
    { inside: (p) => p[0] >= BBOX[0], intersect: (a, b) => [BBOX[0], a[1] + ((b[1] - a[1]) * (BBOX[0] - a[0])) / (b[0] - a[0])] },
    { inside: (p) => p[0] <= BBOX[2], intersect: (a, b) => [BBOX[2], a[1] + ((b[1] - a[1]) * (BBOX[2] - a[0])) / (b[0] - a[0])] },
    { inside: (p) => p[1] >= BBOX[1], intersect: (a, b) => [a[0] + ((b[0] - a[0]) * (BBOX[1] - a[1])) / (b[1] - a[1]), BBOX[1]] },
    { inside: (p) => p[1] <= BBOX[3], intersect: (a, b) => [a[0] + ((b[0] - a[0]) * (BBOX[3] - a[1])) / (b[1] - a[1]), BBOX[3]] },
  ];
  for (const boundary of boundaries) {
    const input = output;
    output = [];
    if (!input.length) break;
    let start = input.at(-1);
    for (const end of input) {
      if (boundary.inside(end)) {
        if (!boundary.inside(start)) output.push(boundary.intersect(start, end));
        output.push(end);
      } else if (boundary.inside(start)) {
        output.push(boundary.intersect(start, end));
      }
      start = end;
    }
  }
  if (output.length < 3) return [];
  if (output[0][0] !== output.at(-1)[0] || output[0][1] !== output.at(-1)[1]) {
    output.push(output[0]);
  }
  return rounded(simplify(output, 0.006));
}

const [land, coast, lakes, rivers] = await Promise.all(
  Object.keys(DATASETS).map(loadDataset),
);

const landPolygons = land.features
  .flatMap((feature) => ringGroups(feature.geometry))
  .map(clipRing)
  .filter((ring) => ring.length > 3);

const coastlines = coast.features
  .flatMap((feature) => lineGroups(feature.geometry))
  .flatMap(clipLine);

const lakePolygons = lakes.features
  .flatMap((feature) => {
    const name = feature.properties?.name || feature.properties?.name_en || "Озеро";
    const rings = ringGroups(feature.geometry)
      .map(clipRing)
      .filter((ring) => ring.length > 3);
    return rings.length ? [{ name, rings }] : [];
  });

const riverLines = rivers.features
  .flatMap((feature) => {
    const name = feature.properties?.name || feature.properties?.name_en || "Река";
    const paths = lineGroups(feature.geometry).flatMap(clipLine);
    return paths.length ? [{ name, paths }] : [];
  });

const header = `/**
 * Generated from Natural Earth 1:10m physical vectors (public domain).
 * Scenario clip: ${BBOX.join(", ")}. Do not edit by hand; run
 * \`node scripts/generate-baltic-geography.mjs\` to refresh.
 */

export type GeoPoint = readonly [lon: number, lat: number];
export type GeoPath = readonly GeoPoint[];

export const GEOGRAPHY_BOUNDS = ${JSON.stringify(BBOX)} as const;
`;

const body = [
  `export const LAND_POLYGONS = ${JSON.stringify(landPolygons)} as const;`,
  `export const COASTLINES = ${JSON.stringify(coastlines)} as const;`,
  `export const LAKE_POLYGONS = ${JSON.stringify(lakePolygons)} as const;`,
  `export const RIVER_LINES = ${JSON.stringify(riverLines)} as const;`,
  `export const GEOGRAPHIC_LABELS = ${JSON.stringify([
    { text: "РИЖСКИЙ ЗАЛИВ", lon: 22.25, lat: 57.45, kind: "water", angle: -0.12 },
    { text: "БАЛТИЙСКОЕ МОРЕ", lon: 20.25, lat: 56.7, kind: "water", angle: -0.05 },
    { text: "ЗАП. ДВИНА (ДАУГАВА)", lon: 25.15, lat: 56.42, kind: "river", angle: 0.18 },
    { text: "НЕМАН", lon: 22.45, lat: 55.32, kind: "river", angle: -0.2 },
    { text: "ЧУДСКОЕ ОЗЕРО", lon: 27.55, lat: 58.55, kind: "water", angle: 0.16 },
  ])} as const;`,
].join("\n\n");

await writeFile(OUTPUT, `${header}\n${body}\n`, "utf8");
console.log(
  `Generated ${OUTPUT.pathname}: ${landPolygons.length} land rings, ` +
    `${coastlines.length} coast paths, ${lakePolygons.length} lakes, ${riverLines.length} rivers.`,
);
