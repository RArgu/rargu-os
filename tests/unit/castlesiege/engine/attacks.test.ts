import { describe, it, expect } from "vitest";
import {
  createInitialState,
  validateAction,
  legalActionsForPiece,
} from "../../../../src/apps/castlesiege/engine/core.js";
import { defaultRuleset } from "../../../../src/apps/castlesiege/engine/rulesets/default.js";
import type {
  Action,
  GameState,
  Piece,
  PieceTypeId,
  PlayerId,
  Ruleset,
  ValidationResult,
} from "../../../../src/apps/castlesiege/engine/types.js";

// ---------------------------------------------------------------------------
// Test harness
//
// The default starting layout packs every piece into the home rows with no
// enemy in attack range, so attack-range behavior can't be exercised from the
// initial position alone. These helpers build a deterministic, isolated
// GameState on a roomy board with an attacker placed centrally and targets at
// precise offsets. We assert the CONTRACT (spec §3–§5, ENGINE_DESIGN §5):
// exact reasons, exact kind/class/swaps — never private internals.
// ---------------------------------------------------------------------------

// A large board so every piece's full attack range (up to range 3) fits with
// margin around a central attacker, regardless of direction.
const BOARD_W = 11;
const BOARD_H = 11;
const CENTER = { x: 5, y: 5 };

// Use the default ruleset's piece definitions (the source of truth for the
// move/attack tables under test) but on a bigger board so nothing clips edges.
const ruleset: Ruleset = {
  ...defaultRuleset,
  version: "test-attacks@1.0.0",
  board: { width: BOARD_W, height: BOARD_H },
  // setup is unused by these tests — we hand-build states — but keep it valid.
};

type PieceSpec = {
  id: string;
  type: PieceTypeId;
  owner: PlayerId;
  x: number;
  y: number;
};

function makeState(specs: PieceSpec[], toMove: PlayerId = "white"): GameState {
  const pieces: Piece[] = specs.map((s) => ({
    id: s.id,
    type: s.type,
    owner: s.owner,
    x: s.x,
    y: s.y,
  }));
  return {
    rulesetVersion: ruleset.version,
    board: { width: BOARD_W, height: BOARD_H },
    pieces,
    toMove,
    status: { state: "playing" },
  };
}

// Place an attacker at CENTER (white) plus an enemy (black) at CENTER+(dx,dy).
function attackerVsEnemyAt(
  attackerType: PieceTypeId,
  dx: number,
  dy: number,
  enemyType: PieceTypeId = "sword",
): { state: GameState; action: Action } {
  const state = makeState([
    { id: "A", type: attackerType, owner: "white", x: CENTER.x, y: CENTER.y },
    {
      id: "E",
      type: enemyType,
      owner: "black",
      x: CENTER.x + dx,
      y: CENTER.y + dy,
    },
  ]);
  return {
    state,
    action: { piece: "A", to: { x: CENTER.x + dx, y: CENTER.y + dy } },
  };
}

function validateAttack(
  attackerType: PieceTypeId,
  dx: number,
  dy: number,
  enemyType: PieceTypeId = "sword",
): ValidationResult {
  const { state, action } = attackerVsEnemyAt(attackerType, dx, dy, enemyType);
  return validateAction(state, ruleset, action);
}

// The 8 immediate neighbors (Chebyshev distance 1).
const NEIGHBORS: ReadonlyArray<[number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [-1, 1],
  [1, -1],
  [-1, -1],
];

// Orthogonal offsets at a given distance.
function orth(dist: number): ReadonlyArray<[number, number]> {
  return [
    [dist, 0],
    [-dist, 0],
    [0, dist],
    [0, -dist],
  ];
}

