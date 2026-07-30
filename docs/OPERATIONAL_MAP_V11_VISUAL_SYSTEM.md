# Operational Map v1.1 — visual system

## Hierarchy

Primary information is formed by counters, selection, strategic settlements,
major rivers, bridge states, frontline and current orders. Roads, railways,
regional settlements and supply context form the second level. Grid,
coordinates and close-zoom terrain marks are background information.

The palette is deliberately restrained: khaki terrain, desaturated forest,
blue-green water, graphite German counters, brick-red Soviet counters, brass
selection, warm-red frontline, pale ochre roads and charcoal railways.

## Terrain and water

Terrain categories use separate fills. At close LOD, forest uses tree marks,
dense forest uses a denser version, swamp uses a wave, city uses blocks and
fortified terrain uses chevrons. Generic random decoration is not used.

Lake and coastline vectors are drawn continuously above the hex terrain mask.
Major named rivers use a wider dark outer stroke and a blue-grey centre stroke.
Gameplay river edges are canonicalized and drawn once. Intact and pontoon
bridges use double bars; destroyed bridges use a red cross.

## Settlements and transport

Settlements are ranked `strategic > major > regional > minor`. Marker shape,
font size, weight and label priority follow that rank. Labels try below, above,
right and left anchors. Lower-priority colliding labels are suppressed;
strategic labels are preserved.

Major roads remain visible from far/medium LOD. Minor roads appear at close
LOD. Railway uses a charcoal base and a light broken centre line. Transport
segments require reciprocal edge data, preventing isolated half-edge strokes.

## Units and interaction

- Far LOD uses a summary marker; German and Soviet markers have different
  silhouettes.
- Medium and close LOD use readable NATO-style counters.
- A stack shows at most three counters; selected counters are projected first
  and the remainder is shown as `+N`.
- HQ counters use an accent stripe and an inset frame.
- Supply status changes marker shape as well as colour.
- Selection uses a restrained brass fill, border and shadow.
- Hover is an outline only.
- Reachable hexes use small inner dots instead of full green fills.
- Attack targets use red fill, outline and hatch.
- March, advance, withdrawal and other routes use distinct colour/dash styles.

## Accessibility

The service preset enables high contrast. Control, selection and supply do not
depend on colour alone. Contested control uses a diagonal hatch. The filter
panel exposes text labels for every layer mode. Global CSS honors
`prefers-reduced-motion: reduce`; Canvas effects are static markers rather than
continuous animation.
