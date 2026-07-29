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

/** Single source of truth for visual detail thresholds. */
export const MAP_LOD = {
  far: 0.5,
  medium: 0.7,
  close: 0.95,
} as const;

const C = {
  paper: "#d9d0b8",
  clear: "#dbd1b7",
  forest: "#84916a",
  dforest: "#617454",
  swamp: "#afa77c",
  city: "#c3af84",
  mcity: "#9f8653",
  fort: "#bd9e6d",
  coast: "#d7c9ab",
  lake: "#99afbb",
  sea: "#819caf",
  river: "#607f95",
  road: "#ab8950",
  mroad: "#76572d",
  rail: "#39362d",
  ger: "#596d7a",
  gerDark: "#2d3c43",
  gerText: "#f6f0df",
  gerAccent: "#bdd0d4",
  sov: "#91483d",
  sovDark: "#57271f",
  sovText: "#f8edd9",
  sovAccent: "#e1c68a",
  gold: "#9d742d",
  grid: "rgba(63,59,46,0.22)",
  gridStrong: "rgba(59,55,42,0.45)",
};

const terrainFill = (t: HexState["terrain"]): string => {
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

function visibleHexIds(state: GameState, vp: Viewport, view: View): string[] {
  const pad = HEX_SIZE * vp.scale + 4;
  const out: string[] = [];
  for (const id in state.hexes) {
    const h = state.hexes[id];
    const p = axialToPixel(h.q, h.r, HEX_SIZE);
    const s = worldToScreen(p.x, p.y, vp);
    if (isVisible(s.x, s.y, view, pad)) out.push(id);
  }
  return out;
}

function hexPath(ctx: CanvasRenderingContext2D, corners: { x: number; y: number }[]): void {
  ctx.beginPath();
  ctx.moveTo(corners[0].x, corners[0].y);
  for (let i = 1; i < corners.length; i++) ctx.lineTo(corners[i].x, corners[i].y);
  ctx.closePath();
}

/** Static geography: terrain, control wash, front line, rivers, roads, rails. */
export function drawStaticLayer(ctx: CanvasRenderingContext2D, state: GameState, vp: Viewport, view: View): void {
  ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
  ctx.fillStyle = C.sea;
  ctx.fillRect(0, 0, view.width, view.height);
  const detail = vp.scale;
  const ids = visibleHexIds(state, vp, view);

  // Only the current side's plan is rendered. Opponent orders remain hidden
  // until the engine exposes them through detected contacts.
  const ownOrders = state.plans[state.activeSide]?.orders ?? [];
  for (const order of ownOrders) {
    if (!order.route || order.route.length < 2 || order.status === "cancelled") continue;
    ctx.strokeStyle =
      order.status === "delayed"
        ? "rgba(205,137,62,0.9)"
        : order.status === "failed"
          ? "rgba(173,58,48,0.9)"
          : state.activeSide === "germany"
            ? "rgba(58,91,132,0.9)"
            : "rgba(167,51,51,0.9)";
    ctx.lineWidth = Math.max(2, 2.5 * detail);
    ctx.setLineDash(order.status === "draft" ? [8, 5] : []);
    ctx.beginPath();
    for (let index = 0; index < order.route.length; index++) {
      const hex = state.hexes[order.route[index]];
      if (!hex) continue;
      const point = axialToPixel(hex.q, hex.r, HEX_SIZE);
      const screen = worldToScreen(point.x, point.y, vp);
      if (index === 0) ctx.moveTo(screen.x, screen.y);
      else ctx.lineTo(screen.x, screen.y);
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // 1. Terrain fill + control wash
  for (const id of ids) {
    const h = state.hexes[id];
    const p = axialToPixel(h.q, h.r, HEX_SIZE);
    const corners = hexCorners(0, 0, HEX_SIZE).map((c) => ({ x: (p.x + c.x + vp.ox) * vp.scale, y: (p.y + c.y + vp.oy) * vp.scale }));
    hexPath(ctx, corners);
    ctx.fillStyle = terrainFill(h.terrain);
    ctx.fill();
    // Territory wash
    if (h.terrain !== "sea" && h.terrain !== "lake") {
      if (h.control === "germany") {
        ctx.fillStyle = "rgba(74,89,112,0.16)";
        ctx.fill();
      } else if (h.control === "ussr") {
        ctx.fillStyle = "rgba(138,59,50,0.13)";
        ctx.fill();
      }
    }
  }

  // 2. Hex grid
  ctx.lineWidth = detail > 0.7 ? 1 : 0.5;
  ctx.strokeStyle = detail > 0.9 ? C.gridStrong : C.grid;
  if (detail > 0.42) {
    for (const id of ids) {
      const h = state.hexes[id];
      if (h.terrain === "sea") continue;
      const p = axialToPixel(h.q, h.r, HEX_SIZE);
      const corners = hexCorners(0, 0, HEX_SIZE).map((c) => ({ x: (p.x + c.x + vp.ox) * vp.scale, y: (p.y + c.y + vp.oy) * vp.scale }));
      hexPath(ctx, corners);
      ctx.stroke();
    }
  }

  // 3. Front line: edges where adjacent control differs.
  ctx.lineWidth = Math.max(2, 2.6 * detail);
  ctx.strokeStyle = "rgba(40,30,18,0.5)";
  for (const id of ids) {
    const h = state.hexes[id];
    if (h.terrain === "sea" || h.terrain === "lake") continue;
    if (h.control === "neutral") continue;
    const a: Axial = { q: h.q, r: h.r };
    const p = axialToPixel(h.q, h.r, HEX_SIZE);
    for (let dir = 0; dir < 6; dir++) {
      const n = neighbors(a)[dir];
      const nh = state.hexes[`${n.q}_${n.r}`];
      if (!nh || nh.terrain === "sea" || nh.terrain === "lake") continue;
      if (nh.control !== h.control && nh.control !== "neutral") {
        const edge = sharedEdge(a, n);
        if (edge == null) continue;
        const ma = edgeMidpoint(h.q, h.r, (edge + 1) % 6, HEX_SIZE);
        const mb = edgeMidpoint(h.q, h.r, (edge + 5) % 6, HEX_SIZE);
        const from = worldToScreen((p.x + ma.x) / 2, (p.y + ma.y) / 2, vp);
        const to = worldToScreen((p.x + mb.x) / 2, (p.y + mb.y) / 2, vp);
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.stroke();
      }
    }
  }

  // 4. Rivers (drawn along edges)
  ctx.lineCap = "round";
  ctx.lineWidth = Math.max(1.4, 2.4 * detail);
  ctx.strokeStyle = C.river;
  for (const id of ids) {
    const h = state.hexes[id];
    const p = axialToPixel(h.q, h.r, HEX_SIZE);
    for (const e of h.riverEdges) {
      const m = edgeMidpoint(h.q, h.r, e, HEX_SIZE);
      // short segment across the edge (center -> midpoint) so adjacent hexes connect
      const from = worldToScreen(p.x + (m.x - p.x) * 0.45, p.y + (m.y - p.y) * 0.45, vp);
      const to = worldToScreen(m.x, m.y, vp);
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
    }
  }

  // 5. Roads & railways
  if (detail > 0.4) {
    // minor roads
    ctx.strokeStyle = C.road;
    ctx.lineWidth = Math.max(1, 1.6 * detail);
    for (const id of ids) {
      drawEdgeLines(ctx, state.hexes[id], vp, "road");
    }
    // major roads
    ctx.strokeStyle = C.mroad;
    ctx.lineWidth = Math.max(1.6, 2.6 * detail);
    for (const id of ids) drawEdgeLines(ctx, state.hexes[id], vp, "major");
  }
  if (detail > 0.55) {
    ctx.strokeStyle = C.rail;
    ctx.lineWidth = Math.max(1, 1.4 * detail);
    ctx.setLineDash([4 * detail, 3 * detail]);
    for (const id of ids) drawEdgeLines(ctx, state.hexes[id], vp, "rail");
    ctx.setLineDash([]);
  }

  // 6. Bridges
  if (detail > 0.6) {
    for (const id of ids) {
      const h = state.hexes[id];
      const p = axialToPixel(h.q, h.r, HEX_SIZE);
      for (const b of h.bridgeEdges) {
        const m = edgeMidpoint(h.q, h.r, b.edge, HEX_SIZE);
        const s = worldToScreen(m.x, m.y, vp);
        ctx.lineWidth = Math.max(1.5, 2.4 * detail);
        if (b.state === "destroyed") {
          ctx.strokeStyle = "#b23b2e";
          ctx.beginPath();
          ctx.moveTo(s.x - 4, s.y - 4);
          ctx.lineTo(s.x + 4, s.y + 4);
          ctx.moveTo(s.x + 4, s.y - 4);
          ctx.lineTo(s.x - 4, s.y + 4);
          ctx.stroke();
        } else {
          ctx.strokeStyle = b.state === "pontoon" ? "#7a6a9c" : "#3a2f1c";
          ctx.beginPath();
          ctx.moveTo(s.x - 4, s.y);
          ctx.lineTo(s.x + 4, s.y);
          ctx.stroke();
        }
        void p;
      }
    }
  }

  // 7. Settlements
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const id of ids) {
    const h = state.hexes[id];
    if (!h.settlement) continue;
    const imp = h.settlement.importance;
    if (detail < 0.6 && !(imp === "strategic" || imp === "major")) continue;
    if (detail < 0.4 && imp !== "strategic") continue;
    const p = axialToPixel(h.q, h.r, HEX_SIZE);
    const s = worldToScreen(p.x, p.y + HEX_SIZE * 0.62, vp);
    const dotR = imp === "strategic" ? 4 : imp === "major" ? 3.2 : 2.4;
    ctx.fillStyle = imp === "strategic" || imp === "major" ? "#2c2417" : "#4a3f2a";
    ctx.beginPath();
    ctx.arc(worldToScreen(p.x, p.y, vp).x, worldToScreen(p.x, p.y, vp).y, dotR * Math.max(0.8, detail), 0, Math.PI * 2);
    ctx.fill();
    if (detail > 0.62) {
      ctx.fillStyle = "#241d12";
      ctx.font = `${imp === "strategic" ? "600 " : ""}${Math.round(10 + 3 * detail)}px 'Iowan Old Style', Georgia, serif`;
      ctx.fillText(h.settlement.name, s.x, s.y);
    }
  }
}

function drawEdgeLines(ctx: CanvasRenderingContext2D, h: HexState, vp: Viewport, kind: "road" | "major" | "rail"): void {
  const edges = kind === "road" ? h.roadEdges : kind === "major" ? h.majorRoadEdges : h.railwayEdges;
  const p = axialToPixel(h.q, h.r, HEX_SIZE);
  for (const e of edges) {
    const m = edgeMidpoint(h.q, h.r, e, HEX_SIZE);
    const from = worldToScreen(p.x + (m.x - p.x) * 0.5, p.y + (m.y - p.y) * 0.5, vp);
    const to = worldToScreen(m.x, m.y, vp);
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
  }
}

/** Dynamic layer: selection, hover, reachable, route, units. */
export function drawDynamicLayer(ctx: CanvasRenderingContext2D, state: GameState, vp: Viewport, view: View, ui: RenderUI): void {
  ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
  ctx.clearRect(0, 0, view.width, view.height);
  const detail = vp.scale;
  const ids = visibleHexIds(state, vp, view);

  // Reachable hexes
  if (ui.reachable) {
    ctx.fillStyle = "rgba(96,150,90,0.30)";
    ctx.strokeStyle = "rgba(60,110,55,0.6)";
    ctx.lineWidth = 1;
    for (const [id] of ui.reachable) {
      highlightHex(ctx, state.hexes[id], vp, ctx.fillStyle, null);
    }
    for (const [id] of ui.reachable) highlightHex(ctx, state.hexes[id], vp, null, "rgba(60,110,55,0.5)");
  }

  // Attack target
  if (ui.attackTargetHexId && state.hexes[ui.attackTargetHexId]) {
    highlightHex(ctx, state.hexes[ui.attackTargetHexId], vp, "rgba(190,60,48,0.32)", "#b23b2e");
  }

  // Selected hex ring
  if (ui.selectedHexId && state.hexes[ui.selectedHexId]) {
    highlightHex(ctx, state.hexes[ui.selectedHexId], vp, null, C.gold);
  }
  // Hover ring
  if (ui.hoveredHexId && ui.hoveredHexId !== ui.selectedHexId && state.hexes[ui.hoveredHexId]) {
    highlightHex(ctx, state.hexes[ui.hoveredHexId], vp, "rgba(201,162,75,0.16)", "rgba(201,162,75,0.7)");
  }

  // Route path
  if (ui.routePath && ui.routePath.length > 1) {
    ctx.strokeStyle = C.gold;
    ctx.lineWidth = Math.max(2, 2.5 * detail);
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    for (let i = 0; i < ui.routePath.length; i++) {
      const h = state.hexes[ui.routePath[i]];
      if (!h) continue;
      const p = axialToPixel(h.q, h.r, HEX_SIZE);
      const s = worldToScreen(p.x, p.y, vp);
      if (i === 0) ctx.moveTo(s.x, s.y);
      else ctx.lineTo(s.x, s.y);
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Units / counters
  for (const id of ids) {
    const h = state.hexes[id];
    if (h.stackUnitIds.length === 0) continue;
    const units = h.stackUnitIds.map((uid) => state.units[uid]).filter((u) => u && !u.eliminated) as UnitState[];
    if (units.length === 0) continue;
    drawStack(ctx, units, h, vp, detail, ui);
  }
}

function highlightHex(ctx: CanvasRenderingContext2D, h: HexState, vp: Viewport, fill: string | null, stroke: string | null): void {
  const p = axialToPixel(h.q, h.r, HEX_SIZE);
  const corners = hexCorners(0, 0, HEX_SIZE).map((c) => ({ x: (p.x + c.x + vp.ox) * vp.scale, y: (p.y + c.y + vp.oy) * vp.scale }));
  hexPath(ctx, corners);
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 2.4;
    ctx.stroke();
  }
}

function drawStack(ctx: CanvasRenderingContext2D, units: UnitState[], h: HexState, vp: Viewport, detail: number, ui: RenderUI): void {
  const p = axialToPixel(h.q, h.r, HEX_SIZE);
  const center = worldToScreen(p.x, p.y, vp);
  const size = Math.max(15, Math.min(64, HEX_SIZE * detail * 1.35));
  const isSel = units.some((u) => ui.selectedUnitIds.includes(u.id));

  if (detail < 0.5) {
    // Far: simple marker.
    const u = units[0];
    ctx.fillStyle = u.side === "germany" ? C.ger : C.sov;
    ctx.strokeStyle = "#15110a";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(center.x, center.y, Math.max(3, size * 0.22), 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    if (units.length > 1) {
      ctx.fillStyle = "#fff";
      ctx.font = `${Math.round(size * 0.3)}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(units.length), center.x, center.y);
    }
    return;
  }

  const show = units.slice(0, 4);
  const dx = size * 0.16;
  for (let i = show.length - 1; i >= 0; i--) {
    const u = show[i];
    const ox = (i - (show.length - 1) / 2) * dx;
    const oy = (i - (show.length - 1) / 2) * dx;
    drawCounter(ctx, u, center.x + ox, center.y + oy, size, isSel && i === 0);
  }
  if (units.length > 4) {
    ctx.fillStyle = "#1a140a";
    ctx.font = `600 ${Math.round(size * 0.26)}px sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(`+${units.length - 4}`, center.x + size * 0.5, center.y + size * 0.5);
  }
}

function drawCounter(ctx: CanvasRenderingContext2D, u: UnitState, x: number, y: number, size: number, selected: boolean): void {
  const w = size * 0.92;
  const hgt = size * 0.78;
  const fill = u.side === "germany" ? C.ger : C.sov;
  const dark = u.side === "germany" ? C.gerDark : C.sovDark;
  const txt = u.side === "germany" ? C.gerText : C.sovText;
  const accent = u.side === "germany" ? C.gerAccent : C.sovAccent;
  const x0 = x - w / 2;
  const y0 = y - hgt / 2;
  const r = 1.25;

  // Shadow
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  roundRect(ctx, x0 + 1.5, y0 + 2, w, hgt, r);
  ctx.fill();
  // Body
  ctx.fillStyle = fill;
  roundRect(ctx, x0, y0, w, hgt, r);
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

  // Headquarters have a flag plus a double command rule: readable without colour.
  const isHq = u.echelon === "corps_hq" || u.echelon === "army_hq" || u.echelon === "front_hq";
  if (isHq) {
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x0 + 1, y0 + 2.5);
    ctx.lineTo(x0 + w - 1, y0 + 2.5);
    ctx.moveTo(x0 + 1, y0 + 5);
    ctx.lineTo(x0 + w - 1, y0 + 5);
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
  if (size > 26) {
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

  // Supply is a shape as well as a colour: circle / half circle / triangle / slash / cross.
  if (size > 22) drawSupplyMark(ctx, u.supplyState, x0 + w - 5, y0 + 5, Math.max(2.5, pipR + 1));
}

function drawSupplyMark(ctx: CanvasRenderingContext2D, state: UnitState["supplyState"], x: number, y: number, r: number): void {
  const colors: Record<UnitState["supplyState"], string> = { full: "#5f7d54", limited: "#b59035", low: "#b85b31", isolated: "#a74032", none: "#54251f" };
  ctx.save();
  ctx.strokeStyle = colors[state];
  ctx.fillStyle = colors[state];
  ctx.lineWidth = 1.3;
  if (state === "full") { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }
  else if (state === "limited") { ctx.beginPath(); ctx.arc(x, y, r, Math.PI, 0); ctx.lineTo(x + r, y); ctx.closePath(); ctx.fill(); }
  else if (state === "low") { ctx.beginPath(); ctx.moveTo(x, y - r); ctx.lineTo(x + r, y + r); ctx.lineTo(x - r, y + r); ctx.closePath(); ctx.fill(); }
  else if (state === "isolated") { ctx.beginPath(); ctx.moveTo(x - r, y + r); ctx.lineTo(x + r, y - r); ctx.stroke(); }
  else { ctx.beginPath(); ctx.moveTo(x - r, y - r); ctx.lineTo(x + r, y + r); ctx.moveTo(x + r, y - r); ctx.lineTo(x - r, y + r); ctx.stroke(); }
  ctx.restore();
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
