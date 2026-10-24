import { describe, it, expect } from "vitest";
import {
  applyAction,
  createInitialState,
  legalActions,
  legalActionsForPiece,
  validateAction,
} from "../../../../src/apps/castlesiege/engine/core.js";
import type {
  GameState,
  Ruleset,
} from "../../../../src/apps/castlesiege/engine/types.js";

// Multi-player turnOrder coverage (ENGINE_DESIGN §2: "list-based for >2 later").
// The engine's turn rotation is `turnOrder[(idx + 1) % length]` — these tests pin
// the wrap-around behavior for a 3-player list, which no 2-player suite exercises.
// Win conditions are kept EMPTY: the win predicates are 2-player constructs
// (`opponentOf` = the first other player) and are out of scope for >2 players.

const ORTH1 = [
  { dx: 1, dy: 0 },
  { dx: -1, dy: 0 },
  { dx: 0, dy: 1 },
  { dx: 0, dy: -1 },
];

const threePlayerRuleset: Ruleset = {
  version: "trio@1.0.0",
  board: { width: 5, height: 5 },
  turnOrder: ["red", "green", "blue"],
  winConditions: [],
  pieceTypes: {
    runner: { id: "runner", moves: ORTH1, attacks: [] },
  },
  setup: [
    { type: "runner", owner: "red", x: 0, y: 0 },
    { type: "runner", owner: "green", x: 2, y: 2 },
    { type: "runner", owner: "blue", x: 4, y: 4 },
  ],
};

/** Apply the mover's first legal action; return the next state. */
function playAnyMove(state: GameState, ruleset: Ruleset): GameState {
  const action = legalActions(state, ruleset)[0];
  expect(action).toBeDefined();
  const res = applyAction(state, ruleset, action!);
  expect(res.ok).toBe(true);
  if (!res.ok) throw new Error("unreachable");
  return res.state;
}

describe("multi-player turnOrder rotation and wrap", () => {
  it("starts with turnOrder[0]", () => {
    const state = createInitialState(threePlayerRuleset);
    expect(state.toMove).toBe("red");
  });

  it("rotates red -> green -> blue and wraps back to red", () => {
    let state = createInitialState(threePlayerRuleset);
    const seen: string[] = [state.toMove];
    for (let i = 0; i < 6; i++) {
      state = playAnyMove(state, threePlayerRuleset);
      seen.push(state.toMove);
    }
    // Two full cycles: the wrap at blue -> red happens twice and stays stable.
    expect(seen).toEqual([
      "red",
      "green",
      "blue",
      "red",
      "green",
      "blue",
      "red",
    ]);
  });

  it("legalActions enumerates ONLY the side to move at every step of the cycle", () => {
    let state = createInitialState(threePlayerRuleset);
    for (let i = 0; i < 6; i++) {
      const mover = state.toMove;
      const actions = legalActions(state, threePlayerRuleset);
      expect(actions.length).toBeGreaterThan(0);
      for (const a of actions) {
        const owner = state.pieces.find((p) => p.id === a.piece)?.owner;
        expect(owner).toBe(mover);
      }
      state = playAnyMove(state, threePlayerRuleset);
    }
  });

  it("a non-mover's piece is NOT_YOUR_PIECE even though its owner moves later this cycle", () => {
    const state = createInitialState(threePlayerRuleset); // red to move
    const res = validateAction(state, threePlayerRuleset, {
      piece: "blue:runner:0",
      to: { x: 4, y: 3 },
    });
    expect(res).toEqual({ legal: false, reason: "NOT_YOUR_PIECE" });
  });

  it("legalActionsForPiece is empty for every non-mover piece in a 3-player game", () => {
    const state = createInitialState(threePlayerRuleset); // red to move
    expect(
      legalActionsForPiece(state, threePlayerRuleset, "green:runner:0"),
    ).toEqual([]);
    expect(
      legalActionsForPiece(state, threePlayerRuleset, "blue:runner:0"),
    ).toEqual([]);
    expect(
      legalActionsForPiece(state, threePlayerRuleset, "red:runner:0").length,
    ).toBeGreaterThan(0);
  });

  it("the wrap survives a hand-built state whose toMove is the LAST player", () => {
    const state: GameState = {
      rulesetVersion: threePlayerRuleset.version,
      board: { width: 5, height: 5 },
      pieces: [
        { id: "blue:runner:0", type: "runner", owner: "blue", x: 4, y: 4 },
        { id: "red:runner:0", type: "runner", owner: "red", x: 0, y: 0 },
      ],
      toMove: "blue",
      status: { state: "playing" },
    };
    const res = applyAction(state, threePlayerRuleset, {
      piece: "blue:runner:0",
      to: { x: 4, y: 3 },
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.state.toMove).toBe("red");
  });
});
