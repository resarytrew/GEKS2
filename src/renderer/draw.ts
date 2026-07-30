/**
 * Canvas 2D renderer for the staff map. Kept entirely separate from the game
 * engine: it only READS GameState and draws it. The engine never imports this.
 *
 * Performance: every frame culls to hexes inside the viewport, so hovering or
 * selecting never iterates the whole multi-thousand-hex map. Static geography
 * is drawn into an offscreen layer that is only rebuilt when the viewport or
 * map content changes; selection / hover only repaint the dynamic layer.
 */

import type { GameState, HexState, UnitState, Side } from "@/engine/types";
import { axialToPixel, edgeMidpoint, hexCorners, HEX_SIZE, neighbors, pixelToAxial, sharedEdge, type Axial } from "@/engine/hex";
import {
  COASTLINES,
  GEOGRAPHIC_LABELS,
  LAKE_POLYGONS,
  RIVER_LINES,
  type GeoPath,
} from "@/scenarios/baltic-1941/geography";
import { lonLatToWorldPixel } from "@/scenarios/baltic-1941/world";
import {
  DEFAULT_MAP_PREFERENCES,
  MAP_VISUAL_LOD,
  getCounterPresentation,
  getMapLod,
  getSettlementPresentation,
  shouldShowCoordinate,
  type MapLayerPreferences,
  type MapLod,
} from "@/renderer/mapVisualConfig";
import {
  collectFrontlineEdges,
  collectUniqueRiverEdges,
  layoutMapLabels,
  projectStack,
  type LabelBox,
} from "@/renderer/mapVisualModel";

export interface Viewport {
  scale: number;
  ox: number;
  oy: number;
}

export interface View {
  width: number;
  height: number;
  dpr: number;
}

export interface RenderUI {
  selectedHexId: string | null;
  selectedUnitIds: string[];
  hoveredHexId: string | null;
  reachable: Map<string, number> | null;
  attackTargetHexId: string | null;
  routePath: string[] | null;
  showZOC: boolean;
  activeSide: Side;
}

export type StaticMapOptions = Partial<MapLayerPreferences>;

interface MapProjection {
  ids: string[];
  lod: MapLod;
}

const C = {
  paper: "#aaa17d",
  clear: "#74745a",
  forest: "#4d5c40",
  dforest: "#33452f",
  swamp: "#666144",
  city: "#806b4d",
  mcity: "#665038",
  fort: "#806949",
  coast: "#666d58",
  lake: "#577a86",
  sea: "#31515b",
  river: "#79a6b7",
  road: "#a98750",
  mroad: "#d0a45d",
  rail: "#29231d",
  ger: "#3f515b",
  gerDark: "#172227",
  gerText: "#f0f2ec",
  gerAccent: "#a9b9b8",
  sov: "#8d3329",
  sovDark: "#47150f",
  sovText: "#f2dfc0",
  sovAccent: "#d2a85a",
  gold: "#e0bd65",
  grid: "rgba(225,205,150,0.075)",
  gridStrong: "rgba(235,216,166,0.15)",
};

const terrainFill = (t: HexState["terrain"], mode: "scheme" | "relief"): string => {
  if (mode === "relief") {
    switch (t) {
      case "sea": return "#3b5960";
      case "lake": return "#64818a";
      case "forest": return "#536244";
      case "dense_forest": return "#374936";
      case "swamp": return "#746e50";
      case "city": return "#8a7556";
      case "major_city": return "#705a40";
      case "fortified": return "#8c7451";
      case "coast": return "#7f826b";
      default: return "#858267";
    }
  }
  switch (t) {
    case "sea": return C.sea;
    case "lake": return C.lake;
    case "forest": return C.forest;
    case "dense_forest": return C.dforest;
    case "swamp": return C.swamp;
    case "city": return C.city;
    case "major_city": return C.mcity;
    case "fortified": return C.fort;
    case "coast": return C.coast;
    default: return C.clear;
  }
};

export function worldToScreen(wx: number, wy: number, vp: Viewport): { x: number; y: number } {
  return { x: (wx + vp.ox) * vp.scale, y: (wy + vp.oy) * vp.scale };
}

export function screenToHex(sx: number, sy: number, vp: Viewport, size = HEX_SIZE): Axial {
  const wx = sx / vp.scale - vp.ox;
  const wy = sy / vp.scale - vp.oy;
  return pixelToAxial(wx, wy, size);
}

function isVisible(sx: number, sy: number, view: View, pad: number): boolean {
  return sx > -pad && sx < view.width + pad && sy > -pad && sy < view.height + pad;
}

export function visibleHexIds(state: GameState, vp: Viewport, view: View): string[] {
  const pad = HEX_SIZE * 2.25;
  const corners = [
    screenToHex(-pad, -pad, vp),
    screenToHex(view.width + pad, -pad, vp),
    screenToHex(-pad, view.height + pad, vp),
    screenToHex(view.width + pad, view.height + pad, vp),
  ];
  const minQ = Math.min(...corners.map((corner) => corner.q)) - 3;
  const maxQ = Math.max(...corners.map((corner) => corner.q)) + 3;
  const minR = Math.min(...corners.map((corner) => corner.r)) - 3;
  const maxR = Math.max(...corners.map((corner) => corner.r)) + 3;
  const out: string[] = [];
  for (let q = minQ; q <= maxQ; q++) {
    for (let r = minR; r <= maxR; r++) {
      const id = `${q}_${r}`;
      if (!state.hexes[id]) continue;
      const point = axialToPixel(q, r, HEX_SIZE);
      const screen = worldToScreen(point.x, point.y, vp);
      if (isVisible(screen.x, screen.y, view, pad * vp.scale + 4)) out.push(id);
    }
  }
  return out;
}

function projectFrame(state: GameState, vp: Viewport, view: View): MapProjection {
  return { ids: visibleHexIds(state, vp, view), lod: getMapLod(vp.scale) };
}

function resolvePreferences(options: StaticMapOptions): MapLayerPreferences {
  return { ...DEFAULT_MAP_PREFERENCES, ...options };
}

function hexPath(ctx: CanvasRenderingContext2D, corners: { x: number; y: number }[]): void {
  ctx.beginPath();
  ctx.moveTo(corners[0].x, corners[0].y);
  for (let i = 1; i < corners.length; i++) ctx.lineTo(corners[i].x, corners[i].y);
  ctx.closePath();
}

