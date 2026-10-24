import { describe, it, expect } from "vitest";
import { createInitialState } from "../../../../src/apps/castlesiege/engine/core.js";
import {
  defaultRuleset,
  ruleset_1_0_0,
} from "../../../../src/apps/castlesiege/engine/rulesets/default.js";
import type {
  GameState,
  Piece,
  Placement,
  Ruleset,
} from "../../../../src/apps/castlesiege/engine/types.js";

// ---------------------------------------------------------------------------
// createInitialState — contract tests against the signed-off RULES_SPEC §1, §2
// and the ENGINE_DESIGN piece-id scheme (`${owner}:${type}:${n}`).
//
// These assert the CONTRACT: exact board dims, exactly 13 pieces/side, the
// correct piece type at every named square, deterministic ids, white to move,
// status playing, and rulesetVersion. They do not touch private internals.
// ---------------------------------------------------------------------------

function state(): GameState {
  return createInitialState(defaultRuleset);
}

function pieceAt(s: GameState, x: number, y: number): Piece | undefined {
  return s.pieces.find((p) => p.x === x && p.y === y);
}

describe("createInitialState — top-level GameState shape", () => {
  it("sets board dimensions from the ruleset (7 wide x 9 tall)", () => {
    const s = state();
    expect(s.board).toEqual({ width: 7, height: 9 });
  });

  it("derives board dims from the ruleset, not hardcoded constants", () => {
    const custom = {
      ...defaultRuleset,
      board: { width: 3, height: 4 },
      setup: [],
    };
    const s = createInitialState(custom);
    expect(s.board).toEqual({ width: 3, height: 4 });
  });

  it("records the ruleset version on the state", () => {
    const s = state();
    expect(s.rulesetVersion).toBe("default@1.1.0"); // S017: anti-stalling rules turned on
  });

  it("starts with white to move (turnOrder[0])", () => {
    const s = state();
    expect(s.toMove).toBe("white");
  });

  it("starts in the playing status", () => {
    const s = state();
    expect(s.status).toEqual({ state: "playing" });
  });
});

describe("createInitialState — piece counts", () => {
  it("places exactly 26 pieces total (13 per side)", () => {
    const s = state();
    expect(s.pieces).toHaveLength(26);
  });

  it("places exactly 13 white pieces", () => {
    const s = state();
    expect(s.pieces.filter((p) => p.owner === "white")).toHaveLength(13);
  });

  it("places exactly 13 black pieces", () => {
    const s = state();
    expect(s.pieces.filter((p) => p.owner === "black")).toHaveLength(13);
  });

  // RULES_SPEC §2: per side — 2 Bow, 1 King, 3 Wall, 2 Spear, 3 Hammer, 2 Sword.
  const perSideCounts: Array<[string, number]> = [
    ["bow", 2],
    ["king", 1],
    ["wall", 3],
    ["spear", 2],
    ["hammer", 3],
    ["sword", 2],
  ];

  it.each(perSideCounts)("white has exactly %i %s", (type, count) => {
    const s = state();
    const got = s.pieces.filter((p) => p.owner === "white" && p.type === type);
    expect(got).toHaveLength(count);
  });

  it.each(perSideCounts)("black has exactly %i %s", (type, count) => {
    const s = state();
    const got = s.pieces.filter((p) => p.owner === "black" && p.type === type);
    expect(got).toHaveLength(count);
  });
});

