import { applyAction, legalActions } from "../engine/index.js";
import {
  DEFAULT_WEIGHTS,
  evaluate,
  isRoyal,
  materialValue,
} from "./evaluate.js";
import { makeZobrist } from "./zobrist.js";
import type {
  Action,
  AgentFactory,
  AlphaBetaConfig,
  EvalFn,
  EvalWeights,
  GameState,
  Rng,
  Ruleset,
} from "./types.js";
import type { Zobrist } from "./zobrist.js";

/**
 * A chess-engine-style alpha-beta OPPONENT: negamax + alpha-beta pruning + iterative deepening +
 * capture/PV move ordering + captures-only quiescence at the horizon, scored by the game-specific
 * {@link evaluate} (docs/AI_MODE.md §3). Quiescence resolves pending captures before the leaf eval so
 * the search can't be baited into grabbing poisoned material (the horizon effect).
 * Difficulty = search depth OR a fixed NODE budget per move (docs/OFFENSE_DEFENSE.md §4 — the
 * "extreme competence" study). A pure engine client: it only reads state and calls `applyAction`,
 * never mutating engine state. Deterministic given its Rng (tiebreaks) and the node budget.
 *
 * Optional transposition table (Zobrist) that is **move-ordering-only**: it remembers the best move
 * found per position (across iterative-deepening passes and across a game's moves) and tries it first
 * on a revisit, which sharpens alpha-beta pruning. It NEVER reuses a stored VALUE/bound — so the search
 * value and the chosen move are PROVABLY IDENTICAL to a no-TT search of the same depth, only reached
 * with fewer nodes. That deliberately sidesteps the whole class of value-reuse hazards (mate-distance
 * ply re-basing, bound-flag classification, cross-pass search instability) that an adversarial review
 * surfaced as a HIGH bug in an earlier value-caching version. The root stays full-window regardless.
 */

// A win/loss is worth more than any material swing; offset by ply so faster mates score higher.
const MATE = 1_000_000;
// Float-equality epsilon for the root tiebreak (tuned weights are fractional → FP drift).
const TIE_EPS = 1e-9;
// Hard depth ceiling when only a node budget is given (iterative deepening stops here regardless).
const DEFAULT_DEPTH_CEILING = 64;
// Cap the table so a long game can't grow it without bound; depth-preferred replacement.
const TT_CAP = 1 << 20;

// Thrown to unwind the search when the node budget is exhausted MID-depth. Caught ONLY at the root,
// which then keeps the last fully-COMPLETED depth's move.
const BUDGET_ABORT = Symbol("alphabeta:budget-abort");

/** A move-ordering hint: the best move found for this position, and the depth it was found at. */
interface TTEntry {
  depth: number;
  best: string | undefined;
}

interface SearchCtx {
  nodes: number;
  budget: number; // 0 = unbounded
  tt: Map<string, TTEntry> | undefined;
  zob: Zobrist | undefined;
  deadline: number | undefined; // ms epoch; undefined = NO clock call (the deterministic default)
}

function actionKey(a: Action): string {
  return `${a.piece}:${a.to.x},${a.to.y}`;
}

/**
 * Is `action` a capture? An action lands on an occupied square iff it captures: the engine only ever
 * generates a move onto an EMPTY square and an attack onto an ENEMY square, so any occupant of `to` is
 * the captured enemy (no aliasing). Used to restrict quiescence to capture replies.
 */
function isCapture(state: GameState, action: Action): boolean {
  return state.pieces.some((p) => p.x === action.to.x && p.y === action.to.y);
}

/** Ordering score for an action: PV/TT-best first, then captures (king-capture highest, else by value). */
function orderScore(
  state: GameState,
  ruleset: Ruleset,
  action: Action,
  pvKey: string | undefined,
  weights: EvalWeights,
): number {
  let score = 0;
  if (pvKey !== undefined && actionKey(action) === pvKey) score += MATE * 2;
  const victim = state.pieces.find(
    (p) => p.x === action.to.x && p.y === action.to.y,
  );
  if (victim !== undefined) {
    // A capture. Capturing a royal wins outright → try it first.
    score += isRoyal(ruleset, victim.type)
      ? MATE
      : 100 + materialValue(victim.type, weights);
  }
  return score;
}

