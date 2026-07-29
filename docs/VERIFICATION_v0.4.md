# Verification v0.4

Local and CI gates:

```powershell
npm ci
npm run typecheck
npm run lint
npm test -- --run
npm run build
```

The v0.4 suite adds 87 tests to the 95-test baseline. It covers all ten order
cost/executor contracts, movement budgets, fuel, ammunition, contact combat,
distributed losses, retreat search, conditional reaction paths, state
invariants, save migration, hidden-information filtering, deterministic replay
and the six-impulse day/AAR transition.

Manual acceptance starts from the main-screen button `Raseiniai WEGO Test`.
The fixture places German and Soviet mobile formations, their HQs and an
engineer around Raseiniai while retaining the full scenario map and data.

GitHub Actions runs the same install, type, lint, test and production-build
checks on `main`, `codex/**` branches and pull requests.
