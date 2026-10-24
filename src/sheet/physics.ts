// Window throw physics (spec 001, Approach: Physics; owner, 2026-10-22;
// spec 009 R3, spec 010 R1). Pure: no DOM, no clock. Positions in sheet px, times in
// seconds unless named ms, angles in degrees.
//
// Held: the window leans toward a target set by the pointer's torque (010
// R1, the pre-009 lean, no lift scale). Thrown: x(t) = x0 + v·τ·(1 − e^(−t/τ)), cut at 2τ, where the window stops
// dead as if pinned. The momentum left at the pin becomes a kick about the
// grab point, passed through a log so hard throws do not swing much harder
// than soft ones, then a damped oscillator settles it.

export type Vec = [number, number];
/** [time ms, x, y] of the grab point, sheet px */
export type Sample = [number, number, number];
export interface Swing {
  /** angle, degrees */
  th: number;
  /** angular velocity, degrees per second */
  v: number;
}
export interface Flight {
  from: Vec;
  to: Vec;
  tau: number;
  /** angular-velocity kick at the pin, degrees per second */
  kick: number;
}

const TAU = 0.12;
const MAX_THROW = 360;
const NORM = 1 - Math.exp(-2);
const OMEGA = 2 * Math.PI * 2.6;
const ZETA = 0.45;
const ZETA_HELD = 0.65;
/** the held lean: degrees per unit of torque, and its limit (010 R1) */
const SWAY = 0.012;
const SWAY_MAX = 12;
/** the pin kick, degrees (009 R3: was 4) */
const KICK = 2.5;

/** Pointer velocity over the last 80 ms, px/s; 0 if the last sample is older than 50 ms. */
export function releaseVelocity(samples: Sample[], now: number): Vec {
  const recent = samples.filter((s) => now - s[0] < 80);
  const a = recent[0];
  const b = recent[recent.length - 1];
  if (recent.length < 2 || now - b[0] > 50 || b[0] === a[0]) return [0, 0];
  const dt = (b[0] - a[0]) / 1000;
  return [(b[1] - a[1]) / dt, (b[2] - a[2]) / dt];
}

/** Torque of the window centre about the grab point; r = centre − grab point. */
export function torque(r: Vec, v: Vec): number {
  return (r[0] * v[1] - r[1] * v[0]) / (Math.hypot(r[0], r[1]) + 1);
}

/** Angle a held window leans to, degrees. */
export function swayTarget(t: number): number {
  return Math.max(-SWAY_MAX, Math.min(SWAY_MAX, -SWAY * t));
}

/** Where a throw at v from top-left `from` stops: capped at 360 px, window kept inside the sheet. */
export function throwLanding(
  from: Vec,
  v: Vec,
  box: { w: number; h: number },
  sheet: { w: number; h: number },
): Vec {
  const d = Math.hypot(v[0], v[1]) * TAU * NORM;
  const k = d > MAX_THROW ? MAX_THROW / d : 1;
  return [
    clamp(from[0] + v[0] * TAU * NORM * k, sheet.w - box.w),
    clamp(from[1] + v[1] * TAU * NORM * k, sheet.h - box.h),
  ];
}

const clamp = (x: number, max: number): number => Math.min(Math.max(x, 0), max);

/** A flight on the throw curve. Long trips (Home, Reset) take longer, up to τ = 0.3 s. */
export function flight(from: Vec, to: Vec, r: Vec): Flight {
  const d = Math.hypot(to[0] - from[0], to[1] - from[1]);
  const tau = d > MAX_THROW ? Math.min(0.3, (TAU * d) / MAX_THROW) : TAU;
  // the velocity at the pin is dx/dt of the curve at t = 2τ
  const pin = Math.exp(-2) / (tau * NORM);
  const t = torque(r, [(to[0] - from[0]) * pin, (to[1] - from[1]) * pin]);
  const kick = Math.sign(t) * KICK * Math.log1p(Math.abs(t) / 150) * OMEGA;
  return { from, to, tau, kick };
}

/** Position t seconds into a flight; exactly `to` from 2τ on. */
export function flightAt(f: Flight, t: number): Vec {
  if (t >= 2 * f.tau) return f.to;
  const k = (1 - Math.exp(-t / f.tau)) / NORM;
  return [
    f.from[0] + (f.to[0] - f.from[0]) * k,
    f.from[1] + (f.to[1] - f.from[1]) * k,
  ];
}

/**
 * One step of θ'' = −ω²(θ − target) − 2ζωθ'. Held: the window leans toward
 * `target` (ζ = 0.65). Free: it swings about 0 (ζ = 0.45). With target 0 it
 * stops at exactly θ = θ' = 0.
 */
export function swing(s: Swing, dt: number, held: boolean, target = 0): Swing {
  const zeta = held ? ZETA_HELD : ZETA;
  const v =
    s.v + (-OMEGA * OMEGA * (s.th - target) - 2 * zeta * OMEGA * s.v) * dt;
  const th = s.th + v * dt;
  if (target === 0 && Math.abs(th) < 0.05 && Math.abs(v) < 0.5)
    return { th: 0, v: 0 };
  return { th, v };
}
