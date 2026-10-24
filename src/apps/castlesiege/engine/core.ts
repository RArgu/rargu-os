import { positionKey } from "./position.js";
import type {
  Action,
  ApplyResult,
  AttackClass,
  GameEvent,
  GameState,
  Offset,
  Piece,
  PieceTypeDef,
  PlayerId,
  Ruleset,
  ValidationResult,
  WinConditionId,
  XY,
} from "./types.js";

// ---------- internal helpers ----------

function pieceTypeDef(ruleset: Ruleset, type: string): PieceTypeDef {
  const def = ruleset.pieceTypes[type];
  if (def === undefined) {
    // A malformed ruleset is a programmer error, not an illegal action.
    throw new Error(`Unknown piece type: ${type}`);
  }
  return def;
}

function findPiece(state: GameState, id: string): Piece | undefined {
  return state.pieces.find((p) => p.id === id);
}

function pieceAt(state: GameState, x: number, y: number): Piece | undefined {
  return state.pieces.find((p) => p.x === x && p.y === y);
}

function inBounds(state: GameState, x: number, y: number): boolean {
  return x >= 0 && x < state.board.width && y >= 0 && y < state.board.height;
}

function offsetInSet(set: Offset[], dx: number, dy: number): boolean {
  return set.some((o) => o.dx === dx && o.dy === dy);
}

function chebyshev(dx: number, dy: number): number {
  return Math.max(Math.abs(dx), Math.abs(dy));
}

function classifyAttack(dx: number, dy: number): AttackClass {
  return chebyshev(dx, dy) <= 1 ? "melee" : "ranged";
}

/**
 * Returns true if a straight-line path from origin to target (collinear,
 * Chebyshev distance > 1) is blocked by a `blocksPath` piece on a strictly
 * intervening square. Non-collinear offsets are leaps with no path — never
 * blocked.
 */
function isPathBlocked(
  state: GameState,
  ruleset: Ruleset,
  ox: number,
  oy: number,
  tx: number,
  ty: number,
): boolean {
  const dx = tx - ox;
  const dy = ty - oy;
  const dist = chebyshev(dx, dy);
  if (dist <= 1) return false;

  const collinear = dx === 0 || dy === 0 || Math.abs(dx) === Math.abs(dy);
  if (!collinear) return false; // knight-style leap — no path.

  const stepX = Math.sign(dx);
  const stepY = Math.sign(dy);
  for (let i = 1; i < dist; i++) {
    const sx = ox + stepX * i;
    const sy = oy + stepY * i;
    const occupant = pieceAt(state, sx, sy);
    if (occupant !== undefined) {
      const def = pieceTypeDef(ruleset, occupant.type);
      if (def.blocksPath === true) return true;
    }
  }
  return false;
}

function hasRole(ruleset: Ruleset, piece: Piece, role: string): boolean {
  const def = pieceTypeDef(ruleset, piece.type);
  return def.roles !== undefined && def.roles.includes(role);
}

function opponentOf(ruleset: Ruleset, player: PlayerId): PlayerId {
  const others = ruleset.turnOrder.filter((p) => p !== player);
  const opp = others[0];
  if (opp === undefined) {
    throw new Error("Ruleset turnOrder has no opponent for player");
  }
  return opp;
}

function nextPlayer(ruleset: Ruleset, player: PlayerId): PlayerId {
  const idx = ruleset.turnOrder.indexOf(player);
  const next = ruleset.turnOrder[(idx + 1) % ruleset.turnOrder.length];
  if (next === undefined) {
    throw new Error("Ruleset turnOrder is empty");
  }
  return next;
}

// ---------- win predicates (data-driven via roles) ----------

type WinPredicate = (
  state: GameState,
  ruleset: Ruleset,
  mover: PlayerId,
) => boolean;

// An elimination win condition must not fire vacuously for a ruleset that has
// no concept of the targeted role (D2: the engine works for ANY ruleset). We
// gate on the ruleset DEFINITION rather than per-match setup so the check is
// also correct for hand-built / server-loaded states (which carry no setup).
function rulesetDefinesRole(ruleset: Ruleset, role: string): boolean {
  for (const def of Object.values(ruleset.pieceTypes)) {
    if (def.roles?.includes(role) ?? false) return true;
  }
  return false;
}

