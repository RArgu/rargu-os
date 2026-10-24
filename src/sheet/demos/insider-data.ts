// Spec 006 R2, R4: the insider demo's invented market, seeded. Ported from
// the mock's generator (docs/mockups/rargu-os-src/reused.js:85-88). Pure: no
// DOM, no clock. The market, trades and wallet ids are invented; wallet ids
// are short "W-XXXX" labels, never address-like strings.
//
// Flag rule: a trade is flagged when its size ≥ FLAG_MIN ($k) and it falls in
// the FLAG_WINDOW hours before the spike, that is 1 ≤ spike − hour ≤ 14.

export const HOURS = 160;
/** the hour the spike starts; the price jumps for SPIKE_LEN hours */
export const SPIKE = 118;
export const SPIKE_LEN = 6;
export const FLAG_MIN = 20;
export const FLAG_WINDOW = 14;
/** the demo's seed */
export const SEED = 7;

export interface Trade {
  hour: number;
  /** $k, whole */
  size: number;
  wallet: string;
}
export interface Market {
  /** price per hour, 0.03–0.97 ($ per share) */
  price: number[];
  spike: number;
  /** in hour order */
  trades: Trade[];
}
export interface Flag {
  wallet: string;
  /** $k */
  amount: number;
  hoursBefore: number;
}

/** mulberry32: a small seeded PRNG, uniform in [0, 1) */
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ID = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function insiderMarket(seed: number): Market {
  const rnd = prng(seed);
  const price: number[] = [];
  const trades: Trade[] = [];
  const used = new Set<string>();
  const wallet = () => {
    for (;;) {
      let id = "W-";
      for (let k = 0; k < 4; k++) id += ID[Math.floor(rnd() * ID.length)];
      if (!used.has(id)) {
        used.add(id);
        return id;
      }
    }
  };
  let p = 0.22;
  for (let hour = 0; hour < HOURS; hour++) {
    p += (rnd() - 0.5) * 0.012;
    if (hour >= SPIKE && hour < SPIKE + SPIKE_LEN) p += 0.1;
    p = Math.min(0.97, Math.max(0.03, p));
    price.push(p);
    if (rnd() >= 0.35) continue;
    const before = SPIKE - hour;
    const inWindow = before >= 1 && before <= FLAG_WINDOW;
    // big bets cluster before the spike (as in the mock); a few big trades
    // elsewhere are not flagged, so the window matters
    const big = rnd() < (inWindow ? 0.6 : 0.08);
    const size = Math.round(big ? 20 + rnd() * 40 : 2 + rnd() * 10);
    trades.push({ hour, size, wallet: wallet() });
  }
  return { price, spike: SPIKE, trades };
}

/** The flagged trades, in hour order. */
export function flagged(m: Market): Flag[] {
  return m.trades
    .map((t) => ({ t, before: m.spike - t.hour }))
    .filter(
      ({ t, before }) =>
        t.size >= FLAG_MIN && before >= 1 && before <= FLAG_WINDOW,
    )
    .map(({ t, before }) => ({
      wallet: t.wallet,
      amount: t.size,
      hoursBefore: before,
    }));
}
