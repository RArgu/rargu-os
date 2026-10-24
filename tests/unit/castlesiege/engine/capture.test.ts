import { describe, it, expect } from "vitest";
import {
  applyAction,
  validateAction,
} from "../../../../src/apps/castlesiege/engine/core.js";
import { defaultRuleset } from "../../../../src/apps/castlesiege/engine/rulesets/default.js";
import type {
  Action,
  ApplyResult,
  GameEvent,
  GameState,
  Piece,
  Ruleset,
} from "../../../../src/apps/castlesiege/engine/types.js";

// -------------------------------------------------------------------------
// Test scaffolding.
//
// Capture resolution is the contract under test. To isolate it from win
// conditions (regicide / castleClear / decapitation would otherwise fire and
// flip `status` to "won" as a side effect of removing pieces), we build a
// minimal ruleset whose piece types carry NO roles and NO active win
// conditions. The capture mechanics — move sets, attack sets, swap behavior —
// mirror the default ruleset's geometry exactly so the assertions still test
// real Castle Siege rules, just without the game ending underneath us.
//
// Offsets are copied verbatim from docs/RULES_SPEC.md §3.
// -------------------------------------------------------------------------

const N8 = [
  { dx: 1, dy: 0 },
  { dx: -1, dy: 0 },
  { dx: 0, dy: 1 },
  { dx: 0, dy: -1 },
  { dx: 1, dy: 1 },
  { dx: -1, dy: 1 },
  { dx: 1, dy: -1 },
  { dx: -1, dy: -1 },
];
const ORTH1 = [
  { dx: 1, dy: 0 },
  { dx: -1, dy: 0 },
  { dx: 0, dy: 1 },
  { dx: 0, dy: -1 },
];
const ORTH2 = [
  { dx: 2, dy: 0 },
  { dx: -2, dy: 0 },
  { dx: 0, dy: 2 },
  { dx: 0, dy: -2 },
];
const ORTH3 = [
  { dx: 3, dy: 0 },
  { dx: -3, dy: 0 },
  { dx: 0, dy: 3 },
  { dx: 0, dy: -3 },
];

// Roleless, win-condition-free clone of the default piece geometry.
const captureRuleset: Ruleset = {
  version: "capture-test@1.0.0",
  board: { width: 9, height: 9 },
  turnOrder: ["white", "black"],
  winConditions: [], // no win can fire while we test captures in isolation
  pieceTypes: {
    sword: { id: "sword", moves: [...N8, ...ORTH2], attacks: N8 },
    hammer: { id: "hammer", moves: N8, attacks: ORTH1 },
    spear: { id: "spear", moves: N8, attacks: [...ORTH1, ...ORTH2] },
    bow: { id: "bow", moves: ORTH1, attacks: [...ORTH2, ...ORTH3] },
    // A plain dummy victim with no defensive constraints.
    dummy: { id: "dummy", moves: [], attacks: [] },
    // A wall: only attackable by a hammer (defensive whitelist).
    wall: {
      id: "wall",
      moves: [],
      attacks: [],
      blocksPath: true,
      onlyAttackableBy: ["hammer"],
    },
  },
  setup: [],
};

/** Build a playing GameState from explicit pieces; white to move by default. */
function stateWith(
  pieces: Piece[],
  toMove = "white",
  ruleset: Ruleset = captureRuleset,
): GameState {
  return {
    rulesetVersion: ruleset.version,
    board: { width: ruleset.board.width, height: ruleset.board.height },
    pieces: pieces.map((p) => ({ ...p })),
    toMove,
    status: { state: "playing" },
  };
}

function findPiece(state: GameState, id: string): Piece | undefined {
  return state.pieces.find((p) => p.id === id);
}

function pieceAt(state: GameState, x: number, y: number): Piece | undefined {
  return state.pieces.find((p) => p.x === x && p.y === y);
}

function expectOk(
  result: ApplyResult,
): asserts result is { ok: true; state: GameState; events: GameEvent[] } {
  expect(result.ok).toBe(true);
}

function captureEvents(events: GameEvent[]) {
  return events.filter((e) => e.type === "captured");
}

// -------------------------------------------------------------------------
// MELEE captures — attacker SWAPS onto the victim square.
// -------------------------------------------------------------------------

