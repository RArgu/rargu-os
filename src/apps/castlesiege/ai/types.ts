import type {
  Action,
  GameState,
  PlayerId,
  Ruleset,
  WinConditionId,
} from "../engine/types.js";

// ---------- Randomness ----------

/** A seeded pseudo-random generator returning a float in [0, 1). */
export type Rng = () => number;

// ---------- Agents ----------

/** A self-play agent: given a state, pick ONE legal action. Deterministic given its Rng. */
export interface Agent {
  readonly name: string;
  /** Must return an action that `validateAction` accepts for `state.toMove`. */
  selectAction(state: GameState, ruleset: Ruleset): Action;
}

/** Builds an Agent bound to a seeded Rng. The harness seeds each game deterministically. */
export type AgentFactory = (rng: Rng) => Agent;

/** Tuning for the MCTS/UCT agent. */
export interface MctsConfig {
  /** Iterations (simulations) per move — the strength knob. */
  simulations: number;
  /** UCB1 exploration constant (default Math.SQRT2). */
  c?: number;
  /** Cap on a single random rollout's length; a rollout that hits it scores as a draw (0.5). */
  rolloutPlyCap?: number;
}

/** Tunable evaluation weights for the alpha-beta opponent (MEASURED, not guessed — docs/PIECE_VALUES.md). */
export interface EvalWeights {
  /** Per-piece-type material value (king ≈ 0; unknown types default to 1). */
  piece: Readonly<Record<string, number>>;
  /** Weight on the legal-action-count differential (flexibility/initiative). */
  mobility: number;
  /** Penalty/bonus for a king capturable next ply (no "check", so a hanging king ≈ lost). */
  kingDanger: number;
}

/** A leaf evaluation from the SIDE-TO-MOVE's perspective. `playerActions`, if given, are that
 *  player's legal actions from `state` (a caller-side optimization the search already has). */
export type EvalFn = (
  state: GameState,
  ruleset: Ruleset,
  player: PlayerId,
  playerActions?: Action[],
) => number;

/** Tuning for the alpha-beta (chess-style) agent. Difficulty = search depth OR a fixed node budget. */
export interface AlphaBetaConfig {
  /** Search depth in plies — "how far ahead it looks". Required UNLESS `nodeBudget` is set, in which
   *  case it acts as a hard depth ceiling (default 64). The classic difficulty knob. */
  maxDepth?: number;
  /** Fixed NODE budget per move (node = one negamax entry). When set, iterative deepening runs until a
   *  depth would exceed it and returns the LAST COMPLETED depth's move — deterministic, equal-work. */
  nodeBudget?: number;
  /** Enable the transposition table (Zobrist; INTERIOR nodes only — the root stays full-window). */
  useTT?: boolean;
  /** Zobrist seed for the TT; omitted → a fixed default constant (keeps runs deterministic). */
  ttSeed?: number;
  /** OPTIONAL non-deterministic wall-clock failsafe (ms). Default OFF; enabling it sacrifices determinism. */
  timeCeilingMs?: number;
  /** Optional per-move telemetry sink (realized nodes + last completed depth). Reporting only. */
  report?: (info: { nodes: number; depth: number }) => void;
  /** Evaluation weights; omitted → the bootstrap `DEFAULT_WEIGHTS`. */
  weights?: EvalWeights;
  /** Override the leaf evaluation entirely (e.g. a defensive "turtle" eval); omitted → the default
   *  `evaluate` with `weights`. Capture ordering still uses `weights`. */
  evalFn?: EvalFn;
}

// ---------- A single game ----------

export type GameResultKind = "won" | "timeout" | "stuck";

