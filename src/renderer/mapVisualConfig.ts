import type { Settlement } from "@/engine/types";

export type MapLod = "far" | "medium" | "close";
export type CoordinateMode = "hidden" | "auto" | "always";
export type ControlMode = "off" | "frontline" | "frontline_and_fill";
export type MapLayerPresetId = "operational" | "terrain" | "supply" | "service";

export interface MapVisualLodConfig {
  maxScale: number;
  gridOpacity: number;
  gridLineWidth: number;
  coordinateOpacity: number;
  coordinateStride: number;
  showMinorRoads: boolean;
  showRegionalSettlements: boolean;
  showMinorSettlements: boolean;
  showTerrainPattern: boolean;
  showBridgeDetails: boolean;
  counterMode: "summary" | "compact" | "full";
  counterScale: number;
  maxVisibleCounters: number;
}

/**
 * The single authoritative map LOD configuration. Renderer thresholds must not
 * be duplicated in components or layer functions.
 */
export const MAP_VISUAL_LOD: Record<MapLod, MapVisualLodConfig> = {
  far: {
    maxScale: 0.4,
    gridOpacity: 0.035,
    gridLineWidth: 0.4,
    coordinateOpacity: 0,
    coordinateStride: 0,
    showMinorRoads: false,
    showRegionalSettlements: false,
    showMinorSettlements: false,
    showTerrainPattern: false,
    showBridgeDetails: false,
    counterMode: "summary",
    counterScale: 0.78,
    maxVisibleCounters: 1,
  },
  medium: {
    maxScale: 0.82,
    gridOpacity: 0.065,
    gridLineWidth: 0.55,
    coordinateOpacity: 0.12,
    coordinateStride: 3,
    showMinorRoads: true,
    showRegionalSettlements: true,
    showMinorSettlements: false,
    showTerrainPattern: false,
    showBridgeDetails: true,
    counterMode: "compact",
    counterScale: 1,
    maxVisibleCounters: 3,
  },
  close: {
    maxScale: Infinity,
    gridOpacity: 0.105,
    gridLineWidth: 0.75,
    coordinateOpacity: 0.18,
    coordinateStride: 1,
    showMinorRoads: true,
    showRegionalSettlements: true,
    showMinorSettlements: true,
    showTerrainPattern: true,
    showBridgeDetails: true,
    counterMode: "full",
    counterScale: 1.12,
    maxVisibleCounters: 3,
  },
};

export interface MapLayerPreferences {
  preset: MapLayerPresetId;
  relief: boolean;
  showGrid: boolean;
  coordinateMode: CoordinateMode;
  showRoads: boolean;
  showRailways: boolean;
  showRivers: boolean;
  controlMode: ControlMode;
  showSupply: boolean;
  showOrders: boolean;
  showSettlements: boolean;
  highContrast: boolean;
}

export const MAP_LAYER_PRESETS: Record<MapLayerPresetId, MapLayerPreferences> = {
  operational: {
    preset: "operational",
    relief: false,
    showGrid: true,
    coordinateMode: "auto",
    showRoads: true,
    showRailways: true,
    showRivers: true,
    controlMode: "frontline_and_fill",
    showSupply: false,
    showOrders: true,
    showSettlements: true,
    highContrast: false,
  },
  terrain: {
    preset: "terrain",
    relief: true,
    showGrid: false,
    coordinateMode: "hidden",
    showRoads: true,
    showRailways: false,
    showRivers: true,
    controlMode: "frontline_and_fill",
    showSupply: false,
    showOrders: false,
    showSettlements: true,
    highContrast: false,
  },
  supply: {
    preset: "supply",
    relief: false,
    showGrid: false,
    coordinateMode: "hidden",
    showRoads: true,
    showRailways: true,
    showRivers: true,
    controlMode: "frontline",
    showSupply: true,
    showOrders: false,
    showSettlements: true,
    highContrast: false,
  },
  service: {
    preset: "service",
    relief: false,
    showGrid: true,
    coordinateMode: "always",
    showRoads: true,
    showRailways: true,
    showRivers: true,
    controlMode: "off",
    showSupply: false,
    showOrders: false,
    showSettlements: true,
    highContrast: true,
  },
};

export const DEFAULT_MAP_PREFERENCES: MapLayerPreferences = {
  ...MAP_LAYER_PRESETS.operational,
};