describe("attack ranges per piece (spec §3)", () => {
  // -----------------------------------------------------------------------
  // SWORD — attacks the 8 neighbors, all melee (range 1). No range-2 attack.
  // -----------------------------------------------------------------------
  describe("sword: attacks all 8 neighbors as melee, nothing further", () => {
    it.each(NEIGHBORS)(
      "captures an enemy at offset (%i,%i) as a melee swap",
      (dx, dy) => {
        const result = validateAttack("sword", dx, dy);
        expect(result).toEqual({
          legal: true,
          kind: "attack",
          class: "melee",
          swaps: true,
        });
      },
    );

    it.each([...orth(2)])(
      "cannot attack an enemy 2 orthogonal away at (%i,%i)",
      (dx, dy) => {
        const result = validateAttack("sword", dx, dy);
        expect(result).toEqual({ legal: false, reason: "NOT_IN_ATTACK_RANGE" });
      },
    );

    it("cannot attack an enemy at diagonal distance 2 (2,2)", () => {
      const result = validateAttack("sword", 2, 2);
      expect(result).toEqual({ legal: false, reason: "NOT_IN_ATTACK_RANGE" });
    });
  });

  // -----------------------------------------------------------------------
  // HAMMER — attacks ORTH1 only (the 4 orthogonal neighbors). NOT diagonals,
  // NOT range 2. All melee.
  // -----------------------------------------------------------------------
  describe("hammer: attacks the 4 orthogonal neighbors (ORTH1) only", () => {
    it.each([...orth(1)])(
      "captures an enemy at orthogonal offset (%i,%i) as a melee swap",
      (dx, dy) => {
        const result = validateAttack("hammer", dx, dy);
        expect(result).toEqual({
          legal: true,
          kind: "attack",
          class: "melee",
          swaps: true,
        });
      },
    );

    it.each([
      [1, 1],
      [-1, 1],
      [1, -1],
      [-1, -1],
    ])("cannot attack a diagonal neighbor at (%i,%i)", (dx, dy) => {
      const result = validateAttack("hammer", dx, dy);
      expect(result).toEqual({ legal: false, reason: "NOT_IN_ATTACK_RANGE" });
    });

    it.each([...orth(2)])(
      "cannot attack an enemy 2 orthogonal away at (%i,%i)",
      (dx, dy) => {
        const result = validateAttack("hammer", dx, dy);
        expect(result).toEqual({ legal: false, reason: "NOT_IN_ATTACK_RANGE" });
      },
    );
  });

  // -----------------------------------------------------------------------
  // SPEAR — attacks ORTH1 (melee, swaps) AND ORTH2 (ranged, stays). No
  // diagonals, no range 3.
  // -----------------------------------------------------------------------
  describe("spear: ORTH1 melee (swaps) and ORTH2 ranged (no swap)", () => {
    it.each([...orth(1)])(
      "captures an adjacent orthogonal enemy at (%i,%i) as a melee swap",
      (dx, dy) => {
        const result = validateAttack("spear", dx, dy);
        expect(result).toEqual({
          legal: true,
          kind: "attack",
          class: "melee",
          swaps: true,
        });
      },
    );

    it.each([...orth(2)])(
      "captures an orthogonal enemy 2 away at (%i,%i) as a ranged non-swap",
      (dx, dy) => {
        const result = validateAttack("spear", dx, dy);
        expect(result).toEqual({
          legal: true,
          kind: "attack",
          class: "ranged",
          swaps: false,
        });
      },
    );

    it.each([
      [1, 1],
      [-1, 1],
      [1, -1],
      [-1, -1],
    ])("cannot attack a diagonal neighbor at (%i,%i)", (dx, dy) => {
      const result = validateAttack("spear", dx, dy);
      expect(result).toEqual({ legal: false, reason: "NOT_IN_ATTACK_RANGE" });
    });

    it.each([...orth(3)])(
      "cannot attack an enemy 3 orthogonal away at (%i,%i)",
      (dx, dy) => {
        const result = validateAttack("spear", dx, dy);
        expect(result).toEqual({ legal: false, reason: "NOT_IN_ATTACK_RANGE" });
      },
    );
  });

  // -----------------------------------------------------------------------
  // BOW — attacks ORTH2 and ORTH3 (always ranged, never swaps). Has NO
  // range-1 attack: an adjacent enemy is the blind spot -> NOT_IN_ATTACK_RANGE.
  // -----------------------------------------------------------------------
  describe("bow: ORTH2 and ORTH3 ranged, with an adjacent blind spot", () => {
    it.each([...orth(2)])(
      "captures an orthogonal enemy 2 away at (%i,%i) as a ranged non-swap",
      (dx, dy) => {
        const result = validateAttack("bow", dx, dy);
        expect(result).toEqual({
          legal: true,
          kind: "attack",
          class: "ranged",
          swaps: false,
        });
      },
    );

    it.each([...orth(3)])(
      "captures an orthogonal enemy 3 away at (%i,%i) as a ranged non-swap",
      (dx, dy) => {
        const result = validateAttack("bow", dx, dy);
        expect(result).toEqual({
          legal: true,
          kind: "attack",
          class: "ranged",
          swaps: false,
        });
      },
    );

    it.each([...orth(1)])(
      "BLIND SPOT: cannot attack an adjacent orthogonal enemy at (%i,%i)",
      (dx, dy) => {
        const result = validateAttack("bow", dx, dy);
        expect(result).toEqual({ legal: false, reason: "NOT_IN_ATTACK_RANGE" });
      },
    );

    it.each([
      [1, 1],
      [-1, 1],
      [1, -1],
      [-1, -1],
    ])(
      "BLIND SPOT: cannot attack an adjacent diagonal enemy at (%i,%i)",
      (dx, dy) => {
        const result = validateAttack("bow", dx, dy);
        expect(result).toEqual({ legal: false, reason: "NOT_IN_ATTACK_RANGE" });
      },
    );

    it("cannot attack a diagonal enemy 2 away (2,2) — bow is orthogonal-only", () => {
      const result = validateAttack("bow", 2, 2);
      expect(result).toEqual({ legal: false, reason: "NOT_IN_ATTACK_RANGE" });
    });
  });

  // -----------------------------------------------------------------------
  // KING — cannot attack at all (empty attack set). An enemy on any of the
  // king's MOVE squares (the 4 orthogonal neighbors) is a DESTINATION_OCCUPIED
  // case, not an attack; an enemy off the move set is NOT_IN_MOVE_RANGE.
  // -----------------------------------------------------------------------
  describe("king: cannot attack any square", () => {
    it.each([...orth(1)])(
      "an enemy on a king move square (%i,%i) is DESTINATION_OCCUPIED, never an attack",
      (dx, dy) => {
        const result = validateAttack("king", dx, dy);
        // Enemy occupies the orthogonal-neighbor square the king would move
        // into; king has no attack offsets, so this is not an attack. The
        // square is occupied by an enemy, but the king cannot capture: the
        // occupied move target resolves to NOT_IN_ATTACK_RANGE (offset is in
        // moves, not attacks; occupant is an enemy).
        expect(result).toEqual({ legal: false, reason: "NOT_IN_ATTACK_RANGE" });
      },
    );

    it.each([
      [1, 1],
      [2, 0],
      [0, 2],
    ])(
      "an enemy at (%i,%i) outside the king's move set is NOT_IN_ATTACK_RANGE",
      (dx, dy) => {
        const result = validateAttack("king", dx, dy);
        expect(result).toEqual({ legal: false, reason: "NOT_IN_ATTACK_RANGE" });
      },
    );

    it("legalActionsForPiece for a surrounded king yields zero attack actions", () => {
      // King at center, enemies on all four orthogonal neighbors. The king has
      // no legal action at all (every move square is blocked by an enemy and
      // it cannot capture).
      const state = makeState([
        { id: "K", type: "king", owner: "white", x: CENTER.x, y: CENTER.y },
        {
          id: "e1",
          type: "sword",
          owner: "black",
          x: CENTER.x + 1,
          y: CENTER.y,
        },
        {
          id: "e2",
          type: "sword",
          owner: "black",
          x: CENTER.x - 1,
          y: CENTER.y,
        },
        {
          id: "e3",
          type: "sword",
          owner: "black",
          x: CENTER.x,
          y: CENTER.y + 1,
        },
        {
          id: "e4",
          type: "sword",
          owner: "black",
          x: CENTER.x,
          y: CENTER.y - 1,
        },
      ]);
      expect(legalActionsForPiece(state, ruleset, "K")).toEqual([]);
    });
  });
});