/** The outcome of one self-play game. */
export interface GameOutcome {
  result: GameResultKind;
  plies: number;
  /** Present iff result === "won". */
  winner?: PlayerId;
  /** The win condition that fired; present iff result === "won". */
  by?: WinConditionId;
  /** The side with no legal move; present iff result === "stuck". */
  stuckSide?: PlayerId;
  /** Label-only material adjudication of the FINAL state. ALWAYS computed; never drives search. */
  heuristicWinner: PlayerId | "even";
  /** The action sequence (interleaved by turn); present iff `record`. Replays to the final state by
   *  folding through `applyAction` from the start state. */
  actions?: Action[];
  /** Per-ply WEIGHTED material (white POV) after each ply; present iff `record`. Length === plies. */
  materialTrajectory?: number[];
  /** Plies on which each side's king sat under enemy threat; present iff `record`. */
  kingThreatPlies?: { white: number; black: number };
  /** Max n-fold repetition count observed over the game (1 = never repeated). */
  repetitions?: number;
  /** Sub-classifier when a repetition limit ended the game (result stays "timeout"). */
  endedBy?: "repetition";
}

export interface PlayGameOptions {
  /** Hard cap on plies; reaching it ends the game as an unresolved "timeout". */
  plyCap: number;
  /** Start from this state instead of `createInitialState(ruleset)` (varied openings). */
  initialState?: GameState;
  /** Capture the action sequence + per-ply material / king-threat metrics into the outcome. */
  record?: boolean;
  /** End as a "timeout" (flagged `endedBy:"repetition"`) when any position recurs this many times. OFF by default. */
  repetitionLimit?: number;
}

// ---------- Aggregated statistics ----------

export interface LengthStats {
  min: number;
  median: number;
  mean: number;
  max: number;
  /** Bucket label (e.g. "0-19", "20-39", …) → count. */
  histogram: Record<string, number>;
}

/**
 * Stats over games with FIXED colors (the white factory is always white). For a MIRROR match
 * (same factory both sides) `firstMoveWinRate` IS the first-move advantage.
 */
export interface BalanceStats {
  label: string;
  games: number;
  whiteWins: number;
  blackWins: number;
  timeouts: number;
  stucks: number;
  /** whiteWins + blackWins. */
  decisive: number;
  /** whiteWins / decisive (0 when no decisive games). */
  firstMoveWinRate: number;
  /** decisive / games. */
  decisiveRate: number;
  /** (timeouts + stucks) / games. */
  unresolvedRate: number;
  length: LengthStats;
  /** Win-condition id → count, among decisive games. */
  winConditionCounts: Record<string, number>;
  /** Among decisive games, fraction where heuristicWinner === actual winner (heuristic sanity). */
  heuristicAgreement: number;
  /** Among timeout games, how the label leaned. */
  timeoutHeuristicLean: { white: number; black: number; even: number };
}

export interface ExperimentConfig {
  label: string;
  /** Games per color assignment (so a swapped experiment plays `games` each way). */
  games: number;
  white: AgentFactory;
  black: AgentFactory;
  ruleset: Ruleset;
  plyCap: number;
  /** Master seed; per-game seeds are derived deterministically from it. */
  seed: number;
  /** Optional n-fold repetition early-stop, forwarded to `playGame` (drawish games end at the n-th
   *  repetition instead of grinding to `plyCap`). Off when omitted — back-compatible for all callers. */
  repetitionLimit?: number;
}

/** One named contestant in a ladder. */
export interface LadderEntry {
  name: string;
  factory: AgentFactory;
}

/**
 * A round-robin ladder. `winRate[a][b]` = agent a's score vs b in [0,1] (win=1, draw=0.5),
 * color-balanced (each pairing played both ways) so it isolates strength from first-move advantage.
 */
export interface LadderStats {
  label: string;
  agents: string[];
  /** Games per color assignment per pairing. */
  games: number;
  winRate: Record<string, Record<string, number>>;
}

// ---------- piece-value determination (docs/PIECE_VALUES.md) ----------

/** One piece type's measured marginal value, from a handicap probe. */
export interface PieceValueRow {
  type: string;
  /** Handicapped side's score (win=1, draw=0.5) when missing one of this type, color-balanced, in [0,1]. */
  handicappedScore: number;
  /** Derived relative value (higher = more valuable), normalized so the least-valuable type ≈ 1. */
  relativeValue: number;
  games: number;
}