describe("melee capture: attacker swaps onto the victim square", () => {
  it("sword captures an adjacent enemy and moves onto its square", () => {
    const attacker: Piece = {
      id: "white:sword:0",
      type: "sword",
      owner: "white",
      x: 4,
      y: 4,
    };
    const victim: Piece = {
      id: "black:dummy:0",
      type: "dummy",
      owner: "black",
      x: 5,
      y: 4,
    };
    const state = stateWith([attacker, victim]);
    const action: Action = { piece: "white:sword:0", to: { x: 5, y: 4 } };

    const validation = validateAction(state, captureRuleset, action);
    expect(validation).toEqual({
      legal: true,
      kind: "attack",
      class: "melee",
      swaps: true,
    });

    const result = applyAction(state, captureRuleset, action);
    expectOk(result);

    // Victim is gone.
    expect(findPiece(result.state, "black:dummy:0")).toBeUndefined();
    expect(result.state.pieces).toHaveLength(1);

    // Attacker swapped onto (5,4) — the former victim square.
    const moved = findPiece(result.state, "white:sword:0");
    expect(moved).toEqual({
      id: "white:sword:0",
      type: "sword",
      owner: "white",
      x: 5,
      y: 4,
    });
    expect(pieceAt(result.state, 5, 4)?.id).toBe("white:sword:0");
    expect(pieceAt(result.state, 4, 4)).toBeUndefined();

    // captured event: melee, swapped true.
    const caps = captureEvents(result.events);
    expect(caps).toEqual([
      {
        type: "captured",
        victim: "black:dummy:0",
        by: "white:sword:0",
        swapped: true,
        class: "melee",
      },
    ]);

    // Turn advances.
    expect(result.state.toMove).toBe("black");
  });

  it("sword captures a diagonal-adjacent enemy and swaps", () => {
    const attacker: Piece = {
      id: "white:sword:0",
      type: "sword",
      owner: "white",
      x: 4,
      y: 4,
    };
    const victim: Piece = {
      id: "black:dummy:0",
      type: "dummy",
      owner: "black",
      x: 5,
      y: 5,
    };
    const state = stateWith([attacker, victim]);
    const action: Action = { piece: "white:sword:0", to: { x: 5, y: 5 } };

    const result = applyAction(state, captureRuleset, action);
    expectOk(result);

    expect(findPiece(result.state, "black:dummy:0")).toBeUndefined();
    expect(findPiece(result.state, "white:sword:0")).toMatchObject({
      x: 5,
      y: 5,
    });
    expect(captureEvents(result.events)).toEqual([
      {
        type: "captured",
        victim: "black:dummy:0",
        by: "white:sword:0",
        swapped: true,
        class: "melee",
      },
    ]);
  });

  it("hammer captures an orthogonally-adjacent enemy and swaps", () => {
    const attacker: Piece = {
      id: "white:hammer:0",
      type: "hammer",
      owner: "white",
      x: 4,
      y: 4,
    };
    const victim: Piece = {
      id: "black:dummy:0",
      type: "dummy",
      owner: "black",
      x: 4,
      y: 5,
    };
    const state = stateWith([attacker, victim]);
    const action: Action = { piece: "white:hammer:0", to: { x: 4, y: 5 } };

    const validation = validateAction(state, captureRuleset, action);
    expect(validation).toEqual({
      legal: true,
      kind: "attack",
      class: "melee",
      swaps: true,
    });

    const result = applyAction(state, captureRuleset, action);
    expectOk(result);

    expect(findPiece(result.state, "black:dummy:0")).toBeUndefined();
    const moved = findPiece(result.state, "white:hammer:0");
    expect(moved).toMatchObject({ x: 4, y: 5 });
    expect(pieceAt(result.state, 4, 4)).toBeUndefined();
    expect(captureEvents(result.events)).toEqual([
      {
        type: "captured",
        victim: "black:dummy:0",
        by: "white:hammer:0",
        swapped: true,
        class: "melee",
      },
    ]);
  });

  it("hammer is the only piece that can capture a wall, and swaps onto it", () => {
    const hammer: Piece = {
      id: "white:hammer:0",
      type: "hammer",
      owner: "white",
      x: 3,
      y: 3,
    };
    const wall: Piece = {
      id: "black:wall:0",
      type: "wall",
      owner: "black",
      x: 4,
      y: 3,
    };
    const state = stateWith([hammer, wall]);
    const action: Action = { piece: "white:hammer:0", to: { x: 4, y: 3 } };

    const result = applyAction(state, captureRuleset, action);
    expectOk(result);

    expect(findPiece(result.state, "black:wall:0")).toBeUndefined();
    expect(findPiece(result.state, "white:hammer:0")).toMatchObject({
      x: 4,
      y: 3,
    });
    expect(captureEvents(result.events)).toEqual([
      {
        type: "captured",
        victim: "black:wall:0",
        by: "white:hammer:0",
        swapped: true,
        class: "melee",
      },
    ]);
  });

  it("spear capturing at RANGE 1 (adjacent) swaps onto the victim square", () => {
    const spear: Piece = {
      id: "white:spear:0",
      type: "spear",
      owner: "white",
      x: 4,
      y: 4,
    };
    const victim: Piece = {
      id: "black:dummy:0",
      type: "dummy",
      owner: "black",
      x: 5,
      y: 4,
    };
    const state = stateWith([spear, victim]);
    const action: Action = { piece: "white:spear:0", to: { x: 5, y: 4 } };

    const validation = validateAction(state, captureRuleset, action);
    expect(validation).toEqual({
      legal: true,
      kind: "attack",
      class: "melee",
      swaps: true,
    });

    const result = applyAction(state, captureRuleset, action);
    expectOk(result);

    expect(findPiece(result.state, "black:dummy:0")).toBeUndefined();
    // Spear moved in onto (5,4).
    expect(findPiece(result.state, "white:spear:0")).toMatchObject({
      x: 5,
      y: 4,
    });
    expect(pieceAt(result.state, 4, 4)).toBeUndefined();
    expect(captureEvents(result.events)).toEqual([
      {
        type: "captured",
        victim: "black:dummy:0",
        by: "white:spear:0",
        swapped: true,
        class: "melee",
      },
    ]);
  });
});