function hash01(q: number, r: number, salt: number): number {
  const x = Math.sin(q * 127.1 + r * 311.7 + salt * 74.7) * 43758.5453;
  return x - Math.floor(x);
}

function traceGeographicPath(
  ctx: CanvasRenderingContext2D,
  path: GeoPath,
  vp: Viewport,
  close = false,
): void {
  if (path.length < 2) return;
  ctx.beginPath();
  path.forEach(([lon, lat], index) => {
    const world = lonLatToWorldPixel(lon, lat);
    const screen = worldToScreen(world.x, world.y, vp);
    if (index === 0) ctx.moveTo(screen.x, screen.y);
    else ctx.lineTo(screen.x, screen.y);
  });
  if (close) ctx.closePath();
}

function drawArrowHead(
  ctx: CanvasRenderingContext2D,
  from: { x: number; y: number },
  to: { x: number; y: number },
  size: number,
): void {
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  ctx.beginPath();
  ctx.moveTo(to.x, to.y);
  ctx.lineTo(to.x - Math.cos(angle - 0.55) * size, to.y - Math.sin(angle - 0.55) * size);
  ctx.lineTo(to.x - Math.cos(angle + 0.55) * size, to.y - Math.sin(angle + 0.55) * size);
  ctx.closePath();
  ctx.fill();
}

function drawOrderRoutes(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  vp: Viewport,
  detail: number,
): void {
  const orders = state.plans[state.activeSide]?.orders ?? [];
  for (const order of orders) {
    if (!order.route || order.route.length < 2 || order.status === "cancelled") continue;
    const typeStyle =
      order.orderType === "withdraw"
        ? { colour: "rgba(122,177,201,0.9)", dash: [4, 5], width: 3.2 }
        : order.orderType === "advance"
          ? { colour: "rgba(215,82,59,0.92)", dash: [], width: 4.4 }
          : order.orderType === "march"
            ? { colour: "rgba(190,205,194,0.86)", dash: [10, 4], width: 3.6 }
            : { colour: "rgba(218,180,85,0.88)", dash: [2, 5], width: 3.1 };
    const colour =
      order.status === "delayed"
        ? "rgba(217,149,66,0.94)"
        : order.status === "failed"
          ? "rgba(196,68,52,0.94)"
          : typeStyle.colour;
    const points = order.route
      .map((id) => state.hexes[id])
      .filter(Boolean)
      .map((hex) => {
        const point = axialToPixel(hex.q, hex.r, HEX_SIZE);
        return worldToScreen(point.x, point.y, vp);
      });
    if (points.length < 2) continue;
    ctx.strokeStyle = colour;
    ctx.fillStyle = colour;
    ctx.lineWidth = Math.max(2.3, typeStyle.width * detail);
    ctx.setLineDash(
      order.status === "draft"
        ? [9, 6]
        : typeStyle.dash.map((value) => value * Math.max(0.8, detail)),
    );
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let index = 1; index < points.length; index++) {
      const previous = points[index - 1];
      const point = points[index];
      const cx = (previous.x + point.x) / 2;
      const cy = (previous.y + point.y) / 2 - Math.min(12, 7 * detail);
      ctx.quadraticCurveTo(cx, cy, point.x, point.y);
    }
    ctx.stroke();
    ctx.setLineDash([]);
    drawArrowHead(ctx, points.at(-2)!, points.at(-1)!, Math.max(8, 11 * detail));
  }
}

/** 1 — neutral paper/sea substrate. */
export function drawBaseBackgroundLayer(
  ctx: CanvasRenderingContext2D,
  view: View,
  preferences: MapLayerPreferences,
): void {
  const gradient = ctx.createLinearGradient(0, 0, view.width, view.height);
  gradient.addColorStop(0, preferences.highContrast ? "#294650" : "#31515b");
  gradient.addColorStop(0.52, preferences.highContrast ? "#203b45" : C.sea);
  gradient.addColorStop(1, "#17282f");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, view.width, view.height);
}

/** 2 — terrain colours and close-zoom terrain-specific marks. */
export function drawTerrainLayer(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  vp: Viewport,
  projection: MapProjection,
  preferences: MapLayerPreferences,
): void {
  const mode = preferences.relief ? "relief" : "scheme";
  const showPattern = MAP_VISUAL_LOD[projection.lod].showTerrainPattern;
  for (const id of projection.ids) {
    const hex = state.hexes[id];
    const point = axialToPixel(hex.q, hex.r, HEX_SIZE);
    const corners = hexCorners(hex.q, hex.r, HEX_SIZE).map((corner) =>
      worldToScreen(corner.x, corner.y, vp),
    );
    hexPath(ctx, corners);
    ctx.fillStyle = terrainFill(hex.terrain, mode);
    ctx.fill();
    if (!showPattern || hex.terrain === "sea" || hex.terrain === "lake") continue;
    ctx.save();
    hexPath(ctx, corners);
    ctx.clip();
    ctx.lineWidth = Math.max(0.55, vp.scale * 0.65);
    ctx.strokeStyle =
      hex.terrain === "forest" || hex.terrain === "dense_forest"
        ? "rgba(211,201,151,0.18)"
        : "rgba(35,27,18,0.18)";
    const density = hex.terrain === "dense_forest" ? 4 : 2;
    for (let index = 0; index < density; index++) {
      const wx = point.x + (hash01(hex.q, hex.r, index) - 0.5) * HEX_SIZE * 1.1;
      const wy = point.y + (hash01(hex.q, hex.r, index + 9) - 0.5) * HEX_SIZE;
      const screen = worldToScreen(wx, wy, vp);
      const size = Math.max(2, vp.scale * 3.2);
      ctx.beginPath();
      if (hex.terrain === "forest" || hex.terrain === "dense_forest") {
        ctx.moveTo(screen.x, screen.y - size);
        ctx.lineTo(screen.x - size * 0.65, screen.y + size * 0.7);
        ctx.lineTo(screen.x + size * 0.65, screen.y + size * 0.7);
        ctx.closePath();
      } else if (hex.terrain === "swamp") {
        ctx.moveTo(screen.x - size, screen.y);
        ctx.quadraticCurveTo(screen.x, screen.y - size, screen.x + size, screen.y);
      } else if (hex.terrain === "city" || hex.terrain === "major_city") {
        ctx.rect(screen.x - size, screen.y - size, size * 1.4, size * 1.1);
      } else if (hex.terrain === "fortified") {
        ctx.moveTo(screen.x - size, screen.y + size * 0.5);
        ctx.lineTo(screen.x, screen.y - size * 0.5);
        ctx.lineTo(screen.x + size, screen.y + size * 0.5);
      } else {
        continue;
      }
      ctx.stroke();
    }
    ctx.restore();
  }
}