export const MAP_PREFERENCES_STORAGE_KEY = "geks2:operational-map:v1.1";

export function getMapLod(scale: number): MapLod {
  if (scale < MAP_VISUAL_LOD.far.maxScale) return "far";
  if (scale < MAP_VISUAL_LOD.medium.maxScale) return "medium";
  return "close";
}

export function normalizeMapPreferences(
  value: Partial<MapLayerPreferences> | null | undefined,
): MapLayerPreferences {
  if (!value) return { ...DEFAULT_MAP_PREFERENCES };
  const preset =
    value.preset && value.preset in MAP_LAYER_PRESETS
      ? value.preset
      : DEFAULT_MAP_PREFERENCES.preset;
  const base = MAP_LAYER_PRESETS[preset];
  return {
    preset,
    relief: typeof value.relief === "boolean" ? value.relief : base.relief,
    showGrid: typeof value.showGrid === "boolean" ? value.showGrid : base.showGrid,
    coordinateMode:
      value.coordinateMode &&
      ["hidden", "auto", "always"].includes(value.coordinateMode)
        ? value.coordinateMode
        : base.coordinateMode,
    showRoads:
      typeof value.showRoads === "boolean" ? value.showRoads : base.showRoads,
    showRailways:
      typeof value.showRailways === "boolean"
        ? value.showRailways
        : base.showRailways,
    showRivers:
      typeof value.showRivers === "boolean" ? value.showRivers : base.showRivers,
    controlMode:
      value.controlMode &&
      ["off", "frontline", "frontline_and_fill"].includes(value.controlMode)
        ? value.controlMode
        : base.controlMode,
    showSupply:
      typeof value.showSupply === "boolean" ? value.showSupply : base.showSupply,
    showOrders:
      typeof value.showOrders === "boolean" ? value.showOrders : base.showOrders,
    showSettlements:
      typeof value.showSettlements === "boolean"
        ? value.showSettlements
        : base.showSettlements,
    highContrast:
      typeof value.highContrast === "boolean"
        ? value.highContrast
        : base.highContrast,
  };
}

export interface SettlementPresentation {
  visible: boolean;
  fontSize: number;
  fontWeight: 500 | 600 | 700;
  priority: number;
  marker: "dot" | "ring" | "node" | "strategic";
  haloStrength: number;
}

export function getSettlementPresentation(
  importance: Settlement["importance"],
  lod: MapLod,
): SettlementPresentation {
  const rank = {
    minor: 1,
    regional: 2,
    major: 3,
    strategic: 4,
  }[importance];
  const visible =
    rank >= 3 ||
    (lod === "medium" && rank >= 2) ||
    lod === "close";
  return {
    visible,
    fontSize:
      importance === "strategic"
        ? lod === "far"
          ? 13
          : 15
        : importance === "major"
          ? 13
          : importance === "regional"
            ? 11
            : 9,
    fontWeight: rank >= 4 ? 700 : rank >= 2 ? 600 : 500,
    priority: rank * 100,
    marker:
      importance === "strategic"
        ? "strategic"
        : importance === "major"
          ? "node"
          : importance === "regional"
            ? "ring"
            : "dot",
    haloStrength: rank >= 3 ? 3.2 : 2.2,
  };
}

export function shouldShowCoordinate(
  lod: MapLod,
  mode: CoordinateMode,
  q: number,
  r: number,
  obstructed: boolean,
): boolean {
  if (mode === "hidden") return false;
  if (mode === "auto" && lod === "far") return false;
  if (obstructed && mode !== "always") return false;
  if (mode === "always" || lod === "close") return true;
  const stride = MAP_VISUAL_LOD[lod].coordinateStride;
  return stride > 0 && Math.abs(q + r * 2) % stride === 0;
}

export interface CounterPresentation {
  mode: MapVisualLodConfig["counterMode"];
  size: number;
  maxVisible: number;
}

export function getCounterPresentation(
  scale: number,
  lod = getMapLod(scale),
): CounterPresentation {
  const config = MAP_VISUAL_LOD[lod];
  return {
    mode: config.counterMode,
    size: Math.max(
      lod === "far" ? 22 : lod === "medium" ? 42 : 48,
      Math.min(74, 34 * scale * 2.25 * config.counterScale),
    ),
    maxVisible: config.maxVisibleCounters,
  };
}
