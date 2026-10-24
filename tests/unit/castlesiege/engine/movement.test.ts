import { describe, it, expect } from "vitest";
import {
  validateAction,
  legalActionsForPiece,
} from "../../../../src/apps/castlesiege/engine/core.js";
import { defaultRuleset } from "../../../../src/apps/castlesiege/engine/rulesets/default.js";
import type {
  GameState,
  Piece,
  ValidationResult,
  XY,
} from "../../../../src/apps/castlesiege/engine/types.js";

// --------------------------------------------------------------------------
// Movement-range tests. We assert the CONTRACT behavior of validateAction +
// legalActionsForPiece against the RULES_SPEC / ENGINE_DESIGN, exercising each
// piece's MOVE set on hand-built, otherwise-empty boards so move legality is
// not confounded by attacks, blocking, or other pieces.
//
// Default board: width 7 (x=0..6), height 8 (y=0..7).
// Move sets per default ruleset:
//   king:   ORTH1            (±1,0),(0,±1)
//   bow:    ORTH1            (±1,0),(0,±1)
//   sword:  N8 + ORTH2       8 neighbors + (±2,0),(0,±2)
//   hammer: N8               8 neighbors
//   spear:  N8               8 neighbors
//   wall:   none
// --------------------------------------------------------------------------

const WIDTH = 7;
const HEIGHT = 8;

/** Build a GameState containing exactly the supplied pieces. White to move. */
function stateWith(pieces: Piece[], toMove: string = "white"): GameState {
  return {
    rulesetVersion: defaultRuleset.version,
    board: { width: WIDTH, height: HEIGHT },
    pieces,
    toMove,
    status: { state: "playing" },
  };
}

function piece(
  id: string,
  type: string,
  x: number,
  y: number,
  owner: string = "white",
): Piece {
  return { id, type, owner, x, y };
}

function expectLegalMove(result: ValidationResult): void {
  expect(result).toEqual({ legal: true, kind: "move", swaps: false });
}

function expectIllegal(result: ValidationResult, reason: string): void {
  expect(result).toEqual({ legal: false, reason });
}

/** Set of "x,y" destinations from a piece's legalActionsForPiece result. */
function legalDestSet(state: GameState, id: string): Set<string> {
  const actions = legalActionsForPiece(state, defaultRuleset, id);
  return new Set(actions.map((a) => `${a.to.x},${a.to.y}`));
}

function xySet(coords: XY[]): Set<string> {
  return new Set(coords.map((c) => `${c.x},${c.y}`));
}

// --------------------------------------------------------------------------
// KING — ORTH1 only (N/S/E/W by 1).
// --------------------------------------------------------------------------
describe("king movement — ORTH1 only", () => {
  // Place king in the interior so all 4 orthogonal steps are on-board.
  const KX = 3;
  const KY = 4;
  const king = piece("white:king:0", "king", KX, KY);

  it.each([
    { label: "east", to: { x: KX + 1, y: KY } },
    { label: "west", to: { x: KX - 1, y: KY } },
    { label: "north", to: { x: KX, y: KY + 1 } },
    { label: "south", to: { x: KX, y: KY - 1 } },
  ])("moves $label by 1 (legal)", ({ to }) => {
    const state = stateWith([king]);
    expectLegalMove(
      validateAction(state, defaultRuleset, { piece: king.id, to }),
    );
  });

  it.each([
    { label: "diagonal NE", to: { x: KX + 1, y: KY + 1 } },
    { label: "diagonal SW", to: { x: KX - 1, y: KY - 1 } },
    { label: "diagonal NW", to: { x: KX - 1, y: KY + 1 } },
    { label: "diagonal SE", to: { x: KX + 1, y: KY - 1 } },
    { label: "orth-2 east", to: { x: KX + 2, y: KY } },
    { label: "orth-2 north", to: { x: KX, y: KY + 2 } },
  ])("rejects $label as NOT_IN_MOVE_RANGE", ({ to }) => {
    const state = stateWith([king]);
    expectIllegal(
      validateAction(state, defaultRuleset, { piece: king.id, to }),
      "NOT_IN_MOVE_RANGE",
    );
  });

  it("enumerates exactly the 4 orthogonal neighbors when interior", () => {
    const state = stateWith([king]);
    expect(legalDestSet(state, king.id)).toEqual(
      xySet([
        { x: KX + 1, y: KY },
        { x: KX - 1, y: KY },
        { x: KX, y: KY + 1 },
        { x: KX, y: KY - 1 },
      ]),
    );
  });

  it("drops off-board neighbors at the SW corner (x=0,y=0)", () => {
    const corner = piece("white:king:0", "king", 0, 0);
    const state = stateWith([corner]);
    // Only east (1,0) and north (0,1) remain; west and south are off-board.
    expect(legalDestSet(state, corner.id)).toEqual(
      xySet([
        { x: 1, y: 0 },
        { x: 0, y: 1 },
      ]),
    );
    // The off-board steps return OFF_BOARD, not NOT_IN_MOVE_RANGE.
    expectIllegal(
      validateAction(state, defaultRuleset, {
        piece: corner.id,
        to: { x: -1, y: 0 },
      }),
      "OFF_BOARD",
    );
    expectIllegal(
      validateAction(state, defaultRuleset, {
        piece: corner.id,
        to: { x: 0, y: -1 },
      }),
      "OFF_BOARD",
    );
  });
});