// Does any piece type in this ruleset have a non-empty attack set? Gate for `militaryDefeat` so it
// can't fire vacuously for a ruleset where no piece can attack (D2: the engine works for ANY ruleset).
function rulesetHasOffensivePiece(ruleset: Ruleset): boolean {
  for (const def of Object.values(ruleset.pieceTypes)) {
    if (def.attacks.length > 0) return true;
  }
  return false;
}

const WIN_PREDICATES: Record<string, WinPredicate> = {
  regicide(state, ruleset, mover) {
    if (!rulesetDefinesRole(ruleset, "royal")) return false;
    const opp = opponentOf(ruleset, mover);
    const royals = state.pieces.filter(
      (p) => p.owner === opp && hasRole(ruleset, p, "royal"),
    );
    return royals.length === 0;
  },
  decapitation(state, ruleset, mover) {
    const opp = opponentOf(ruleset, mover);
    const oppPieces = state.pieces.filter((p) => p.owner === opp);
    if (oppPieces.length === 0) return false;
    return oppPieces.every((p) => hasRole(ruleset, p, "royal"));
  },
  castleClear(state, ruleset, mover) {
    if (!rulesetDefinesRole(ruleset, "castle")) return false;
    const opp = opponentOf(ruleset, mover);
    const castles = state.pieces.filter(
      (p) => p.owner === opp && hasRole(ruleset, p, "castle"),
    );
    return castles.length === 0;
  },
  // S017: the opponent is reduced to no OFFENSIVE pieces — only pieces with an empty attack set
  // remain (King + Walls, or a lone King). "Your army is defeated." Subsumes the old `decapitation`
  // (kept for the frozen default@1.0.0 + custom rulesets). Reads the attack tables directly (D2 — no
  // new role data that could desync from the actual attack sets).
  militaryDefeat(state, ruleset, mover) {
    if (!rulesetHasOffensivePiece(ruleset)) return false;
    const opp = opponentOf(ruleset, mover);
    const oppPieces = state.pieces.filter((p) => p.owner === opp);
    if (oppPieces.length === 0) return false; // zero pieces ⇒ regicide territory, not militaryDefeat
    return oppPieces.every(
      (p) => pieceTypeDef(ruleset, p.type).attacks.length === 0,
    );
  },
};

function evaluateWin(
  state: GameState,
  ruleset: Ruleset,
  mover: PlayerId,
): WinConditionId | undefined {
  for (const id of ruleset.winConditions) {
    const predicate = WIN_PREDICATES[id];
    if (predicate !== undefined && predicate(state, ruleset, mover)) {
      return id;
    }
  }
  return undefined;
}

// ---------- anti-stalling helpers (S017; docs/ANTI_STALLING.md) ----------

/**
 * Is the repetition ban active for this ruleset? Throws on a present-but-malformed limit (it must be
 * an integer >= 2) so a bad ruleset fails loudly on EVERY path — not just `createInitialState` — a
 * programmer error, never a silently-inert rule (P0 #3).
 */
function repetitionActive(ruleset: Ruleset): boolean {
  const limit = ruleset.repetitionLimit;
  if (limit === undefined) return false;
  if (!Number.isInteger(limit) || limit < 2) {
    throw new Error("repetitionLimit must be an integer >= 2 (or omitted)");
  }
  return true;
}

/** A piece's candidate target squares (the union of its move ∪ attack offsets, de-duped). Shared by
 *  `legalActionsForPiece` and `hasAnyLegalAction` so they enumerate identically. */
function pieceActionTargets(p: Piece, def: PieceTypeDef): XY[] {
  const offsets = new Set<string>();
  for (const o of def.moves) offsets.add(`${o.dx},${o.dy}`);
  for (const o of def.attacks) offsets.add(`${o.dx},${o.dy}`);
  const targets: XY[] = [];
  for (const key of offsets) {
    const parts = key.split(",");
    targets.push({ x: p.x + Number(parts[0]), y: p.y + Number(parts[1]) });
  }
  return targets;
}