/** Legal actions, ordered best-first to maximize alpha-beta pruning. */
function orderActions(
  state: GameState,
  ruleset: Ruleset,
  actions: Action[],
  pvKey: string | undefined,
  weights: EvalWeights,
): Action[] {
  return actions
    .map((a) => ({ a, s: orderScore(state, ruleset, a, pvKey, weights) }))
    .sort((x, y) => y.s - x.s)
    .map((e) => e.a);
}

/** Insert/refresh a best-move hint, preferring the deeper analysis and respecting the size cap. */
function storeTT(tt: Map<string, TTEntry>, key: string, entry: TTEntry): void {
  const existing = tt.get(key);
  if (existing !== undefined) {
    if (existing.depth > entry.depth) return; // keep the deeper (more reliable) best-move hint
  } else if (tt.size >= TT_CAP) {
    return; // table full — stop inserting NEW keys (deterministic, correctness-preserving)
  }
  tt.set(key, entry);
}

/**
 * Quiescence search (captures only). At the depth horizon, instead of trusting the static eval mid-
 * exchange, keep resolving CAPTURES until the position is quiet (no capture available), then evaluate.
 * This removes the horizon effect — the search no longer banks a capture whose recapture lies just past
 * the horizon (the baitability fix; docs/AI_MODE.md §3).
 *
 * Standard stand-pat negamax: the static eval is a lower bound *when a quiet move exists* (the side to
 * move may DECLINE to capture — "stand pat"), so only capture replies that beat standing pat are
 * explored. This both takes a genuinely free piece AND avoids a poisoned one (whose recapture drags the
 * value back below stand-pat). NOTE: this game has NO PASS (RULES_SPEC §6), so if EVERY legal move is a
 * capture there is no stand-pat floor — we then force evaluation of the mandatory captures (no static
 * lower bound), matching negamax. (All-capture nodes are ~0% on the real board but possible in cramped
 * endgames; without this guard a forced-capture-zugzwang leaf would be over-scored.)
 *
 * Invariants honored: it NEVER reads or writes the transposition table, so the search is identical with
 * or without the TT — keeping the move-ordering-only TT provably value-identical to a no-TT search. Pure
 * + deterministic (no RNG). It TERMINATES because every capture strictly reduces the piece count, so a
 * capture chain is bounded by the number of pieces; the node budget + deadline are the outer backstops.
 */
function quiesce(
  state: GameState,
  ruleset: Ruleset,
  alpha: number,
  beta: number,
  ply: number,
  weights: EvalWeights,
  evalFn: EvalFn,
  ctx: SearchCtx,
  knownActions?: Action[],
): number {
  ctx.nodes++;
  if (ctx.budget > 0 && ctx.nodes > ctx.budget) throw BUDGET_ABORT;
  if (ctx.deadline !== undefined && Date.now() > ctx.deadline)
    throw BUDGET_ABORT;

  // A capture may have ended the game (e.g. regicide): the side to move has already lost.
  if (state.status.state === "won") return -(MATE - ply);

  const actions = knownActions ?? legalActions(state, ruleset);
  // Stuck (no legal move) = draw, consistent with negamax (RULES_SPEC §6 leaves it unresolved).
  if (actions.length === 0) return 0;

  // Stand-pat: the static eval bounds this node from below — but ONLY when a quiet (non-capture) move
  // exists. No pass in this game: if every legal move is a capture, the mover can't decline, so there
  // is no static floor (best = -Infinity) and the mandatory captures below are evaluated instead.
  const hasQuiet = actions.some((a) => !isCapture(state, a));
  let best = hasQuiet
    ? evalFn(state, ruleset, state.toMove, actions)
    : -Infinity;
  if (best >= beta) return best; // fail-high — even standing pat refutes the parent
  if (best > alpha) alpha = best;

  // Explore ONLY capture replies, best-victim-first (reuse the search's king-capture → MVV ordering).
  const captures = actions.filter((a) => isCapture(state, a));
  for (const action of orderActions(
    state,
    ruleset,
    captures,
    undefined,
    weights,
  )) {
    const applied = applyAction(state, ruleset, action);
    if (!applied.ok) {
      // Unreachable: enumerated actions are legal. Surface loudly (P0 #3 — no silent failure).
      throw new Error(
        `alphabeta quiesce: legal action rejected (${applied.reason})`,
      );
    }
    const score = -quiesce(
      applied.state,
      ruleset,
      -beta,
      -alpha,
      ply + 1,
      weights,
      evalFn,
      ctx,
    );
    if (score > best) best = score;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break; // beta cutoff
  }
  return best;
}

