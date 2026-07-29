# UI component states — WEGO v0.4

## Operational sheet

- **collapsed:** 44px vertical reveal tab; map receives released width.
- **inspect:** empty, hex, stack, or unit passport.
- **orders:** `OrderPlanningPanel` is rendered only in planning, followed by active-side `PlannedOrder` list.
- **situation:** `ExecutionPanel` is rendered during execution/after-action and factual objectives remain available.

## Shared order statuses

`draft`, `committed`, `executing`, `delayed`, `blocked` (when exposed by engine), `failed`, `completed`, `cancelled`. Presentation must use a label, shape/line state and colour; it must not rely on raw values alone.

## Phase and controls

Phase items use `completed`, `current`, `upcoming`, `locked` and `unavailable`. Icon-only controls have an accessible name on their button; SVGs are decorative. A modal closes before `Esc` clears a map selection.

## Canvas entities

Counters have far/medium/close LOD via `MAP_LOD`, selected/hovered/reachable/attack-target states, HQ double command rule, and supply circle/half-circle/triangle/slash/cross marks. Stack display is limited to three counters plus a count marker.