describe("createInitialState — exact placements (RULES_SPEC §2)", () => {
  // White home rows y=0,1,2; Black mirror at y=8,7,6 (shifted +1 for the 7x9
  // board's middle no-man's-land).
  // Each entry: [x, y, expected owner, expected type].
  const placements: Array<[number, number, string, string]> = [
    // White back row (y=0): Bow . . King . . Bow
    [0, 0, "white", "bow"],
    [3, 0, "white", "king"],
    [6, 0, "white", "bow"],
    // White mid row (y=1): . Wall . Wall . Wall .
    [1, 1, "white", "wall"],
    [3, 1, "white", "wall"],
    [5, 1, "white", "wall"],
    // White front row (y=2): Spear Hammer Sword Hammer Sword Hammer Spear
    [0, 2, "white", "spear"],
    [1, 2, "white", "hammer"],
    [2, 2, "white", "sword"],
    [3, 2, "white", "hammer"],
    [4, 2, "white", "sword"],
    [5, 2, "white", "hammer"],
    [6, 2, "white", "spear"],
    // Black back row (y=8): Bow . . King . . Bow
    [0, 8, "black", "bow"],
    [3, 8, "black", "king"],
    [6, 8, "black", "bow"],
    // Black mid row (y=7): . Wall . Wall . Wall .
    [1, 7, "black", "wall"],
    [3, 7, "black", "wall"],
    [5, 7, "black", "wall"],
    // Black front row (y=6): Spear Hammer Sword Hammer Sword Hammer Spear
    [0, 6, "black", "spear"],
    [1, 6, "black", "hammer"],
    [2, 6, "black", "sword"],
    [3, 6, "black", "hammer"],
    [4, 6, "black", "sword"],
    [5, 6, "black", "hammer"],
    [6, 6, "black", "spear"],
  ];

  it.each(placements)("square (%i,%i) holds %s %s", (x, y, owner, type) => {
    const p = pieceAt(state(), x, y);
    expect(p).toBeDefined();
    expect(p?.owner).toBe(owner);
    expect(p?.type).toBe(type);
  });

  it("leaves the middle no-man's-land unoccupied (y=3, y=4, y=5)", () => {
    const s = state();
    for (let y = 3; y <= 5; y++) {
      for (let x = 0; x < 7; x++) {
        expect(pieceAt(s, x, y)).toBeUndefined();
      }
    }
  });

  it("leaves the gap squares on the back/mid rows empty", () => {
    const s = state();
    // White back-row gaps: x = 1,2,4,5 at y=0.
    for (const x of [1, 2, 4, 5]) {
      expect(pieceAt(s, x, 0)).toBeUndefined();
    }
    // White mid-row gaps: x = 0,2,4,6 at y=1.
    for (const x of [0, 2, 4, 6]) {
      expect(pieceAt(s, x, 1)).toBeUndefined();
    }
  });
});