// -------------------------------------------------------------------------
// RANGED captures — attacker STAYS in place.
// -------------------------------------------------------------------------

describe("ranged capture: attacker stays in place", () => {
  it("spear capturing at RANGE 2 stays put (no swap)", () => {
    const spear: Piece = {
      id: "white:spear:0",
      type: "spear",
      owner: "white",
      x: 4,
      y: 4,
    };
    const victim: Piece = {
      id: "black:dummy:0",
      type: "dummy",
      owner: "black",
      x: 6,
      y: 4,
    };
    const state = stateWith([spear, victim]);
    const action: Action = { piece: "white:spear:0", to: { x: 6, y: 4 } };

    const validation = validateAction(state, captureRuleset, action);
    expect(validation).toEqual({
      legal: true,
      kind: "attack",
      class: "ranged",
      swaps: false,
    });

    const result = applyAction(state, captureRuleset, action);
    expectOk(result);

    expect(findPiece(result.state, "black:dummy:0")).toBeUndefined();
    expect(result.state.pieces).toHaveLength(1);

    // Spear did NOT move — still at (4,4); victim square (6,4) is now empty.
    expect(findPiece(result.state, "white:spear:0")).toEqual({
      id: "white:spear:0",
      type: "spear",
      owner: "white",
      x: 4,
      y: 4,
    });
    expect(pieceAt(result.state, 4, 4)?.id).toBe("white:spear:0");
    expect(pieceAt(result.state, 6, 4)).toBeUndefined();

    expect(captureEvents(result.events)).toEqual([
      {
        type: "captured",
        victim: "black:dummy:0",
        by: "white:spear:0",
        swapped: false,
        class: "ranged",
      },
    ]);
    expect(result.state.toMove).toBe("black");
  });

  it("bow capturing at RANGE 2 stays put (no swap)", () => {
    const bow: Piece = {
      id: "white:bow:0",
      type: "bow",
      owner: "white",
      x: 4,
      y: 4,
    };
    const victim: Piece = {
      id: "black:dummy:0",
      type: "dummy",
      owner: "black",
      x: 4,
      y: 6,
    };
    const state = stateWith([bow, victim]);
    const action: Action = { piece: "white:bow:0", to: { x: 4, y: 6 } };

    const validation = validateAction(state, captureRuleset, action);
    expect(validation).toEqual({
      legal: true,
      kind: "attack",
      class: "ranged",
      swaps: false,
    });

    const result = applyAction(state, captureRuleset, action);
    expectOk(result);

    expect(findPiece(result.state, "black:dummy:0")).toBeUndefined();
    expect(findPiece(result.state, "white:bow:0")).toEqual({
      id: "white:bow:0",
      type: "bow",
      owner: "white",
      x: 4,
      y: 4,
    });
    expect(pieceAt(result.state, 4, 6)).toBeUndefined();
    expect(captureEvents(result.events)).toEqual([
      {
        type: "captured",
        victim: "black:dummy:0",
        by: "white:bow:0",
        swapped: false,
        class: "ranged",
      },
    ]);
  });

  it("bow capturing at RANGE 3 stays put (no swap)", () => {
    const bow: Piece = {
      id: "white:bow:0",
      type: "bow",
      owner: "white",
      x: 1,
      y: 4,
    };
    const victim: Piece = {
      id: "black:dummy:0",
      type: "dummy",
      owner: "black",
      x: 4,
      y: 4,
    };
    const state = stateWith([bow, victim]);
    const action: Action = { piece: "white:bow:0", to: { x: 4, y: 4 } };

    const validation = validateAction(state, captureRuleset, action);
    expect(validation).toEqual({
      legal: true,
      kind: "attack",
      class: "ranged",
      swaps: false,
    });

    const result = applyAction(state, captureRuleset, action);
    expectOk(result);

    expect(findPiece(result.state, "black:dummy:0")).toBeUndefined();
    // Bow unmoved at (1,4).
    expect(findPiece(result.state, "white:bow:0")).toMatchObject({
      x: 1,
      y: 4,
    });
    expect(pieceAt(result.state, 4, 4)).toBeUndefined();
    expect(captureEvents(result.events)).toEqual([
      {
        type: "captured",
        victim: "black:dummy:0",
        by: "white:bow:0",
        swapped: false,
        class: "ranged",
      },
    ]);
  });
});

