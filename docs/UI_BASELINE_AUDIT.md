# UI baseline audit — before UI v1.0

- **Baseline commit:** `75d556dbd888491e1ccf2b6e7d3512795d532377`
- **Working branch:** `arena/019faf17-geks2` (Arena session branch; the requested branch cannot be created in this workspace).
- **Scope:** presentation only. Engine remains authoritative for movement, combat, supply, score, contacts and WEGO execution.
- **Environment:** Node `v22.22.3`, npm `10.9.8`.
- **Verification:** `typecheck`, `lint`, 95 engine tests and production `build` passed after the installed dependency resolution. `npm ci` is currently blocked before execution because `package-lock.json` omits `esbuild@0.28.1` optional package entries required by the present dependency graph; this pre-existing lockfile mismatch is not changed by UI work.

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

## WEGO capability verification

| Capability | In types | Executes in engine | Available to current UI |
|---|---|---|---|
| March order | yes | yes | yes — map creates `march` orders |
| Prepared attack | yes | not exposed by current map workflow | shown only if engine state contains it |
| Defence / withdrawal / reserve | yes | no UI creation path verified | shown only if engine state contains it |
| Contacts | yes (`ContactState`) | yes during execution | no detailed presentation yet |
| Combat report | yes (`CombatResolution`) | yes | yes — strength, odds and result |
| Daily report | no dedicated type | no | only existing morning summary |
| Execution total | no | no `executionImpulses` field | current impulse only; no fake total |

## Accessibility baseline

Keyboard access exists for native buttons but focus treatment was not deliberately designed. Canvas controls had small targets and Unicode labels. State frequently depended on colour. `prefers-reduced-motion` was absent before the first migration. No component/browser UI test or screenshot suite exists.

## Preserve / rework

Preserve deterministic store/engine boundary, save flow, Canvas/offscreen cache, pointer pan/zoom and game-state-derived reports. Rework all visual shell components, inspector information hierarchy, cards tray, map controls, canvas counter vocabulary and modal presentation. Do not invent unavailable reports, directives, command causes or combat modifiers.
