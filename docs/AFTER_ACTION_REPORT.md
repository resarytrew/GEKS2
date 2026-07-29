# After Action Report

В v0.4.1 `damagedThisTurn` строится только из `UNIT_LOST_STEP` после
`turnStartedAtEventIndex`, а `understrengthUnits` содержит все сохранившиеся
части неполного состава. Side-filtered AAR удаляет скрытые вражеские данные.

After impulse six, the engine changes the phase to `after_action` and stores a
`DailyAfterActionReport`. It contains:

- all six impulse summaries;
- combats and their outcomes;
- destroyed and damaged formations;
- captured objectives and destroyed bridges;
- failed orders and their reasons;
- supply changes;
- score events;
- per-side order summaries.

The report is derived only from authoritative state and events. A side-filtered
state removes hidden opponent order details. The UI opens the report
automatically. Continuing from it performs supply recovery and end-of-day
scoring, expires effects when appropriate, and opens the next morning report in
one command.
