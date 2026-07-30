# Operational Map v1.1 — verification

## Automated checks

- TypeScript typecheck
- ESLint
- full Vitest suite
- production Next.js build
- production smoke for `/`, `/play`, `/api/health`
- renderer projection tests for LOD, coordinates, settlements, unique river
  and frontline edges, label collisions, stack projection, presets,
  invalidation policy and benchmark statistics

## Browser acceptance

`scripts/capture-operational-map-v11.mjs` uses Playwright with Chromium,
reduced motion and a deterministic Raseiniai fixture. It creates:

- `1920x1080-medium.png`
- `1440x900-medium.png`
- `1280x720-medium.png`
- `1024x768-medium.png`
- `390x844-medium.png`
- `1920x1080-far.png`
- `1920x1080-close.png`
- `1920x1080-supply.png`
- `1920x1080-grid-off.png`
- `1920x1080-selected-german.png`
- `1920x1080-selected-soviet.png`
- `1920x1080-attack-target.png`
- `1920x1080-prepared-attack.png`
- `1920x1080-engineer-order.png`

The machine-readable capture list and render timings are in `manifest.json` in
the same directory.

## Manual acceptance

- pan and wheel zoom preserve pointer position;
- far, medium and close LOD switch at the authoritative thresholds;
- filter presets change visible layers and survive reload;
- control/frontline, rivers/coast, settlements and counters remain legible;
- selection, hover, reachable and attack target use distinct treatments;
- mobile layout moves the tool rail to the bottom and leaves the map full width;
- display settings do not alter `GameState` or save schema.

The screenshots validate layout and deterministic rendering. They are not
pixel-perfect golden tests across operating systems because font rasterization
and Canvas anti-aliasing vary by browser and platform.