describe("aiming an attack at an empty square -> NO_TARGET (spec §9, ENGINE_DESIGN §5.6)", () => {
  // The square is in the attacker's ATTACK set but holds no piece. This is
  // distinct from NOT_IN_ATTACK_RANGE (which is for squares not in the set).
  it("bow aimed 2 orthogonal away at an empty square is NO_TARGET", () => {
    const state = makeState([
      { id: "A", type: "bow", owner: "white", x: CENTER.x, y: CENTER.y },
    ]);
    const action: Action = { piece: "A", to: { x: CENTER.x + 2, y: CENTER.y } };
    expect(validateAction(state, ruleset, action)).toEqual({
      legal: false,
      reason: "NO_TARGET",
    });
  });

  it("bow aimed 3 orthogonal away at an empty square is NO_TARGET", () => {
    const state = makeState([
      { id: "A", type: "bow", owner: "white", x: CENTER.x, y: CENTER.y },
    ]);
    const action: Action = { piece: "A", to: { x: CENTER.x, y: CENTER.y - 3 } };
    expect(validateAction(state, ruleset, action)).toEqual({
      legal: false,
      reason: "NO_TARGET",
    });
  });

  it("spear aimed 2 orthogonal away at an empty square is NO_TARGET (range-2 is attack-only)", () => {
    // ORTH2 is in the spear's attack set but NOT its move set, so an empty
    // range-2 square is NO_TARGET, not a move.
    const state = makeState([
      { id: "A", type: "spear", owner: "white", x: CENTER.x, y: CENTER.y },
    ]);
    const action: Action = { piece: "A", to: { x: CENTER.x + 2, y: CENTER.y } };
    expect(validateAction(state, ruleset, action)).toEqual({
      legal: false,
      reason: "NO_TARGET",
    });
  });

  it("sword aimed at an empty neighbor is a MOVE, not NO_TARGET (neighbor is in its move set)", () => {
    // Contrast: the sword's neighbors are in BOTH its move and attack sets, so
    // an EMPTY neighbor resolves as a move (move set is checked first), never
    // NO_TARGET. This guards the resolution order in ENGINE_DESIGN §5.6.
    const state = makeState([
      { id: "A", type: "sword", owner: "white", x: CENTER.x, y: CENTER.y },
    ]);
    const action: Action = {
      piece: "A",
      to: { x: CENTER.x + 1, y: CENTER.y + 1 },
    };
    expect(validateAction(state, ruleset, action)).toEqual({
      legal: true,
      kind: "move",
      swaps: false,
    });
  });
});

