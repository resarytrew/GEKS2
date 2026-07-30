# Operational Map v1.1 — LOD

All thresholds are defined only in `MAP_VISUAL_LOD` in
`src/renderer/mapVisualConfig.ts`.

| Property | Far (`scale < 0.40`) | Medium (`0.40–0.81`) | Close (`>= 0.82`) |
|---|---|---|---|
| grid opacity | 0.035 | 0.065 | 0.105 |
| grid width | 0.40 px | 0.55 px | 0.75 px |
| automatic coordinates | hidden | stride 3 | every unobstructed hex |
| minor roads | hidden | hidden | visible |
| regional settlements | hidden | visible | visible |
| minor settlements | hidden | hidden | visible |
| terrain marks | hidden | hidden | visible |
| bridge detail | hidden | visible | visible |
| counter projection | summary | compact | full |
| max visible counters | 1 | 3 | 3 |

`coordinateMode=always` overrides LOD sampling. In automatic mode, coordinates
under counters or settlement markers are suppressed. Strategic and major
settlements remain visible at every LOD.

Counter sizes are clamped to maintain legibility: 22 px minimum at far, 42 px
at medium and 48 px at close, with a 74 px maximum.

The available display presets are:

- `operational`: control fill/front, transport, rivers, settlements, orders;
- `terrain`: relief, rivers, roads, minimal operational overlays;
- `supply`: supply overlay, rail, roads and frontline;
- `service`: grid, all coordinates and high contrast.
