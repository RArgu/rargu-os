import type { Rng } from "./types.js";

/**
 * mulberry32 — a tiny, fast, well-distributed seeded PRNG. Deterministic given the seed, so every
 * experiment is reproducible (the engine itself has no RNG; randomness lives here, in the lab).
 */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return function (): number {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Pick a uniformly-random element from a non-empty array. Throws on empty (callers must guard). */
export function pickRandom<T>(items: readonly T[], rng: Rng): T {
  if (items.length === 0) {
    throw new Error("pickRandom: empty array");
  }
  const item = items[Math.floor(rng() * items.length)];
  if (item === undefined) {
    // Unreachable for an in-range index into a non-empty array; satisfies noUncheckedIndexedAccess.
    throw new Error("pickRandom: index out of range");
  }
  return item;
}