describe("attacker cannot target a friendly piece on an attack square (spec §4)", () => {
  it("bow with a FRIENDLY piece 2 away is DESTINATION_OCCUPIED, not a capture", () => {
    const state = makeState([
      { id: "A", type: "bow", owner: "white", x: CENTER.x, y: CENTER.y },
      { id: "F", type: "sword", owner: "white", x: CENTER.x + 2, y: CENTER.y },
    ]);
    const action: Action = { piece: "A", to: { x: CENTER.x + 2, y: CENTER.y } };
    expect(validateAction(state, ruleset, action)).toEqual({
      legal: false,
      reason: "DESTINATION_OCCUPIED",
    });
  });

  it("sword with a FRIENDLY neighbor is DESTINATION_OCCUPIED, not a melee capture", () => {
    const state = makeState([
      { id: "A", type: "sword", owner: "white", x: CENTER.x, y: CENTER.y },
      { id: "F", type: "hammer", owner: "white", x: CENTER.x + 1, y: CENTER.y },
    ]);
    const action: Action = { piece: "A", to: { x: CENTER.x + 1, y: CENTER.y } };
    expect(validateAction(state, ruleset, action)).toEqual({
      legal: false,
      reason: "DESTINATION_OCCUPIED",
    });
  });
});

describe("legalActionsForPiece enumerates exactly the attack squares (spec §3)", () => {
  // Isolate the attack enumeration by ringing the attacker with enemies on
  // every square that could be an attack target, on an otherwise empty board.
  // Move squares that land on those enemies are excluded (occupied), so the
  // resulting actions are precisely the legal captures.

  it("bow surrounded by enemies at range 1/2/3 attacks only range 2 and 3 (blind spot at range 1)", () => {
    const enemies: PieceSpec[] = [];
    let n = 0;
    for (const dist of [1, 2, 3]) {
      for (const [dx, dy] of orth(dist)) {
        enemies.push({
          id: `e${n++}`,
          type: "sword",
          owner: "black",
          x: CENTER.x + dx,
          y: CENTER.y + dy,
        });
      }
    }
    const state = makeState([
      { id: "A", type: "bow", owner: "white", x: CENTER.x, y: CENTER.y },
      ...enemies,
    ]);

    const actions = legalActionsForPiece(state, ruleset, "A");
    const targets = actions
      .map((a) => `${a.to.x - CENTER.x},${a.to.y - CENTER.y}`)
      .sort();

    const expected = [...orth(2), ...orth(3)]
      .map(([dx, dy]) => `${dx},${dy}`)
      .sort();

    expect(targets).toEqual(expected);
  });

  it("hammer surrounded by enemies attacks only the 4 orthogonal neighbors", () => {
    // Enemies on all 8 neighbors. Hammer attacks ORTH1 only; the 4 diagonal
    // enemies sit on hammer move squares (occupied) so are not capturable.
    const enemies: PieceSpec[] = NEIGHBORS.map(([dx, dy], i) => ({
      id: `e${i}`,
      type: "sword",
      owner: "black",
      x: CENTER.x + dx,
      y: CENTER.y + dy,
    }));
    const state = makeState([
      { id: "A", type: "hammer", owner: "white", x: CENTER.x, y: CENTER.y },
      ...enemies,
    ]);

    const actions = legalActionsForPiece(state, ruleset, "A");
    const targets = actions
      .map((a) => `${a.to.x - CENTER.x},${a.to.y - CENTER.y}`)
      .sort();

    const expected = [...orth(1)].map(([dx, dy]) => `${dx},${dy}`).sort();
    expect(targets).toEqual(expected);
  });
});

