# UI component states

## GameMap

- `far`, `medium`, `close`: derived from viewport scale.
- `scheme`, `relief`: physical terrain presentation.
- `operational`, `terrain`, `supply`, `service`: layer presets.
- `selected`: brass fill and strong outline.
- `hovered`: outline only.
- `reachable`: inner green marker.
- `attackTarget`: red hatch and border.
- `showZOC`: quiet enemy control field.
- `highContrast`: increased grid/control/frontline contrast.

## Unit counter

- summary marker at far LOD;
- compact counter at medium LOD;
- full stats counter at close LOD;
- HQ inset frame;
- supply shape for full/limited/low/isolated/none;
- stack projection with up to three counters and `+N`.

## Filter panel

The panel exposes labeled preset buttons, checkboxes and selects. Its state is
persisted locally. On narrow screens it opens as a bounded full-width overlay.

## Responsive states

At `<= 1240px` the right operation sheet is hidden. At `<= 640px` the
navigation rail becomes a horizontal bottom rail, the terrain chip is hidden
and map zoom/filter controls remain reachable above the rail.
