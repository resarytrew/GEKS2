# UI baseline audit — before UI v1.0

- **Baseline commit:** `75d556dbd888491e1ccf2b6e7d3512795d532377`
- **Working branch:** `arena/019faf17-geks2` (Arena session branch; the requested branch cannot be created in this workspace).
- **Scope:** presentation only. Engine remains authoritative for movement, combat, supply, score, contacts and WEGO execution.

## Existing surfaces

| Surface | Existing implementation | Decision |
|---|---|---|
| Scenario menu | `src/app/page.tsx` | keep data flow; rebuild as dossier/table |
| Play shell | `src/app/play/page.tsx` | keep map wiring/handoff; rebuild rails, sheet and responsive states |
| Map | `GameMap` + Canvas `renderer/draw.ts` | retain Canvas 2D/offscreen static layer; revise symbols, LOD and map controls |
| Status bar | `TopBar` | rebuilt as command rail |
| Cards / phase controls | `BottomBar` | rebuilt as phase rail + on-demand tray |
| Inspector | `SidePanels` | retain factual hex/unit data; rebuild as tabbed operational sheet |
| Combat | `CombatPanel` | retain `predictCombat` / `CombatResolution`; rebuild visual report only |
| Reports and log | `Modals` | retain real `eventLog`, scenario events and scores; restyle and remove glyph UI |

## Design baseline

Legacy aliases (`staff-*`) are still in use while migration proceeds. The previous UI used dark surfaces, a high card density, repeated rounded corners and Unicode/emoji controls. The current first migration introduced paper/ink surfaces and local SVG controls, but still had Unicode glyphs in reports, map controls and content states.

At 1280×720 the original persistent 340px inspector plus 128px card bar left the map visually constrained. At 1440×900 it was usable but panels had equal visual weight to the map. The original mobile layout hid the inspector entirely and lacked a contextual sheet. The Canvas map itself used all remaining space, but there was no explicit map-area contract or semantic controls.

## Data actually available to UI

`GameState` supplies phase, active/initiative side, date/turn/impulse, plans and orders, reactions, contacts, cards, objectives, scores, weather, supply state per unit, HQ command points, event log, combat resolution and save status. `predictCombat` is an existing engine rules adapter. There is **no** DailyAfterActionReport, battle modifier itemisation, source-verified operational-area data, card artwork, command reliability percentage, supply path explanation, presentation mode or mobile-specific state.

## Accessibility baseline

Keyboard access exists for native buttons but focus treatment was not deliberately designed. Canvas controls had small targets and Unicode labels. State frequently depended on colour. `prefers-reduced-motion` was absent before the first migration. No component/browser UI test or screenshot suite exists.

## Preserve / rework

Preserve deterministic store/engine boundary, save flow, Canvas/offscreen cache, pointer pan/zoom and game-state-derived reports. Rework all visual shell components, inspector information hierarchy, cards tray, map controls, canvas counter vocabulary and modal presentation. Do not invent unavailable reports, directives, command causes or combat modifiers.
