# UI state contract

All entries below are read-only projections of engine state. UI must dispatch commands and never reproduce a rules calculation.

| UI element | Actual source | States rendered | User command |
|---|---|---|---|
| Phase rail | `GameState.phase`, `plans`, `impulse` | current, completed (derived historical sequence), upcoming, plan committed | `END_PHASE`, `COMMIT_PLAN`, `EXECUTE_IMPULSE`, `END_ACTIVATION` |
| Order item | `GameState.plans[side].orders: PlannedOrder[]` | `draft`, `committed`, `executing`, `completed`, `delayed`, `failed`, `cancelled` | `UPSERT_PLANNED_ORDER`, `REMOVE_PLANNED_ORDER` |
| Card item | `playerHands`, `cards`, `CardDefinition` | playable/window closed/target required; engine card state | `PLAY_CARD` |
| Unit passport | `units`, `headquarters`, `UnitState.order` | active/acted/eliminated; supply and command states | selection only |
| Supply status | `UnitState.supplyState` | full, limited, low, isolated, none | none |
| Combat sheet | `predictCombat` / `lastCombat` | preview/result | `RESOLVE_COMBAT` |
| Log | `GameState.eventLog: GameEvent[]` | event-specific | none |
| Daily report | `phase === morning_report`, scenario event data and existing game state | available/hidden | `END_PHASE` |
| Handoff | `plans[side].committed`, local UI acknowledgement | sealed/acknowledged | none; engine owns plan visibility |

Not available in v0.3: a DailyAfterActionReport model, supported causal explanations for supply/orders, a calculation-ready modifier list, operational-area records, directive decisions, presentation-mode permissions and card imagery. UI marks no fictional equivalents as implemented.
