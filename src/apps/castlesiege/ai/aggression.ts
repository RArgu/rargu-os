import { legalActions } from "../engine/index.js";
import { alphaBetaAgent } from "./alphabeta.js";
import {
  DEFAULT_WEIGHTS,
  isRoyal,
  materialValue,
  opponentSeat,
} from "./evaluate.js";
import type {
  Action,
  AgentFactory,
  AlphaBetaConfig,
  EvalFn,
  EvalWeights,
  GameState,
  PlayerId,
  Rng,
  Ruleset,
} from "./types.js";

/**
 * The offense↔defense dial (docs/OFFENSE_DEFENSE.md §3) as ONE parameterized eval, so the study holds
 * COMPETENCE fixed (same node budget) and varies only this scalar.
 *
 *   aggression a ∈ [−1, +1]:   own-king-safety weight ∝ (1 − a),   enemy-king-threat weight ∝ (1 + a)
 *
 * a = 0  → symmetric (antisymmetric eval, like `evaluate` but on the KING_SCALE).
 * a = −1 → pure turtle: only its OWN king matters (≈ defensive.ts's intent).
 * a = +1 → pure king-hunter: only the ENEMY king matters (own safety left to the search horizon).
 *
 * The 1-ply king terms are leaf heuristics; the αβ search still avoids real mates regardless of the
 * dial (negamax sees them within the horizon), so a = +1 biases toward aggressive placement WITHOUT
 * being suicidal at adequate depth.
 */

/** King-term magnitude at the dial extremes (≈ several pieces of material). Calibratable. */
export const KING_SCALE = 24;

/** Clamp the dial to [−1, +1]; NaN → 0 (neutral). */
export function clampAggression(a: number): number {
  return Number.isNaN(a) ? 0 : Math.max(-1, Math.min(1, a));
}

function actionsForPlayer(
  state: GameState,
  ruleset: Ruleset,
  player: PlayerId,
): Action[] {
  const s = state.toMove === player ? state : { ...state, toMove: player };
  return legalActions(s, ruleset);
}

/** Build a leaf eval for a given dial setting. Positive = good for the side-to-move (`player`). */
export function aggressionEval(
  aggression: number,
  weights: EvalWeights = DEFAULT_WEIGHTS,
): EvalFn {
  const a = clampAggression(aggression);
  const ownWeight = KING_SCALE * (1 - a);
  const enemyWeight = KING_SCALE * (1 + a);

  return (state, ruleset, player, playerActions?): number => {
    const opp = opponentSeat(ruleset, player);
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

    let king = 0;
    if (myKing !== undefined) {
      const k = myKing;
      if (oppActions.some((act) => act.to.x === k.x && act.to.y === k.y))
        king -= ownWeight;
    }
    if (oppKing !== undefined) {
      const k = oppKing;
      if (myActions.some((act) => act.to.x === k.x && act.to.y === k.y))
        king += enemyWeight;
    }

    return material + mobility + king;
  };
}

/** Options for {@link aggressionAgent}: the competence knob (node budget / depth) + search extras. */
export interface AggressionOpts {
  nodeBudget?: number;
  maxDepth?: number;
  weights?: EvalWeights;
  useTT?: boolean;
  ttSeed?: number;
  report?: (info: { nodes: number; depth: number }) => void;
}

/**
 * An αβ agent driven by the aggression dial. Offense = `aggressionAgent(+1, …)`, defense = `(−1, …)`,
 * neutral = `(0, …)`. Competence comes from `nodeBudget` (preferred) or `maxDepth`.
 */
export function aggressionAgent(
  aggression: number,
  opts: AggressionOpts = {},
): AgentFactory {
  const a = clampAggression(aggression);
  const weights = opts.weights ?? DEFAULT_WEIGHTS;
  const evalFn: EvalFn = aggressionEval(a, weights);

  // Build the αβ config, omitting undefined optionals (exactOptionalPropertyTypes).
  const cfg: AlphaBetaConfig = {
    weights,
    evalFn,
    ...(opts.maxDepth !== undefined ? { maxDepth: opts.maxDepth } : {}),
    ...(opts.nodeBudget !== undefined ? { nodeBudget: opts.nodeBudget } : {}),
    ...(opts.useTT !== undefined ? { useTT: opts.useTT } : {}),
    ...(opts.ttSeed !== undefined ? { ttSeed: opts.ttSeed } : {}),
    ...(opts.report !== undefined ? { report: opts.report } : {}),
  };
  const factory = alphaBetaAgent(cfg);

  const dialTag = `${a >= 0 ? "+" : ""}${a.toFixed(2)}`;
  const budgetTag =
    opts.nodeBudget !== undefined
      ? `/n${opts.nodeBudget}`
      : opts.maxDepth !== undefined
        ? `/d${opts.maxDepth}`
        : "";
  const name = `aggr${dialTag}${budgetTag}`;

  return (rng: Rng) => {
    const inner = factory(rng);
    return {
      name,
      selectAction: (state: GameState, ruleset: Ruleset): Action =>
        inner.selectAction(state, ruleset),
    };
  };
}
