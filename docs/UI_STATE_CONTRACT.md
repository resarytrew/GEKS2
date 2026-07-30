# UI state contract

## Authoritative state

The map renderer reads `GameState` and never mutates it. Units, terrain,
control, river/transport edges, bridges, settlements, contacts, orders and
supply state remain authoritative engine/scenario data.

## Ephemeral map state

The following values are UI-only:

- viewport scale and offset;
- hovered hex;
- selected presentation and route preview;
- layer filter panel open/closed;
- terrain/context cache dirty flags;
- render timing samples.

## Persisted display preferences

`MapLayerPreferences` is stored in browser `localStorage` under
`geks2:operational-map:v1.1`. It contains preset, relief, grid, coordinate,
road, railway, river, control, supply, order, settlement and high-contrast
settings.

Display preferences are excluded from save files, replay commands and
`GameState`; changing them cannot affect deterministic simulation.

## Invalidation

Selection and hover invalidate interaction only. Order changes invalidate the
operational overlay only. Physical layer preferences or viewport changes
invalidate terrain/context caches. See
`OPERATIONAL_MAP_V11_ARCHITECTURE.md` for the full table.
