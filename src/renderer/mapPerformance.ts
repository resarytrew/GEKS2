export type MapRenderStage = "terrain" | "context" | "dynamic" | "frame";

export interface MapRenderSummary {
  samples: number;
  latestMs: number;
  medianMs: number;
  p95Ms: number;
  maxMs: number;
}

const MAX_SAMPLES = 180;
const samples: Record<MapRenderStage, number[]> = {
  terrain: [],
  context: [],
  dynamic: [],
  frame: [],
};

export function recordMapRenderSample(stage: MapRenderStage, durationMs: number): void {
  if (!Number.isFinite(durationMs) || durationMs < 0) return;
  const values = samples[stage];
  values.push(durationMs);
  if (values.length > MAX_SAMPLES) values.splice(0, values.length - MAX_SAMPLES);
}

export function summarizeMapRenderStage(stage: MapRenderStage): MapRenderSummary {
  const values = samples[stage];
  if (values.length === 0) {
    return { samples: 0, latestMs: 0, medianMs: 0, p95Ms: 0, maxMs: 0 };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const percentile = (fraction: number) =>
    sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * fraction))];
  return {
    samples: values.length,
    latestMs: round(values.at(-1) ?? 0),
    medianMs: round(percentile(0.5)),
    p95Ms: round(percentile(0.95)),
    maxMs: round(sorted.at(-1) ?? 0),
  };
}

export function getMapRenderBenchmark(): Record<MapRenderStage, MapRenderSummary> {
  return {
    terrain: summarizeMapRenderStage("terrain"),
    context: summarizeMapRenderStage("context"),
    dynamic: summarizeMapRenderStage("dynamic"),
    frame: summarizeMapRenderStage("frame"),
  };
}

export function resetMapRenderBenchmark(): void {
  for (const stage of Object.keys(samples) as MapRenderStage[]) samples[stage].length = 0;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