describe("createInitialState — deterministic piece ids", () => {
  it("assigns ids of the form `${owner}:${type}:${n}` ordinal in setup order", () => {
    const s = state();
    // White bows: x=0 first (n=0), x=6 second (n=1) per setup array order.
    expect(pieceAt(s, 0, 0)?.id).toBe("white:bow:0");
    expect(pieceAt(s, 6, 0)?.id).toBe("white:bow:1");
    // Singleton king.
    expect(pieceAt(s, 3, 0)?.id).toBe("white:king:0");
    // White walls in setup order: x=1, x=3, x=5.
    expect(pieceAt(s, 1, 1)?.id).toBe("white:wall:0");
    expect(pieceAt(s, 3, 1)?.id).toBe("white:wall:1");
    expect(pieceAt(s, 5, 1)?.id).toBe("white:wall:2");
    // White hammers in setup order: x=1, x=3, x=5 at y=2.
    expect(pieceAt(s, 1, 2)?.id).toBe("white:hammer:0");
    expect(pieceAt(s, 3, 2)?.id).toBe("white:hammer:1");
    expect(pieceAt(s, 5, 2)?.id).toBe("white:hammer:2");
    // White swords: x=2, x=4 at y=2.
    expect(pieceAt(s, 2, 2)?.id).toBe("white:sword:0");
    expect(pieceAt(s, 4, 2)?.id).toBe("white:sword:1");
    // White spears: x=0, x=6 at y=2.
    expect(pieceAt(s, 0, 2)?.id).toBe("white:spear:0");
    expect(pieceAt(s, 6, 2)?.id).toBe("white:spear:1");
  });

  it("counts ordinals per-owner independently (black ids start at 0)", () => {
    const s = state();
    expect(pieceAt(s, 0, 8)?.id).toBe("black:bow:0");
    expect(pieceAt(s, 6, 8)?.id).toBe("black:bow:1");
    expect(pieceAt(s, 3, 8)?.id).toBe("black:king:0");
    expect(pieceAt(s, 1, 7)?.id).toBe("black:wall:0");
  });

  it("produces globally unique piece ids", () => {
    const s = state();
    const ids = s.pieces.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("is deterministic — two calls yield identical ids at identical squares", () => {
    const a = createInitialState(defaultRuleset);
    const b = createInitialState(defaultRuleset);
    expect(a.pieces).toEqual(b.pieces);
  });
});

// ---------------------------------------------------------------------------
// Setup validation (S077) — createInitialState throws at CONSTRUCTION on a
// malformed setup (unknown type · out-of-bounds/non-integer coords · overlap),
// mirroring the `repetitionActive` guard: a malformed setup is a programmer
// error, never a silently-inert rule (P0 #3).
// ---------------------------------------------------------------------------

describe("createInitialState — setup validation", () => {
  // A minimal valid base ruleset (5x5, one known type) that each case clones
  // and breaks in exactly one way.
  const base: Ruleset = {
    version: "setup-guard@1.0.0",
    board: { width: 5, height: 5 },
    turnOrder: ["white", "black"],
    winConditions: [],
    pieceTypes: {
      pawn: { id: "pawn", moves: [{ dx: 0, dy: 1 }], attacks: [] },
    },
    setup: [
      { type: "pawn", owner: "white", x: 0, y: 0 },
      { type: "pawn", owner: "black", x: 4, y: 4 },
    ],
  };

  function withSetup(setup: Placement[]): Ruleset {
    return { ...base, setup };
  }

  it("does not throw on the shipped rulesets (happy path preserved)", () => {
    expect(() => createInitialState(defaultRuleset)).not.toThrow();
    expect(() => createInitialState(ruleset_1_0_0)).not.toThrow();
    // Spot-check the map still runs: both shipped setups place 26 pieces.
    expect(createInitialState(defaultRuleset).pieces).toHaveLength(26);
    expect(createInitialState(ruleset_1_0_0).pieces).toHaveLength(26);
  });

  it("does not throw on the minimal valid base ruleset", () => {
    expect(() => createInitialState(base)).not.toThrow();
    expect(createInitialState(base).pieces).toHaveLength(2);
  });

  it("throws on an unknown piece type", () => {
    const bad = withSetup([{ type: "dragon", owner: "white", x: 0, y: 0 }]);
    expect(() => createInitialState(bad)).toThrow(
      'Unknown piece type in setup[0]: "dragon"',
    );
  });

  it("throws on an inherited-prototype key masquerading as a type (Object.hasOwn guard)", () => {
    // "constructor"/"toString" live on Object.prototype, so a bracket-lookup would find a
    // function and let this slip past — Object.hasOwn rejects it as the unknown type it is.
    const bad = withSetup([
      { type: "constructor", owner: "white", x: 0, y: 0 },
    ]);
    expect(() => createInitialState(bad)).toThrow(
      'Unknown piece type in setup[0]: "constructor"',
    );
  });

  // Out-of-bounds / non-integer coordinates — each throws. Board is 5x5.
  const badCoords: Array<[string, number, number]> = [
    ["x >= width", 5, 0],
    ["y >= height", 0, 5],
    ["negative x", -1, 0],
    ["negative y", 0, -1],
    ["non-integer x", 1.5, 0],
    ["non-integer y", 0, 2.25],
  ];

  it.each(badCoords)(
    "throws on an out-of-bounds placement: %s",
    (_label, x, y) => {
      const bad = withSetup([{ type: "pawn", owner: "white", x, y }]);
      expect(() => createInitialState(bad)).toThrow(
        /Setup placement out of bounds/,
      );
    },
  );

  it("throws on two placements on the same square (same owner)", () => {
    const bad = withSetup([
      { type: "pawn", owner: "white", x: 2, y: 2 },
      { type: "pawn", owner: "white", x: 2, y: 2 },
    ]);
    expect(() => createInitialState(bad)).toThrow(
      /Overlapping setup placements at \(2,2\)/,
    );
  });

  it("throws on two placements on the same square (different owners)", () => {
    const bad = withSetup([
      { type: "pawn", owner: "white", x: 1, y: 3 },
      { type: "pawn", owner: "black", x: 1, y: 3 },
    ]);
    expect(() => createInitialState(bad)).toThrow(
      /Overlapping setup placements at \(1,3\)/,
    );
  });

  it("reports the FIRST violation when several exist (mirrors repetitionActive)", () => {
    const bad = withSetup([
      { type: "dragon", owner: "white", x: 9, y: 9 }, // unknown type AND out of bounds
      { type: "pawn", owner: "black", x: 9, y: 9 },
    ]);
    // The unknown-type check on setup[0] fires before anything else.
    expect(() => createInitialState(bad)).toThrow(
      'Unknown piece type in setup[0]: "dragon"',
    );
  });
});
