# Operational Map v1.1 — performance

## Instrumentation

`mapPerformance.ts` keeps a bounded 180-sample window for `terrain`, `context`,
`dynamic` and complete `frame` durations. The latest summary is written to the
visible canvas as `data-render-metrics`; the screenshot manifest records it.

The two offscreen caches ensure that selection, hover and route preview do not
redraw geography. State changes rebuild only operational context. Spatial axial
bounds replace repeated full-map scans.

## Reproducible benchmark

Start the dev server and run:

```powershell
npm run capture:map-v11
```

The capture script records cold medium renders at five viewports plus far,
close, supply and grid-off states. Results are stored in
`artifacts/operational-map-v11/manifest.json`.

Representative local Chromium run on 2026-07-30:

| Scenario | Terrain latest | Context latest | Dynamic latest | Frame latest |
|---|---:|---:|---:|---:|
| 1920×1080 medium cold frame | 16.0 ms | 22.2 ms | 4.2 ms | 50.6 ms |
| 1440×900 medium cold frame | 8.2 ms | 22.5 ms | 4.2 ms | 43.2 ms |
| 390×844 mobile medium cold frame | 5.7 ms | 16.5 ms | 2.8 ms | 27.2 ms |
| selected German formation | cached | cached | 1.1 ms | 1.1 ms |
| selected Soviet formation | cached | cached | 1.2 ms | 1.2 ms |

These are development-mode cold-frame measurements, not a guaranteed hardware
budget. Interaction frames reuse both caches and normally measure only the
dynamic stage.
