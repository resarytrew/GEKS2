"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { GameState, Side } from "@/engine/types";
import {
  drawContextCache,
  drawDynamicLayer,
  drawTerrainCache,
  fitViewport,
  screenToHex,
  type RenderUI,
  type Viewport,
} from "@/renderer/draw";
import {
  DEFAULT_MAP_PREFERENCES,
  MAP_LAYER_PRESETS,
  MAP_PREFERENCES_STORAGE_KEY,
  normalizeMapPreferences,
  type MapLayerPreferences,
  type MapLayerPresetId,
} from "@/renderer/mapVisualConfig";
import {
  getMapRenderBenchmark,
  recordMapRenderSample,
} from "@/renderer/mapPerformance";
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
  onToggleZOC?: () => void;
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
  onToggleZOC,
  activeSide,
  onHexClick,
}: Props) {
  const [preferences, setPreferences] = useState<MapLayerPreferences>(DEFAULT_MAP_PREFERENCES);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const preferencesHydratedRef = useRef(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const terrainRef = useRef<HTMLCanvasElement | null>(null);
  const contextRef = useRef<HTMLCanvasElement | null>(null);
  const vpRef = useRef<Viewport>({ scale: 1, ox: 0, oy: 0 });
  const viewRef = useRef({ width: 800, height: 600, dpr: 1 });
  const flagsRef = useRef({
    needsRender: true,
    terrainDirty: true,
    contextDirty: true,
    inited: false,
  });
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

  useEffect(() => {
    let restored: MapLayerPreferences | null = null;
    try {
      const saved = window.localStorage.getItem(MAP_PREFERENCES_STORAGE_KEY);
      if (saved) restored = normalizeMapPreferences(JSON.parse(saved));
    } catch {}
    queueMicrotask(() => {
      if (restored) setPreferences(restored);
      preferencesHydratedRef.current = true;
    });
  }, []);

  useEffect(() => {
    if (!preferencesHydratedRef.current) return;
    window.localStorage.setItem(MAP_PREFERENCES_STORAGE_KEY, JSON.stringify(preferences));
  }, [preferences]);

  // Initialise / resize canvas + two offscreen caches.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (!terrainRef.current) terrainRef.current = document.createElement("canvas");
    if (!contextRef.current) contextRef.current = document.createElement("canvas");
    const parent = canvas.parentElement!;
    const resize = () => {
      const rect = parent.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const previous = viewRef.current;
      const dimensionsChanged =
        Math.abs(previous.width - rect.width) > 0.5 ||
        Math.abs(previous.height - rect.height) > 0.5 ||
        previous.dpr !== dpr;
      if (!dimensionsChanged && flagsRef.current.inited) return;
      viewRef.current = { width: rect.width, height: rect.height, dpr };
      const pixelWidth = Math.max(1, Math.round(rect.width * dpr));
      const pixelHeight = Math.max(1, Math.round(rect.height * dpr));
      for (const c of [canvas, terrainRef.current, contextRef.current]) {
        if (!c) continue;
        if (c.width !== pixelWidth) c.width = pixelWidth;
        if (c.height !== pixelHeight) c.height = pixelHeight;
      }
      if (!flagsRef.current.inited) {
        vpRef.current = focusedViewport(bounds, viewRef.current, state);
        flagsRef.current.inited = true;
      }
      flagsRef.current.terrainDirty = true;
      flagsRef.current.contextDirty = true;
      flagsRef.current.needsRender = true;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(parent);
    return () => ro.disconnect();
  }, [bounds, state]);

  // State changes invalidate operational context, never physical geography.
  useEffect(() => {
    flagsRef.current.contextDirty = true;
    flagsRef.current.needsRender = true;
  }, [state]);

  useEffect(() => {
    flagsRef.current.terrainDirty = true;
    flagsRef.current.contextDirty = true;
    flagsRef.current.needsRender = true;
  }, [preferences]);

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
      flagsRef.current.terrainDirty = true;
      flagsRef.current.contextDirty = true;
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
      const canvas = canvasRef.current;
      const terrain = terrainRef.current;
      const context = contextRef.current;
      if (!canvas || !terrain || !context) return;
      if (
        canvas.width === 0 ||
        canvas.height === 0 ||
        terrain.width === 0 ||
        terrain.height === 0 ||
        context.width === 0 ||
        context.height === 0
      ) return;
      const ctx = canvas.getContext("2d");
      const terrainCtx = terrain.getContext("2d");
      const contextCtx = context.getContext("2d");
      if (!ctx || !terrainCtx || !contextCtx) return;
      flags.needsRender = false;
      const vp = vpRef.current;
      const view = viewRef.current;
      const frameStarted = performance.now();
      if (flags.terrainDirty) {
        const started = performance.now();
        drawTerrainCache(terrainCtx, state, vp, view, preferences);
        recordMapRenderSample("terrain", performance.now() - started);
        flags.terrainDirty = false;
      }
      if (flags.contextDirty) {
        const started = performance.now();
        drawContextCache(contextCtx, state, vp, view, preferences);
        recordMapRenderSample("context", performance.now() - started);
        flags.contextDirty = false;
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(terrain, 0, 0);
      ctx.drawImage(context, 0, 0);
      const hovered = hoverRef.current;
      const routePath = reachable && hovered && reachable.has(hovered) ? (reachable.get(hovered) as Reach)?.path ?? null : null;
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
      const dynamicStarted = performance.now();
      drawDynamicLayer(ctx, state, vp, view, ui, preferences);
      recordMapRenderSample("dynamic", performance.now() - dynamicStarted);
      recordMapRenderSample("frame", performance.now() - frameStarted);
      canvas.dataset.renderMetrics = JSON.stringify(getMapRenderBenchmark());
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [state, selectedHexId, selectedUnitIds, reachable, attackTargetHexId, showZOC, activeSide, preferences]);

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
      flagsRef.current.terrainDirty = true;
      flagsRef.current.contextDirty = true;
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
    flagsRef.current.terrainDirty = true;
    flagsRef.current.contextDirty = true;
    flagsRef.current.needsRender = true;
  };

  const refit = () => {
    vpRef.current = fitViewport(bounds, viewRef.current);
    flagsRef.current.terrainDirty = true;
    flagsRef.current.contextDirty = true;
    flagsRef.current.needsRender = true;
  };

  const updatePreference = <Key extends keyof MapLayerPreferences>(
    key: Key,
    value: MapLayerPreferences[Key],
  ) => {
    setPreferences((current) => ({
      ...current,
      preset: key === "preset" ? (value as MapLayerPresetId) : current.preset,
      [key]: value,
    }));
  };

  const applyPreset = (preset: MapLayerPresetId) => {
    setPreferences({ ...MAP_LAYER_PRESETS[preset] });
  };

  return (
    <div className={`relative h-full w-full overflow-hidden bg-map-sea map-mode-${preferences.relief ? "relief" : "scheme"}`}>
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
      <div className="map-vignette" />
      <div className="map-grain" />

      <div className="map-terrain-switcher tactical-chip absolute left-4 top-4 w-[154px] p-3">
        <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-staff-gold">Ландшафт</div>
        <button
          type="button"
          aria-pressed={!preferences.relief}
          onClick={() => updatePreference("relief", false)}
          className="mt-3 flex w-full items-center gap-2 text-[11px] uppercase tracking-[0.12em] text-staff-ink-dim hover:text-staff-ink"
        >
          <span className="flex h-4 w-4 items-center justify-center rounded-full border border-staff-gold/60">
            {!preferences.relief && <span className="h-2 w-2 rounded-full bg-staff-gold" />}
          </span>
          Схема
        </button>
        <button
          type="button"
          aria-pressed={preferences.relief}
          onClick={() => updatePreference("relief", true)}
          className="mt-2 flex w-full items-center gap-2 text-[11px] uppercase tracking-[0.12em] text-staff-mute hover:text-staff-ink"
        >
          <span className="flex h-4 w-4 items-center justify-center rounded-full border border-staff-edge2">
            {preferences.relief && <span className="h-2 w-2 rounded-full bg-staff-gold" />}
          </span>
          Рельеф
        </button>
      </div>

      <div className="pointer-events-none absolute left-1/2 top-5 hidden -translate-x-1/2 rounded-sm border border-staff-edge/50 bg-black/25 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-staff-ink-dim backdrop-blur-sm xl:block">
        Перетаскивайте карту · колесо — масштаб · клик — выбор гекса
      </div>

      <div className="map-filter-control absolute bottom-4 left-1/2 -translate-x-1/2">
        {filtersOpen && (
          <div className="tactical-chip absolute bottom-12 left-1/2 max-h-[min(70vh,520px)] w-72 -translate-x-1/2 overflow-y-auto p-3">
            <div className="staff-section-title mb-2">Профиль карты</div>
            <div className="mb-3 grid grid-cols-2 gap-1">
              {(Object.keys(MAP_LAYER_PRESETS) as MapLayerPresetId[]).map((preset) => (
                <button
                  key={preset}
                  type="button"
                  aria-pressed={preferences.preset === preset}
                  onClick={() => applyPreset(preset)}
                  className={`border px-2 py-1.5 text-[8px] font-bold uppercase tracking-[0.11em] ${
                    preferences.preset === preset
                      ? "border-staff-gold/70 bg-staff-gold/15 text-staff-gold"
                      : "border-staff-edge/60 text-staff-ink-dim hover:border-staff-edge2"
                  }`}
                >
                  {preset === "operational"
                    ? "Оперативный"
                    : preset === "terrain"
                      ? "Рельеф"
                      : preset === "supply"
                        ? "Снабжение"
                        : "Служебный"}
                </button>
              ))}
            </div>
            <div className="staff-section-title mb-1">Слои карты</div>
            <FilterToggle label="Гексагональная сетка" checked={preferences.showGrid} onChange={(value) => updatePreference("showGrid", value)} />
            <label className="flex items-center justify-between gap-3 border-t border-staff-edge/55 py-2 text-[10px] uppercase tracking-[0.1em] text-staff-ink-dim">
              <span>Координаты</span>
              <select
                aria-label="Режим координат"
                value={preferences.coordinateMode}
                onChange={(event) => updatePreference("coordinateMode", event.target.value as MapLayerPreferences["coordinateMode"])}
                className="border border-staff-edge bg-black/35 px-1.5 py-1 text-[9px] text-staff-ink"
              >
                <option value="hidden">Скрыты</option>
                <option value="auto">Авто</option>
                <option value="always">Всегда</option>
              </select>
            </label>
            <FilterToggle label="Населённые пункты" checked={preferences.showSettlements} onChange={(value) => updatePreference("showSettlements", value)} />
            <FilterToggle label="Дороги" checked={preferences.showRoads} onChange={(value) => updatePreference("showRoads", value)} />
            <FilterToggle label="Железные дороги" checked={preferences.showRailways} onChange={(value) => updatePreference("showRailways", value)} />
            <FilterToggle label="Реки и мосты" checked={preferences.showRivers} onChange={(value) => updatePreference("showRivers", value)} />
            <FilterToggle label="Маршруты приказов" checked={preferences.showOrders} onChange={(value) => updatePreference("showOrders", value)} />
            <FilterToggle label="Сеть снабжения" checked={preferences.showSupply} onChange={(value) => updatePreference("showSupply", value)} />
            <label className="flex items-center justify-between gap-3 border-t border-staff-edge/55 py-2 text-[10px] uppercase tracking-[0.1em] text-staff-ink-dim">
              <span>Контроль</span>
              <select
                aria-label="Отображение контроля"
                value={preferences.controlMode}
                onChange={(event) => updatePreference("controlMode", event.target.value as MapLayerPreferences["controlMode"])}
                className="border border-staff-edge bg-black/35 px-1.5 py-1 text-[9px] text-staff-ink"
              >
                <option value="off">Выкл.</option>
                <option value="frontline">Фронт</option>
                <option value="frontline_and_fill">Фронт + заливка</option>
              </select>
            </label>
            <FilterToggle label="Высокий контраст" checked={preferences.highContrast} onChange={(value) => updatePreference("highContrast", value)} />
            <FilterToggle label="Зоны контроля" checked={showZOC} onChange={() => onToggleZOC?.()} />
            <div className="mt-2 border-t border-staff-edge/55 pt-2 text-[8px] uppercase leading-4 tracking-[0.11em] text-staff-mute">
              Физическая основа: Natural Earth · 1:10m
            </div>
          </div>
        )}
        <button
          type="button"
          aria-expanded={filtersOpen}
          onClick={() => setFiltersOpen((value) => !value)}
          className="tactical-chip inline-flex items-center gap-2 px-5 py-2 text-[10px] font-bold uppercase tracking-[0.16em] text-staff-ink-dim hover:text-staff-gold"
        >
          <Icon name="layers" className="h-3.5 w-3.5" />
          Фильтры
        </button>
      </div>

      <div className="map-zoom-controls absolute bottom-4 right-4 flex flex-col gap-1.5">
        <button
          aria-label="Приблизить карту"
          onClick={() => zoomBy(1.2)}
          className="tactical-chip flex h-9 w-9 items-center justify-center text-staff-ink hover:text-staff-gold"
        >
          <Icon name="zoomIn" className="h-4 w-4" />
        </button>
        <button
          aria-label="Отдалить карту"
          onClick={() => zoomBy(1 / 1.2)}
          className="tactical-chip flex h-9 w-9 items-center justify-center text-staff-ink hover:text-staff-gold"
        >
          <Icon name="zoomOut" className="h-4 w-4" />
        </button>
        <button
          aria-label="Показать весь театр"
          onClick={refit}
          className="tactical-chip flex h-9 w-9 items-center justify-center text-staff-ink hover:text-staff-gold"
          title="Уместить карту"
        >
          <Icon name="map" className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function focusedViewport(
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
  view: { width: number; height: number; dpr: number },
  state: GameState,
): Viewport {
  const fitted = fitViewport(bounds, view);
  const positions = Object.values(state.units)
    .filter((unit) => !unit.eliminated)
    .map((unit) => state.hexes[unit.hexId])
    .filter(Boolean)
    .map((hex) => axialToPixel(hex.q, hex.r, HEX_SIZE));
  if (positions.length === 0) return fitted;
  const centerX = positions.reduce((sum, point) => sum + point.x, 0) / positions.length;
  const averageY = positions.reduce((sum, point) => sum + point.y, 0) / positions.length;
  const scale = Math.max(fitted.scale, Math.min(0.68, fitted.scale * 2.15));
  const centerY = averageY - view.height / scale * 0.12;
  return {
    scale,
    ox: view.width / 2 / scale - centerX,
    oy: view.height / 2 / scale - centerY,
  };
}

function FilterToggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 border-t border-staff-edge/55 py-2 text-[10px] uppercase tracking-[0.1em] text-staff-ink-dim first:border-0">
      <span>{label}</span>
      <input
        type="checkbox"
        className="staff-checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
    </label>
  );
}
