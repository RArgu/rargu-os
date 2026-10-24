// @vitest-environment node
// Spec 006 R2.a (the flagged list) and R4.a (seeded) for the insider demo's
// data module. The chart itself is tested in the page (T4).
import { describe, expect, it } from "vitest";
import {
  FLAG_MIN,
  FLAG_WINDOW,
  HOURS,
  SEED,
  flagged,
  insiderMarket,
  type Flag,
  type Market,
} from "../../src/sheet/demos/insider-data.ts";

/** The spec rule, written again here: size ≥ 20 ($k) and in the 14 hours
 * before the spike; hours before = spike hour − trade hour. */
function expected(m: Market): Flag[] {
  return m.trades
    .filter((t) => {
      const before = m.spike - t.hour;
      return t.size >= 20 && before >= 1 && before <= 14;
    })
    .map((t) => ({
      wallet: t.wallet,
      amount: t.size,
      hoursBefore: m.spike - t.hour,
    }));
}

describe("R2.a flagged list", () => {
  const m = insiderMarket(SEED);

  it("uses the rule's numbers", () => {
    expect(FLAG_MIN).toBe(20);
    expect(FLAG_WINDOW).toBe(14);
  });

  it(`seed ${SEED}: equals the trades the rule selects`, () => {
    expect(flagged(m)).toEqual(expected(m));
    expect(flagged(m).length).toBeGreaterThan(0);
  });

  it(`seed ${SEED}: both conditions matter (a big trade outside the window, a small one inside)`, () => {
    const big = m.trades.filter((t) => t.size >= 20);
    expect(big.some((t) => m.spike - t.hour < 1 || m.spike - t.hour > 14)).toBe(
      true,
    );
    expect(
      m.trades.some(
        (t) => t.size < 20 && m.spike - t.hour >= 1 && m.spike - t.hour <= 14,
      ),
    ).toBe(true);
  });

  it("finds the same list on other seeds", () => {
    for (let s = 1; s <= 50; s++) {
      const n = insiderMarket(s);
      expect(flagged(n)).toEqual(expected(n));
    }
  });

  // pinned so that a change to the generator is seen
  it(`seed ${SEED}: pinned flagged list`, () => {
    expect(flagged(m)).toEqual(PINNED_FLAGS);
  });
});

// The generator never makes 13–19 $k trades, so the edges are hand-built.
describe("R2.a rule edges (hand-built market)", () => {
  const t = (hour: number, size: number, wallet: string) => ({
    hour,
    size,
    wallet,
  });
  const hand: Market = {
    price: [],
    spike: 118,
    trades: [
      t(103, 30, "W-T15H"), // 15 h before: outside
      t(104, 19, "W-T19K"), // 14 h before, 19 $k: too small
      t(104, 20, "W-T20K"), // 14 h before, 20 $k: flagged
      t(117, 25, "W-T01H"), // 1 h before: flagged
      t(118, 40, "W-T00H"), // the spike hour, 0 h before: outside
    ],
  };
  it("flags 20 $k at 14 h and 1 h before; not 19 $k, 15 h or 0 h", () => {
    expect(flagged(hand)).toEqual([
      { wallet: "W-T20K", amount: 20, hoursBefore: 14 },
      { wallet: "W-T01H", amount: 25, hoursBefore: 1 },
    ]);
  });
});

describe("generated market", () => {
  it("has a price per hour in [0.03, 0.97] that rises at the spike", () => {
    for (let s = 1; s <= 50; s++) {
      const m = insiderMarket(s);
      expect(m.price).toHaveLength(HOURS);
      for (const p of m.price) {
        expect(p).toBeGreaterThanOrEqual(0.03);
        expect(p).toBeLessThanOrEqual(0.97);
      }
      expect(m.price[m.spike + 5]).toBeGreaterThan(m.price[m.spike - 1]);
    }
  });

  it("has trades in hour order with whole $k sizes and invented wallet ids", () => {
    const m = insiderMarket(SEED);
    const hours = m.trades.map((t) => t.hour);
    expect(hours).toEqual([...hours].sort((a, b) => a - b));
    for (const t of m.trades) {
      expect(t.hour).toBeGreaterThanOrEqual(0);
      expect(t.hour).toBeLessThan(HOURS);
      expect(Number.isInteger(t.size)).toBe(true);
      expect(t.size).toBeGreaterThan(0);
      // short invented ids, never an address-like 0x… string
      expect(t.wallet).toMatch(/^W-[A-Z0-9]{4}$/);
    }
    const ids = m.trades.map((t) => t.wallet);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("R4.a seeded", () => {
  it("same seed twice gives equal output", () => {
    expect(insiderMarket(SEED)).toEqual(insiderMarket(SEED));
  });
  it("another seed gives different output", () => {
    expect(insiderMarket(SEED + 1)).not.toEqual(insiderMarket(SEED));
  });
});

// trades at hours 104, 110, 113, 115; the 6 $k trade at hour 111 is not
// flagged; 14 h before is inside the window
const PINNED_FLAGS: Flag[] = [
  { wallet: "W-VXPY", amount: 40, hoursBefore: 14 },
  { wallet: "W-YSYL", amount: 58, hoursBefore: 8 },
  { wallet: "W-BY2G", amount: 27, hoursBefore: 5 },
  { wallet: "W-KTYK", amount: 58, hoursBefore: 3 },
];