// --------------------------------------------------------------------------
// BOW — ORTH1 move set (same shape as king for MOVEMENT).
// --------------------------------------------------------------------------
describe("bow movement — ORTH1", () => {
  const BX = 3;
  const BY = 4;
  const bow = piece("white:bow:0", "bow", BX, BY);

  it.each([
    { label: "east", to: { x: BX + 1, y: BY } },
    { label: "west", to: { x: BX - 1, y: BY } },
    { label: "north", to: { x: BX, y: BY + 1 } },
    { label: "south", to: { x: BX, y: BY - 1 } },
  ])("moves $label by 1 (legal)", ({ to }) => {
    const state = stateWith([bow]);
    expectLegalMove(
      validateAction(state, defaultRuleset, { piece: bow.id, to }),
    );
  });

  it("rejects a diagonal-1 step as NOT_IN_MOVE_RANGE (bow has no diagonal move)", () => {
    const state = stateWith([bow]);
    expectIllegal(
      validateAction(state, defaultRuleset, {
        piece: bow.id,
        to: { x: BX + 1, y: BY + 1 },
      }),
      "NOT_IN_MOVE_RANGE",
    );
  });

  it.each([
    { label: "orth-2 east", to: { x: BX + 2, y: BY } },
    { label: "orth-3 north", to: { x: BX, y: BY + 3 } },
  ])(
    "rejects $label onto an EMPTY square as NO_TARGET (those offsets are the bow's attack range, not move range)",
    ({ to }) => {
      const state = stateWith([bow]);
      expectIllegal(
        validateAction(state, defaultRuleset, { piece: bow.id, to }),
        "NO_TARGET",
      );
    },
  );

  it("enumerates exactly the 4 orthogonal neighbors when interior", () => {
    const state = stateWith([bow]);
    expect(legalDestSet(state, bow.id)).toEqual(
      xySet([
        { x: BX + 1, y: BY },
        { x: BX - 1, y: BY },
        { x: BX, y: BY + 1 },
        { x: BX, y: BY - 1 },
      ]),
    );
  });

  it("drops off-board step at the NE corner (x=6,y=7)", () => {
    const corner = piece("white:bow:0", "bow", 6, 7);
    const state = stateWith([corner]);
    // Only west (5,7) and south (6,6) remain on-board.
    expect(legalDestSet(state, corner.id)).toEqual(
      xySet([
        { x: 5, y: 7 },
        { x: 6, y: 6 },
      ]),
    );
    expectIllegal(
      validateAction(state, defaultRuleset, {
        piece: corner.id,
        to: { x: 7, y: 7 },
      }),
      "OFF_BOARD",
    );
  });
});

