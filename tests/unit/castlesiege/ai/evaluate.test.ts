import { describe, expect, it } from "vitest";
import {
  createInitialState,
  defaultRuleset,
} from "../../../../src/apps/castlesiege/engine/index.js";
import { evaluate } from "../../../../src/apps/castlesiege/ai/evaluate.js";
import type {
  GameState,
  Ruleset,
} from "../../../../src/apps/castlesiege/ai/types.js";

function removeFirst(state: GameState, owner: string): GameState {
  const idx = state.pieces.findIndex((p) => p.owner === owner);
  return { ...state, pieces: state.pieces.filter((_, i) => i !== idx) };
}

describe("evaluate", () => {
  it("is ~zero and symmetric at the mirrored start", () => {
    const s = createInitialState(defaultRuleset);
    expect(evaluate(s, defaultRuleset, "white")).toBeCloseTo(0, 6);
    expect(evaluate(s, defaultRuleset, "white")).toBeCloseTo(
      -evaluate(s, defaultRuleset, "black"),
      6,
    );
  });

  it("favors the side with more material (and is antisymmetric in player)", () => {
    const s = removeFirst(createInitialState(defaultRuleset), "black");
    expect(evaluate(s, defaultRuleset, "white")).toBeGreaterThan(0);
    expect(evaluate(s, defaultRuleset, "black")).toBeLessThan(0);
    expect(evaluate(s, defaultRuleset, "white")).toBeCloseTo(
      -evaluate(s, defaultRuleset, "black"),
      6,
    );
  });

  it("penalizes a king that can be captured next ply", () => {
    // White king on (2,0) is attackable by the black bow on (4,0) (range-2 along the row).
    const ruleset: Ruleset = {
      version: "kingdanger@1",
      board: { width: 5, height: 2 },
      turnOrder: ["white", "black"],
      winConditions: ["regicide"],
      pieceTypes: defaultRuleset.pieceTypes,
      setup: [
        { type: "king", owner: "white", x: 2, y: 0 },
        { type: "king", owner: "black", x: 0, y: 1 },
        { type: "bow", owner: "black", x: 4, y: 0 },
      ],
    };
    const s = createInitialState(ruleset);
    expect(evaluate(s, ruleset, "white")).toBeLessThan(0);
  });
});
