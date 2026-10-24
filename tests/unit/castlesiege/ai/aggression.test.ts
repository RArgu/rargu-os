import { describe, expect, it } from "vitest";
import {
  createInitialState,
  defaultRuleset,
  validateAction,
} from "../../../../src/apps/castlesiege/engine/index.js";
import {
  aggressionAgent,
  aggressionEval,
  clampAggression,
  KING_SCALE,
} from "../../../../src/apps/castlesiege/ai/aggression.js";
import { mulberry32 } from "../../../../src/apps/castlesiege/ai/rng.js";
import type {
  GameState,
  Ruleset,
} from "../../../../src/apps/castlesiege/ai/types.js";

function removeFirst(state: GameState, owner: string): GameState {
  const idx = state.pieces.findIndex((p) => p.owner === owner);
  return { ...state, pieces: state.pieces.filter((_, i) => i !== idx) };
}

// White king (2,0) hangs to the black bow (4,0) (range-2 along the row). Black king tucked at (0,1);
// the king has no attacks, so only WHITE's king is ever in danger here.
const KING_HANGS: Ruleset = {
  version: "aggr-kinghangs@1",
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

describe("clampAggression", () => {
  it("clamps to [−1,1] and maps NaN → 0", () => {
    expect(clampAggression(5)).toBe(1);
    expect(clampAggression(-3)).toBe(-1);
    expect(clampAggression(0.4)).toBeCloseTo(0.4, 9);
    expect(clampAggression(Number.NaN)).toBe(0);
  });
});

describe("aggressionEval", () => {
  it("a=0 is antisymmetric (eval(white) = −eval(black))", () => {
    const s = removeFirst(createInitialState(defaultRuleset), "black"); // imbalance → non-trivially nonzero
    const e0 = aggressionEval(0);
    expect(e0(s, defaultRuleset, "white")).toBeCloseTo(
      -e0(s, defaultRuleset, "black"),
      6,
    );
  });

  it("a=0 is ~zero at the mirrored start", () => {
    const s = createInitialState(defaultRuleset);
    expect(aggressionEval(0)(s, defaultRuleset, "white")).toBeCloseTo(0, 6);
  });

  it("a defender (−1) scores a hanging-own-king position 2·KING_SCALE below an attacker (+1)", () => {
    const s = createInitialState(KING_HANGS);
    const def = aggressionEval(-1)(s, KING_HANGS, "white");
    const atk = aggressionEval(1)(s, KING_HANGS, "white");
    // Identical material + mobility; only the own-king penalty differs (def = base − 2·KS, atk = base).
    expect(atk - def).toBeCloseTo(2 * KING_SCALE, 6);
    expect(def).toBeLessThan(atk);
  });

  it("the enemy-king-threat bonus increases monotonically with aggression", () => {
    // From BLACK's POV black threatens white's king → its bonus = KING_SCALE·(1+a), rising with a.
    const s = createInitialState(KING_HANGS);
    const lo = aggressionEval(-1)(s, KING_HANGS, "black");
    const mid = aggressionEval(0)(s, KING_HANGS, "black");
    const hi = aggressionEval(1)(s, KING_HANGS, "black");
    expect(mid).toBeGreaterThan(lo);
    expect(hi).toBeGreaterThan(mid);
  });
});

describe("aggressionAgent", () => {
  it("returns only legal actions and is reproducible under a fixed seed", () => {
    const s = createInitialState(defaultRuleset);
    const a1 = aggressionAgent(1, { maxDepth: 2 })(mulberry32(5)).selectAction(
      s,
      defaultRuleset,
    );
    expect(validateAction(s, defaultRuleset, a1).legal).toBe(true);
    const a2 = aggressionAgent(1, { maxDepth: 2 })(mulberry32(5)).selectAction(
      s,
      defaultRuleset,
    );
    expect(a2).toEqual(a1);
  });

  it("an attacker (+1) takes a handed regicide; the same is true under a node budget", () => {
    // 5x1: white bow at (0,0) can snipe the black king at (2,0) (range-2). Any dial should take a win.
    const ruleset: Ruleset = {
      version: "aggr-winin1@1",
      board: { width: 5, height: 1 },
      turnOrder: ["white", "black"],
      winConditions: ["regicide"],
      pieceTypes: defaultRuleset.pieceTypes,
      setup: [
        { type: "bow", owner: "white", x: 0, y: 0 },
        { type: "king", owner: "black", x: 2, y: 0 },
        { type: "sword", owner: "black", x: 4, y: 0 },
      ],
    };
    const s = createInitialState(ruleset);
    expect(
      aggressionAgent(1, { maxDepth: 2 })(mulberry32(1)).selectAction(
        s,
        ruleset,
      ).to,
    ).toEqual({ x: 2, y: 0 });
    expect(
      aggressionAgent(1, { nodeBudget: 3000, useTT: true })(
        mulberry32(1),
      ).selectAction(s, ruleset).to,
    ).toEqual({ x: 2, y: 0 });
  });
});