/**
 * Apply a pre-validated action to a CLONE of the pieces, returning the resulting pieces + events.
 * Shared by `applyAction` (which then finalizes) and `wouldRepeat` (which needs only the resulting
 * arrangement). Never mutates the input state (D3).
 */
function actResult(
  state: GameState,
  validation: ValidationResult & { legal: true },
  action: Action,
): { pieces: Piece[]; events: GameEvent[] } {
  const events: GameEvent[] = [];
  const pieces: Piece[] = state.pieces.map((p) => ({ ...p }));
  const actor = pieces.find((p) => p.id === action.piece);
  if (actor === undefined) {
    // Unreachable: validation already confirmed the piece exists.
    throw new Error("actResult: actor missing after validation");
  }

  if (validation.kind === "move") {
    const from = { x: actor.x, y: actor.y };
    actor.x = action.to.x;
    actor.y = action.to.y;
    events.push({
      type: "moved",
      piece: actor.id,
      from,
      to: { x: action.to.x, y: action.to.y },
    });
    return { pieces, events };
  }

  const victim = pieces.find((p) => p.x === action.to.x && p.y === action.to.y);
  if (victim === undefined) {
    // Unreachable: validation confirmed an enemy occupant.
    throw new Error("actResult: victim missing after validation");
  }
  const swapped = validation.swaps;
  const attackClass: AttackClass = validation.class ?? "ranged";
  events.push({
    type: "captured",
    victim: victim.id,
    by: actor.id,
    swapped,
    class: attackClass,
  });
  const remaining = pieces.filter((p) => p.id !== victim.id);
  if (swapped) {
    actor.x = action.to.x;
    actor.y = action.to.y;
  }
  return { pieces: remaining, events };
}

/**
 * Does any position this game ALREADY stand at the repetition limit? A cheap pre-gate computed ONCE
 * per enumeration (O(distinct positions seen)) so the per-candidate `wouldRepeat` check is skipped
 * in the common no-repeat case (where every count is 1). False unless the ban is active.
 */
function anyPositionAtLimit(state: GameState, ruleset: Ruleset): boolean {
  if (!repetitionActive(ruleset)) return false;
  const counts = state.positionCounts;
  if (counts === undefined) return false;
  const limit = ruleset.repetitionLimit as number;
  for (const k in counts) {
    if ((counts[k] as number) >= limit) return true;
  }
  return false;
}

/**
 * Would this (already base-legal) action create a position that has already occurred
 * `repetitionLimit` times? That is the no-yield superko ban — UNLESS the move ENDS THE GAME as a win
 * for the mover, which is never banned (forward-safety). Two win shapes are exempt:
 *   1. an `evaluateWin` win (regicide / castleClear / militaryDefeat) — all of these capture, so the
 *      arrangement is novel and the exemption is moot today, but it keeps a future quiet-move win safe;
 *   2. a GENUINE no-moves win (`noMovesLoses`): the move leaves the opponent with NO base-legal reply
 *      (truly surrounded), which wins by `noLegalMove`.
 *
 * The boxing check uses BASE legality (`hasAnyBaseLegalAction`, not the full repetition gate) ON
 * PURPOSE: a recursive "is the opponent also repetition-stuck?" check does NOT terminate — a mutual
 * bounce fortress (A↔B, both at the limit) would recurse forever as `wouldRepeat → hasAnyLegalAction →
 * wouldRepeat → …` with no decreasing measure to bottom out on (neither cycling side ever reaches a
 * base-empty terminal). So we deliberately do NOT exempt a move
 * whose "win" arises only from the OPPONENT's repetition-saturation: that mutual-saturation tangle is a
 * loopy-game position, and the no-yield ban resolves it by parity (whoever runs out of non-repeating
 * moves loses) — the accepted design tradeoff (docs/ANTI_STALLING.md). A genuinely-boxing position can
 * never itself reach the limit through legal play (it ends the game the first time it occurs), so this
 * branch only hardens the invariant for hand-built / reconstructed states. One source of truth with
 * `finalize`: it tests the same `evaluateWin` + `noMovesLoses`/no-reply terminal.
 */
