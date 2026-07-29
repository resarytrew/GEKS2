# UI component states

## Operational sheet

- **Collapsed:** a 44px tab remains; the map receives the released width.
- **Inspect:** no selection shows phase guidance; a hex shows only factual hex data; a unit adds the factual unit passport.
- **Orders:** shows only `GameState.plans[activeSide].orders`; opposite-side orders are never read.
- **Situation:** entry points to factual objectives and event log, not a fabricated intelligence summary.

## Phase rail

- **Planning:** displays draft count and committed marker from `SidePlan`.
- **Plans locked / execution:** displays engine `impulse`; it does not claim a time-of-day or contact count beyond `contacts`.
- **Other phases:** displays label/hint from existing labels and one engine command action.

## Cards tray

- closed / open / no cards / unavailable date / target required / playable. It is not persistent and does not assert an action is valid until engine validation succeeds.

## Combat sheet

- hidden / candidate selection / engine-rule preview / engine-result report. The preview shows strength, odds and engine outcome only; it must not display a fictitious modifier breakdown.

## Handoff

- only after one plan is committed; sealed screen hides map and identifies the receiving side. It is local UI acknowledgement, while plan secrecy is guaranteed by `drawStaticLayer` reading only active-side orders.
