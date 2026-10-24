import { describe, expect, it } from "vitest";
import {
  mulberry32,
  pickRandom,
} from "../../../../src/apps/castlesiege/ai/rng.js";

describe("mulberry32", () => {
  it("is deterministic for a given seed", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    expect([a(), a(), a(), a(), a()]).toEqual([b(), b(), b(), b(), b()]);
  });

  it("produces different streams for different seeds", () => {
    expect(mulberry32(1)()).not.toEqual(mulberry32(2)());
  });

  it("stays within [0, 1)", () => {
    const r = mulberry32(7);
    for (let i = 0; i < 1000; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("is roughly uniform across deciles", () => {
    const r = mulberry32(123);
    const buckets = new Array<number>(10).fill(0);
    const N = 100000;
    for (let i = 0; i < N; i++) {
      const bi = Math.min(9, Math.floor(r() * 10));
      buckets[bi] = (buckets[bi] ?? 0) + 1;
    }
    for (const count of buckets) {
      expect(count).toBeGreaterThan((N / 10) * 0.85);
      expect(count).toBeLessThan((N / 10) * 1.15);
    }
  });
});

describe("pickRandom", () => {
  it("returns an element of the array", () => {
    const r = mulberry32(5);
    const items = ["a", "b", "c"];
    for (let i = 0; i < 50; i++) {
      expect(items).toContain(pickRandom(items, r));
    }
  });

  it("is deterministic for a given seed", () => {
    const items = [10, 20, 30, 40, 50];
    const pick = (seed: number): number[] => {
      const r = mulberry32(seed);
      return [0, 1, 2, 3, 4].map(() => pickRandom(items, r));
    };
    expect(pick(99)).toEqual(pick(99));
  });

  it("throws on an empty array", () => {
    expect(() => pickRandom([], mulberry32(1))).toThrow();
  });
});
