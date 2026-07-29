"use client";

import { useEffect, useMemo, useRef } from "react";
import type { GameState, Side } from "@/engine/types";
import {
  drawDynamicLayer,
  drawStaticLayer,
  fitViewport,
  screenToHex,
  worldToScreen,
  type RenderUI,
  type Viewport,
} from "@/renderer/draw";
import { HEX_SIZE, axialToPixel } from "@/engine/hex";
import type { Reachable as Reach } from "@/engine/rules";
import { Icon } from "@/components/Icon";

interface Props {
  state: GameState;
  selectedHexId: string | null;
  selectedUnitIds: string[];
  reachable: Map<string, Reach> | null;
  attackTargetHexId: string | null;
  showZOC: boolean;
  activeSide: Side;
  onHexClick: (hexId: string | null) => void;
}

export default function GameMap({
  state,
  selectedHexId,
  selectedUnitIds,
  reachable,
  attackTargetHexId,
  showZOC,
  activeSide,
  onHexClick,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const offRef = useRef<HTMLCanvasElement | null>(null);
  const vpRef = useRef<Viewport>({ scale: 1, ox: 0, oy: 0 });
  const viewRef = useRef({ width: 800, height: 600, dpr: 1 });
  const flagsRef = useRef({ needsRender: true, staticDirty: true, inited: false });
  const hoverRef = useRef<string | null>(null);
  const dragRef = useRef<{ down: boolean; moved: boolean; x: number; y: number; sx: number; sy: number }>({
    down: false,
    moved: false,
    x: 0,
    y: 0,
    sx: 0,
    sy: 0,
  });

  const bounds = useMemo(() => {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const id in state.hexes) {
      const h = state.hexes[id];
      const p = axialToPixel(h.q, h.r, HEX_SIZE);
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
    return { minX, minY, maxX, maxY };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.scenarioId]);

  // Initialise / resize canvas + offscreen.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement!;
    const resize = () => {
      const rect = parent.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      viewRef.current = { width: rect.width, height: rect.height, dpr };
      for (const c of [canvas, offRef.current]) {
        if (!c) continue;
        c.width = Math.round(rect.width * dpr);
        c.height = Math.round(rect.height * dpr);
        c.style.width = `${rect.width}px`;
        c.style.height = `${rect.height}px`;
      }
      if (!flagsRef.current.inited) {
        vpRef.current = fitViewport(bounds, viewRef.current);
        flagsRef.current.inited = true;
      }
      flagsRef.current.staticDirty = true;
      flagsRef.current.needsRender = true;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(parent);
    return () => ro.disconnect();
  }, [bounds]);

  // Mark static dirty whenever the game state reference changes.
  useEffect(() => {
    flagsRef.current.staticDirty = true;
    flagsRef.current.needsRender = true;
  }, [state]);

  // Native non-passive wheel for zoom.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      const vp = vpRef.current;
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      const newScale = Math.max(0.32, Math.min(3.2, vp.scale * factor));
      const wx = cx / vp.scale - vp.ox;
      const wy = cy / vp.scale - vp.oy;
      vp.scale = newScale;
      vp.ox = cx / newScale - wx;
      vp.oy = cy / newScale - wy;
      flagsRef.current.staticDirty = true;
      flagsRef.current.needsRender = true;
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, []);

  // Render loop.
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const flags = flagsRef.current;
      if (!flags.needsRender) return;
      flags.needsRender = false;
      const canvas = canvasRef.current;
      const off = offRef.current;
      if (!canvas || !off) return;
      const ctx = canvas.getContext("2d");
      const offCtx = off.getContext("2d");
      if (!ctx || !offCtx) return;
      const vp = vpRef.current;
      const view = viewRef.current;
      if (flags.staticDirty) {
        drawStaticLayer(offCtx, state, vp, view);
        flags.staticDirty = false;
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(off, 0, 0);
      const hovered = hoverRef.current;
      const routePath =
        reachable && hovered && reachable.has(hovered) ? (reachable.get(hovered) as Reach)?.path ?? null : null;
      const ui: RenderUI = {
        selectedHexId,
        selectedUnitIds,
        hoveredHexId: hovered,
        reachable: reachable ? new Map([...reachable].map(([k, v]) => [k, v.cost])) : null,
        attackTargetHexId,
        routePath,
        showZOC,
        activeSide,
      };
      drawDynamicLayer(ctx, state, vp, view, ui);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [state, selectedHexId, selectedUnitIds, reachable, attackTargetHexId, showZOC, activeSide]);

  // Pointer interaction.
  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { down: true, moved: false, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    const vp = vpRef.current;
    if (d.down) {
      const dx = e.clientX - d.x;
      const dy = e.clientY - d.y;
      if (Math.abs(e.clientX - d.sx) + Math.abs(e.clientY - d.sy) > 4) d.moved = true;
      vp.ox += dx / vp.scale;
      vp.oy += dy / vp.scale;
      d.x = e.clientX;
      d.y = e.clientY;
      flagsRef.current.staticDirty = true;
      flagsRef.current.needsRender = true;
    }
    // hover
    const rect = canvasRef.current!.getBoundingClientRect();
    const hx = screenToHex(e.clientX - rect.left, e.clientY - rect.top, vp);
    const id = `${hx.q}_${hx.r}`;
    const newHover = state.hexes[id] ? id : null;
    if (newHover !== hoverRef.current) {
      hoverRef.current = newHover;
      flagsRef.current.needsRender = true;
    }
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const d = dragRef.current;
    d.down = false;
    if (!d.moved) {
      const rect = canvasRef.current!.getBoundingClientRect();
      const vp = vpRef.current;
      const hx = screenToHex(e.clientX - rect.left, e.clientY - rect.top, vp);
      const id = `${hx.q}_${hx.r}`;
      onHexClick(state.hexes[id] ? id : null);
    }
  };

  const zoomBy = (factor: number) => {
    const vp = vpRef.current;
    const view = viewRef.current;
    const cx = view.width / 2;
    const cy = view.height / 2;
    const newScale = Math.max(0.32, Math.min(3.2, vp.scale * factor));
    const wx = cx / vp.scale - vp.ox;
    const wy = cy / vp.scale - vp.oy;
    vp.scale = newScale;
    vp.ox = cx / newScale - wx;
    vp.oy = cy / newScale - wy;
    flagsRef.current.staticDirty = true;
    flagsRef.current.needsRender = true;
  };

  const refit = () => {
    vpRef.current = fitViewport(bounds, viewRef.current);
    flagsRef.current.staticDirty = true;
    flagsRef.current.needsRender = true;
  };

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#7d99b1]">
      <canvas
        ref={canvasRef}
        className="block h-full w-full cursor-crosshair touch-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => {
          if (hoverRef.current) {
            hoverRef.current = null;
            flagsRef.current.needsRender = true;
          }
        }}
      />
      <canvas ref={offRef} className="hidden" />
      <div className="pointer-events-none absolute left-3 top-3 border border-[#57594f]/70 bg-[#f1e8d2]/90 px-2 py-1 text-[9px] uppercase tracking-[.1em] text-staff-ink-dim">
        Панорама · колесо: масштаб
      </div>
      <div className="absolute bottom-3 right-3 flex flex-col border border-[#77715e] bg-[#f1e8d2] shadow-[1px_2px_4px_rgba(34,31,22,.28)]">
        <button aria-label="Приблизить карту" title="Приблизить" onClick={() => zoomBy(1.2)} className="flex h-10 w-10 items-center justify-center border-b border-staff-edge text-staff-ink hover:bg-staff-panel2"><Icon name="zoomIn" className="h-4 w-4" /></button>
        <button aria-label="Отдалить карту" title="Отдалить" onClick={() => zoomBy(1 / 1.2)} className="flex h-10 w-10 items-center justify-center border-b border-staff-edge text-staff-ink hover:bg-staff-panel2"><Icon name="zoomOut" className="h-4 w-4" /></button>
        <button aria-label="Показать весь театр" title="Показать весь театр" onClick={refit} className="flex h-10 w-10 items-center justify-center text-staff-ink hover:bg-staff-panel2"><Icon name="map" className="h-4 w-4" /></button>
      </div>
    </div>
  );
}