// --------------------------------------------------------------------------
// SWORD — N8 (8 neighbors) + ORTH2 (straight-2).
// --------------------------------------------------------------------------
describe("sword movement — N8 + straight-2", () => {
  const SX = 3;
  const SY = 4;
  const sword = piece("white:sword:0", "sword", SX, SY);

  it.each([
    { label: "N", to: { x: SX, y: SY + 1 } },
    { label: "S", to: { x: SX, y: SY - 1 } },
    { label: "E", to: { x: SX + 1, y: SY } },
    { label: "W", to: { x: SX - 1, y: SY } },
    { label: "NE", to: { x: SX + 1, y: SY + 1 } },
    { label: "NW", to: { x: SX - 1, y: SY + 1 } },
    { label: "SE", to: { x: SX + 1, y: SY - 1 } },
    { label: "SW", to: { x: SX - 1, y: SY - 1 } },
    { label: "orth-2 E", to: { x: SX + 2, y: SY } },
    { label: "orth-2 W", to: { x: SX - 2, y: SY } },
    { label: "orth-2 N", to: { x: SX, y: SY + 2 } },
    { label: "orth-2 S", to: { x: SX, y: SY - 2 } },
  ])("moves $label (legal)", ({ to }) => {
    const state = stateWith([sword]);
    expectLegalMove(
      validateAction(state, defaultRuleset, { piece: sword.id, to }),
    );
  });

  it.each([
    { label: "diagonal-2 NE", to: { x: SX + 2, y: SY + 2 } },
    { label: "knight (1,2)", to: { x: SX + 1, y: SY + 2 } },
    { label: "knight (2,1)", to: { x: SX + 2, y: SY + 1 } },
    { label: "orth-3 E", to: { x: SX + 3, y: SY } },
  ])("rejects $label as NOT_IN_MOVE_RANGE", ({ to }) => {
    const state = stateWith([sword]);
    expectIllegal(
      validateAction(state, defaultRuleset, { piece: sword.id, to }),
      "NOT_IN_MOVE_RANGE",
    );
  });

  it("enumerates exactly N8 + ORTH2 (12 squares) when interior", () => {
    const state = stateWith([sword]);
    expect(legalDestSet(state, sword.id)).toEqual(
      xySet([
        { x: SX + 1, y: SY },
        { x: SX - 1, y: SY },
        { x: SX, y: SY + 1 },
        { x: SX, y: SY - 1 },
        { x: SX + 1, y: SY + 1 },
        { x: SX - 1, y: SY + 1 },
        { x: SX + 1, y: SY - 1 },
        { x: SX - 1, y: SY - 1 },
        { x: SX + 2, y: SY },
        { x: SX - 2, y: SY },
        { x: SX, y: SY + 2 },
        { x: SX, y: SY - 2 },
      ]),
    );
    expect(legalActionsForPiece(state, defaultRuleset, sword.id)).toHaveLength(
      12,
    );
  });

  it("returns OFF_BOARD for the orth-2 step that runs past the west edge (x=1)", () => {
    // From x=1, orth-2 west targets x=-1 (off board); orth-1 west targets x=0 (legal).
    const s = piece("white:sword:0", "sword", 1, 4);
    const state = stateWith([s]);
    expectIllegal(
      validateAction(state, defaultRuleset, {
        piece: s.id,
        to: { x: -1, y: 4 },
      }),
      "OFF_BOARD",
    );
    expectLegalMove(
      validateAction(state, defaultRuleset, {
        piece: s.id,
        to: { x: 0, y: 4 },
      }),
    );
  });
});

