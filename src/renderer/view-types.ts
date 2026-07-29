import type {
  GameEntity,
  GameEvent,
  HexState,
  PlannedOrder,
  Side,
} from "@/engine/types";

export interface MapState {
  hexes: Record<string, HexState>;
}

export interface CameraState {
  scale: number;
  x: number;
  y: number;
}

export interface SideVisibility {
  side: Side;
  visibleHexIds: string[];
  detectedEntityIds: string[];
}

export type { GameEntity, GameEvent, PlannedOrder };
