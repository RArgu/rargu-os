// R8.b, R8.c (001), R3.a (009) and R1.a (010): window throw physics. Expected
// numbers are worked out from the spec formulas by hand, not from the
// module's constants.
import { describe, expect, it } from "vitest";
import {
  flight,
  flightAt,
  releaseVelocity,
  swayTarget,
  swing,
  throwLanding,
  torque,
  type Sample,
  type Swing,
  type Vec,
} from "../../src/sheet/physics.ts";

const box = { w: 100, h: 100 };
const sheet = { w: 3000, h: 1640 };

/** samples every 10 ms from t = 0 to t = last ms, moving at (vx, vy) px/s */
const samples = (last: number, vx: number, vy: number): Sample[] =>
  Array.from({ length: last / 10 + 1 }, (_, i) => [
    i * 10,
    (vx * i) / 100,
    (vy * i) / 100,
  ]);

describe("R8.b release velocity", () => {
  it("is the pointer motion over the last 80 ms", () => {
    const v = releaseVelocity(samples(200, 1000, -500), 205);
    expect(v[0]).toBeCloseTo(1000, 6);
    expect(v[1]).toBeCloseTo(-500, 6);
  });
  it("is zero when the last sample is older than 50 ms", () => {
    expect(releaseVelocity(samples(200, 1000, 0), 251)).toEqual([0, 0]);
  });
  it("is zero with no motion or one sample", () => {
    expect(releaseVelocity(samples(200, 0, 0), 205)).toEqual([0, 0]);
    expect(releaseVelocity([[0, 5, 5]], 1)).toEqual([0, 0]);
    expect(
      releaseVelocity(
        [
          [10, 0, 0],
          [10, 9, 0],
        ],
        11,
      ),
    ).toEqual([0, 0]);
  });
});

describe("R8.b throw landing", () => {
  it("v = (1000, 0) flies 103.76 px", () => {
    const [x, y] = throwLanding([100, 100], [1000, 0], box, sheet);
    expect(Math.abs(x - 203.76)).toBeLessThan(0.01);
    expect(y).toBe(100);
  });
  it("v = (5000, 0) is capped at 360 px", () => {
    expect(throwLanding([100, 100], [5000, 0], box, sheet)[0]).toBeCloseTo(
      460,
      6,
    );
  });
  it("v = (600, 800) flies 103.76 px along that direction", () => {
    const [x, y] = throwLanding([100, 100], [600, 800], box, sheet);
    expect(Math.abs(x - 100 - 62.256)).toBeLessThan(0.01);
    expect(Math.abs(y - 100 - 83.008)).toBeLessThan(0.01);
  });
  it("a throw toward an edge stops with the whole window inside the sheet", () => {
    expect(throwLanding([2800, 1500], [5000, 5000], box, sheet)).toEqual([
      2900, 1540,
    ]);
    expect(throwLanding([50, 20], [-5000, -1000], box, sheet)).toEqual([0, 0]);
  });
});

describe("R8.b flight curve", () => {
  const f = flight(
    [100, 100],
    throwLanding([100, 100], [1000, 0], box, sheet),
    [0, 100],
  );
  it("follows x0 + v·τ·(1 − e^(−t/τ))", () => {
    expect(f.tau).toBe(0.12);
    expect(flightAt(f, 0)[0]).toBeCloseTo(100, 6);
    expect(Math.abs(flightAt(f, 0.12)[0] - 175.854)).toBeLessThan(0.01);
  });
  it("stops dead at 2τ and does not change after", () => {
    expect(flightAt(f, 0.24)).toEqual(f.to);
    expect(flightAt(f, 0.5)).toEqual(f.to);
    expect(flightAt(f, 0.2399)[0]).toBeLessThan(f.to[0]);
  });
  it("kicks the swing by sign(t)·2.5°·ln(1 + |t|/150)·ω from the pin velocity", () => {
    // pin velocity 135.336 px/s; r = (0, 100) → torque −133.996;
    // −2.5 · ln(1.89331) · 2π · 2.6 = −26.070
    expect(Math.abs(f.kick - -26.07)).toBeLessThan(0.01);
  });
  it("long flights take τ = min(0.3, 0.12 · d / 360)", () => {
    expect(flight([0, 0], [720, 0], [0, 0]).tau).toBeCloseTo(0.24, 9);
    expect(flight([0, 0], [1800, 0], [0, 0]).tau).toBe(0.3);
    expect(flight([0, 0], [360, 0], [0, 0]).tau).toBe(0.12);
  });
});

describe("torque", () => {
  it("torque = (rx·vy − ry·vx) / (|r| + 1)", () => {
    expect(torque([3, 4], [10, 0])).toBeCloseTo(-40 / 6, 9);
  });
});

