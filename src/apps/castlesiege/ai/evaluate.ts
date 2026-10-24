import { legalActions } from "../engine/index.js";
import type {
  Action,
  EvalWeights,
  GameState,
  PlayerId,
  Ruleset,
} from "./types.js";

/**
 * Game-specific evaluation for the alpha-beta OPPONENT (not the assumption-free balance lab — this
 * deliberately encodes piece values + king safety to play strongly). Positive = good for `player`.
 *
 * Weights are a TUNABLE input ({@link EvalWeights}), NOT magic numbers — they are *measured*, not
 * guessed (docs/PIECE_VALUES.md): an empirical probe seeds them, then Texel/SPSA tuning via αβ
 * self-play refines them. {@link DEFAULT_WEIGHTS} is only the bootstrap seed.
 */

/** Bootstrap seed only — hand-set from intuition + the lab's "materialistic" finding. To be MEASURED. */
export const DEFAULT_WEIGHTS: EvalWeights = {
  piece: { king: 0, wall: 3, hammer: 4, bow: 5, spear: 5, sword: 6 },
  mobility: 0.1,
  kingDanger: 8,
};

/** Material value of a piece type under the given weights (default 1 for unknown types). */
export function materialValue(
  type: string,
  weights: EvalWeights = DEFAULT_WEIGHTS,
): number {
  return weights.piece[type] ?? 1;
}

/** Does this piece type carry the "royal" role in the ruleset? (data-driven, like the win predicates) */
export function isRoyal(ruleset: Ruleset, type: string): boolean {
  return ruleset.pieceTypes[type]?.roles?.includes("royal") ?? false;
}

/** The other seat in a 2-player ruleset. */
export function opponentSeat(ruleset: Ruleset, player: PlayerId): PlayerId {
  return ruleset.turnOrder.find((p) => p !== player) ?? player;
}

/** `player`'s legal actions from `state`, flipping the side-to-move if needed (hypothetical mobility). */
function actionsForPlayer(
  state: GameState,
  ruleset: Ruleset,
  player: PlayerId,
): Action[] {
  const s = state.toMove === player ? state : { ...state, toMove: player };
  return legalActions(s, ruleset);
}

/**
 * Static evaluation from `player`'s perspective: weighted material + a small mobility term + a king-
 * safety term (penalty if our king can be captured next ply, symmetric bonus if theirs can). Symmetric
 * by construction: `evaluate(s, r, white) === -evaluate(s, r, black)` for the same position.
 */
export function evaluate(
  state: GameState,
  ruleset: Ruleset,
  player: PlayerId,
  weights: EvalWeights = DEFAULT_WEIGHTS,
  playerActions?: Action[],
): number {
  const opp = opponentSeat(ruleset, player);
  // `playerActions`, when supplied, MUST be `player`'s legal actions from `state` — a caller-side
  // optimization (the search already computed them) that doesn't change the value, only avoids a scan.
  const myActions = playerActions ?? actionsForPlayer(state, ruleset, player);
  const oppActions = actionsForPlayer(state, ruleset, opp);

  let material = 0;
  let myKing: { x: number; y: number } | undefined;
  let oppKing: { x: number; y: number } | undefined;
  for (const p of state.pieces) {
    const v = materialValue(p.type, weights);
    if (p.owner === player) {
      material += v;
      if (isRoyal(ruleset, p.type)) myKing = { x: p.x, y: p.y };
    } else {
      material -= v;
      if (isRoyal(ruleset, p.type)) oppKing = { x: p.x, y: p.y };
    }
  }

  const mobility = weights.mobility * (myActions.length - oppActions.length);

  let kingSafety = 0;
  if (myKing !== undefined) {
    const k = myKing;
    if (oppActions.some((a) => a.to.x === k.x && a.to.y === k.y)) {
      kingSafety -= weights.kingDanger;
    }
  }
  if (oppKing !== undefined) {
    const k = oppKing;
    if (myActions.some((a) => a.to.x === k.x && a.to.y === k.y)) {
      kingSafety += weights.kingDanger;
    }
  }

  return material + mobility + kingSafety;
}
