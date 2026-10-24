import { describe, it, expect } from "vitest";
import {
  createInitialState,
  applyAction,
  validateAction,
  legalActionsForPiece,
} from "../../../../src/apps/castlesiege/engine/core.js";
import { defaultRuleset } from "../../../../src/apps/castlesiege/engine/rulesets/default.js";
import type {
  GameState,
  Piece,
  Placement,
  Ruleset,
} from "../../../../src/apps/castlesiege/engine/types.js";

// ---------------------------------------------------------------------------
// Helpers — build minimal, deterministic boards from explicit placements so
// every blocking scenario asserts EXACT coordinates against the contract,
// independent of the default starting layout.
// ---------------------------------------------------------------------------

// A spacious empty board so target squares and intervening squares are never
// off-board and never accidentally occupied.
const BOARD = { width: 10, height: 10 };

/** Build a Ruleset that reuses the default piece definitions but with a custom
 *  board size and an arbitrary placement list. Win conditions are kept so the
 *  engine code path is identical, but our scenarios never trigger them. */
function rulesetWith(setup: Placement[]): Ruleset {
  return {
    ...defaultRuleset,
    version: "blocking-test@1.0.0",
    board: { ...BOARD },
    setup,
  };
}

/** Construct a playing GameState directly from placements (ids assigned the
 *  same deterministic way createInitialState does), with a chosen side to move. */
function stateFrom(setup: Placement[], toMove: string): GameState {
  const ruleset = rulesetWith(setup);
  const state = createInitialState(ruleset);
  return { ...state, toMove };
}

function pieceId(owner: string, type: string, n: number): string {
  return `${owner}:${type}:${n}`;
}

function findById(state: GameState, id: string): Piece {
  const p = state.pieces.find((q) => q.id === id);
  if (p === undefined) throw new Error(`piece not found in state: ${id}`);
  return p;
}

function hasPieceAt(state: GameState, x: number, y: number): boolean {
  return state.pieces.some((p) => p.x === x && p.y === y);
}

/** Parked-in-the-corner pieces that keep BOTH sides alive so that an
 *  applyAction in a blocking scenario never accidentally trips a win condition
 *  (regicide / decapitation / castleClear). Each side keeps a king (royal), a
 *  wall (castle) and a sword (a surviving non-royal). Placed far from the action
 *  in the bottom-right so they are off every test's path/target. */
const KEEP_ALIVE: Placement[] = [
  { type: "king", owner: "white", x: 9, y: 9 },
  { type: "wall", owner: "white", x: 9, y: 8 },
  { type: "sword", owner: "white", x: 8, y: 9 },
  { type: "king", owner: "black", x: 9, y: 0 },
  { type: "wall", owner: "black", x: 9, y: 1 },
  { type: "sword", owner: "black", x: 8, y: 0 },
];

// ---------------------------------------------------------------------------
// 1. WALL BLOCKS A SLIDING MOVE (straight line, range>1)
// ---------------------------------------------------------------------------
//
// Sword at (2,2) wants the orthogonal-2 move to (2,4) [dy=+2, in its move set].
// Path = the single strictly-intervening square (2,3). A wall there blocks it.
//
describe("wall blocks a straight-line range-2 MOVE", () => {
  const setup: Placement[] = [
    { type: "sword", owner: "white", x: 2, y: 2 },
    { type: "wall", owner: "black", x: 2, y: 3 }, // intervening square
  ];

  it("returns PATH_BLOCKED for the sword's range-2 move over a wall", () => {
    const state = stateFrom(setup, "white");
    const sword = pieceId("white", "sword", 0);
    const res = validateAction(state, defaultRuleset, {
      piece: sword,
      to: { x: 2, y: 4 },
    });
    expect(res).toEqual({ legal: false, reason: "PATH_BLOCKED" });
  });

  it("applyAction also refuses the blocked move and does not move the piece", () => {
    const state = stateFrom(setup, "white");
    const sword = pieceId("white", "sword", 0);
    const res = applyAction(state, defaultRuleset, {
      piece: sword,
      to: { x: 2, y: 4 },
    });
    expect(res).toEqual({ ok: false, reason: "PATH_BLOCKED" });
    // input state untouched.
    expect(findById(state, sword)).toMatchObject({ x: 2, y: 2 });
  });

  it("the blocked range-2 move is absent from the sword's legal actions", () => {
    const state = stateFrom(setup, "white");
    const sword = pieceId("white", "sword", 0);
    const actions = legalActionsForPiece(state, defaultRuleset, sword);
    const targets = actions.map((a) => `${a.to.x},${a.to.y}`);
    expect(targets).not.toContain("2,4");
  });

  it("the SAME range-2 move IS legal once the wall is removed (control)", () => {
    const state = stateFrom(
      [{ type: "sword", owner: "white", x: 2, y: 2 }],
      "white",
    );
    const sword = pieceId("white", "sword", 0);
    const res = validateAction(state, defaultRuleset, {
      piece: sword,
      to: { x: 2, y: 4 },
    });
    expect(res).toEqual({ legal: true, kind: "move", swaps: false });
  });
});

