# UI functionality blocked by engine data

The following capabilities are intentionally not rendered as working production controls in UI v1.0 because v0.3 does not expose the required authoritative data.

| Requested surface | Blocking fact in current code | Safe current UI behaviour |
|---|---|---|
| Execution total / progress percentage | `GameState` has only `impulse`, with no `executionImpulses` collection or maximum | display current impulse only when execution is active; do not invent a denominator |
| Daily After Action Report | there is no `DailyAfterActionReport` type or reducer output | existing morning report uses only current state and scenario events |
| Combat modifier list | `predictCombat` returns strengths, odds, expected outcome and a penetration flag, not itemised modifiers | display factual strengths/odds/outcome; no fictional breakdown |
| Supply explanation/path | only resulting `UnitState.supplyState` is exposed | display state only |
| Directive decisions | cards/events do not expose document/choice model beyond `CardDefinition` | no directive decision sheet |
| Presentation permissions | `mode` has no `presentation` policy or redaction selector | no projector control that could leak information |
| Operational areas | no `OperationalArea` scenario data exists | no map layer |
| Full planner fields | only `march` is created by current map interaction although `PlannedOrderType` enumerates more types | Orders sheet shows all existing engine orders but creates no unsupported types |
| Structured log links | many `GameEvent` variants lack a common hex/unit/time envelope | log remains text-only and does not pretend it can center every event |

The UI still reads the real `plans`, `contacts`, `lastCombat`, `eventLog`, cards, objectives, scores and supply states. Any future engine addition should be exposed through a read-only presentation selector before an interactive UI control is introduced.