// -------------------------------------------------------------------------
// Cross-cutting invariants on capture resolution.
// -------------------------------------------------------------------------

describe("capture resolution invariants", () => {
  it("does not mutate the input state (purity)", () => {
    const spear: Piece = {
      id: "white:spear:0",
      type: "spear",
      owner: "white",
      x: 4,
      y: 4,
    };
    const victim: Piece = {
      id: "black:dummy:0",
      type: "dummy",
      owner: "black",
      x: 5,
      y: 4,
    };
    const state = stateWith([spear, victim]);
    const before = JSON.parse(JSON.stringify(state));

    const result = applyAction(state, captureRuleset, {
      piece: "white:spear:0",
      to: { x: 5, y: 4 },
    });
    expectOk(result);

    // Original state object is untouched.
    expect(state).toEqual(before);
    expect(state.pieces).toHaveLength(2);
    expect(findPiece(state, "black:dummy:0")).toBeDefined();
    expect(findPiece(state, "white:spear:0")).toMatchObject({ x: 4, y: 4 });
    // And the returned state is a distinct object.
    expect(result.state).not.toBe(state);
  });

  it("emits exactly one captured event with no stray moved event", () => {
    const sword: Piece = {
      id: "white:sword:0",
      type: "sword",
      owner: "white",
      x: 4,
      y: 4,
    };
    const victim: Piece = {
      id: "black:dummy:0",
      type: "dummy",
      owner: "black",
      x: 4,
      y: 5,
    };
    const state = stateWith([sword, victim]);
    const result = applyAction(state, captureRuleset, {
      piece: "white:sword:0",
      to: { x: 4, y: 5 },
    });
    expectOk(result);

    expect(result.events.filter((e) => e.type === "captured")).toHaveLength(1);
    expect(result.events.filter((e) => e.type === "moved")).toHaveLength(0);
  });

  it("removes only the victim, leaving bystander pieces intact", () => {
    const sword: Piece = {
      id: "white:sword:0",
      type: "sword",
      owner: "white",
      x: 4,
      y: 4,
    };
    const victim: Piece = {
      id: "black:dummy:0",
      type: "dummy",
      owner: "black",
      x: 5,
      y: 4,
    };
    const bystander: Piece = {
      id: "black:dummy:1",
      type: "dummy",
      owner: "black",
      x: 0,
      y: 0,
    };
    const friendly: Piece = {
      id: "white:dummy:0",
      type: "dummy",
      owner: "white",
      x: 8,
      y: 8,
    };
    const state = stateWith([sword, victim, bystander, friendly]);
    const result = applyAction(state, captureRuleset, {
      piece: "white:sword:0",
      to: { x: 5, y: 4 },
    });
    expectOk(result);

    expect(result.state.pieces).toHaveLength(3);
    expect(findPiece(result.state, "black:dummy:0")).toBeUndefined();
    expect(findPiece(result.state, "black:dummy:1")).toEqual(bystander);
    expect(findPiece(result.state, "white:dummy:0")).toEqual(friendly);
  });

  it("a melee swap does not displace or capture pieces along the (zero-length) path", () => {
    // Sanity: a range-1 capture has no intervening squares; only the victim
    // is removed and the attacker lands exactly on the victim square.
    const hammer: Piece = {
      id: "white:hammer:0",
      type: "hammer",
      owner: "white",
      x: 2,
      y: 2,
    };
    const victim: Piece = {
      id: "black:dummy:0",
      type: "dummy",
      owner: "black",
      x: 3,
      y: 2,
    };
    const behind: Piece = {
      id: "black:dummy:1",
      type: "dummy",
      owner: "black",
      x: 4,
      y: 2,
    };
    const state = stateWith([hammer, victim, behind]);
    const result = applyAction(state, captureRuleset, {
      piece: "white:hammer:0",
      to: { x: 3, y: 2 },
    });
    expectOk(result);

    expect(findPiece(result.state, "white:hammer:0")).toMatchObject({
      x: 3,
      y: 2,
    });
    expect(findPiece(result.state, "black:dummy:0")).toBeUndefined();
    expect(findPiece(result.state, "black:dummy:1")).toMatchObject({
      x: 4,
      y: 2,
    });
  });
});

