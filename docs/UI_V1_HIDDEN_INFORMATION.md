# UI v1 hidden-information contract

The hot-seat UI must never infer an opponent plan from full `GameState` when a side-specific presentation is available.

## Enforced surfaces

| Surface | Authoritative projection | What is hidden |
|---|---|---|
| Canvas orders | `state.plans[state.activeSide]` | opponent routes, supports, reserve data and delayed state |
| Execution panel | active-side plan only | opponent order type, unit count and status |
| Cards tray | `playerHands[state.activeSide]` | opponent hand and card identity |
| AAR | `sanitizeStateForSide(state, activeSide).afterActionReport` | hidden enemy losses, supports, reserves and undiscovered combat participants |
| Event log | `getVisibleEventLog(state, activeSide)` | opponent planning, undiscovered movement, private card events and internal diagnostics |
| Handoff | transient selection/panel reset, active-side keyed sheet, side-owned card tray | previous player’s map selection, open report and hand tray |

## Design limits

`GameState` remains authoritative and may contain data for both sides because engine replay requires it. Presentation components must not render direct cross-side collections unless they are an explicitly sanitised public view.

Presentation mode remains blocked until an engine-backed redacted state contract exists. It must not be added as a CSS-only switch.