function wouldRepeat(
  state: GameState,
  ruleset: Ruleset,
  action: Action,
  validation: ValidationResult & { legal: true },
): boolean {
  const counts = state.positionCounts;
  const limit = ruleset.repetitionLimit;
  if (counts === undefined || limit === undefined) return false;
  const { pieces } = actResult(state, validation, action);
  const after: GameState = {
    rulesetVersion: state.rulesetVersion,
    board: state.board,
    pieces,
    toMove: nextPlayer(ruleset, state.toMove),
    status: { state: "playing" },
  };
  if ((counts[positionKey(after)] ?? 0) < limit) return false;
  // Forward-safety: a game-ending WIN for the mover is never banned — a capture-win, or...
  if (evaluateWin(after, ruleset, state.toMove) !== undefined) return false;
  // ...a genuine boxing win (the opponent has no base-legal reply ⇒ noMovesLoses fires for the mover).
  if (ruleset.noMovesLoses === true && !hasAnyBaseLegalAction(after, ruleset))
    return false;
  return true;
}

/**
 * Does the side to move have ANY legal action? First-legal short-circuit (cheap in the common case),
 * so `finalize`'s no-moves lookahead never materializes the whole list. Honors the repetition ban
 * (a side whose every move is repetition-banned has "no legal action" → it loses via `noMovesLoses`).
 */
function hasAnyLegalAction(state: GameState, ruleset: Ruleset): boolean {
  if (state.status.state !== "playing") return false;
  const checkRepeat = anyPositionAtLimit(state, ruleset);
  for (const p of state.pieces) {
    if (p.owner !== state.toMove) continue;
    const def = pieceTypeDef(ruleset, p.type);
    for (const to of pieceActionTargets(p, def)) {
      const action: Action = { piece: p.id, to };
      const base = validateActionBase(state, ruleset, action);
      if (!base.legal) continue;
      if (checkRepeat && wouldRepeat(state, ruleset, action, base)) continue;
      return true;
    }
  }
  return false;
}

/**
 * Does the side to move have any BASE-legal action (ignoring the repetition gate)? Non-recursive —
 * `wouldRepeat`'s forward-safety check uses this to detect a GENUINE boxing win (the opponent is
 * surrounded) without re-entering the repetition logic, which would not terminate (see `wouldRepeat`).
 */
function hasAnyBaseLegalAction(state: GameState, ruleset: Ruleset): boolean {
  if (state.status.state !== "playing") return false;
  for (const p of state.pieces) {
    if (p.owner !== state.toMove) continue;
    const def = pieceTypeDef(ruleset, p.type);
    for (const to of pieceActionTargets(p, def)) {
      if (validateActionBase(state, ruleset, { piece: p.id, to }).legal)
        return true;
    }
  }
  return false;
}

/**
 * Validate `ruleset.setup` at construction time. Throws on an unknown piece type, an
 * out-of-bounds or non-integer coordinate, or two placements on the same square — each of
 * which would otherwise misbehave silently or late (an inert off-board piece, a shadowed
 * `pieceAt`, a throw deferred to the first later API call). A malformed setup is a
 * programmer error, never a silently-inert rule (P0 #3).
 */
function validateSetup(ruleset: Ruleset): void {
  const { width, height } = ruleset.board;
  const seen = new Set<string>();
  ruleset.setup.forEach((placement, i) => {
    if (!Object.hasOwn(ruleset.pieceTypes, placement.type)) {
      throw new Error(`Unknown piece type in setup[${i}]: "${placement.type}"`);
    }
    const { x, y } = placement;
    if (
      !Number.isInteger(x) ||
      !Number.isInteger(y) ||
      x < 0 ||
      x >= width ||
      y < 0 ||
      y >= height
    ) {
      throw new Error(
        `Setup placement out of bounds: setup[${i}] ${placement.owner}:${placement.type} at (${x},${y}) on a ${width}×${height} board`,
      );
    }
    const key = `${x},${y}`;
    if (seen.has(key)) {
      throw new Error(
        `Overlapping setup placements at (${x},${y}): setup[${i}] ${placement.owner}:${placement.type} occupies an already-used square`,
      );
    }
    seen.add(key);
  });
}

