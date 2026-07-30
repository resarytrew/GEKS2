# UI state contract — WEGO v0.4

UI is a projection of engine state and dispatches `GameCommand`; it must not recalculate rules.

| Surface | Authoritative source | States | Commands / selector | Hidden-data rule |
|---|---|---|---|---|
| Phase rail | `GameState.phase`, `plans`, `impulse` | completed/current/upcoming/locked | `getVisiblePhaseFlow`, primary engine command | never reads opponent plan detail |
| Planner | `plans[activeSide]`, selected map state, `IMPULSE_LABELS` | draft/committed/cancelled | `OrderPlanningPanel`, `UPSERT_PLANNED_ORDER`, `REMOVE_PLANNED_ORDER`, reactions | active side only |
| Execution | `impulse`, `IMPULSE_LABELS`, `impulseReports`, contacts | current/complete | `ExecutionPanel`, `EXECUTE_IMPULSE` | report sanitisation remains engine-owned |
| Orders | `PlannedOrder` | draft/committed/executing/delayed/failed/completed/cancelled | `ORDER_*` presentation mapping (pending consolidation) | opponent orders are omitted |
| Combat | `CombatModel`, `CombatResolution`, `lastCombat` | preview/result | `RESOLVE_COMBAT` | UI outputs existing breakdown only |
| AAR | `afterActionReport: DailyAfterActionReport` | hidden/ready | next-day phase command | use engine’s sanitised report |
| Supply | `UnitState.supplyState` | full/limited/low/isolated/none | read only | no route/cause is invented |
| Cards | `playerHands[activeSide]`, `cards` | target-required/playable/resolved | `PLAY_CARD` | active side hand only |

`IMPULSE_LABELS.length`, rather than a UI literal, controls execution progress. `GameState` and the scenario now expose v0.4 schema `4`, engine `0.4.0`, scenario `0.4.0`.
