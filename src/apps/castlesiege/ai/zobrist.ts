import { mulberry32 } from "./rng.js";
import type { GameState, Ruleset } from "./types.js";

/**
 * Deterministic Zobrist hashing for the transposition table (docs/OFFENSE_DEFENSE.md §4).
 *
 * A position's key is the XOR-fold of a random 64-bit value per (pieceType, owner, x, y) present, plus
 * one per side-to-move. This keys on (pieces, toMove) ONLY.
 *
 * ⚠️ S017: with the anti-stalling repetition ban a ruleset can be NON-Markov — two positions with the
 * same (pieces, toMove) but different `positionCounts` history are legally distinct. This key IGNORES
 * that history, which is SOUND here ONLY because the TT is MOVE-ORDERING-ONLY (it stores a best-move
 * hint, never a value/bound): a stale hint from a same-board/different-history position is at worst
 * slightly worse ordering — it can never inject an illegal move (a now-banned move simply won't match
 * any current legal action) nor change the search value. If value-caching is EVER reintroduced, this
 * key would be UNSOUND across repetition-history-differing positions and must fold `positionCounts`
 * in (see ai/CLAUDE.md). Aside from history it collides only on a genuine 64-bit hash collision
 * (astronomically unlikely, and the TT differential test would catch one anyway).
 *
 * Pure + seeded: the random table is generated from `mulberry32(seed)`, so the same seed always yields
 * the same keys (a determinism requirement for the measurement lab). Keys are `"hi:lo"` strings (two
 * 32-bit halves) — exact and Map-keyable, with no 2⁵³ float-precision loss from packing into one number.
 */

export interface Zobrist {
  /** A collision-resistant, Map-keyable key for the FULL position + side to move. */
  key(state: GameState): string;
}

interface HalfPair {
  hi: number;
  lo: number;
}

/** A fixed default so a TT-enabled agent is deterministic without the caller picking a seed. */
export const DEFAULT_ZOBRIST_SEED = 0x5a17b0a7;

/** FNV-1a 32-bit — a pure fallback for an off-table (out-of-bounds / unknown-type) piece. */
function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function makeZobrist(
  ruleset: Ruleset,
  seed: number = DEFAULT_ZOBRIST_SEED,
): Zobrist {
  const rng = mulberry32(seed >>> 0);
  const rand32 = (): number => Math.floor(rng() * 0x1_0000_0000) >>> 0;
  const randPair = (): HalfPair => ({ hi: rand32(), lo: rand32() });

  const { width, height } = ruleset.board;
  const pieceTable = new Map<string, HalfPair>();
  for (const type of Object.keys(ruleset.pieceTypes)) {
    for (const owner of ruleset.turnOrder) {
      for (let x = 0; x < width; x++) {
        for (let y = 0; y < height; y++) {
          pieceTable.set(`${type}|${owner}|${x}|${y}`, randPair());
        }
      }
    }
  }
  const sideTable = new Map<string, HalfPair>();
  for (const owner of ruleset.turnOrder) sideTable.set(owner, randPair());

  return {
    key(state: GameState): string {
      let hi = 0;
      let lo = 0;
      for (const p of state.pieces) {
        const id = `${p.type}|${p.owner}|${p.x}|${p.y}`;
        const e = pieceTable.get(id);
        if (e === undefined) {
          // Defensive: a piece outside the precomputed grid (never happens for legal states). Fold a
          // stable per-id value into BOTH halves so distinct off-table pieces still differ.
          hi = (hi ^ fnv1a(id)) >>> 0;
          lo = (lo ^ fnv1a(`${id}#`)) >>> 0;
          continue;
        }
        hi = (hi ^ e.hi) >>> 0;
        lo = (lo ^ e.lo) >>> 0;
      }
      const s = sideTable.get(state.toMove);
      if (s !== undefined) {
        hi = (hi ^ s.hi) >>> 0;
        lo = (lo ^ s.lo) >>> 0;
      }
      return `${hi}:${lo}`;
    },
  };
}