// ---------------------------------------------------------------------------
// 2. WALL BLOCKS A RANGED ATTACK (straight line, range>1)
// ---------------------------------------------------------------------------
//
// Bow at (4,1) wants the range-2 ranged attack to (4,3) [dy=+2, in attack set].
// Path = the intervening square (4,2). A wall there blocks the shot.
// (Bow has no range-1 attack, so range-2 is the closest shot — perfect probe.)
//
describe("wall blocks a straight-line ranged ATTACK", () => {
  it("returns PATH_BLOCKED for a bow range-2 shot over a wall", () => {
    const setup: Placement[] = [
      { type: "bow", owner: "white", x: 4, y: 1 },
      { type: "wall", owner: "black", x: 4, y: 2 }, // intervening
      { type: "sword", owner: "black", x: 4, y: 3 }, // intended victim
    ];
    const state = stateFrom(setup, "white");
    const bow = pieceId("white", "bow", 0);
    const res = validateAction(state, defaultRuleset, {
      piece: bow,
      to: { x: 4, y: 3 },
    });
    expect(res).toEqual({ legal: false, reason: "PATH_BLOCKED" });
  });

  it("the SAME range-2 shot lands once the wall is gone (control)", () => {
    const setup: Placement[] = [
      { type: "bow", owner: "white", x: 4, y: 1 },
      { type: "sword", owner: "black", x: 4, y: 3 }, // victim, clear line
    ];
    const state = stateFrom(setup, "white");
    const bow = pieceId("white", "bow", 0);
    const res = validateAction(state, defaultRuleset, {
      piece: bow,
      to: { x: 4, y: 3 },
    });
    expect(res).toEqual({
      legal: true,
      kind: "attack",
      class: "ranged",
      swaps: false,
    });
  });

  it("blocking applies to a range-3 bow shot with the wall on either intervening square", () => {
    // Bow at (1,1) → range-3 vertical shot to (1,4). Path = (1,2),(1,3).
    const farWall: Placement[] = [
      { type: "bow", owner: "white", x: 1, y: 1 },
      { type: "wall", owner: "black", x: 1, y: 3 }, // second intervening square
      { type: "sword", owner: "black", x: 1, y: 4 }, // victim at range 3
    ];
    const state = stateFrom(farWall, "white");
    const bow = pieceId("white", "bow", 0);
    expect(
      validateAction(state, defaultRuleset, { piece: bow, to: { x: 1, y: 4 } }),
    ).toEqual({ legal: false, reason: "PATH_BLOCKED" });
  });
});

