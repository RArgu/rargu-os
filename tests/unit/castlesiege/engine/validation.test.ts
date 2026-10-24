import { describe, it, expect } from "vitest";
import {
  createInitialState,
  applyAction,
  validateAction,
  legalActions,
  legalActionsForPiece,
} from "../../../../src/apps/castlesiege/engine/core.js";
import { defaultRuleset } from "../../../../src/apps/castlesiege/engine/rulesets/default.js";
import type {
  Action,
  GameState,
  Piece,
  Ruleset,
} from "../../../../src/apps/castlesiege/engine/types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Deep structural clone so we can detect any mutation of an input object. */
function snapshot<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * A tiny hand-built ruleset + state used for attack/blocking scenarios that the
 * default opening position cannot express (no adjacent enemies at game start).
 * Board 7x8 to match default coordinates; pieces placed explicitly.
 */
function makeRuleset(overrides: Partial<Ruleset> = {}): Ruleset {
  return {
    version: "test@1.0.0",
    board: { width: 7, height: 8 },
    turnOrder: ["white", "black"],
    winConditions: ["regicide", "castleClear", "decapitation"],
    pieceTypes: defaultRuleset.pieceTypes,
    setup: [],
    ...overrides,
  };
}

function makeState(
  pieces: Piece[],
  overrides: Partial<GameState> = {},
): GameState {
  return {
    rulesetVersion: "test@1.0.0",
    board: { width: 7, height: 8 },
    pieces,
    toMove: "white",
    status: { state: "playing" },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// IllegalReason coverage — each reason produced at least once
// ---------------------------------------------------------------------------

describe("IllegalReason coverage", () => {
  it("GAME_OVER — any action on a finished game is rejected", () => {
    const state = makeState(
      [{ id: "w-king", type: "king", owner: "white", x: 3, y: 0 }],
      { status: { state: "won", winner: "white", by: "regicide" } },
    );
    const result = validateAction(state, makeRuleset(), {
      piece: "w-king",
      to: { x: 3, y: 1 },
    });
    expect(result).toEqual({ legal: false, reason: "GAME_OVER" });
  });

  it("NO_SUCH_PIECE — unknown piece id", () => {
    const state = createInitialState(defaultRuleset);
    const result = validateAction(state, defaultRuleset, {
      piece: "does-not-exist",
      to: { x: 0, y: 0 },
    });
    expect(result).toEqual({ legal: false, reason: "NO_SUCH_PIECE" });
  });

  it("NOT_YOUR_PIECE — moving the opponent's piece on white's turn", () => {
    const state = createInitialState(defaultRuleset);
    expect(state.toMove).toBe("white");
    // black king at (3,7), white to move.
    const result = validateAction(state, defaultRuleset, {
      piece: "black:king:0",
      to: { x: 3, y: 6 },
    });
    expect(result).toEqual({ legal: false, reason: "NOT_YOUR_PIECE" });
  });

  it("OFF_BOARD — target column outside the board", () => {
    const state = createInitialState(defaultRuleset);
    // white bow at (0,0); target (-1,0) is off-board (and OFF_BOARD precedes range checks).
    const result = validateAction(state, defaultRuleset, {
      piece: "white:bow:0",
      to: { x: -1, y: 0 },
    });
    expect(result).toEqual({ legal: false, reason: "OFF_BOARD" });
  });

  it("OFF_BOARD — target row >= height", () => {
    const state = createInitialState(defaultRuleset);
    // Board is 7×9 (rows 0..8); row 9 is off-board.
    const result = validateAction(state, defaultRuleset, {
      piece: "white:bow:0",
      to: { x: 0, y: 9 },
    });
    expect(result).toEqual({ legal: false, reason: "OFF_BOARD" });
  });

  it("NOT_IN_MOVE_RANGE — empty square not in the move set", () => {
    const state = createInitialState(defaultRuleset);
    // white king at (3,0) moves ORTH1 only; (4,1) is empty, diagonal, not reachable.
    const result = validateAction(state, defaultRuleset, {
      piece: "white:king:0",
      to: { x: 4, y: 1 },
    });
    expect(result).toEqual({ legal: false, reason: "NOT_IN_MOVE_RANGE" });
  });

  it("NOT_IN_ATTACK_RANGE — enemy present but offset not in the attack set", () => {
    // White hammer at (3,3) attacks ORTH1 only. Enemy at (5,5) (diagonal, dist 2) — not attackable.
    const state = makeState([
      { id: "w-hammer", type: "hammer", owner: "white", x: 3, y: 3 },
      { id: "b-sword", type: "sword", owner: "black", x: 5, y: 5 },
    ]);
    const result = validateAction(state, makeRuleset(), {
      piece: "w-hammer",
      to: { x: 5, y: 5 },
    });
    expect(result).toEqual({ legal: false, reason: "NOT_IN_ATTACK_RANGE" });
  });

  it("DESTINATION_OCCUPIED — own piece sits on the move target", () => {
    const state = createInitialState(defaultRuleset);
    // white king at (3,0); (3,1) holds white's own wall.
    const result = validateAction(state, defaultRuleset, {
      piece: "white:king:0",
      to: { x: 3, y: 1 },
    });
    expect(result).toEqual({ legal: false, reason: "DESTINATION_OCCUPIED" });
  });

  it("PATH_BLOCKED — a wall sits strictly between attacker and ranged target", () => {
    // White bow at (0,0) attacks ORTH2/ORTH3. Target enemy at (0,3); a wall at (0,2) blocks.
    const state = makeState([
      { id: "w-bow", type: "bow", owner: "white", x: 0, y: 0 },
      { id: "b-wall", type: "wall", owner: "black", x: 0, y: 2 },
      { id: "b-sword", type: "sword", owner: "black", x: 0, y: 3 },
    ]);
    const result = validateAction(state, makeRuleset(), {
      piece: "w-bow",
      to: { x: 0, y: 3 },
    });
    expect(result).toEqual({ legal: false, reason: "PATH_BLOCKED" });
  });

  it("NO_TARGET — aiming an attack-only offset at an empty square", () => {
    // White bow at (0,0): (0,2) is in attacks (ORTH2) but NOT in moves (ORTH1). Empty target.
    const state = makeState([
      { id: "w-bow", type: "bow", owner: "white", x: 0, y: 0 },
    ]);
    const result = validateAction(state, makeRuleset(), {
      piece: "w-bow",
      to: { x: 0, y: 2 },
    });
    expect(result).toEqual({ legal: false, reason: "NO_TARGET" });
  });

  it("TARGET_INVULNERABLE — non-hammer attacking a wall (onlyAttackableBy=[hammer])", () => {
    // White sword at (1,1) (N8 attacks) targets enemy wall at (1,2). Wall only attackable by hammer.
    const state = makeState([
      { id: "w-sword", type: "sword", owner: "white", x: 1, y: 1 },
      { id: "b-wall", type: "wall", owner: "black", x: 1, y: 2 },
    ]);
    const result = validateAction(state, makeRuleset(), {
      piece: "w-sword",
      to: { x: 1, y: 2 },
    });
    expect(result).toEqual({ legal: false, reason: "TARGET_INVULNERABLE" });
  });

  it("TARGET_IMMUNE — target immune to the attack class", () => {
    // Custom ruleset: a 'ghost' piece immune to ranged. White bow ranged-attacks it -> TARGET_IMMUNE.
    const ruleset = makeRuleset({
      pieceTypes: {
        ...defaultRuleset.pieceTypes,
        ghost: {
          id: "ghost",
          moves: [],
          attacks: [],
          immuneTo: ["ranged"],
        },
      },
    });
    const state = makeState([
      { id: "w-bow", type: "bow", owner: "white", x: 0, y: 0 },
      { id: "b-ghost", type: "ghost", owner: "black", x: 0, y: 2 },
    ]);
    const result = validateAction(state, ruleset, {
      piece: "w-bow",
      to: { x: 0, y: 2 },
    });
    expect(result).toEqual({ legal: false, reason: "TARGET_IMMUNE" });
  });
});

// ---------------------------------------------------------------------------
// Legal classification (positive cases backing the negative reasons)
// ---------------------------------------------------------------------------

describe("validateAction — legal classifications", () => {
  it("classifies an empty in-range square as a non-swapping move", () => {
    const state = createInitialState(defaultRuleset);
    // white king (3,0) -> (2,0) empty, ORTH1.
    const result = validateAction(state, defaultRuleset, {
      piece: "white:king:0",
      to: { x: 2, y: 0 },
    });
    expect(result).toEqual({ legal: true, kind: "move", swaps: false });
  });

  it("classifies a melee enemy capture as a swapping attack", () => {
    // White sword at (2,2) melee-attacks an enemy at (2,3): Chebyshev 1 -> melee, swaps.
    const state = makeState([
      { id: "w-sword", type: "sword", owner: "white", x: 2, y: 2 },
      { id: "b-spear", type: "spear", owner: "black", x: 2, y: 3 },
    ]);
    const result = validateAction(state, makeRuleset(), {
      piece: "w-sword",
      to: { x: 2, y: 3 },
    });
    expect(result).toEqual({
      legal: true,
      kind: "attack",
      class: "melee",
      swaps: true,
    });
  });

  it("classifies a ranged bow capture as a non-swapping attack", () => {
    // White bow at (0,0) attacks (0,2) (ORTH2, Chebyshev 2 -> ranged, no swap).
    const state = makeState([
      { id: "w-bow", type: "bow", owner: "white", x: 0, y: 0 },
      { id: "b-spear", type: "spear", owner: "black", x: 0, y: 2 },
    ]);
    const result = validateAction(state, makeRuleset(), {
      piece: "w-bow",
      to: { x: 0, y: 2 },
    });
    expect(result).toEqual({
      legal: true,
      kind: "attack",
      class: "ranged",
      swaps: false,
    });
  });
});

// ---------------------------------------------------------------------------
// Turn alternation
// ---------------------------------------------------------------------------

describe("turn alternation", () => {
  it("advances white -> black -> white across two applied moves", () => {
    const s0 = createInitialState(defaultRuleset);
    expect(s0.toMove).toBe("white");

    const r1 = applyAction(s0, defaultRuleset, {
      piece: "white:king:0",
      to: { x: 2, y: 0 },
    });
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;
    expect(r1.state.toMove).toBe("black");

    const r2 = applyAction(r1.state, defaultRuleset, {
      piece: "black:king:0",
      to: { x: 2, y: 8 }, // black king now starts at (3,8) on the 7×9 board
    });
    expect(r2.ok).toBe(true);
    if (!r2.ok) return;
    expect(r2.state.toMove).toBe("white");
  });
});

// ---------------------------------------------------------------------------
// Purity: validateAction does not mutate; applyAction returns a new state
// ---------------------------------------------------------------------------

describe("purity / immutability", () => {
  it("validateAction does not mutate the input state", () => {
    const state = createInitialState(defaultRuleset);
    const before = snapshot(state);
    validateAction(state, defaultRuleset, {
      piece: "white:king:0",
      to: { x: 2, y: 0 },
    });
    expect(state).toEqual(before);
  });

  it("applyAction returns a brand-new state and leaves the input unchanged", () => {
    const state = createInitialState(defaultRuleset);
    const before = snapshot(state);

    const result = applyAction(state, defaultRuleset, {
      piece: "white:king:0",
      to: { x: 2, y: 0 },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Input untouched.
    expect(state).toEqual(before);
    // A new object, not the same reference.
    expect(result.state).not.toBe(state);
    expect(result.state.pieces).not.toBe(state.pieces);

    // The acting piece actually moved in the NEW state only.
    const movedNew = result.state.pieces.find((p) => p.id === "white:king:0");
    const movedOld = state.pieces.find((p) => p.id === "white:king:0");
    expect(movedNew).toMatchObject({ x: 2, y: 0 });
    expect(movedOld).toMatchObject({ x: 3, y: 0 });
  });

  it("applyAction with melee swap relocates attacker and removes victim in the new state", () => {
    const state = makeState([
      { id: "w-sword", type: "sword", owner: "white", x: 2, y: 2 },
      { id: "b-spear", type: "spear", owner: "black", x: 2, y: 3 },
    ]);
    const before = snapshot(state);

    const result = applyAction(state, makeRuleset(), {
      piece: "w-sword",
      to: { x: 2, y: 3 },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Input unchanged.
    expect(state).toEqual(before);

    // Victim gone, attacker swapped onto (2,3).
    expect(result.state.pieces.find((p) => p.id === "b-spear")).toBeUndefined();
    expect(result.state.pieces.find((p) => p.id === "w-sword")).toMatchObject({
      x: 2,
      y: 3,
    });
    expect(result.events).toContainEqual({
      type: "captured",
      victim: "b-spear",
      by: "w-sword",
      swapped: true,
      class: "melee",
    });
  });
});

// ---------------------------------------------------------------------------
// legalActions / legalActionsForPiece
// ---------------------------------------------------------------------------

describe("legalActions", () => {
  it("is non-empty at game start", () => {
    const state = createInitialState(defaultRuleset);
    const actions = legalActions(state, defaultRuleset);
    expect(actions.length).toBeGreaterThan(0);
  });

  it("returns only legal actions, all owned by the side to move", () => {
    const state = createInitialState(defaultRuleset);
    const actions = legalActions(state, defaultRuleset);

    for (const action of actions) {
      // Each enumerated action re-validates as legal.
      const result = validateAction(state, defaultRuleset, action);
      expect(result.legal).toBe(true);

      // The acting piece belongs to white (the side to move).
      const piece = state.pieces.find((p) => p.id === action.piece);
      expect(piece).toBeDefined();
      expect(piece?.owner).toBe("white");
    }
  });

  it("returns an empty list when the game is already won", () => {
    const state = createInitialState(defaultRuleset);
    const won: GameState = {
      ...state,
      status: { state: "won", winner: "white", by: "regicide" },
    };
    expect(legalActions(won, defaultRuleset)).toEqual([]);
  });

  it("legalActionsForPiece returns no actions for the opponent's piece on white's turn", () => {
    const state = createInitialState(defaultRuleset);
    expect(legalActionsForPiece(state, defaultRuleset, "black:king:0")).toEqual(
      [],
    );
  });

  it("legalActions equals the union of legalActionsForPiece over the mover's pieces (no gate active)", () => {
    // The repetition-gated twin of this test lives in antiStalling.test.ts; this
    // pins the PLAIN path, and not just at the opening — also after two plies.
    const key = (a: Action) => `${a.piece}->${a.to.x},${a.to.y}`;
    let state = createInitialState(defaultRuleset);
    for (let ply = 0; ply < 3; ply++) {
      const all = legalActions(state, defaultRuleset).map(key).sort();
      const union = state.pieces
        .filter((p) => p.owner === state.toMove)
        .flatMap((p) => legalActionsForPiece(state, defaultRuleset, p.id))
        .map(key)
        .sort();
      expect(all).toEqual(union);
      expect(all.length).toBeGreaterThan(0);
      const next = applyAction(
        state,
        defaultRuleset,
        legalActions(state, defaultRuleset)[0]!,
      );
      expect(next.ok).toBe(true);
      if (!next.ok) throw new Error("unreachable");
      state = next.state;
    }
  });

  it("legalActionsForPiece enumerates the king's two open orthogonal moves at start", () => {
    const state = createInitialState(defaultRuleset);
    // King at (3,0): up (3,1) blocked by own wall, off-board below; left (2,0) and right (4,0) open.
    const actions = legalActionsForPiece(state, defaultRuleset, "white:king:0");
    const targets = actions.map((a: Action) => `${a.to.x},${a.to.y}`).sort();
    expect(targets).toEqual(["2,0", "4,0"]);
  });
});
