import type {
  CameraState,
  GameEntity,
  GameEvent,
  MapState,
  PlannedOrder,
  SideVisibility,
} from "@/renderer/view-types";

export interface GameRenderer {
  loadMap(map: MapState): void;
  updateEntities(entities: GameEntity[]): void;
  updateOrders(orders: PlannedOrder[]): void;
  playEvents(events: GameEvent[]): Promise<void>;
  setCamera(camera: CameraState): void;
  setVisibility(view: SideVisibility): void;
}