describe("default ruleset attack tables match the spec (sanity on the data)", () => {
  // Directly assert the DATA the engine reads, so a balance patch that changes
  // an attack table is caught here too. (spec §3)
  const types = createInitialState(defaultRuleset).pieces; // proves ruleset loads
  void types;

  function attackSet(type: PieceTypeId): string[] {
    const def = defaultRuleset.pieceTypes[type];
    if (def === undefined) throw new Error(`missing piece type ${type}`);
    return def.attacks.map((o) => `${o.dx},${o.dy}`).sort();
  }

  it("king has an empty attack set", () => {
    expect(attackSet("king")).toEqual([]);
  });

  it("sword attacks exactly the 8 neighbors", () => {
    expect(attackSet("sword")).toEqual(
      NEIGHBORS.map(([dx, dy]) => `${dx},${dy}`).sort(),
    );
  });

  it("hammer attacks exactly ORTH1", () => {
    expect(attackSet("hammer")).toEqual(
      [...orth(1)].map(([dx, dy]) => `${dx},${dy}`).sort(),
    );
  });

  it("spear attacks exactly ORTH1 + ORTH2", () => {
    expect(attackSet("spear")).toEqual(
      [...orth(1), ...orth(2)].map(([dx, dy]) => `${dx},${dy}`).sort(),
    );
  });

  it("bow attacks exactly ORTH2 + ORTH3 (no range 1)", () => {
    expect(attackSet("bow")).toEqual(
      [...orth(2), ...orth(3)].map(([dx, dy]) => `${dx},${dy}`).sort(),
    );
  });
});
