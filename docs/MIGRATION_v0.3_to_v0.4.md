# Migration v0.3 to v0.4

Current save metadata is:

```text
schemaVersion: 4
engineVersion: 0.4.0
scenarioVersion: 0.4.0
```

`migrateSaveGame` accepts v0.2 and v0.3 command-log envelopes, updates their
metadata, and normalizes planned orders with v0.4 progress, movement-budget and
engineering fields. A migrated save returns a non-empty warning so a caller
cannot silently present a replay as an unchanged old result.

Unknown future schemas and malformed command logs return an explanatory error.
The initial state is rebuilt from the recorded seed, match ID and mode, then the
migrated command log is replayed through the current authoritative engine.