// ---------------------------------------------------------------------------
// 3. NON-WALL PIECE IS JUMPED OVER (NOT blocked) — moves
// ---------------------------------------------------------------------------
//
// "Every other piece is jumped over, knight-style." A non-wall on the path of
// a sliding move does NOT block it.
//
describe("non-wall piece does NOT block a sliding move (jumped over)", () => {
  it("sword range-2 move clears a FRIENDLY non-wall on the path", () => {
    // sword (3,3) → (3,5); intervening (3,4) holds a friendly sword.
    const setup: Placement[] = [
      { type: "sword", owner: "white", x: 3, y: 3 },
      { type: "sword", owner: "white", x: 3, y: 4 }, // friendly, non-wall, on path
    ];
    const state = stateFrom(setup, "white");
    const mover = pieceId("white", "sword", 0); // first in setup order
    const res = validateAction(state, defaultRuleset, {
      piece: mover,
      to: { x: 3, y: 5 },
    });
    expect(res).toEqual({ legal: true, kind: "move", swaps: false });
  });

  it("sword range-2 move clears an ENEMY non-wall on the path (and resolves as a move, landing empty)", () => {
    // sword (3,3) → (3,5); intervening (3,4) holds an enemy hammer; (3,5) empty.
    const setup: Placement[] = [
      { type: "sword", owner: "white", x: 3, y: 3 }, // mover — first sword → ordinal 0
      { type: "hammer", owner: "black", x: 3, y: 4 }, // enemy non-wall, on path
      ...KEEP_ALIVE, // keep both sides alive so no win condition fires
    ];
    const state = stateFrom(setup, "white");
    const mover = pieceId("white", "sword", 0);
    const action = { piece: mover, to: { x: 3, y: 5 } };
    expect(validateAction(state, defaultRuleset, action)).toEqual({
      legal: true,
      kind: "move",
      swaps: false,
    });
    const applied = applyAction(state, defaultRuleset, action);
    expect(applied.ok).toBe(true);
    if (applied.ok) {
      // mover landed on (3,5); the jumped-over enemy is untouched at (3,4).
      expect(findById(applied.state, mover)).toMatchObject({ x: 3, y: 5 });
      expect(hasPieceAt(applied.state, 3, 4)).toBe(true);
      expect(applied.events).toEqual([
        {
          type: "moved",
          piece: mover,
          from: { x: 3, y: 3 },
          to: { x: 3, y: 5 },
        },
      ]);
    }
  });
});

// ---------------------------------------------------------------------------
// 4. NON-WALL PIECE IS JUMPED OVER (NOT blocked) — ranged attack
// ---------------------------------------------------------------------------
describe("non-wall piece does NOT block a ranged attack (shot flies over)", () => {
  it("bow range-3 shot flies over a friendly non-wall and kills the victim", () => {
    // bow (0,0) → range-3 to (0,3); path (0,1),(0,2). A friendly sword sits on (0,1).
    const setup: Placement[] = [
      { type: "bow", owner: "white", x: 0, y: 0 },
      { type: "sword", owner: "white", x: 0, y: 1 }, // friendly, on path
      { type: "spear", owner: "black", x: 0, y: 3 }, // victim at range 3
      ...KEEP_ALIVE, // keep both sides alive so killing the spear fires no win
    ];
    const state = stateFrom(setup, "white");
    const bow = pieceId("white", "bow", 0);
    const action = { piece: bow, to: { x: 0, y: 3 } };
    expect(validateAction(state, defaultRuleset, action)).toEqual({
      legal: true,
      kind: "attack",
      class: "ranged",
      swaps: false,
    });
    const applied = applyAction(state, defaultRuleset, action);
    expect(applied.ok).toBe(true);
    if (applied.ok) {
      const victim = pieceId("black", "spear", 0);
      // victim removed; bow stayed put (ranged never swaps); jumped piece survives.
      expect(applied.state.pieces.some((p) => p.id === victim)).toBe(false);
      expect(findById(applied.state, bow)).toMatchObject({ x: 0, y: 0 });
      expect(hasPieceAt(applied.state, 0, 1)).toBe(true);
      expect(applied.events).toEqual([
        {
          type: "captured",
          victim,
          by: bow,
          swapped: false,
          class: "ranged",
        },
      ]);
    }
  });

  it("bow range-2 shot flies over an ENEMY non-wall on the path", () => {
    // bow (5,5) → range-2 to (5,7); intervening (5,6) holds an enemy sword.
    const setup: Placement[] = [
      { type: "bow", owner: "white", x: 5, y: 5 },
      { type: "sword", owner: "black", x: 5, y: 6 }, // enemy non-wall, on path
      { type: "hammer", owner: "black", x: 5, y: 7 }, // victim
    ];
    const state = stateFrom(setup, "white");
    const bow = pieceId("white", "bow", 0);
    expect(
      validateAction(state, defaultRuleset, { piece: bow, to: { x: 5, y: 7 } }),
    ).toEqual({ legal: true, kind: "attack", class: "ranged", swaps: false });
  });
});

