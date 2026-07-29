# WEGO screen flow — v0.4

```text
Morning report → events / command → Germany planning → sealed handoff
→ USSR planning → plans locked → six authoritative execution impulses
→ reactions → supply → Daily After Action Report → next day
```

`getVisiblePhaseFlow(state)` renders the modern flow and a separate legacy-compatible flow where `legacy_debug` is selected. The current execution denominator is `IMPULSE_LABELS.length`; the UI does not repeat the number six.

- During planning, `OrderPlanningPanel` sends complete v0.4 `PlannedOrder` and reaction commands.
- Handoff is a local interaction layer; the engine’s sanitised plan state remains the authority for secrecy.
- Execution reads `impulseReports`, contacts and active orders through `ExecutionPanel`.
- `afterActionReport` is the authoritative day-end report. UI does not rebuild results from `eventLog`.
