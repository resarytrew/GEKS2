# Operational Map v1.1 — baseline

Recorded on 2026-07-30 before the v1.1 renderer refactor.

## Repository state

- Source SHA: `c46771f9cb475a0ae94eb8ddad9754ad98ac3ff8`
- Working branch: `codex/operational-map-v11`
- Upstream `origin/main`: `c46771f9cb475a0ae94eb8ddad9754ad98ac3ff8`
- Engine version: `0.4.1`
- Save schema version: `5`
- Baseline test suite: 14 files, 266 tests
- Latest `main` CI: run `30514667621`, completed successfully on 2026-07-30
- The working tree already contained the reference-driven UI redesign and the
  Natural Earth physical-geography clip when this baseline was recorded.

## Baseline verification

| Command | Result |
| --- | --- |
| `npm ci` | Passed; npm reported 13 dependency audit findings (4 moderate, 9 high) |
| `npm run typecheck` | Passed |
| `npm run lint` | Passed |
| `npm test -- --run` | Passed: 14 files, 266 tests |
| `npm run build` | Passed |
| `npm run smoke:production` | Passed: `/`, `/play`, `/api/health` |

## Existing Canvas structure

`GameMap` owns one visible canvas and one offscreen canvas. Geography is drawn
into the offscreen canvas by `drawStaticLayer`; interaction and counters are
drawn over the copied bitmap by `drawDynamicLayer`.

### Current static draw order

1. Sea gradient / base background
2. Hex terrain fill, control wash and per-hex decorative strokes
3. Continuous Natural Earth lake, coast and river vectors
4. Hex grid and coordinates
5. Frontline edges
6. Scenario edge-based rivers
7. Roads and railways
8. Bridges
9. Planned order routes
10. Settlements and labels

### Current dynamic draw order

1. Enemy ZOC wash
2. Reachable hexes
3. Attack target
4. Selected and hovered hex outlines
5. Draft route
6. Contact and combat bursts
7. Unit stacks and counters

Selection and hover do not rebuild the offscreen canvas. Any `GameState`
reference change, including an order change, marks the complete static canvas
dirty.

## Current LOD thresholds

The baseline has no authoritative LOD object. Thresholds are embedded in draw
branches and use `viewport.scale` directly.

- Per-hex terrain strokes: scale greater than `0.38`
- Hex grid: scale greater than `0.42`
- Stronger grid colour: scale greater than `0.9`
- Full coordinates: scale greater than `0.78`
- Water labels: scale greater than `0.30`
- Regional/minor settlement filtering begins below `0.48`
- Only strategic settlements remain below `0.30`
- Settlement text: scale greater than `0.31`
- Far counter projection: scale below `0.33`
- Full roads: scale greater than `0.40`
- Railways: scale greater than `0.55`
- Bridges: scale greater than `0.60`

The transitions are abrupt and distributed across the renderer.

## Counter baseline

- Counter size: `clamp(32, HEX_SIZE * scale * 2.05, 68)` CSS pixels
- Far projection: circular marker below scale `0.33`
- Stack projection: up to four counters plus a `+N` badge
- Selected counter: 2 px brass outline
- Selected hex: outline only
- HQ: body stripe and text marker, but no distinct counter silhouette
- Supply: primarily encoded in small counter details and colour

## Hex grid and coordinates

- Grid colours: `rgba(225,205,150,0.075)` and
  `rgba(235,216,166,0.15)`
- Grid width: `0.5` px below scale `0.7`, otherwise `1` px
- The grid is not drawn over sea cells
- Coordinates are all-or-nothing and appear on every visible land hex above
  scale `0.78`
- There is no hidden/auto/always coordinate preference

## Labels

- Settlements use importance-based font weight and size
- Strategic and major labels are uppercased
- Labels have a dark stroke halo
- There is no collision layout, alternate anchor selection or reserved-space
  check against counters, routes and other labels

## Rivers, coast and bridges

- Natural Earth vectors provide continuous visual coastlines, lakes and major
  river centre-lines.
- Authoritative gameplay rivers remain edge-based through `HexState.riverEdges`.
- Gameplay river edges are rendered by scanning every visible hex; shared edges
  are not normalized into a unique render list.
- Bridges are generated from authoritative transport/river crossings and are
  drawn after rivers.
- Intact/pontoon and destroyed states differ, while damaged and prepared states
  do not yet have sufficiently distinct visual forms.

## Control and frontline

- German control uses a low-opacity blue-grey wash.
- Soviet control uses a low-opacity brick wash.
- Contested control has no non-colour pattern.
- Frontline is derived from neighbouring hexes with different non-neutral
  control.
- Shared frontline edges can be visited from both adjacent hexes.
- Control and frontline cannot be configured independently.

## Known performance issues

- `visibleHexIds` scans every scenario hex for each static rebuild and again for
  each dynamic frame.
- Static layers repeat loops over the same visible ID list.
- River and frontline shared edges are normalized during drawing rather than
  cached as render projections.
- Settlement label geometry is calculated during every static rebuild.
- Any `GameState` reference change invalidates the entire static geography,
  including changes limited to orders.
- The Natural Earth vector arrays are clipped at build time and do not perform
  runtime network requests.
- Supply-network Dijkstra already uses a binary heap; this is engine
  infrastructure and is outside the visual v1.1 refactor.

## Baseline visual problems

- The map still reads as a dense technical surface at medium zoom.
- Decorative terrain strokes and the hex grid compete with roads, labels and
  counters.
- Terrain types rely too heavily on fill colour.
- Major and secondary rivers are not consistently separated by visual weight.
- Frontline and control are not visually configurable.
- Counter stacks cover too much map content.
- Selection is weaker than counters, routes and contact markers.
- Eastern forest groups can become a dark mass.
- Layer settings are incomplete and have no named presets or persisted UI
  preference model.
