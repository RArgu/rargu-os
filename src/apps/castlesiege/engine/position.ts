import type { GameState } from "./types.js";

/**
 * Canonical, order-independent position identity (the pieces multiset + side to move) — the unit of
 * repetition for the S017 anti-stalling ban (docs/ANTI_STALLING.md §1.1). Structural and EXACT:
 * distinct positions ⇒ distinct strings, with NO probabilistic collision (unlike the AI's Zobrist
 * hash). A legality rule cannot tolerate a hash collision — two positions colliding would silently
 * make a legal move illegal (or fail to ban an over-limit one), a P0 #3 violation — so the key is
 * built by construction to be exact.
 *
 * - **`~`-delimited fields** so it stays exact for ARBITRARY string type/owner ids and multi-digit
 *   coords (not just the default roster): "aa~b~1~2" can never alias "a~ab~1~2".
 * - **Order-independent**: `pieces[]` array order is not semantic (`applyAction` reorders on
 *   capture), so the parts are sorted.
 * - **`PieceId` is EXCLUDED**: two interchangeable same-side pieces swapping squares is the SAME
 *   board; `id` is a handle for animation/networking, not a position attribute.
 * - **`toMove` in the key** (situational superko): the same board with white- vs black-to-move are
 *   DISTINCT positions, so the count climbs on the side that keeps returning the board to its own
 *   prior turn-state.
 *
 * There is no castling / en-passant / halfmove state in Castle Siege, so position identity is
 * purely arrangement + side-to-move.
 */
export function positionKey(
  state: Pick<GameState, "pieces" | "toMove">,
): string {
  const parts = state.pieces.map((p) => `${p.type}~${p.owner}~${p.x}~${p.y}`);
  parts.sort();
  return `${parts.join("|")}#${state.toMove}`;
}
