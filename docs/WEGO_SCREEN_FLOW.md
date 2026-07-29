# WEGO screen flow

```text
Morning report → Events → Planning (Germany) → sealed handoff → Planning (USSR)
  → plans locked → execution impulses → reactions → supply → after action → next day
```

The exact legacy-compatible phases (`command`, `air`, `activation`, `combat`, `exploitation`) remain supported because they are part of `GamePhase`. The shell labels the actual `GameState.phase`; it does not force a simplified sequence into the reducer.

1. The report opens only when the engine enters `morning_report`.
2. During planning, selecting units and a reachable hex sends `UPSERT_PLANNED_ORDER` through the store.
3. Committing sends `COMMIT_PLAN` for `activeSide`.
4. When exactly one plan is committed, the local sealed handoff interrupts the shell; `drawStaticLayer` still renders active-side orders only.
5. Execution uses `EXECUTE_IMPULSE`; actual contacts, delays and reactions come from engine events/state.
6. When the engine returns to `morning_report`, the factual daily summary opens. There is no separate After Action Report model in v0.3.
