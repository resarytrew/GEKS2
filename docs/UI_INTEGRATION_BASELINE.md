# UI v1.0 WEGO integration baseline

- **Current `origin/main` at integration:** `4e6d0ca` (`v0.4.0`; merge of WEGO execution v0.4).
- **UI source commit:** `bcdb7e5130875a25c2246c37a9c2b490715db1e2`.
- **Merge base:** `91040c168e021d56d870cb2cca00b48669591f32`.
- **Integration branch:** `arena/019faf17-geks2` (Arena fixes the session branch, so a separate `codex/*` branch cannot be created here).
- **Engine/schema/scenario versions:** `0.4.0` / `4` / `0.4.0` (authoritative values in the merged scenario/persistence code).

## Baseline verification

| Command | Result |
|---|---|
| `npm ci` | not rerun after integration: before merge it was blocked on the old v0.3 lockfile. The v0.4 lockfile has been merged from `origin/main`; clean CI should be validated separately in a clean checkout. |
| `npm run typecheck` | passed |
| `npm run lint` | passed |
| `npm test -- --run` | passed: 9 files, 182 tests |
| `npm run build` | passed |

## v0.4 capability that must survive

`OrderPlanningPanel`, `ExecutionPanel`, Raseiniai WEGO fixture, six authoritative `IMPULSE_LABELS`, `impulseReports`, `DailyAfterActionReport`, planned reactions and temporary command effects, combat model/resolution, support/reserve handling, persistence migration, state invariants, deterministic replay and sanitised hidden-information views.

## Selected visual transfer

Paper/ink design tokens; command rail; tool rail; collapsible operational sheet; SVG icons; phase rail; non-persistent card tray; scenario dossier; canvas counter palette; HQ double rule; shape-based supply markers; reduced-motion support; map controls; keyboard shortcuts. Old v0.3 engine/store/type files were not reused: the current main implementation is authoritative.
