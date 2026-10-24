export type PieceTypeId = string;
export type PlayerId = string;
export type PieceId = string;

export interface Offset {
  dx: number;
  dy: number;
}

export type AttackClass = "melee" | "ranged";

// known: "regicide" | "castleClear" | "decapitation"
export type WinConditionId = string;

export interface PieceTypeDef {
  id: PieceTypeId;
  moves: Offset[]; // relative dests it may move into (must be empty)
  attacks: Offset[]; // relative squares it may capture an enemy on
  blocksPath?: boolean; // does it block straight-line paths at range>1? (wall=true)
  onlyAttackableBy?: PieceTypeId[]; // vulnerability whitelist; absent/empty = anyone
  immuneTo?: AttackClass[]; // attack-class immunity; absent/empty = none
  roles?: string[]; // semantic tags for win conditions, e.g. ["royal"], ["castle"]
}

export interface Placement {
  type: PieceTypeId;
  owner: PlayerId;
  x: number;
  y: number;
}

export interface Ruleset {
  version: string;
  board: { width: number; height: number };
  pieceTypes: Record<PieceTypeId, PieceTypeDef>;
  setup: Placement[];
  turnOrder: PlayerId[];
  winConditions: WinConditionId[];

  // --- Anti-stalling rules (S017). ALL opt-in; ALL absent ⇒ today's Markov, no-draw engine. ---

  /** Repetition ban (Go-superko / xiangqi-shogi philosophy — NOT chess's draw). A move that would
   *  create a position (pieces multiset + toMove) already seen `repetitionLimit` times is ILLEGAL:
   *  excluded from `legalActions`/`legalActionsForPiece`, rejected by `validateAction` as
   *  `"REPETITION"`. No-yield (a forced limit-repeat → no legal move → a loss via `noMovesLoses`).
   *  OBJECTIVE — no aggressor detection. Must be >= 2 (createInitialState throws otherwise);
   *  absent ⇒ OFF (the engine stays Markov, no `positionCounts`). */
  repetitionLimit?: number;

  /** No-move terminal: a side to move with ZERO legal actions LOSES (opponent wins). Gives the
   *  repetition ban its teeth and resolves RULES_SPEC §6's deferred "no legal action" case. Fires
   *  INDEPENDENTLY of repetition (a genuinely boxed-in side loses too). Absent/false ⇒ today's
   *  behavior (an empty legalActions is left unresolved). */
  noMovesLoses?: boolean;

  /** Label stamped on a no-moves loss (`status.by`). Default `"noLegalMove"`. */
  noMovesWinCondition?: WinConditionId;
}

export interface Piece {
  id: PieceId;
  type: PieceTypeId;
  owner: PlayerId;
  x: number;
  y: number;
}

export type GameStatus =
  { state: "playing" } | { state: "won"; winner: PlayerId; by: WinConditionId };

export interface GameState {
  rulesetVersion: string;
  board: { width: number; height: number };
  pieces: Piece[];
  toMove: PlayerId;
  status: GameStatus;

  /** Repetition bookkeeping (S017): positionKey → times that position has occurred this game
   *  (incl. the current one). A plain object (string keys) so JSON round-trips losslessly
   *  (PLATFORM_PLAN §4) — NEVER a Map/Set. OMITTED when the ruleset has no `repetitionLimit`.
   *  Append-only per ply; `applyAction` builds a NEW map, never mutating the input (D3). This is
   *  the engine's first history-dependent field — the AI's Zobrist TT key intentionally ignores it
   *  (move-ordering-only ⇒ still sound; see ai/zobrist.ts). */
  positionCounts?: Record<string, number>;
}

export interface XY {
  x: number;
  y: number;
}

export interface Action {
  piece: PieceId;
  to: XY;
}

export type IllegalReason =
  | "GAME_OVER"
  | "NO_SUCH_PIECE"
  | "NOT_YOUR_PIECE"
  | "OFF_BOARD"
  | "NOT_IN_MOVE_RANGE"
  | "NOT_IN_ATTACK_RANGE"
  | "DESTINATION_OCCUPIED"
  | "PATH_BLOCKED"
  | "NO_TARGET"
  | "TARGET_INVULNERABLE"
  | "TARGET_IMMUNE"
  | "REPETITION"; // S017: would create a position seen `repetitionLimit`× (no-yield ban; P0 #3)

export type ValidationResult =
  | {
      legal: true;
      kind: "move" | "attack";
      swaps: boolean;
      class?: AttackClass;
    }
  | { legal: false; reason: IllegalReason };

export type GameEvent =
  | { type: "moved"; piece: PieceId; from: XY; to: XY }
  | {
      type: "captured";
      victim: PieceId;
      by: PieceId;
      swapped: boolean;
      class: AttackClass;
    }
  | { type: "won"; winner: PlayerId; by: WinConditionId };

export type ApplyResult =
  | { ok: true; state: GameState; events: GameEvent[] }
  | { ok: false; reason: IllegalReason };
