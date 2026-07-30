# Operational Map v1.1 — architecture

## Scope

UI v1.1 changes presentation only. `GameState`, WEGO execution, OOB, combat
coefficients, save schema and scenario balance remain authoritative and are not
owned by the renderer.

## Render order

`src/renderer/draw.ts` exposes the following fixed order:

1. `BaseBackgroundLayer`
2. `TerrainLayer`
3. `WaterAndCoastLayer`
4. `ControlLayer`
5. `HexGridLayer`
6. `RiverLayer`
7. `TransportLayer`
8. `SettlementLayer`
9. `FrontlineLayer`
10. `OperationalOverlayLayer`
11. `UnitLayer`
12. `InteractionLayer`
13. `TransientEffectsLayer`

Layers 1–3 are stored in the terrain canvas cache. Layers 4–9 are stored in
the context canvas cache. Layers 10–13 are rendered to the visible canvas when
interaction or game presentation changes.

Selection and hover only request a visible-frame redraw. Orders are part of the
dynamic operational overlay. Neither action marks the terrain cache dirty.
Viewport changes invalidate both caches; a `GameState` change invalidates
context, but not physical geography.

## Projection and data

- `visibleHexIds` converts padded viewport corners to axial bounds and looks up
  only keys in that rectangle; it does not iterate the full `hexes` object.
- `collectUniqueRiverEdges` and `collectFrontlineEdges` canonicalize a shared
  edge by the sorted pair of adjacent hex IDs.
- Natural Earth-derived coastlines, lake polygons and named river centre-lines
  live in `src/scenarios/baltic-1941/geography.ts`. Gameplay crossing rules
  still use authoritative hex-edge river data.
- Settlement label candidates are laid out once per context-cache rebuild,
  with unit counter rectangles supplied as fixed obstacles.
- Map display preferences live under
  `geks2:operational-map:v1.1` in `localStorage`; they are not serialized into
  `GameState`.

## Invalidation contract

| Change | Terrain cache | Context cache | Dynamic frame |
|---|---:|---:|---:|
| viewport / DPR | rebuild | rebuild | redraw |
| relief or physical layer preference | rebuild | rebuild | redraw |
| game state | keep | rebuild | redraw |
| order | keep | keep | redraw |
| selection / hover / route preview | keep | keep | redraw |

The pure form of this policy is exported as `MAP_RENDER_INVALIDATION` and is
covered by renderer tests.