/**
 * Negamax value of `state` from its side-to-move's perspective, window [alpha, beta].
 * A "won" state means the side to move has already LOST (the previous mover won) → -(MATE-ply).
 *
 * The TT is consulted ONLY for the best-move ordering hint (`ttBest`); it never short-circuits the
 * search or narrows the window, so the returned value is exactly the no-TT minimax value.
 */
function negamax(
  state: GameState,
  ruleset: Ruleset,
  depth: number,
  alpha: number,
  beta: number,
  ply: number,
  weights: EvalWeights,
  evalFn: EvalFn,
  ctx: SearchCtx,
): number {
  ctx.nodes++;
  if (ctx.budget > 0 && ctx.nodes > ctx.budget) throw BUDGET_ABORT;
  if (ctx.deadline !== undefined && Date.now() > ctx.deadline)
    throw BUDGET_ABORT;

  if (state.status.state === "won") return -(MATE - ply);

  const actions = legalActions(state, ruleset);
  // Stuck (no legal move): RULES_SPEC §6 leaves this undefined, and the lab buckets it as
  // "unresolved" — so score it as a DRAW, not a phantom win/loss (else αβ chases stalemates). Rare.
  if (actions.length === 0) return 0;

  // Horizon: descend into a quiescence search (captures only) so the eval lands on a QUIET position,
  // never banking a capture whose recapture is just past the horizon. Reuse the already-computed
  // `actions` for the first q-node (it needs them for stand-pat + the capture filter).
  if (depth <= 0)
    return quiesce(
      state,
      ruleset,
      alpha,
      beta,
      ply,
      weights,
      evalFn,
      ctx,
      actions,
    );

  // ---- transposition table: best-move ordering hint only (no value/bound reuse) ----
  const tt = ctx.tt;
  const zob = ctx.zob;
  const useTT = tt !== undefined && zob !== undefined;
  let key = "";
  let ttBest: string | undefined;
  if (useTT) {
    key = zob.key(state);
    ttBest = tt.get(key)?.best;
  }

  let best = -Infinity;
  let bestKey: string | undefined;
  for (const action of orderActions(state, ruleset, actions, ttBest, weights)) {
    const applied = applyAction(state, ruleset, action);
    if (!applied.ok) {
      // Unreachable: enumerated actions are legal. Surface loudly (P0 #3 — no silent failure).
      throw new Error(`alphabeta: legal action rejected (${applied.reason})`);
    }
    const score = -negamax(
      applied.state,
      ruleset,
      depth - 1,
      -beta,
      -alpha,
      ply + 1,
      weights,
      evalFn,
      ctx,
    );
    if (score > best) {
      best = score;
      bestKey = actionKey(action);
    }
    if (best > alpha) alpha = best;
    if (alpha >= beta) break; // beta cutoff
  }

  if (useTT) storeTT(tt, key, { depth, best: bestKey });
  return best;
}

/**
 * DevPageOS local change (see VENDOR.md): {@link negamax} line for line, as a generator that yields
 * after every child. The root runs its own children through it, so a sliced search can pause one ply
 * below the root. Same window, same order, same TT and node accounting: the same value and move.
 */