describe("R1.a (010) held: the pre-009 lean", () => {
  it("swayTarget = clamp(−0.012·t, −12°, 12°)", () => {
    expect(swayTarget(100)).toBeCloseTo(-1.2, 9);
    expect(swayTarget(-250)).toBeCloseTo(3, 9);
    expect(swayTarget(5000)).toBe(-12);
    expect(swayTarget(-5000)).toBe(12);
    expect(Math.abs(swayTarget(0))).toBe(0);
  });
  it("held: θ'' = −ω²(θ − target) − 2·0.65·ω·θ'", () => {
    const w = 2 * Math.PI * 2.6;
    const dt = 1 / 120;
    const s = { th: 1, v: 10 };
    const v = 10 + (-w * w * (1 - 6) - 2 * 0.65 * w * 10) * dt;
    const got = swing(s, dt, true, 6);
    expect(got.v).toBeCloseTo(v, 9);
    expect(got.th).toBeCloseTo(1 + v * dt, 9);
  });
  it("held: leans toward the target and holds it", () => {
    let s: Swing = { th: 0, v: 0 };
    for (let t = 0; t < 1.5; t += 1 / 120) s = swing(s, 1 / 120, true, -8);
    expect(s.th).toBeCloseTo(-8, 1);
  });
  it("held at rest with target 0 stays exactly 0", () => {
    expect(swing({ th: 0, v: 0 }, 1 / 120, true, 0)).toEqual({ th: 0, v: 0 });
  });
  it("held, target back to 0: ends at exactly θ = θ' = 0", () => {
    let s: Swing = { th: 6, v: 0 };
    for (let t = 0; t < 3; t += 1 / 120) s = swing(s, 1 / 120, true, 0);
    expect(s).toEqual({ th: 0, v: 0 });
  });
  it("held with a target never snaps to 0", () => {
    expect(swing({ th: 0.01, v: 0.1 }, 1 / 120, true, 0.02).th).not.toBe(0);
  });
});

// R8.c: from 0.8 s after the pin, |θ| < 0.05° and |θ'| < 0.5 °/s
function settleCheck(s: Swing, dt: number): void {
  for (let t = 0; t < 3; t += dt) {
    if (t >= 0.8 - 1e-9) {
      expect(Math.abs(s.th)).toBeLessThan(0.05);
      expect(Math.abs(s.v)).toBeLessThan(0.5);
    }
    s = swing(s, dt, false);
  }
}
// the largest throw: 360 px with the pin velocity at right angles to r
const largest = flight([0, 0], [360, 0], [0, -1e6]);

describe("R8.c settle", () => {
  for (const hz of [60, 120]) {
    const dt = 1 / hz;
    it(`settles after the largest throw at ${hz} Hz`, () => {
      // torque ≈ 469 → 2.5 · ln(1 + 469/150) · ω ≈ 57.9 °/s
      expect(Math.abs(largest.kick)).toBeGreaterThan(57);
      settleCheck({ th: 0, v: largest.kick }, dt);
    });
    it(`settles when caught and re-thrown while it wobbles, at ${hz} Hz`, () => {
      for (let caught = 0; caught <= 0.6; caught += 0.05)
        for (const held of [dt, 0.1])
          for (const sign of [-1, 1]) {
            let s: Swing = { th: 0, v: largest.kick };
            for (let t = 0; t < caught; t += dt) s = swing(s, dt, false);
            // caught: θ = θ' = 0 (windows.ts), then held still (target 0)
            s = { th: 0, v: 0 };
            for (let t = 0; t < held; t += dt) s = swing(s, dt, true, 0);
            for (let t = 0; t < 0.24; t += dt) s = swing(s, dt, false);
            settleCheck({ th: s.th, v: s.v + sign * largest.kick }, dt);
          }
    });
  }
  it("comes to rest: swing stops at the threshold", () => {
    expect(swing({ th: 0.04, v: 0.4 }, 1 / 60, false)).toEqual({
      th: 0,
      v: 0,
    });
  });
});

// R3.a (009): fixtures at dt = 1/120, each a window (CastleSiege, 620 × 654),
// a start, a destination and a grab point P. r = centre − P = (310, 327) −
// (310, 12) = (0, 315).
describe("R3.a pin wobble peak and settle", () => {
  const dt = 1 / 120;
  const r: Vec = [0, 315];
  /** peak |θ| over 3 s from the pin; asserts the settle from 0.8 s on */
  const peak = (kick: number): number => {
    let s: Swing = { th: 0, v: kick };
    let max = 0;
    for (let i = 1; i * dt < 3; i++) {
      s = swing(s, dt, false);
      max = Math.max(max, Math.abs(s.th));
      if (i * dt >= 0.8 - 1e-9) {
        expect(Math.abs(s.th), `θ at ${i * dt} s`).toBeLessThan(0.05);
        expect(Math.abs(s.v), `θ' at ${i * dt} s`).toBeLessThan(0.5);
      }
    }
    return max;
  };
  it("the capped throw (360 px, bar grab): peak |θ| ≤ 2.5°", () => {
    // (360, 100) → (720, 100): pin velocity 469.6 px/s, torque −468.07
    const f = flight([360, 100], [720, 100], r);
    expect(f.tau).toBe(0.12);
    expect(Math.abs(f.kick - -57.83)).toBeLessThan(0.01);
    const p = peak(f.kick);
    expect(p).toBeGreaterThan(1);
    expect(p).toBeLessThanOrEqual(2.5);
  });
  it("Home of CastleSiege from (2380, 986): peak |θ| ≤ 3.0°", () => {
    // d = 2205.76 px → τ = 0.3 s; torque 1050.55
    const f = flight([2380, 986], [360, 100], r);
    expect(f.tau).toBe(0.3);
    expect(Math.abs(f.kick - 84.94)).toBeLessThan(0.01);
    const p = peak(f.kick);
    expect(p).toBeGreaterThan(2);
    expect(p).toBeLessThanOrEqual(3);
  });
});
