# UI baseline audit — WEGO v0.4 integration

## Repository baseline

- **Current main integrated:** `4e6d0ca`.
- **UI source only:** `bcdb7e5130875a25c2246c37a9c2b490715db1e2`.
- **Shared merge base:** `91040c168e021d56d870cb2cca00b48669591f32`.
- **Runtime:** Node `v22.22.3`, npm `10.9.8`.
- **Authoritative version tuple:** schema 4, engine 0.4.0, scenario 0.4.0.
- **Checks after integration:** typecheck/lint/build pass; 9 test files and 182 tests pass. The old v0.3 `npm ci` lock mismatch was not imported; clean v0.4 lockfile validation remains CI work.

## UI inventory

Pages are scenario dossier (`/`) and play (`/play`). Main components are command rail, tool rail, `GameMap`, operational sheet, `OrderPlanningPanel`, `ExecutionPanel`, cards tray, combat sheet, reports/modals and toasts. The renderer uses Canvas 2D with a cached static geography canvas and a dynamic canvas.

## Available v0.4 UI data

The engine exposes plans for both sides, ten planned order types, planned reactions, six authoritative impulse labels, impulse reports, contacts, combat model/resolution, temporary command effects, supply states, cards, objectives, scores, save migration and `DailyAfterActionReport`. The engine’s sanitised state controls hidden information. Details and fallbacks are in `UI_STATE_CONTRACT.md`.

## Visual migration findings

The legacy v0.3 shell was a dense dark dashboard with repeated rounded cards, emoji controls and a permanent tall card bar. The integrated shell uses paper surfaces, dark rails, restrained ochre, local SVG controls, tabular numbers, serif historical labels and a non-persistent card tray. At 1280×720 the expanded 340px sheet remains dense; collapsing it restores map width. Exact geometry is in `UI_LAYOUT_MEASUREMENTS.md`.

## Preserve and rework

Preserve v0.4 engine/store/types, planner, execution, AAR, test fixture, replay, persistence and sanitisation. Rework only presentation: styling, panel composition, Canvas counter language and user-facing labels. Browser acceptance tests, mobile contextual sheet, projector redaction and continuous river geometry remain separate work items rather than simulated features.