function* negamaxSliced(
  state: GameState,
  ruleset: Ruleset,
  depth: number,
  alpha: number,
  beta: number,
  ply: number,
  weights: EvalWeights,
  evalFn: EvalFn,
  ctx: SearchCtx,
): Generator<void, number, void> {
  ctx.nodes++;
  if (ctx.budget > 0 && ctx.nodes > ctx.budget) throw BUDGET_ABORT;
  if (ctx.deadline !== undefined && Date.now() > ctx.deadline)
    throw BUDGET_ABORT;

  if (state.status.state === "won") return -(MATE - ply);

  const actions = legalActions(state, ruleset);
  // Stuck (no legal move): RULES_SPEC §6 leaves this undefined, and the lab buckets it as
  // "unresolved" — so score it as a DRAW, not a phantom win/loss (else αβ chases stalemates). Rare.
  if (actions.length === 0) return 0;

  // Horizon: descend into a quiescence search (captures only) so the eval lands on a QUIET position,
  // never banking a capture whose recapture is just past the horizon. Reuse the already-computed
  // `actions` for the first q-node (it needs them for stand-pat + the capture filter).
  if (depth <= 0)
    return quiesce(
      state,
      ruleset,
      alpha,
      beta,
      ply,
      weights,
      evalFn,
      ctx,
      actions,
    );

  // ---- transposition table: best-move ordering hint only (no value/bound reuse) ----
  const tt = ctx.tt;
  const zob = ctx.zob;
  const useTT = tt !== undefined && zob !== undefined;
  let key = "";
  let ttBest: string | undefined;
  if (useTT) {
    key = zob.key(state);
    ttBest = tt.get(key)?.best;
  }

  let best = -Infinity;
  let bestKey: string | undefined;
  for (const action of orderActions(state, ruleset, actions, ttBest, weights)) {
    const applied = applyAction(state, ruleset, action);
    if (!applied.ok) {
      // Unreachable: enumerated actions are legal. Surface loudly (P0 #3 — no silent failure).
      throw new Error(`alphabeta: legal action rejected (${applied.reason})`);
    }
    const score = -negamax(
      applied.state,
      ruleset,
      depth - 1,
      -beta,
      -alpha,
      ply + 1,
      weights,
      evalFn,
      ctx,
    );
    if (score > best) {
      best = score;
      bestKey = actionKey(action);
    }
    if (best > alpha) alpha = best;
    if (alpha >= beta) break; // beta cutoff
    yield;
  }

  if (useTT) storeTT(tt, key, { depth, best: bestKey });
  return best;
}

/**
 * DevPageOS local change (see VENDOR.md): the root search is a generator that yields after every
 * root move and after every reply to it (through {@link negamaxSliced}), so `alphaBetaAgent` (run to completion, unchanged behaviour) and `alphaBetaSliced`
 * (awaits a pause between root moves so a browser stays responsive) share one code path.
 */
