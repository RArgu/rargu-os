import { describe, it, expect } from "vitest";
import {
  createInitialState,
  validateAction,
  applyAction,
} from "../../../../src/apps/castlesiege/engine/core.js";
import type { Ruleset } from "../../../../src/apps/castlesiege/engine/types.js";

// Supplementary edge-case coverage (from the build's completeness critic +
// adversarial review): generic-ruleset robustness that the default ruleset
// alone never exercises.

describe("win predicates do not fire vacuously for rulesets lacking the role", () => {
  // No royal and no castle pieces anywhere, yet all three win conditions active.
  const noRolesRuleset: Ruleset = {
    version: "no-roles@1.0.0",
    board: { width: 5, height: 5 },
    turnOrder: ["white", "black"],
    winConditions: ["regicide", "castleClear", "decapitation"],
    pieceTypes: {
      pawn: {
        id: "pawn",
        moves: [
          { dx: 0, dy: 1 },
          { dx: 0, dy: -1 },
        ],
        attacks: [],
      },
    },
    setup: [
      { type: "pawn", owner: "white", x: 0, y: 0 },
      { type: "pawn", owner: "black", x: 4, y: 4 },
    ],
  };

  it("a legal move does not trigger regicide/castleClear/decapitation when those roles were never present", () => {
    const state = createInitialState(noRolesRuleset);
    const res = applyAction(state, noRolesRuleset, {
      piece: "white:pawn:0",
      to: { x: 0, y: 1 },
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.state.status).toEqual({ state: "playing" });
      expect(res.events.some((e) => e.type === "won")).toBe(false);
    }
  });
});

describe("diagonal path blocking (blocksPath on a same-diagonal intervening square)", () => {
  const diagRuleset: Ruleset = {
    version: "diag@1.0.0",
    board: { width: 5, height: 5 },
    turnOrder: ["white", "black"],
    winConditions: [],
    pieceTypes: {
      runner: { id: "runner", moves: [{ dx: 2, dy: 2 }], attacks: [] },
      block: { id: "block", moves: [], attacks: [], blocksPath: true },
    },
    setup: [
      { type: "runner", owner: "white", x: 0, y: 0 },
      { type: "block", owner: "black", x: 1, y: 1 }, // on the (0,0)->(2,2) diagonal
    ],
  };

  it("a wall on the diagonal blocks a range-2 diagonal move", () => {
    const state = createInitialState(diagRuleset);
    const res = validateAction(state, diagRuleset, {
      piece: "white:runner:0",
      to: { x: 2, y: 2 },
    });
    expect(res).toEqual({ legal: false, reason: "PATH_BLOCKED" });
  });

  it("a blocker OFF the diagonal does not block (knight-style leaps are never blocked)", () => {
    const offDiag: Ruleset = {
      ...diagRuleset,
      setup: [
        { type: "runner", owner: "white", x: 0, y: 0 },
        { type: "block", owner: "black", x: 1, y: 0 }, // off the diagonal
      ],
    };
    const state = createInitialState(offDiag);
    const res = validateAction(state, offDiag, {
      piece: "white:runner:0",
      to: { x: 2, y: 2 },
    });
    expect(res).toEqual({ legal: true, kind: "move", swaps: false });
  });
});

describe("defensive-field edge cases", () => {
  it("onlyAttackableBy:[] (present but empty) means anyone may attack", () => {
    const ruleset: Ruleset = {
      version: "open@1.0.0",
      board: { width: 5, height: 5 },
      turnOrder: ["white", "black"],
      winConditions: [],
      pieceTypes: {
        sword: {
          id: "sword",
          moves: [{ dx: 1, dy: 0 }],
          attacks: [{ dx: 1, dy: 0 }],
        },
        open: { id: "open", moves: [], attacks: [], onlyAttackableBy: [] },
      },
      setup: [
        { type: "sword", owner: "white", x: 0, y: 0 },
        { type: "open", owner: "black", x: 1, y: 0 },
      ],
    };
    const state = createInitialState(ruleset);
    const res = validateAction(state, ruleset, {
      piece: "white:sword:0",
      to: { x: 1, y: 0 },
    });
    expect(res).toEqual({
      legal: true,
      kind: "attack",
      swaps: true,
      class: "melee",
    });
  });

  it("immuneTo:[] (present but empty) grants no immunity — melee AND ranged both land", () => {
    const ruleset: Ruleset = {
      version: "no-immunity@1.0.0",
      board: { width: 5, height: 5 },
      turnOrder: ["white", "black"],
      winConditions: [],
      pieceTypes: {
        sword: { id: "sword", moves: [], attacks: [{ dx: 1, dy: 0 }] },
        archer: { id: "archer", moves: [], attacks: [{ dx: 2, dy: 0 }] },
        open: { id: "open", moves: [], attacks: [], immuneTo: [] },
      },
      setup: [
        { type: "sword", owner: "white", x: 0, y: 0 },
        { type: "open", owner: "black", x: 1, y: 0 },
        { type: "archer", owner: "white", x: 0, y: 1 },
        { type: "open", owner: "black", x: 2, y: 1 },
      ],
    };
    const state = createInitialState(ruleset);
    const melee = validateAction(state, ruleset, {
      piece: "white:sword:0",
      to: { x: 1, y: 0 },
    });
    expect(melee).toEqual({
      legal: true,
      kind: "attack",
      swaps: true,
      class: "melee",
    });
    const ranged = validateAction(state, ruleset, {
      piece: "white:archer:0",
      to: { x: 2, y: 1 },
    });
    expect(ranged).toEqual({
      legal: true,
      kind: "attack",
      swaps: false,
      class: "ranged",
    });
  });

  it("TARGET_INVULNERABLE is checked before TARGET_IMMUNE (precedence)", () => {
    // Ranged attacker that is neither a hammer (whitelist) nor allowed to hit a
    // ranged-immune target. Both checks would fail; INVULNERABLE must win.
    const ruleset: Ruleset = {
      version: "precedence@1.0.0",
      board: { width: 6, height: 6 },
      turnOrder: ["white", "black"],
      winConditions: [],
      pieceTypes: {
        archer: { id: "archer", moves: [], attacks: [{ dx: 2, dy: 0 }] },
        fort: {
          id: "fort",
          moves: [],
          attacks: [],
          onlyAttackableBy: ["hammer"],
          immuneTo: ["ranged"],
        },
      },
      setup: [
        { type: "archer", owner: "white", x: 0, y: 0 },
        { type: "fort", owner: "black", x: 2, y: 0 },
      ],
    };
    const state = createInitialState(ruleset);
    const res = validateAction(state, ruleset, {
      piece: "white:archer:0",
      to: { x: 2, y: 0 },
    });
    expect(res).toEqual({ legal: false, reason: "TARGET_INVULNERABLE" });
  });
});