/** 3 — continuous physical water, lakes and coastline keyline. */
export function drawWaterAndCoastLayer(
  ctx: CanvasRenderingContext2D,
  vp: Viewport,
  preferences: MapLayerPreferences,
): void {
  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  for (const lake of LAKE_POLYGONS) {
    for (const ring of lake.rings) {
      traceGeographicPath(ctx, ring, vp, true);
      ctx.fillStyle = preferences.relief ? "rgba(75,112,124,0.76)" : "rgba(47,91,106,0.86)";
      ctx.fill();
      ctx.strokeStyle = "rgba(142,184,190,0.58)";
      ctx.lineWidth = Math.max(0.8, 1.1 * vp.scale);
      ctx.stroke();
    }
  }
  ctx.strokeStyle = "rgba(18,25,23,0.72)";
  ctx.lineWidth = Math.max(1.2, 1.9 * vp.scale);
  for (const path of COASTLINES) {
    traceGeographicPath(ctx, path, vp);
    ctx.stroke();
  }
  ctx.strokeStyle = "rgba(205,192,143,0.42)";
  ctx.lineWidth = Math.max(0.55, 0.75 * vp.scale);
  for (const path of COASTLINES) {
    traceGeographicPath(ctx, path, vp);
    ctx.stroke();
  }
  if (getMapLod(vp.scale) !== "far") {
    for (const label of GEOGRAPHIC_LABELS) {
      const world = lonLatToWorldPixel(label.lon, label.lat);
      const screen = worldToScreen(world.x, world.y, vp);
      ctx.save();
      ctx.translate(screen.x, screen.y);
      ctx.rotate(label.angle);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `${label.kind === "water" ? "600" : "500"} ${Math.round(9 + vp.scale * 2)}px Bahnschrift, 'Arial Narrow', sans-serif`;
      ctx.strokeStyle = "rgba(12,21,22,0.68)";
      ctx.lineWidth = 2.5;
      ctx.strokeText(label.text, 0, 0);
      ctx.fillStyle =
        label.kind === "water" ? "rgba(151,199,210,0.7)" : "rgba(137,188,201,0.75)";
      ctx.fillText(label.text, 0, 0);
      ctx.restore();
    }
  }
  ctx.restore();
}

/** 4 — deliberately quiet territory wash. */
export function drawControlLayer(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  vp: Viewport,
  projection: MapProjection,
  preferences: MapLayerPreferences,
): void {
  if (preferences.controlMode !== "frontline_and_fill") return;
  for (const id of projection.ids) {
    const hex = state.hexes[id];
    if (hex.terrain === "sea" || hex.terrain === "lake" || hex.control === "neutral") continue;
    const corners = hexCorners(hex.q, hex.r, HEX_SIZE).map((corner) =>
      worldToScreen(corner.x, corner.y, vp),
    );
    hexPath(ctx, corners);
    ctx.fillStyle =
      hex.control === "germany"
        ? preferences.highContrast
          ? "rgba(67,94,123,0.16)"
          : "rgba(66,84,106,0.085)"
        : hex.control === "ussr"
          ? preferences.highContrast
            ? "rgba(155,58,45,0.14)"
            : "rgba(145,61,49,0.075)"
          : "rgba(191,126,61,0.07)";
    ctx.fill();
    if (hex.control === "contested") {
      ctx.save();
      hexPath(ctx, corners);
      ctx.clip();
      ctx.strokeStyle = preferences.highContrast
        ? "rgba(232,155,76,0.52)"
        : "rgba(184,119,56,0.3)";
      ctx.lineWidth = 1;
      const left = Math.min(...corners.map((corner) => corner.x));
      const right = Math.max(...corners.map((corner) => corner.x));
      const top = Math.min(...corners.map((corner) => corner.y));
      const bottom = Math.max(...corners.map((corner) => corner.y));
      for (let x = left - (bottom - top); x < right; x += 7) {
        ctx.beginPath();
        ctx.moveTo(x, bottom);
        ctx.lineTo(x + (bottom - top), top);
        ctx.stroke();
      }
      ctx.restore();
    }
  }
}