// ---------- public API ----------

export function createInitialState(ruleset: Ruleset): GameState {
  validateSetup(ruleset);
  const counters: Record<string, number> = {};
  const pieces: Piece[] = ruleset.setup.map((placement) => {
    const key = `${placement.owner}:${placement.type}`;
    const n = counters[key] ?? 0;
    counters[key] = n + 1;
    return {
      id: `${placement.owner}:${placement.type}:${n}`,
      type: placement.type,
      owner: placement.owner,
      x: placement.x,
      y: placement.y,
    };
  });

  const first = ruleset.turnOrder[0];
  if (first === undefined) {
    throw new Error("Ruleset turnOrder is empty");
  }

  const base: GameState = {
    rulesetVersion: ruleset.version,
    board: { width: ruleset.board.width, height: ruleset.board.height },
    pieces,
    toMove: first,
    status: { state: "playing" },
  };
  // Seed the repetition history with the initial position (gated). Omitted entirely when off, so a
  // Markov ruleset's state is byte-identical to before.
  if (repetitionActive(ruleset)) {
    base.positionCounts = { [positionKey(base)]: 1 };
  }
  return base;
}

function validateActionBase(
  state: GameState,
  ruleset: Ruleset,
  action: Action,
): ValidationResult {
  // 1. game over.
  if (state.status.state === "won") {
    return { legal: false, reason: "GAME_OVER" };
  }

  // 2. piece exists.
  const piece = findPiece(state, action.piece);
  if (piece === undefined) {
    return { legal: false, reason: "NO_SUCH_PIECE" };
  }

  // 3. ownership.
  if (piece.owner !== state.toMove) {
    return { legal: false, reason: "NOT_YOUR_PIECE" };
  }

  // 4. target on board.
  if (!inBounds(state, action.to.x, action.to.y)) {
    return { legal: false, reason: "OFF_BOARD" };
  }

  const dx = action.to.x - piece.x;
  const dy = action.to.y - piece.y;
  const def = pieceTypeDef(ruleset, piece.type);
  const occupant = pieceAt(state, action.to.x, action.to.y);

  // 6. empty target.
  if (occupant === undefined) {
    if (offsetInSet(def.moves, dx, dy)) {
      if (
        isPathBlocked(
          state,
          ruleset,
          piece.x,
          piece.y,
          action.to.x,
          action.to.y,
        )
      ) {
        return { legal: false, reason: "PATH_BLOCKED" };
      }
      return { legal: true, kind: "move", swaps: false };
    }
    if (offsetInSet(def.attacks, dx, dy)) {
      return { legal: false, reason: "NO_TARGET" };
    }
    return { legal: false, reason: "NOT_IN_MOVE_RANGE" };
  }

  // 7. own piece on target.
  if (occupant.owner === piece.owner) {
    return { legal: false, reason: "DESTINATION_OCCUPIED" };
  }

  // 8. enemy piece on target.
  if (offsetInSet(def.attacks, dx, dy)) {
    const targetDef = pieceTypeDef(ruleset, occupant.type);
    if (
      targetDef.onlyAttackableBy !== undefined &&
      targetDef.onlyAttackableBy.length > 0 &&
      !targetDef.onlyAttackableBy.includes(piece.type)
    ) {
      return { legal: false, reason: "TARGET_INVULNERABLE" };
    }
    const attackClass = classifyAttack(dx, dy);
    if (
      targetDef.immuneTo !== undefined &&
      targetDef.immuneTo.includes(attackClass)
    ) {
      return { legal: false, reason: "TARGET_IMMUNE" };
    }
    if (
      isPathBlocked(state, ruleset, piece.x, piece.y, action.to.x, action.to.y)
    ) {
      return { legal: false, reason: "PATH_BLOCKED" };
    }
    const swaps = attackClass === "melee";
    return { legal: true, kind: "attack", class: attackClass, swaps };
  }

  return { legal: false, reason: "NOT_IN_ATTACK_RANGE" };
}

