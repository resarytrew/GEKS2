# Baseline audit

Audit date: 2026-07-29  
Target: `Baltic Front 1941 — Prototype v0.3 WEGO Core`

## Project structure

- Next.js App Router UI in `src/app` and `src/components`.
- Framework-independent TypeScript engine in `src/engine`.
- Scenario and generated map data in `src/scenarios/baltic-1941`.
- Zustand client adapter in `src/store/gameStore.ts`.
- Canvas 2D renderer in `src/renderer/draw.ts`.
- Drizzle/PostgreSQL persistence routes in `src/app/api` and `src/db`.
- One Vitest suite in `src/engine/__tests__/core.test.ts`.

The archive contained no README, documentation directory, lock file, or local
dependency installation. It is not a Git worktree, so no initial Git status or
commit history is available.

## Declared dependency baseline

The archive declared Next.js 16.2.6, React/React DOM 19.2.6, TypeScript 5.9.3,
Tailwind and `@tailwindcss/postcss` 4.1.17, PostCSS 8.5.8, Vitest 4.1.10,
Zustand 5.0.14, ESLint 9.39.4, Drizzle ORM 0.45.2 and PostgreSQL driver 8.20.0.
No package manager was declared; the scripts and registry assumptions are npm
oriented, so npm was selected.

## Archive state before local installation

- `npm run typecheck`: failed because dependencies were absent. TypeScript also
  discovered incomplete packages in a parent `node_modules`, producing hundreds
  of misleading missing-module and JSX errors.
- `npm test`: failed because the `test` script was missing.
- `npm run lint`: failed because local ESLint was absent.
- `npm run build`: failed. It accidentally used parent Next.js 15.1.7 and could
  not resolve Zustand/Drizzle.

This demonstrates that the archive was not reproducible and could silently use
an unrelated parent installation.

## Baseline after `npm install`

`npm install` completed and installed 424 packages. It reported 16 audit
findings (4 moderate, 12 high), including advisories affecting the declared
Next.js/PostCSS patch levels and development-only ESLint/Drizzle tooling.

- `npm run typecheck`: passed.
- `npm exec vitest run`: passed, 1 file / 30 tests.
- `npm run lint`: failed with two `react-hooks/set-state-in-effect` errors in
  `src/app/page.tsx` and `src/components/CombatPanel.tsx`.
- `npm run build`: compiled and typechecked, then failed while collecting
  `/api/health` because `src/db/index.ts` required `DATABASE_URL` at module load.
- Build also warned that a parent lock file caused an incorrect inferred
  Turbopack workspace root.

## Known rule and architecture defects

- Combat changes target control unconditionally before verifying advance.
- Heavy armour reduces odds in preview and again in resolution.
- CP spending returns a boolean that callers ignore; invalid actions can mutate.
- Card command cost is never spent and card effects include no-op branches.
- Shared map edges can be mutated from one side.
- Any nearby friendly unit can destroy a bridge; no preparation/engineer rule.
- End-of-day scoring recounts all prior eliminations and territory every day.
- Preserve objectives are evaluated only after the state is completed.
- Cards begin with inconsistent deck/hand state.
- HQs live outside map stacks, cannot move and are invisible to the renderer.
- Command fallback selects the nearest unrelated HQ.
- 3rd and 12th Mechanized Corps army assignments are reversed.
- Controlled large cities are treated as autonomous supply sources.
- Encirclement is based on adjacent units rather than routes.
- The phase loop is alternating activation, not simultaneous WEGO.
- `createInitialState` uses `Math.random`.
- Client persistence sends a mutable summary and command list without schema
  migration, version concurrency or idempotency checks.

## Preserved parts

- Pure TypeScript engine boundary and deterministic seeded RNG.
- Command → validation → cloned state → event log flow.
- Hex math, pathfinding base, Canvas 2D map, scenario world generator and
  existing 30 tests.
- React/Zustand as a presentation adapter rather than the rules authority.

## Parts to rework

- Domain types/events, command validation and reducer application.
- Combat model, CP/card transactions, shared edges, scoring and finalization.
- HQ/entity representation, OOB command chain, supply and encirclement.
- Phase state into WEGO plans, impulses, contacts and reactions.
- Persistence envelope/migrations and development API boundary.
- UI phase controls, order overlays, HQ selection and hidden-plan handling.