/** 5 — restrained grid and optional coordinates. */
export function drawHexGridLayer(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  vp: Viewport,
  projection: MapProjection,
  preferences: MapLayerPreferences,
): void {
  if (!preferences.showGrid) return;
  const config = MAP_VISUAL_LOD[projection.lod];
  ctx.strokeStyle = `rgba(235,216,166,${preferences.highContrast ? config.gridOpacity * 1.8 : config.gridOpacity})`;
  ctx.lineWidth = config.gridLineWidth;
  for (const id of projection.ids) {
    const hex = state.hexes[id];
    if (hex.terrain === "sea") continue;
    const corners = hexCorners(hex.q, hex.r, HEX_SIZE).map((corner) =>
      worldToScreen(corner.x, corner.y, vp),
    );
    hexPath(ctx, corners);
    ctx.stroke();
    const obstructed = Boolean(hex.settlement || hex.stackUnitIds.length);
    if (!shouldShowCoordinate(projection.lod, preferences.coordinateMode, hex.q, hex.r, obstructed)) continue;
    const point = axialToPixel(hex.q, hex.r, HEX_SIZE);
    const screen = worldToScreen(point.x, point.y - HEX_SIZE * 0.63, vp);
    ctx.font = `${Math.round(6 + vp.scale * 1.5)}px ui-monospace, monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = `rgba(238,224,184,${preferences.highContrast ? 0.34 : config.coordinateOpacity})`;
    ctx.fillText(`${hex.q},${hex.r}`, screen.x, screen.y);
  }
}

function traceSharedEdge(
  ctx: CanvasRenderingContext2D,
  hex: HexState,
  edge: number,
  vp: Viewport,
): void {
  const center = axialToPixel(hex.q, hex.r, HEX_SIZE);
  const midpoint = edgeMidpoint(hex.q, hex.r, edge, HEX_SIZE);
  const angle = Math.atan2(midpoint.y - center.y, midpoint.x - center.x) + Math.PI / 2;
  const half = HEX_SIZE * 0.5;
  const from = worldToScreen(midpoint.x + Math.cos(angle) * half, midpoint.y + Math.sin(angle) * half, vp);
  const to = worldToScreen(midpoint.x - Math.cos(angle) * half, midpoint.y - Math.sin(angle) * half, vp);
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
}

/** 6 — major/minor rivers and bridge state symbols. */
export function drawRiverLayer(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  vp: Viewport,
  projection: MapProjection,
  preferences: MapLayerPreferences,
): void {
  if (!preferences.showRivers) return;
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const river of RIVER_LINES) {
    const primary = ["Daugava", "Neman", "Neris", "Velikaya", "Narva"].includes(river.name);
    if (!primary && projection.lod === "far") continue;
    for (const path of river.paths) {
      traceGeographicPath(ctx, path, vp);
      if (primary) {
        ctx.strokeStyle = "rgba(28,55,63,0.48)";
        ctx.lineWidth = Math.max(2.4, vp.scale * 4.1);
        ctx.stroke();
        traceGeographicPath(ctx, path, vp);
      }
      ctx.strokeStyle = primary ? "rgba(112,184,207,0.88)" : "rgba(92,153,174,0.68)";
      ctx.lineWidth = Math.max(primary ? 1.25 : 0.7, vp.scale * (primary ? 2.25 : 1.15));
      ctx.stroke();
    }
  }
  ctx.strokeStyle = "rgba(112,177,198,0.78)";
  ctx.lineWidth = Math.max(1, vp.scale * 1.6);
  for (const edge of collectUniqueRiverEdges(state, projection.ids)) {
    traceSharedEdge(ctx, state.hexes[edge.fromHexId], edge.edge, vp);
    ctx.stroke();
  }
  if (MAP_VISUAL_LOD[projection.lod].showBridgeDetails) {
    for (const id of projection.ids) {
      const hex = state.hexes[id];
      for (const bridge of hex.bridgeEdges) {
        const midpoint = edgeMidpoint(hex.q, hex.r, bridge.edge, HEX_SIZE);
        const screen = worldToScreen(midpoint.x, midpoint.y, vp);
        const size = Math.max(4, vp.scale * 5);
        ctx.lineWidth = Math.max(1.4, vp.scale * 1.7);
        ctx.strokeStyle =
          bridge.state === "destroyed" ? "#d35b43" : bridge.state === "pontoon" ? "#c6a86f" : "#241d15";
        if (bridge.state === "destroyed") {
          ctx.beginPath();
          ctx.moveTo(screen.x - size, screen.y - size);
          ctx.lineTo(screen.x + size, screen.y + size);
          ctx.moveTo(screen.x + size, screen.y - size);
          ctx.lineTo(screen.x - size, screen.y + size);
          ctx.stroke();
        } else {
          ctx.beginPath();
          ctx.moveTo(screen.x - size, screen.y - 2);
          ctx.lineTo(screen.x + size, screen.y - 2);
          ctx.moveTo(screen.x - size, screen.y + 2);
          ctx.lineTo(screen.x + size, screen.y + 2);
          ctx.stroke();
        }
      }
    }
  }
  ctx.restore();
}

/** 7 — major/minor roads and railway hierarchy. */
export function drawTransportLayer(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  vp: Viewport,
  projection: MapProjection,
  preferences: MapLayerPreferences,
): void {
  ctx.save();
  ctx.lineCap = "round";
  if (preferences.showRoads) {
    if (MAP_VISUAL_LOD[projection.lod].showMinorRoads) {
      ctx.strokeStyle = "rgba(157,124,75,0.66)";
      ctx.lineWidth = Math.max(0.7, vp.scale * 1.05);
      ctx.setLineDash([3, 2]);
      for (const id of projection.ids) drawEdgeLines(ctx, state, state.hexes[id], vp, "road");
      ctx.setLineDash([]);
    }
    ctx.strokeStyle = "rgba(211,166,88,0.78)";
    ctx.lineWidth = Math.max(1.2, vp.scale * 2.05);
    for (const id of projection.ids) drawEdgeLines(ctx, state, state.hexes[id], vp, "major");
  }
  if (preferences.showRailways) {
    ctx.strokeStyle = "rgba(28,23,18,0.88)";
    ctx.lineWidth = Math.max(1.1, vp.scale * 1.6);
    for (const id of projection.ids) drawEdgeLines(ctx, state, state.hexes[id], vp, "rail");
    ctx.strokeStyle = "rgba(210,194,146,0.54)";
    ctx.lineWidth = Math.max(0.55, vp.scale * 0.65);
    ctx.setLineDash([3.5, 3.5]);
    for (const id of projection.ids) drawEdgeLines(ctx, state, state.hexes[id], vp, "rail");
    ctx.setLineDash([]);
  }
  ctx.restore();
}

/** 8 — importance-aware labels with collision avoidance. */
export function drawSettlementLayer(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  vp: Viewport,
  projection: MapProjection,
  preferences: MapLayerPreferences,
): void {
  if (!preferences.showSettlements) return;
  const fixed: LabelBox[] = [];
  const meta = new Map<string, { hex: HexState; text: string; fontSize: number; fontWeight: number; marker: string; halo: number }>();
  const candidates = projection.ids.flatMap((id) => {
    const hex = state.hexes[id];
    if (!hex.settlement) return [];
    const presentation = getSettlementPresentation(hex.settlement.importance, projection.lod);
    if (!presentation.visible) return [];
    const point = axialToPixel(hex.q, hex.r, HEX_SIZE);
    const screen = worldToScreen(point.x, point.y, vp);
    const text =
      hex.settlement.importance === "strategic" || hex.settlement.importance === "major"
        ? hex.settlement.name.toUpperCase()
        : hex.settlement.name;
    ctx.font = `${presentation.fontWeight} ${presentation.fontSize}px 'Iowan Old Style', Georgia, serif`;
    const width = ctx.measureText(text).width;
    meta.set(id, {
      hex,
      text,
      fontSize: presentation.fontSize,
      fontWeight: presentation.fontWeight,
      marker: presentation.marker,
      halo: presentation.haloStrength,
    });
    if (hex.stackUnitIds.length) {
      const counter = getCounterPresentation(vp.scale, projection.lod);
      fixed.push({
        left: screen.x - counter.size * 0.55,
        top: screen.y - counter.size * 0.5,
        right: screen.x + counter.size * 0.55,
        bottom: screen.y + counter.size * 0.5,
      });
    }
    return [{
      id,
      x: screen.x,
      y: screen.y,
      width,
      height: presentation.fontSize + 3,
      priority: presentation.priority,
      strategic: hex.settlement.importance === "strategic",
    }];
  });
  const placed = layoutMapLabels(candidates, fixed);
  for (const label of placed) {
    const item = meta.get(label.id);
    if (!item) continue;
    const point = axialToPixel(item.hex.q, item.hex.r, HEX_SIZE);
    const center = worldToScreen(point.x, point.y, vp);
    const radius = item.marker === "strategic" ? 4.5 : item.marker === "node" ? 3.8 : item.marker === "ring" ? 3 : 2;
    ctx.beginPath();
    ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = "#1b1710";
    ctx.fill();
    ctx.strokeStyle = "rgba(235,218,170,0.7)";
    ctx.lineWidth = item.marker === "strategic" ? 1.6 : 1;
    ctx.stroke();
    ctx.font = `${item.fontWeight} ${item.fontSize}px 'Iowan Old Style', Georgia, serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const x = (label.box.left + label.box.right) / 2;
    const y = (label.box.top + label.box.bottom) / 2;
    ctx.strokeStyle = "rgba(8,10,8,0.84)";
    ctx.lineWidth = item.halo;
    ctx.strokeText(item.text, x, y);
    ctx.fillStyle = item.fontWeight >= 600 ? "#f1ead4" : "#d4c9aa";
    ctx.fillText(item.text, x, y);
  }
}