// --------------------------------------------------------------------------
// HAMMER — N8 (8 neighbors).
// --------------------------------------------------------------------------
describe("hammer movement — N8", () => {
  const HX = 3;
  const HY = 4;
  const hammer = piece("white:hammer:0", "hammer", HX, HY);

  it.each([
    { label: "N", to: { x: HX, y: HY + 1 } },
    { label: "S", to: { x: HX, y: HY - 1 } },
    { label: "E", to: { x: HX + 1, y: HY } },
    { label: "W", to: { x: HX - 1, y: HY } },
    { label: "NE", to: { x: HX + 1, y: HY + 1 } },
    { label: "NW", to: { x: HX - 1, y: HY + 1 } },
    { label: "SE", to: { x: HX + 1, y: HY - 1 } },
    { label: "SW", to: { x: HX - 1, y: HY - 1 } },
  ])("moves $label (legal)", ({ to }) => {
    const state = stateWith([hammer]);
    expectLegalMove(
      validateAction(state, defaultRuleset, { piece: hammer.id, to }),
    );
  });

  it.each([
    { label: "orth-2 E (no straight-2 for hammer)", to: { x: HX + 2, y: HY } },
    { label: "orth-2 N", to: { x: HX, y: HY + 2 } },
    { label: "knight (1,2)", to: { x: HX + 1, y: HY + 2 } },
  ])("rejects $label as NOT_IN_MOVE_RANGE", ({ to }) => {
    const state = stateWith([hammer]);
    expectIllegal(
      validateAction(state, defaultRuleset, { piece: hammer.id, to }),
      "NOT_IN_MOVE_RANGE",
    );
  });

  it("enumerates exactly the 8 neighbors when interior", () => {
    const state = stateWith([hammer]);
    expect(legalDestSet(state, hammer.id)).toEqual(
      xySet([
        { x: HX + 1, y: HY },
        { x: HX - 1, y: HY },
        { x: HX, y: HY + 1 },
        { x: HX, y: HY - 1 },
        { x: HX + 1, y: HY + 1 },
        { x: HX - 1, y: HY + 1 },
        { x: HX + 1, y: HY - 1 },
        { x: HX - 1, y: HY - 1 },
      ]),
    );
    expect(legalActionsForPiece(state, defaultRuleset, hammer.id)).toHaveLength(
      8,
    );
  });
});

// --------------------------------------------------------------------------
// SPEAR — N8 (8 neighbors) for MOVEMENT (attacks add range-2, not tested here).
// --------------------------------------------------------------------------
describe("spear movement — N8", () => {
  const PX = 3;
  const PY = 4;
  const spear = piece("white:spear:0", "spear", PX, PY);

  it.each([
    { label: "N", to: { x: PX, y: PY + 1 } },
    { label: "S", to: { x: PX, y: PY - 1 } },
    { label: "E", to: { x: PX + 1, y: PY } },
    { label: "W", to: { x: PX - 1, y: PY } },
    { label: "NE", to: { x: PX + 1, y: PY + 1 } },
    { label: "NW", to: { x: PX - 1, y: PY + 1 } },
    { label: "SE", to: { x: PX + 1, y: PY - 1 } },
    { label: "SW", to: { x: PX - 1, y: PY - 1 } },
  ])("moves $label (legal)", ({ to }) => {
    const state = stateWith([spear]);
    expectLegalMove(
      validateAction(state, defaultRuleset, { piece: spear.id, to }),
    );
  });

  it("rejects orth-2 east as NO_TARGET (in attack set but empty square)", () => {
    // Spear's attack set includes ORTH2; aiming a move there onto an EMPTY square
    // is classified NO_TARGET, NOT NOT_IN_MOVE_RANGE.
    const state = stateWith([spear]);
    expectIllegal(
      validateAction(state, defaultRuleset, {
        piece: spear.id,
        to: { x: PX + 2, y: PY },
      }),
      "NO_TARGET",
    );
  });

  it("rejects a diagonal-2 (in neither move nor attack set) as NOT_IN_MOVE_RANGE", () => {
    const state = stateWith([spear]);
    expectIllegal(
      validateAction(state, defaultRuleset, {
        piece: spear.id,
        to: { x: PX + 2, y: PY + 2 },
      }),
      "NOT_IN_MOVE_RANGE",
    );
  });

  it("enumerates exactly the 8 neighbors as MOVE destinations when interior", () => {
    const state = stateWith([spear]);
    // legalActionsForPiece returns moves AND attacks; on an empty board the spear
    // has no attack targets, so every legal action is a move into a neighbor.
    expect(legalDestSet(state, spear.id)).toEqual(
      xySet([
        { x: PX + 1, y: PY },
        { x: PX - 1, y: PY },
        { x: PX, y: PY + 1 },
        { x: PX, y: PY - 1 },
        { x: PX + 1, y: PY + 1 },
        { x: PX - 1, y: PY + 1 },
        { x: PX + 1, y: PY - 1 },
        { x: PX - 1, y: PY - 1 },
      ]),
    );
    expect(legalActionsForPiece(state, defaultRuleset, spear.id)).toHaveLength(
      8,
    );
  });
});