export interface PieceValueReport {
  label: string;
  note: string;
  /** One row per piece type the handicapped side owns, sorted by relativeValue desc. */
  rows: PieceValueRow[];
}

/** A labeled training position for Texel-style tuning: a state + the game's final result (white POV). */
export interface CorpusEntry {
  state: GameState;
  /** White's game result: 1 = white won, 0.5 = draw/unresolved, 0 = white lost. */
  result: number;
}

/** Result of tuning {@link EvalWeights} to predict game outcomes (Texel-style logistic regression). */
export interface TuningResult {
  weights: EvalWeights;
  /** The fitted logistic scale constant (eval → win-probability via sigmoid(eval/scaleK)). */
  scaleK: number;
  /** Mean-squared error of sigmoid(eval/scaleK) vs outcome over the corpus, after tuning. */
  error: number;
  iterations: number;
  positions: number;
}

// ---------- offense-vs-defense study (docs/OFFENSE_DEFENSE.md) ----------

/** One competence tier: a fixed node budget/move + how many color-balanced games to play at it. */
export interface TierConfig {
  label: string;
  nodeBudget: number;
  games: number;
}

/** Config for the offense-vs-defense study. Offense = aggression `+a`, defense = `−a`. */
export interface OffenseDefenseConfig {
  ruleset: Ruleset;
  tiers: TierConfig[];
  /** Dial magnitude; offense plays `+aggression`, defense `−aggression`. Default 1 (the extremes). */
  aggression?: number;
  /** Random-opening depth (plies of seeded random play before the contest). Default 6. */
  openingPlies?: number;
  /** Hard ply cap per game. Default 200. */
  plyCap?: number;
  /** Master seed; per-tier/per-game seeds derive from it (whole study reproducible). */
  seed: number;
  /** Enable the transposition table on both agents. Default true. */
  useTT?: boolean;
  /** Also run a neutral (`a=0`) control → a 3-agent round-robin per tier. */
  includeNeutral?: boolean;
  /** Number of notable game-logs to save per tier (0 = none). Default a small sample. */
  saveLogsPerTier?: number;
}

/** A saved notable game-log: the start state + actions + outcome, re-foldable for replay. */
export interface SavedGame {
  tier: string;
  why: string;
  initialState: GameState;
  actions: Action[];
  result: GameResultKind;
  winner?: PlayerId;
  by?: WinConditionId;
  plies: number;
  endedBy?: "repetition";
}

/** Aggregated result for one competence tier (offense's POV is the primary read). */
export interface TierResult {
  label: string;
  nodeBudget: number;
  games: number;
  /** Offense's color-balanced score in [0,1] (win=1, draw=0.5). */
  offenseScore: number;
  /** Wilson 95% interval on `offenseScore`. */
  offenseWilson: { lo: number; hi: number };
  /** Offense's score split by who moved first. */
  byFirstPlayer: { offenseFirst: number; defenseFirst: number };
  decisiveRate: number;
  /** Fraction of games that ended by detected position repetition (a true fortress). */
  repetitionRate: number;
  length: LengthStats;
  winConditionCounts: Record<string, number>;
  /** Mean realized nodes/move (≤ budget) — a competence sanity check. */
  avgNodesPerMove: number;
  /** Mean realized search depth/move — the "how far did it look" competence read. */
  avgDepth: number;
  /** Mean final weighted-material diff, offense POV (did offense trade up or down?). */
  materialSummary: { meanFinalDiff: number };
  /** Plies-under-threat per king, averaged per game (realized aggression). */
  kingThreatSummary: { offense: number; defense: number };
  /** Optional neutral (a=0) control scores: offense's and defense's score vs neutral, in [0,1]. */
  vsNeutral?: { offenseVsNeutral: number; defenseVsNeutral: number };
}

export interface OffenseDefenseReport {
  tiers: TierResult[];
  logs: SavedGame[];
}

// Re-export the engine types the lab's modules pass around, so they import from one place.
export type { Action, GameState, PlayerId, Ruleset, WinConditionId };