/** 9 — one canonical shared edge per control boundary. */
export function drawFrontlineLayer(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  vp: Viewport,
  projection: MapProjection,
  preferences: MapLayerPreferences,
): void {
  if (preferences.controlMode === "off") return;
  ctx.save();
  ctx.lineCap = "round";
  ctx.strokeStyle = preferences.highContrast ? "rgba(239,84,55,0.96)" : "rgba(211,77,52,0.76)";
  ctx.lineWidth = Math.max(1.8, vp.scale * 2.7);
  ctx.setLineDash([Math.max(4, vp.scale * 6), Math.max(3, vp.scale * 4)]);
  for (const edge of collectFrontlineEdges(state, projection.ids)) {
    traceSharedEdge(ctx, state.hexes[edge.fromHexId], edge.edge, vp);
    ctx.stroke();
  }
  ctx.restore();
}

/** Compatibility orchestrator for layers 1–9. */
export function drawStaticLayer(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  vp: Viewport,
  view: View,
  options: StaticMapOptions = {},
): void {
  const preferences = resolvePreferences(options);
  const projection = projectFrame(state, vp, view);
  ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
  drawBaseBackgroundLayer(ctx, view, preferences);
  drawTerrainLayer(ctx, state, vp, projection, preferences);
  drawWaterAndCoastLayer(ctx, vp, preferences);
  drawControlLayer(ctx, state, vp, projection, preferences);
  drawHexGridLayer(ctx, state, vp, projection, preferences);
  drawRiverLayer(ctx, state, vp, projection, preferences);
  drawTransportLayer(ctx, state, vp, projection, preferences);
  drawSettlementLayer(ctx, state, vp, projection, preferences);
  drawFrontlineLayer(ctx, state, vp, projection, preferences);
}

/** Cache A: immutable physical geography (layers 1–3). */
export function drawTerrainCache(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  vp: Viewport,
  view: View,
  options: StaticMapOptions = {},
): void {
  const preferences = resolvePreferences(options);
  const projection = projectFrame(state, vp, view);
  ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
  drawBaseBackgroundLayer(ctx, view, preferences);
  drawTerrainLayer(ctx, state, vp, projection, preferences);
  drawWaterAndCoastLayer(ctx, vp, preferences);
}

/** Cache B: operational context without orders or interaction (layers 4–9). */
export function drawContextCache(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  vp: Viewport,
  view: View,
  options: StaticMapOptions = {},
): void {
  const preferences = resolvePreferences(options);
  const projection = projectFrame(state, vp, view);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
  drawControlLayer(ctx, state, vp, projection, preferences);
  drawHexGridLayer(ctx, state, vp, projection, preferences);
  drawRiverLayer(ctx, state, vp, projection, preferences);
  drawTransportLayer(ctx, state, vp, projection, preferences);
  drawSettlementLayer(ctx, state, vp, projection, preferences);
  drawFrontlineLayer(ctx, state, vp, projection, preferences);
}

function drawEdgeLines(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  h: HexState,
  vp: Viewport,
  kind: "road" | "major" | "rail",
): void {
  const edges = kind === "road" ? h.roadEdges : kind === "major" ? h.majorRoadEdges : h.railwayEdges;
  const p = axialToPixel(h.q, h.r, HEX_SIZE);
  for (const e of edges) {
    const m = edgeMidpoint(h.q, h.r, e, HEX_SIZE);
    const adjacentAxial = pixelToAxial(m.x * 2 - p.x, m.y * 2 - p.y, HEX_SIZE);
    const adjacent = state.hexes[`${adjacentAxial.q}_${adjacentAxial.r}`];
    if (!adjacent || h.id.localeCompare(adjacent.id) >= 0) continue;
    const reverseEdges =
      kind === "road"
        ? adjacent.roadEdges
        : kind === "major"
          ? adjacent.majorRoadEdges
          : adjacent.railwayEdges;
    if (!reverseEdges.includes((e + 3) % 6)) continue;
    const from = worldToScreen(p.x, p.y, vp);
    const adjacentCenter = axialToPixel(adjacent.q, adjacent.r, HEX_SIZE);
    const to = worldToScreen(adjacentCenter.x, adjacentCenter.y, vp);
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
  }
}

