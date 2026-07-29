# UI features still blocked by authoritative data

WEGO v0.4 **does** provide the planner, six authoritative impulse labels/reports, `DailyAfterActionReport`, contacts, reactions and replay. They are not listed as blockers.

| Requested UI feature | Missing authoritative contract | Current safe behaviour |
|---|---|---|
| Projector / presentation mode | no dedicated redacted presentation state or permission policy | no production switch that could reveal plans/cards |
| Operational-area map overlay | no `OperationalArea` scenario model | no decorative area overlay |
| Rich directive sheet and decisions | no document/decision model with supported commands | cards remain engine-backed cards only |
| Map-centering event log | `GameEvent` has no universal hex/unit/time link | log stays textual; no false navigation |
| Full causal supply explanation | state exposes outcome, not explanation/path | displays state and shape only |
| Continuous river geometry | source map still describes river edges, not hydrological polylines | no claim of archive-accurate continuous rivers |
| Browser acceptance screenshots | Playwright configuration and deterministic browser fixture are absent | no acceptance screenshots are claimed |

Future engine additions must arrive through a read-only presentation selector before an interactive UI control is added.
