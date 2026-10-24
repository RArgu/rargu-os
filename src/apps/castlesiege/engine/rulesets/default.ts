import type { Offset, Placement, Ruleset } from "../types.js";

// Offset shorthands (omnidirectional — all directions listed explicitly).
const N8: Offset[] = [
  { dx: 1, dy: 0 },
  { dx: -1, dy: 0 },
  { dx: 0, dy: 1 },
  { dx: 0, dy: -1 },
  { dx: 1, dy: 1 },
  { dx: -1, dy: 1 },
  { dx: 1, dy: -1 },
  { dx: -1, dy: -1 },
];

const ORTH1: Offset[] = [
  { dx: 1, dy: 0 },
  { dx: -1, dy: 0 },
  { dx: 0, dy: 1 },
  { dx: 0, dy: -1 },
];

const ORTH2: Offset[] = [
  { dx: 2, dy: 0 },
  { dx: -2, dy: 0 },
  { dx: 0, dy: 2 },
  { dx: 0, dy: -2 },
];

const ORTH3: Offset[] = [
  { dx: 3, dy: 0 },
  { dx: -3, dy: 0 },
  { dx: 0, dy: 3 },
  { dx: 0, dy: -3 },
];

const setup: Placement[] = [
  // White — home rows y=0,1,2.
  { type: "bow", owner: "white", x: 0, y: 0 },
  { type: "king", owner: "white", x: 3, y: 0 },
  { type: "bow", owner: "white", x: 6, y: 0 },
  { type: "wall", owner: "white", x: 1, y: 1 },
  { type: "wall", owner: "white", x: 3, y: 1 },
  { type: "wall", owner: "white", x: 5, y: 1 },
  { type: "spear", owner: "white", x: 0, y: 2 },
  { type: "hammer", owner: "white", x: 1, y: 2 },
  { type: "sword", owner: "white", x: 2, y: 2 },
  { type: "hammer", owner: "white", x: 3, y: 2 },
  { type: "sword", owner: "white", x: 4, y: 2 },
  { type: "hammer", owner: "white", x: 5, y: 2 },
  { type: "spear", owner: "white", x: 6, y: 2 },
  // Black — mirror at y=8,7,6 (shifted +1 for the 7x9 board's middle no-man's-land).
  { type: "bow", owner: "black", x: 0, y: 8 },
  { type: "king", owner: "black", x: 3, y: 8 },
  { type: "bow", owner: "black", x: 6, y: 8 },
  { type: "wall", owner: "black", x: 1, y: 7 },
  { type: "wall", owner: "black", x: 3, y: 7 },
  { type: "wall", owner: "black", x: 5, y: 7 },
  { type: "spear", owner: "black", x: 0, y: 6 },
  { type: "hammer", owner: "black", x: 1, y: 6 },
  { type: "sword", owner: "black", x: 2, y: 6 },
  { type: "hammer", owner: "black", x: 3, y: 6 },
  { type: "sword", owner: "black", x: 4, y: 6 },
  { type: "hammer", owner: "black", x: 5, y: 6 },
  { type: "spear", owner: "black", x: 6, y: 6 },
];

// The FROZEN Markov ruleset (no anti-stalling rules). Old persisted games / saved logs were played
// under this and MUST still resolve to it (replay/registry.ts), so it is kept verbatim and never
// mutated. `decapitation` (reduced to lone King) stays here; `default@1.1.0` swaps it for the broader
// `militaryDefeat`. The byte-identical golden test compares against THIS object.
const RULES_1_0_0: Ruleset = {
  version: "default@1.0.0",
  board: { width: 7, height: 9 },
  turnOrder: ["white", "black"],
  winConditions: ["regicide", "castleClear", "decapitation"],
  pieceTypes: {
    king: {
      id: "king",
      moves: ORTH1,
      attacks: [],
      roles: ["royal"],
    },
    wall: {
      id: "wall",
      moves: [],
      attacks: [],
      blocksPath: true,
      onlyAttackableBy: ["hammer"],
      roles: ["castle"],
    },
    sword: {
      id: "sword",
      moves: [...N8, ...ORTH2],
      attacks: N8,
    },
    hammer: {
      id: "hammer",
      moves: N8,
      attacks: ORTH1,
    },
    spear: {
      id: "spear",
      moves: N8,
      attacks: [...ORTH1, ...ORTH2],
    },
    bow: {
      id: "bow",
      moves: ORTH1,
      attacks: [...ORTH2, ...ORTH3], // no range-1 = adjacent blind spot
    },
  },
  setup,
};

/** The frozen Markov v1 ruleset — exported for the version registry + the byte-identical golden
 *  test. Do NOT add anti-stalling fields here (that is what `default@1.1.0` is for). */
export const ruleset_1_0_0: Ruleset = RULES_1_0_0;

/**
 * The default ruleset (S017 — `default@1.1.0`). Same board/roster/pieces as `1.0.0` PLUS the
 * anti-stalling rules turned ON: a no-yield repetition ban (`repetitionLimit: 3`), a no-legal-move
 * loss (`noMovesLoses`), and `militaryDefeat` replacing `decapitation` in the win set (King + only
 * Walls, or a lone King, = a loss). Bumping the version is REQUIRED because turning the rules on
 * changes play; `1.0.0` stays frozen so old games/replays are faithful (docs/ANTI_STALLING.md §2.6).
 */
export const defaultRuleset: Ruleset = {
  ...RULES_1_0_0,
  version: "default@1.1.0",
  winConditions: ["regicide", "castleClear", "militaryDefeat"],
  repetitionLimit: 3,
  noMovesLoses: true,
  // noMovesWinCondition omitted ⇒ defaults to "noLegalMove".
};