// -------------------------------------------------------------------------
// Capture resolution against the REAL default ruleset (smoke check that the
// swap geometry holds with the shipped piece config, not only our clone).
// -------------------------------------------------------------------------

describe("capture resolution with the default ruleset geometry", () => {
  it("a default-ruleset sword melee-capture swaps onto the victim square", () => {
    // Use real default piece types but a hand-placed board to avoid win
    // conditions: white sword next to a lone black sword, plus extra black
    // pieces so decapitation/regicide/castleClear cannot fire.
    const pieces: Piece[] = [
      { id: "white:sword:0", type: "sword", owner: "white", x: 4, y: 4 },
      { id: "black:sword:0", type: "sword", owner: "black", x: 5, y: 4 },
      { id: "black:king:0", type: "king", owner: "black", x: 0, y: 7 },
      { id: "black:wall:0", type: "wall", owner: "black", x: 1, y: 7 },
      { id: "black:bow:0", type: "bow", owner: "black", x: 2, y: 7 },
    ];
    const state: GameState = {
      rulesetVersion: defaultRuleset.version,
      board: { width: 7, height: 8 },
      pieces,
      toMove: "white",
      status: { state: "playing" },
    };

    const action: Action = { piece: "white:sword:0", to: { x: 5, y: 4 } };
    const validation = validateAction(state, defaultRuleset, action);
    expect(validation).toEqual({
      legal: true,
      kind: "attack",
      class: "melee",
      swaps: true,
    });

    const result = applyAction(state, defaultRuleset, action);
    expectOk(result);
    expect(result.state.status).toEqual({ state: "playing" }); // no win fired
    expect(findPiece(result.state, "black:sword:0")).toBeUndefined();
    expect(findPiece(result.state, "white:sword:0")).toMatchObject({
      x: 5,
      y: 4,
    });
    expect(captureEvents(result.events)).toEqual([
      {
        type: "captured",
        victim: "black:sword:0",
        by: "white:sword:0",
        swapped: true,
        class: "melee",
      },
    ]);
  });

  it("a default-ruleset bow ranged-capture leaves the attacker in place", () => {
    const pieces: Piece[] = [
      { id: "white:bow:0", type: "bow", owner: "white", x: 3, y: 3 },
      { id: "black:sword:0", type: "sword", owner: "black", x: 3, y: 5 },
      { id: "black:king:0", type: "king", owner: "black", x: 0, y: 7 },
      { id: "black:wall:0", type: "wall", owner: "black", x: 1, y: 7 },
      // A 2nd black sword keeps black "armed" after the capture, so S017 militaryDefeat (reduced to
      // only non-offensive pieces) doesn't fire — this test is about ranged-capture geometry, not a win.
      { id: "black:sword:1", type: "sword", owner: "black", x: 5, y: 5 },
    ];
    const state: GameState = {
      rulesetVersion: defaultRuleset.version,
      board: { width: 7, height: 8 },
      pieces,
      toMove: "white",
      status: { state: "playing" },
    };

    const action: Action = { piece: "white:bow:0", to: { x: 3, y: 5 } };
    const validation = validateAction(state, defaultRuleset, action);
    expect(validation).toEqual({
      legal: true,
      kind: "attack",
      class: "ranged",
      swaps: false,
    });

    const result = applyAction(state, defaultRuleset, action);
    expectOk(result);
    expect(result.state.status).toEqual({ state: "playing" });
    expect(findPiece(result.state, "black:sword:0")).toBeUndefined();
    expect(findPiece(result.state, "white:bow:0")).toMatchObject({
      x: 3,
      y: 3,
    });
    expect(captureEvents(result.events)).toEqual([
      {
        type: "captured",
        victim: "black:sword:0",
        by: "white:bow:0",
        swapped: false,
        class: "ranged",
      },
    ]);
  });
});