/** 10 — orders, supply network, ZOC and a temporary route preview. */
export function drawOperationalOverlayLayer(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  vp: Viewport,
  ui: RenderUI,
  preferences: MapLayerPreferences,
): void {
  if (preferences.showOrders) drawOrderRoutes(ctx, state, vp, vp.scale);
  if (preferences.showSupply) {
    ctx.save();
    ctx.strokeStyle = "rgba(214,184,89,0.72)";
    ctx.fillStyle = "rgba(214,184,89,0.86)";
    ctx.lineWidth = Math.max(1.5, vp.scale * 2);
    ctx.setLineDash([7, 4]);
    for (const unit of Object.values(state.units)) {
      if (unit.eliminated || unit.side !== ui.activeSide || unit.supplyState === "full") continue;
      const hex = state.hexes[unit.hexId];
      if (!hex) continue;
      const point = axialToPixel(hex.q, hex.r, HEX_SIZE);
      const screen = worldToScreen(point.x, point.y, vp);
      ctx.beginPath();
      ctx.arc(screen.x, screen.y, Math.max(9, 14 * vp.scale), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }
  if (ui.showZOC) {
    const zocHexIds = new Set<string>();
    for (const unit of Object.values(state.units)) {
      if (unit.side === ui.activeSide || unit.eliminated) continue;
      const origin = state.hexes[unit.hexId];
      if (!origin) continue;
      for (const adjacent of neighbors(origin)) {
        const id = `${adjacent.q}_${adjacent.r}`;
        const hex = state.hexes[id];
        if (hex && hex.terrain !== "sea" && hex.terrain !== "lake") zocHexIds.add(id);
      }
    }
    for (const id of zocHexIds) {
      const hex = state.hexes[id];
      if (!hex) continue;
      highlightHex(
        ctx,
        hex,
        vp,
        ui.activeSide === "germany" ? "rgba(151,48,38,0.09)" : "rgba(45,73,91,0.11)",
        null,
      );
    }
  }
  if (ui.routePath && ui.routePath.length > 1) {
    ctx.strokeStyle = C.gold;
    ctx.fillStyle = C.gold;
    ctx.lineWidth = Math.max(2, 2.5 * vp.scale);
    ctx.setLineDash([6, 4]);
    const points = ui.routePath.flatMap((id) => {
      const hex = state.hexes[id];
      if (!hex) return [];
      const point = axialToPixel(hex.q, hex.r, HEX_SIZE);
      return [worldToScreen(point.x, point.y, vp)];
    });
    ctx.beginPath();
    points.forEach((point, index) => {
      if (index === 0) ctx.moveTo(point.x, point.y);
      else ctx.lineTo(point.x, point.y);
    });
    ctx.stroke();
    ctx.setLineDash([]);
    if (points.length > 1) drawArrowHead(ctx, points.at(-2)!, points.at(-1)!, Math.max(7, 9 * vp.scale));
  }
}

/** 11 — counters only; max three visible counters per hex. */
export function drawUnitLayer(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  vp: Viewport,
  projection: MapProjection,
  ui: RenderUI,
): void {
  for (const id of projection.ids) {
    const hex = state.hexes[id];
    if (hex.stackUnitIds.length === 0) continue;
    const units = hex.stackUnitIds
      .map((unitId) => state.units[unitId])
      .filter((unit) => unit && !unit.eliminated) as UnitState[];
    if (units.length) drawStack(ctx, units, hex, vp, projection.lod, ui);
  }
}

function drawReachableMarker(
  ctx: CanvasRenderingContext2D,
  hex: HexState,
  vp: Viewport,
): void {
  const point = axialToPixel(hex.q, hex.r, HEX_SIZE);
  const center = worldToScreen(point.x, point.y, vp);
  ctx.beginPath();
  ctx.arc(center.x, center.y, Math.max(2.2, 3.2 * vp.scale), 0, Math.PI * 2);
  ctx.fillStyle = "rgba(151,190,112,0.74)";
  ctx.fill();
  ctx.strokeStyle = "rgba(30,55,27,0.7)";
  ctx.lineWidth = 0.8;
  ctx.stroke();
}

/** 12 — interaction language: dot, fill+brass, outline, target hatch. */
export function drawInteractionLayer(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  vp: Viewport,
  ui: RenderUI,
): void {
  if (ui.reachable) {
    for (const [id] of ui.reachable) {
      const hex = state.hexes[id];
      if (hex) drawReachableMarker(ctx, hex, vp);
    }
  }
  if (ui.attackTargetHexId && state.hexes[ui.attackTargetHexId]) {
    const target = state.hexes[ui.attackTargetHexId];
    highlightHex(ctx, target, vp, "rgba(174,52,40,0.18)", "#d05942", 2.5);
    const point = axialToPixel(target.q, target.r, HEX_SIZE);
    const center = worldToScreen(point.x, point.y, vp);
    const radius = Math.max(9, HEX_SIZE * vp.scale * 0.42);
    ctx.save();
    ctx.strokeStyle = "rgba(235,132,92,0.8)";
    ctx.lineWidth = 1.2;
    for (let offset = -radius; offset <= radius; offset += 6) {
      ctx.beginPath();
      ctx.moveTo(center.x + offset - 6, center.y + radius);
      ctx.lineTo(center.x + offset + 6, center.y - radius);
      ctx.stroke();
    }
    ctx.restore();
  }
  if (ui.selectedHexId && state.hexes[ui.selectedHexId]) {
    ctx.save();
    ctx.shadowColor = "rgba(224,189,101,0.38)";
    ctx.shadowBlur = 7;
    highlightHex(ctx, state.hexes[ui.selectedHexId], vp, "rgba(224,189,101,0.12)", C.gold, 2.8);
    ctx.restore();
  }
  if (ui.hoveredHexId && ui.hoveredHexId !== ui.selectedHexId && state.hexes[ui.hoveredHexId]) {
    highlightHex(ctx, state.hexes[ui.hoveredHexId], vp, null, "rgba(238,220,164,0.64)", 1.2);
  }
}

/** 13 — contact and battle effects, intentionally last. */
export function drawTransientEffectsLayer(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  vp: Viewport,
  ui: RenderUI,
): void {
  for (const contact of state.contacts.filter((item) => item.detectedBy.includes(ui.activeSide))) {
    const hex = state.hexes[contact.hexId];
    if (!hex) continue;
    drawOperationalBurst(
      ctx,
      hex,
      vp,
      contact.resolved ? "rgba(217,113,48,0.9)" : "rgba(255,151,55,0.98)",
      Math.max(7, 10 * vp.scale),
      contact.resolved,
    );
  }
  if (!["execution", "combat", "after_action"].includes(state.phase)) return;
  const resolutions =
    state.phase === "after_action"
      ? state.combatResolutions.slice(-10)
      : state.lastCombat
        ? [state.lastCombat]
        : [];
  for (const combat of resolutions) {
    const hex = state.hexes[combat.defenderHexId];
    if (hex) drawOperationalBurst(ctx, hex, vp, "rgba(226,70,40,0.96)", Math.max(9, 14 * vp.scale), true);
  }
}

/** Dynamic orchestrator for layers 10–13. */
export function drawDynamicLayer(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  vp: Viewport,
  view: View,
  ui: RenderUI,
  options: StaticMapOptions = {},
): void {
  const preferences = resolvePreferences(options);
  const projection = projectFrame(state, vp, view);
  ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
  drawOperationalOverlayLayer(ctx, state, vp, ui, preferences);
  drawUnitLayer(ctx, state, vp, projection, ui);
  drawInteractionLayer(ctx, state, vp, ui);
  drawTransientEffectsLayer(ctx, state, vp, ui);
}

function drawOperationalBurst(
  ctx: CanvasRenderingContext2D,
  hex: HexState,
  vp: Viewport,
  colour: string,
  radius: number,
  ring: boolean,
): void {
  const point = axialToPixel(hex.q, hex.r, HEX_SIZE);
  const center = worldToScreen(point.x, point.y, vp);
  ctx.save();
  ctx.translate(center.x, center.y);
  ctx.fillStyle = colour;
  ctx.shadowColor = colour;
  ctx.shadowBlur = Math.max(5, radius * 0.65);
  ctx.beginPath();
  for (let index = 0; index < 16; index++) {
    const angle = (Math.PI * 2 * index) / 16 - Math.PI / 2;
    const length = index % 2 === 0 ? radius : radius * 0.35;
    const x = Math.cos(angle) * length;
    const y = Math.sin(angle) * length;
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = "rgba(255,221,130,0.92)";
  ctx.beginPath();
  ctx.arc(0, 0, radius * 0.22, 0, Math.PI * 2);
  ctx.fill();
  if (ring) {
    ctx.strokeStyle = colour;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.arc(0, 0, radius * 2.35, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function highlightHex(
  ctx: CanvasRenderingContext2D,
  h: HexState,
  vp: Viewport,
  fill: string | null,
  stroke: string | null,
  lineWidth = 2.4,
): void {
  const p = axialToPixel(h.q, h.r, HEX_SIZE);
  const corners = hexCorners(0, 0, HEX_SIZE).map((c) => ({ x: (p.x + c.x + vp.ox) * vp.scale, y: (p.y + c.y + vp.oy) * vp.scale }));
  hexPath(ctx, corners);
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }
}

function drawStack(
  ctx: CanvasRenderingContext2D,
  units: UnitState[],
  h: HexState,
  vp: Viewport,
  lod: MapLod,
  ui: RenderUI,
): void {
  const p = axialToPixel(h.q, h.r, HEX_SIZE);
  const center = worldToScreen(p.x, p.y, vp);
  const counter = getCounterPresentation(vp.scale, lod);
  const size = counter.size;
  const stack = projectStack(units, ui.selectedUnitIds, counter.maxVisible);

  if (counter.mode === "summary") {
    const u = stack.visible[0];
    ctx.fillStyle = u.side === "germany" ? C.ger : C.sov;
    ctx.strokeStyle = "#15110a";
    ctx.lineWidth = ui.selectedUnitIds.includes(u.id) ? 2 : 1;
    ctx.beginPath();
    if (u.side === "germany") {
      ctx.rect(center.x - size * 0.22, center.y - size * 0.19, size * 0.44, size * 0.38);
    } else {
      ctx.moveTo(center.x, center.y - size * 0.25);
      ctx.lineTo(center.x + size * 0.24, center.y);
      ctx.lineTo(center.x, center.y + size * 0.25);
      ctx.lineTo(center.x - size * 0.24, center.y);
      ctx.closePath();
    }
    ctx.fill();
    ctx.stroke();
    if (units.length > 1) {
      ctx.fillStyle = u.side === "germany" ? C.gerText : C.sovText;
      ctx.font = `700 ${Math.round(size * 0.34)}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(units.length), center.x, center.y);
    }
    return;
  }

  const show = stack.visible;
  const dx = size * 0.16;
  for (let i = show.length - 1; i >= 0; i--) {
    const u = show[i];
    const ox = (i - (show.length - 1) / 2) * dx;
    const oy = (i - (show.length - 1) / 2) * dx;
    drawCounter(
      ctx,
      u,
      center.x + ox,
      center.y + oy,
      size,
      ui.selectedUnitIds.includes(u.id),
      counter.mode,
    );
  }
  if (stack.hiddenCount > 0) {
    ctx.fillStyle = "#17120c";
    ctx.strokeStyle = "rgba(232,209,150,0.64)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(center.x + size * 0.52, center.y + size * 0.42, size * 0.16, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#f0dfb5";
    ctx.font = `700 ${Math.round(size * 0.19)}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`+${stack.hiddenCount}`, center.x + size * 0.52, center.y + size * 0.42);
  }
}

function drawCounter(
  ctx: CanvasRenderingContext2D,
  u: UnitState,
  x: number,
  y: number,
  size: number,
  selected: boolean,
  mode: "compact" | "full",
): void {
  const w = size * 0.92;
  const hgt = size * 0.78;
  const fill = u.side === "germany" ? C.ger : C.sov;
  const dark = u.side === "germany" ? C.gerDark : C.sovDark;
  const txt = u.side === "germany" ? C.gerText : C.sovText;
  const accent = u.side === "germany" ? C.gerAccent : C.sovAccent;
  const x0 = x - w / 2;
  const y0 = y - hgt / 2;
  const isHq = u.echelon === "corps_hq" || u.echelon === "army_hq" || u.echelon === "front_hq";
  const r = u.side === "germany" ? 2 : 4;

  // Shadow
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  roundRect(ctx, x0 + 1.5, y0 + 2, w, hgt, r);
  ctx.fill();
  // Body
  ctx.fillStyle = fill;
  if (u.side === "ussr" && isHq) {
    ctx.beginPath();
    ctx.moveTo(x0 + w * 0.12, y0);
    ctx.lineTo(x0 + w, y0);
    ctx.lineTo(x0 + w, y0 + hgt);
    ctx.lineTo(x0, y0 + hgt);
    ctx.lineTo(x0, y0 + hgt * 0.12);
    ctx.closePath();
  } else {
    roundRect(ctx, x0, y0, w, hgt, r);
  }
  ctx.fill();
  // Inner bevel
  ctx.strokeStyle = dark;
  ctx.lineWidth = 1.4;
  roundRect(ctx, x0, y0, w, hgt, r);
  ctx.stroke();
  if (selected) {
    ctx.strokeStyle = C.gold;
    ctx.lineWidth = 2;
    roundRect(ctx, x0 - 1.5, y0 - 1.5, w + 3, hgt + 3, r + 1);
    ctx.stroke();
  }

  // HQ stripe
  if (isHq) {
    ctx.fillStyle = accent;
    ctx.fillRect(x0, y0, w, 2.4);
    ctx.strokeStyle = accent;
    ctx.lineWidth = 0.9;
    roundRect(ctx, x0 + 2.5, y0 + 2.5, w - 5, hgt - 5, Math.max(1, r - 1));
    ctx.stroke();
  }

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // Short name
  ctx.fillStyle = txt;
  ctx.font = `600 ${Math.round(size * 0.2)}px sans-serif`;
  ctx.fillText(u.shortName.slice(0, 8), x, y0 + hgt * 0.2);

  // NATO-style symbol
  drawSymbol(ctx, u, x, y, size, txt, accent);

  // Stats row: atk / def / mv
  if (mode === "full") {
    ctx.font = `${Math.round(size * 0.17)}px sans-serif`;
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.fillText(`${u.attack}-${u.defense}-${u.movement}`, x, y0 + hgt * 0.82);
  }

  // Step pips
  const pipR = Math.max(1.2, size * 0.05);
  for (let i = 0; i < u.maxSteps; i++) {
    ctx.beginPath();
    ctx.arc(x0 + 3 + i * (pipR * 2 + 1.5), y0 + hgt - 3, pipR, 0, Math.PI * 2);
    ctx.fillStyle = i < u.currentSteps ? "#f4e3a1" : "rgba(255,255,255,0.25)";
    ctx.fill();
  }

  // Supply dot (top-right)
  const supColor: Record<string, string> = { full: "#7bbf6a", limited: "#d8c24a", low: "#e0a13b", isolated: "#cf5b3a", none: "#9c2f24" };
  if (size > 22) {
    const sx = x0 + w - 4;
    const sy = y0 + 4;
    ctx.fillStyle = supColor[u.supplyState] ?? "#888";
    ctx.beginPath();
    if (u.supplyState === "full") {
      ctx.arc(sx, sy, pipR + 0.5, 0, Math.PI * 2);
    } else if (u.supplyState === "limited" || u.supplyState === "low") {
      ctx.rect(sx - pipR, sy - pipR, pipR * 2, pipR * 2);
    } else {
      ctx.moveTo(sx, sy - pipR - 1);
      ctx.lineTo(sx + pipR + 1, sy + pipR);
      ctx.lineTo(sx - pipR - 1, sy + pipR);
      ctx.closePath();
    }
    ctx.fill();
  }
}

function drawSymbol(ctx: CanvasRenderingContext2D, u: UnitState, x: number, y: number, size: number, color: string, accent: string): void {
  const s = size * 0.16;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = Math.max(1, size * 0.045);
  const cy = y - size * 0.04;
  const isHq = u.echelon === "corps_hq" || u.echelon === "army_hq" || u.echelon === "front_hq";

  if (isHq) {
    // Flag symbol for headquarters
    ctx.strokeStyle = accent;
    ctx.beginPath();
    ctx.moveTo(x - s, cy - s);
    ctx.lineTo(x - s, cy + s);
    ctx.moveTo(x - s, cy - s);
    ctx.lineTo(x + s, cy - s * 0.5);
    ctx.lineTo(x - s, cy);
    ctx.stroke();
    return;
  }

  switch (u.unitType) {
    case "tank":
    case "mechanized":
      // armour: ellipse with bar
      ctx.beginPath();
      ctx.ellipse(x, cy, s * 1.2, s * 0.8, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x - s * 1.2, cy);
      ctx.lineTo(x + s * 1.2, cy);
      ctx.stroke();
      break;
    case "motorized":
      ctx.beginPath();
      ctx.ellipse(x, cy, s, s * 0.7, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x, cy, s * 0.32, 0, Math.PI * 2);
      ctx.stroke();
      break;
    case "artillery":
      ctx.beginPath();
      ctx.ellipse(x, cy, s, s * 0.7, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    case "cavalry":
      ctx.beginPath();
      ctx.moveTo(x - s, cy + s * 0.5);
      ctx.quadraticCurveTo(x, cy - s, x + s, cy + s * 0.5);
      ctx.stroke();
      break;
    case "engineer":
      ctx.beginPath();
      ctx.moveTo(x - s, cy + s);
      ctx.lineTo(x, cy - s);
      ctx.lineTo(x + s, cy + s);
      ctx.stroke();
      break;
    case "air":
      ctx.beginPath();
      ctx.moveTo(x, cy - s);
      ctx.lineTo(x + s, cy + s);
      ctx.lineTo(x - s, cy + s);
      ctx.closePath();
      ctx.fill();
      break;
    default:
      // infantry / rifle: rectangle frame with X
      ctx.strokeRect(x - s, cy - s * 0.7, s * 2, s * 1.4);
      ctx.beginPath();
      ctx.moveTo(x - s, cy - s * 0.7);
      ctx.lineTo(x + s, cy + s * 0.7);
      ctx.moveTo(x + s, cy - s * 0.7);
      ctx.lineTo(x - s, cy + s * 0.7);
      ctx.stroke();
  }
  if (u.traits.includes("heavy_armor")) {
    ctx.strokeStyle = accent;
    ctx.beginPath();
    ctx.arc(x, cy, s * 1.5, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Compute a viewport that fits the given world bounds into the view. */
export function fitViewport(bounds: { minX: number; minY: number; maxX: number; maxY: number }, view: View): Viewport {
  const w = bounds.maxX - bounds.minX + HEX_SIZE * 2;
  const h = bounds.maxY - bounds.minY + HEX_SIZE * 2;
  const scale = Math.min(view.width / w, view.height / h) * 0.96;
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cy = (bounds.minY + bounds.maxY) / 2;
  return { scale, ox: view.width / 2 / scale - cx, oy: view.height / 2 / scale - cy };
}