function rootSearcher(config: AlphaBetaConfig): (rng: Rng) => {
  name: string;
  search(state: GameState, ruleset: Ruleset): Generator<void, Action, void>;
} {
  const budget =
    config.nodeBudget !== undefined && config.nodeBudget > 0
      ? Math.floor(config.nodeBudget)
      : 0;
  if (config.maxDepth === undefined && budget === 0) {
    throw new Error(
      "alphaBetaAgent: provide maxDepth or a positive nodeBudget",
    );
  }
  const maxDepth =
    config.maxDepth !== undefined
      ? Math.max(1, Math.floor(config.maxDepth))
      : DEFAULT_DEPTH_CEILING;
  const weights = config.weights ?? DEFAULT_WEIGHTS;
  const evalFn: EvalFn =
    config.evalFn ?? ((s, r, p, acts) => evaluate(s, r, p, weights, acts));
  const useTT = config.useTT === true;
  const ttSeed = config.ttSeed;
  const timeCeilingMs = config.timeCeilingMs;
  const name = budget > 0 ? `alphabeta-n${budget}` : `alphabeta-${maxDepth}`;

  return (rng: Rng) => {
    // The TT (best-move hints) + its Zobrist persist across THIS agent instance's moves (one game) for
    // stronger ordering; built lazily once the ruleset is known. Single-threaded + seeded ⇒ deterministic.
    const tt = useTT ? new Map<string, TTEntry>() : undefined;
    let zob: Zobrist | undefined;

    return {
      name,
      *search(
        state: GameState,
        ruleset: Ruleset,
      ): Generator<void, Action, void> {
        const actions = legalActions(state, ruleset);
        const first = actions[0];
        if (first === undefined) {
          throw new Error("alphaBetaAgent.selectAction: no legal actions");
        }
        if (actions.length === 1) return first;

        if (useTT && zob === undefined) {
          zob =
            ttSeed !== undefined
              ? makeZobrist(ruleset, ttSeed)
              : makeZobrist(ruleset);
        }
        const ctx: SearchCtx = {
          nodes: 0,
          budget,
          tt,
          zob: useTT ? zob : undefined,
          deadline:
            timeCeilingMs !== undefined
              ? Date.now() + timeCeilingMs
              : undefined,
        };

        // Iterative deepening: each depth re-seeds the ROOT move ordering with the prior depth's best
        // move (PV). (Interior nodes order by TT-best/captures — see negamax.)
        let bestAction = first;
        let completedDepth = 0;
        let completedNodes = 0; // ctx.nodes at the end of the last FULLY-searched depth (≤ budget)
        for (let depth = 1; depth <= maxDepth; depth++) {
          let bestScore = -Infinity;
          let chosen = bestAction;
          let ties = 0;
          let completed = true;

          try {
            for (const action of orderActions(
              state,
              ruleset,
              actions,
              actionKey(bestAction),
              weights,
            )) {
              const applied = applyAction(state, ruleset, action);
              if (!applied.ok) {
                throw new Error(
                  `alphabeta root: legal action rejected (${applied.reason})`,
                );
              }
              // FULL window at the ROOT so every score is EXACT — never a fail-soft bound. With a
              // narrowed window a fail-low move returns only an upper bound that can tie bestScore and
              // corrupt the tiebreak into a strictly-worse move (verified vs a minimax oracle).
              const score = -(yield* negamaxSliced(
                applied.state,
                ruleset,
                depth - 1,
                -Infinity,
                Infinity,
                1,
                weights,
                evalFn,
                ctx,
              ));
              if (score > bestScore + TIE_EPS) {
                bestScore = score;
                chosen = action;
                ties = 1;
              } else if (score >= bestScore - TIE_EPS) {
                // Reservoir tiebreak among (near-)equal-best moves (deterministic given the seed).
                ties += 1;
                if (rng() < 1 / ties) chosen = action;
              }
              yield;
            }
          } catch (e) {
            if (e !== BUDGET_ABORT) throw e;
            completed = false; // budget hit mid-depth → discard this depth, keep the last completed one
          }

          if (!completed) break;
          bestAction = chosen;
          completedDepth = depth;
          completedNodes = ctx.nodes;
          if (bestScore >= MATE - 1000) break; // a forced win is found — deeper search can't improve on it
          if (budget > 0 && ctx.nodes >= budget) break; // budget spent — don't start a deeper pass
        }
        config.report?.({ nodes: completedNodes, depth: completedDepth });
        return bestAction;
      },
    };
  };
}

export function alphaBetaAgent(config: AlphaBetaConfig): AgentFactory {
  const make = rootSearcher(config);
  return (rng: Rng) => {
    const searcher = make(rng);
    return {
      name: searcher.name,
      selectAction(state: GameState, ruleset: Ruleset): Action {
        const it = searcher.search(state, ruleset);
        let step = it.next();
        while (!step.done) step = it.next();
        return step.value;
      },
    };
  };
}

/** The same search as {@link alphaBetaAgent}, awaiting `pause()` after every root move. */
export function alphaBetaSliced(config: AlphaBetaConfig): (rng: Rng) => {
  name: string;
  selectAction(
    state: GameState,
    ruleset: Ruleset,
    pause: () => Promise<void>,
  ): Promise<Action>;
} {
  const make = rootSearcher(config);
  return (rng: Rng) => {
    const searcher = make(rng);
    return {
      name: searcher.name,
      async selectAction(state, ruleset, pause): Promise<Action> {
        const it = searcher.search(state, ruleset);
        let step = it.next();
        while (!step.done) {
          await pause();
          step = it.next();
        }
        return step.value;
      },
    };
  };
}
