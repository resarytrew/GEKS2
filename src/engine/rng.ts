/**
 * Deterministic, counter-based pseudo-random generator.
 *
 * Each draw is a pure function of (seed, cursor), so the full sequence of dice
 * rolls is fully reproducible from the stored seed + command order. Every roll
 * is recorded as a DICE_ROLLED event carrying the cursor, enabling exact
 * replay, network synchronisation and dispute resolution.
 */

function imul32(a: number, b: number): number {
  return Math.imul(a, b) >>> 0;
}

function hash32(input: number): number {
  let h = input | 0;
  h = imul32(h ^ 0x9e3779b9, 0x85ebca6b);
  h = imul32(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** A uniform float in [0, 1) derived deterministically from seed + cursor. */
export function rngValue(seed: number, cursor: number): number {
  const h = hash32((seed | 0) ^ imul32(cursor + 1, 0x9e3779b9));
  return h / 0x100000000;
}

export interface RollResult {
  /** float in [0,1) */
  value: number;
  /** the cursor value consumed */
  cursor: number;
}

/** Draw the next value, returning the value and the new cursor. */
export function roll(seed: number, cursor: number): RollResult {
  return { value: rngValue(seed, cursor), cursor: cursor + 1 };
}

/** Convenience: an integer in [min, max] inclusive. */
export function rollInt(seed: number, cursor: number, min: number, max: number): { value: number; cursor: number } {
  const r = roll(seed, cursor);
  const span = max - min + 1;
  return { value: min + Math.floor(r.value * span), cursor: r.cursor };
}

/** Sum of n six-sided dice. */
export function rollDice(
  seed: number,
  cursor: number,
  count: number,
  sides = 6,
): { total: number; rolls: number[]; cursor: number } {
  let c = cursor;
  let total = 0;
  const rolls: number[] = [];
  for (let i = 0; i < count; i++) {
    const r = rollInt(seed, c, 1, sides);
    total += r.value;
    rolls.push(r.value);
    c = r.cursor;
  }
  return { total, rolls, cursor: c };
}