// --------------------------------------------------------------------------
// WALL — no movement (and no attack).
// --------------------------------------------------------------------------
describe("wall movement — none", () => {
  const wall = piece("white:wall:0", "wall", 3, 4);

  it.each([
    { label: "N", to: { x: 3, y: 5 } },
    { label: "E", to: { x: 4, y: 4 } },
    { label: "NE", to: { x: 4, y: 5 } },
  ])("rejects $label as NOT_IN_MOVE_RANGE", ({ to }) => {
    const state = stateWith([wall]);
    expectIllegal(
      validateAction(state, defaultRuleset, { piece: wall.id, to }),
      "NOT_IN_MOVE_RANGE",
    );
  });

  it("enumerates zero legal actions", () => {
    const state = stateWith([wall]);
    expect(legalActionsForPiece(state, defaultRuleset, wall.id)).toEqual([]);
  });
});

// --------------------------------------------------------------------------
// DESTINATION_OCCUPIED — moving onto a FRIENDLY piece.
// --------------------------------------------------------------------------
describe("moving onto a friendly piece — DESTINATION_OCCUPIED", () => {
  it("king blocked by a friendly piece on an in-range square", () => {
    const king = piece("white:king:0", "king", 3, 4);
    const friend = piece("white:hammer:0", "hammer", 4, 4); // east neighbor
    const state = stateWith([king, friend]);
    expectIllegal(
      validateAction(state, defaultRuleset, {
        piece: king.id,
        to: { x: 4, y: 4 },
      }),
      "DESTINATION_OCCUPIED",
    );
  });

  it("sword blocked by a friendly piece on a straight-2 square", () => {
    const sword = piece("white:sword:0", "sword", 3, 4);
    const friend = piece("white:spear:0", "spear", 3, 6); // north-2 (0,+2)
    const state = stateWith([sword, friend]);
    expectIllegal(
      validateAction(state, defaultRuleset, {
        piece: sword.id,
        to: { x: 3, y: 6 },
      }),
      "DESTINATION_OCCUPIED",
    );
  });

  it("hammer blocked by a friendly diagonal neighbor", () => {
    const hammer = piece("white:hammer:0", "hammer", 3, 4);
    const friend = piece("white:sword:0", "sword", 4, 5); // NE neighbor
    const state = stateWith([hammer, friend]);
    expectIllegal(
      validateAction(state, defaultRuleset, {
        piece: hammer.id,
        to: { x: 4, y: 5 },
      }),
      "DESTINATION_OCCUPIED",
    );
  });

  it("the occupied square is dropped from legalActionsForPiece", () => {
    const king = piece("white:king:0", "king", 3, 4);
    const friend = piece("white:bow:0", "bow", 4, 4); // east neighbor
    const state = stateWith([king, friend]);
    const dests = legalDestSet(state, king.id);
    expect(dests.has("4,4")).toBe(false);
    expect(dests).toEqual(
      xySet([
        { x: 2, y: 4 },
        { x: 3, y: 5 },
        { x: 3, y: 3 },
      ]),
    );
  });
});