// ---------------------------------------------------------------------------
// 5. KNIGHT-STYLE / NON-COLLINEAR OFFSETS ARE NEVER BLOCKED
// ---------------------------------------------------------------------------
//
// The diagonal-1 sword move (1,1)->(2,2) is Chebyshev distance 1: no path at all,
// so a wall adjacent can never be "between" it. And there are no non-collinear
// range>1 offsets in the default set, so a wall on a neighboring square must not
// inhibit a diagonal step.
//
describe("non-collinear / range-1 offsets are never path-blocked", () => {
  it("sword diagonal range-1 move is legal even with a wall on an adjacent square", () => {
    // sword (1,1) → diagonal (2,2). Wall at (2,1) and (1,2) are NOT on any path
    // (Chebyshev distance is 1 → no strictly-intervening squares).
    const setup: Placement[] = [
      { type: "sword", owner: "white", x: 1, y: 1 },
      { type: "wall", owner: "black", x: 2, y: 1 },
      { type: "wall", owner: "black", x: 1, y: 2 },
    ];
    const state = stateFrom(setup, "white");
    const sword = pieceId("white", "sword", 0);
    const res = validateAction(state, defaultRuleset, {
      piece: sword,
      to: { x: 2, y: 2 },
    });
    expect(res).toEqual({ legal: true, kind: "move", swaps: false });
  });

  it("a wall that is NOT collinear with a range-2 move does not block it", () => {
    // sword (2,2) → (4,2) [horizontal range 2]; path = (3,2).
    // Put a wall OFF the path at (3,3): it is not collinear/intervening → no block.
    const setup: Placement[] = [
      { type: "sword", owner: "white", x: 2, y: 2 },
      { type: "wall", owner: "black", x: 3, y: 3 }, // off-path
    ];
    const state = stateFrom(setup, "white");
    const sword = pieceId("white", "sword", 0);
    const res = validateAction(state, defaultRuleset, {
      piece: sword,
      to: { x: 4, y: 2 },
    });
    expect(res).toEqual({ legal: true, kind: "move", swaps: false });
  });
});

// ---------------------------------------------------------------------------
// 6. BLOCKING IS DRIVEN BY blocksPath DATA, NOT THE LITERAL "wall" TYPE
// ---------------------------------------------------------------------------
//
// Contract: "Only blocksPath pieces block." Prove the engine reads the flag,
// not a hardcoded type name, by (a) confirming a wall (blocksPath:true) blocks
// and (b) building a ruleset where a normally-passable piece is marked
// blocksPath and now DOES block on the same geometry.
//
describe("blocking is governed by blocksPath data", () => {
  it("a custom ruleset that flags 'sword' as blocksPath makes a sword block a range-2 move", () => {
    const blockingSwordRuleset: Ruleset = {
      ...defaultRuleset,
      version: "blocking-data-test@1.0.0",
      board: { ...BOARD },
      pieceTypes: {
        ...defaultRuleset.pieceTypes,
        sword: {
          ...defaultRuleset.pieceTypes.sword!,
          blocksPath: true,
        },
      },
      setup: [
        { type: "sword", owner: "white", x: 2, y: 2 }, // mover
        { type: "sword", owner: "black", x: 2, y: 3 }, // now a blocker (on path)
      ],
    };
    const state = createInitialState(blockingSwordRuleset);
    const mover = pieceId("white", "sword", 0);
    expect(
      validateAction(state, blockingSwordRuleset, {
        piece: mover,
        to: { x: 2, y: 4 },
      }),
    ).toEqual({ legal: false, reason: "PATH_BLOCKED" });
  });
});