/**
 * Public validation = base legality + the S017 repetition gate. A base-legal move that would create
 * a position already seen `repetitionLimit`× (with no win) is rejected as `REPETITION` (no-yield).
 * Under the "yield to no other move" semantic the ban is per-candidate, so the gate lives in this
 * ONE chokepoint — `legalActionsForPiece`/`hasAnyLegalAction` apply the identical predicate, so
 * `validateAction(a).legal === (a ∈ legalActions)` holds by construction.
 */
export function validateAction(
  state: GameState,
  ruleset: Ruleset,
  action: Action,
): ValidationResult {
  const base = validateActionBase(state, ruleset, action);
  if (!base.legal) return base;
  if (
    anyPositionAtLimit(state, ruleset) &&
    wouldRepeat(state, ruleset, action, base)
  ) {
    return { legal: false, reason: "REPETITION" };
  }
  return base;
}

export function legalActionsForPiece(
  state: GameState,
  ruleset: Ruleset,
  piece: string,
): Action[] {
  const actions: Action[] = [];
  const p = findPiece(state, piece);
  if (p === undefined) return actions;
  if (p.owner !== state.toMove) return actions;
  if (state.status.state === "won") return actions;

  const def = pieceTypeDef(ruleset, p.type);
  // Decide once per piece whether the repetition ban can bite (a fortress is the only place it does).
  const checkRepeat = anyPositionAtLimit(state, ruleset);
  for (const to of pieceActionTargets(p, def)) {
    const action: Action = { piece, to };
    const base = validateActionBase(state, ruleset, action);
    if (!base.legal) continue;
    if (checkRepeat && wouldRepeat(state, ruleset, action, base)) continue;
    actions.push(action);
  }
  return actions;
}

export function legalActions(state: GameState, ruleset: Ruleset): Action[] {
  if (state.status.state === "won") return [];
  const actions: Action[] = [];
  for (const p of state.pieces) {
    if (p.owner === state.toMove) {
      actions.push(...legalActionsForPiece(state, ruleset, p.id));
    }
  }
  return actions;
}

export function applyAction(
  state: GameState,
  ruleset: Ruleset,
  action: Action,
): ApplyResult {
  const validation = validateAction(state, ruleset, action);
  if (!validation.legal) {
    return { ok: false, reason: validation.reason };
  }

  const mover = state.toMove;
  const { pieces, events } = actResult(state, validation, action);
  return finalize(state, ruleset, pieces, mover, events);
}

function finalize(
  prev: GameState,
  ruleset: Ruleset,
  pieces: Piece[],
  mover: PlayerId,
  events: GameEvent[],
): ApplyResult {
  const toMove = nextPlayer(ruleset, mover);

  const nextState: GameState = {
    rulesetVersion: prev.rulesetVersion,
    board: { width: prev.board.width, height: prev.board.height },
    pieces,
    toMove,
    status: { state: "playing" },
  };

  // Append the repetition history (gated) BEFORE the terminal checks — the no-moves lookahead must
  // see the post-move counts (the append-before-check invariant). New map; never mutate the input.
  if (repetitionActive(ruleset)) {
    const k = positionKey(nextState);
    const prevCounts = prev.positionCounts ?? {};
    nextState.positionCounts = { ...prevCounts, [k]: (prevCounts[k] ?? 0) + 1 };
  }

  // 1. Standard win conditions FIRST — a real regicide/castleClear/militaryDefeat must win the race
  //    over the no-moves fallthrough (e.g. a move that both decapitates AND leaves the loser stuck).
  const winBy = evaluateWin(nextState, ruleset, mover);
  if (winBy !== undefined) {
    nextState.status = { state: "won", winner: mover, by: winBy };
    events.push({ type: "won", winner: mover, by: winBy });
    return { ok: true, state: nextState, events };
  }

  // 2. No-moves terminal (S017): the side to move has zero legal actions ⇒ it LOSES (mover wins).
  //    Resolves RULES_SPEC §6's deferred case + gives the repetition ban its teeth.
  if (ruleset.noMovesLoses === true && !hasAnyLegalAction(nextState, ruleset)) {
    const by = ruleset.noMovesWinCondition ?? "noLegalMove";
    nextState.status = { state: "won", winner: mover, by };
    events.push({ type: "won", winner: mover, by });
  }

  return { ok: true, state: nextState, events };
}
