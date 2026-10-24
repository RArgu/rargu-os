import { describe, it, expect } from "vitest";
import {
  applyAction,
  createInitialState,
  legalActions,
  legalActionsForPiece,
  validateAction,
} from "../../../../src/apps/castlesiege/engine/core.js";
import { positionKey } from "../../../../src/apps/castlesiege/engine/position.js";
import type {
  Action,
  GameState,
  Offset,
  Piece,
  Ruleset,
} from "../../../../src/apps/castlesiege/engine/types.js";

// ---------------------------------------------------------------------------
// S017 anti-stalling rules (docs/ANTI_STALLING.md) — the acceptance suite (D7):
//   - the no-yield repetition ban (positionKey + repetitionLimit),
//   - the `militaryDefeat` win condition (reduced to no offensive pieces),
//   - the `noMovesLoses` terminal,
//   - win-first ordering, serialization, immutability, the malformed guard,
//   - and the Markov path staying unchanged when the rules are absent.
// Small hand-built rulesets give exact control; `positionCounts` is seeded
// directly to place a position at the limit deterministically.
// ---------------------------------------------------------------------------

const ORTH1: Offset[] = [
  { dx: 1, dy: 0 },
  { dx: -1, dy: 0 },
  { dx: 0, dy: 1 },
  { dx: 0, dy: -1 },
];

// king = royal, non-offensive (no attacks); runner = offensive (orth attack); wall = passive blocker.
const PIECE_TYPES: Ruleset["pieceTypes"] = {
  king: { id: "king", moves: ORTH1, attacks: [], roles: ["royal"] },
  runner: { id: "runner", moves: ORTH1, attacks: ORTH1 },
  wall: {
    id: "wall",
    moves: [],
    attacks: [],
    blocksPath: true,
    onlyAttackableBy: ["hammer"],
    roles: ["castle"],
  },
};

// Repetition ban + no-moves-loses, on a 5x5 board. NO castleClear (black often has no wall here, and a
// vacuous castleClear would fire) — regicide + militaryDefeat suffice.
const banRuleset: Ruleset = {
  version: "ban-test@1",
  board: { width: 5, height: 5 },
  turnOrder: ["white", "black"],
  winConditions: ["regicide", "militaryDefeat"],
  repetitionLimit: 3,
  noMovesLoses: true,
  pieceTypes: PIECE_TYPES,
  setup: [],
};

// Same, smaller, for the boxed-in / no-moves terminal.
const noMovesRuleset: Ruleset = {
  ...banRuleset,
  version: "nomoves-test@1",
  board: { width: 3, height: 3 },
};

// Win-condition isolation: no repetition, no-moves OFF (so only the standard win conditions fire).
const winRuleset: Ruleset = {
  version: "win-test@1",
  board: { width: 5, height: 5 },
  turnOrder: ["white", "black"],
  winConditions: ["regicide", "militaryDefeat"],
  pieceTypes: PIECE_TYPES,
  setup: [],
};

function mkState(
  pieces: Piece[],
  toMove: string,
  ruleset: Ruleset,
  positionCounts?: Record<string, number>,
): GameState {
  const s: GameState = {
    rulesetVersion: ruleset.version,
    board: { width: ruleset.board.width, height: ruleset.board.height },
    pieces,
    toMove,
    status: { state: "playing" },
  };
  if (positionCounts !== undefined) s.positionCounts = positionCounts;
  return s;
}

const sortActions = (a: Action[]): Action[] =>
  [...a].sort((x, y) => JSON.stringify(x).localeCompare(JSON.stringify(y)));

// ---------------------------------------------------------------------------
describe("repetition ban (no-yield)", () => {
  // A controlled board: white runner at (1,1), kings + a black runner out of the way.
  const piecesNow: Piece[] = [
    { id: "white:king:0", type: "king", owner: "white", x: 0, y: 0 },
    { id: "white:runner:0", type: "runner", owner: "white", x: 1, y: 1 },
    { id: "black:king:0", type: "king", owner: "black", x: 4, y: 4 },
    { id: "black:runner:0", type: "runner", owner: "black", x: 3, y: 3 },
  ];
  const banned: Action = { piece: "white:runner:0", to: { x: 2, y: 1 } };
  // The position that move (1,1)->(2,1) would create (white runner at (2,1), black to move).
  const afterPieces = piecesNow.map((p) =>
    p.id === "white:runner:0" ? { ...p, x: 2, y: 1 } : p,
  );
  const afterKey = positionKey({ pieces: afterPieces, toMove: "black" });
  const nowKey = positionKey({ pieces: piecesNow, toMove: "white" });

  it("bans the move that would create the (limit+1)th occurrence of a position", () => {
    const state = mkState(piecesNow, "white", banRuleset, {
      [afterKey]: 3,
      [nowKey]: 1,
    });
    expect(validateAction(state, banRuleset, banned)).toEqual({
      legal: false,
      reason: "REPETITION",
    });
    const la = legalActions(state, banRuleset);
    expect(la).not.toContainEqual(banned);
    // The piece still has non-repeating moves (no yield needed — there IS an alternative).
    expect(la).toContainEqual({ piece: "white:runner:0", to: { x: 1, y: 2 } });
    // Every action legalActions offers is accepted by validateAction (the consistency invariant).
    for (const a of la)
      expect(validateAction(state, banRuleset, a).legal).toBe(true);
  });

  it("allows the move while the resulting position is still below the limit", () => {
    const state = mkState(piecesNow, "white", banRuleset, {
      [afterKey]: 2,
      [nowKey]: 1,
    });
    expect(validateAction(state, banRuleset, banned).legal).toBe(true);
    expect(legalActions(state, banRuleset)).toContainEqual(banned);
  });

  it("REPETITION is reachable via a direct validateAction (the validate-only surface)", () => {
    const state = mkState(piecesNow, "white", banRuleset, { [afterKey]: 3 });
    const v = validateAction(state, banRuleset, banned);
    expect(v.legal).toBe(false);
    if (!v.legal) expect(v.reason).toBe("REPETITION");
  });

  it("legalActions equals the union of legalActionsForPiece under the rule (gate active)", () => {
    const state = mkState(piecesNow, "white", banRuleset, {
      [afterKey]: 3,
      [nowKey]: 1,
    });
    const all = legalActions(state, banRuleset);
    const union = state.pieces
      .filter((p) => p.owner === "white")
      .flatMap((p) => legalActionsForPiece(state, banRuleset, p.id));
    expect(sortActions(all)).toEqual(sortActions(union));
  });

  it("does not ban repeats when the ruleset has no repetitionLimit (Markov path)", () => {
    const { repetitionLimit: _omit, ...markov } = banRuleset;
    // Even a (here meaningless) seeded count is ignored when the ban is off.
    const state = mkState(piecesNow, "white", markov as Ruleset, {
      [afterKey]: 99,
    });
    expect(validateAction(state, markov as Ruleset, banned).legal).toBe(true);
  });
});

// ---------------------------------------------------------------------------
describe("militaryDefeat win condition", () => {
  it("wins when the opponent is reduced to King + only Walls", () => {
    const pieces: Piece[] = [
      { id: "white:king:0", type: "king", owner: "white", x: 0, y: 0 },
      { id: "white:runner:0", type: "runner", owner: "white", x: 2, y: 1 },
      { id: "black:king:0", type: "king", owner: "black", x: 4, y: 4 },
      { id: "black:wall:0", type: "wall", owner: "black", x: 4, y: 3 },
      { id: "black:runner:0", type: "runner", owner: "black", x: 2, y: 2 },
    ];
    const applied = applyAction(
      mkState(pieces, "white", winRuleset),
      winRuleset,
      {
        piece: "white:runner:0",
        to: { x: 2, y: 2 }, // melee-capture black's last offensive piece; black left with King + Wall
      },
    );
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    expect(applied.state.status).toEqual({
      state: "won",
      winner: "white",
      by: "militaryDefeat",
    });
  });

  it("subsumes decapitation: reducing the opponent to a lone King wins by militaryDefeat", () => {
    const pieces: Piece[] = [
      { id: "white:king:0", type: "king", owner: "white", x: 0, y: 0 },
      { id: "white:runner:0", type: "runner", owner: "white", x: 2, y: 1 },
      { id: "black:king:0", type: "king", owner: "black", x: 4, y: 4 },
      { id: "black:runner:0", type: "runner", owner: "black", x: 2, y: 2 },
    ];
    const applied = applyAction(
      mkState(pieces, "white", winRuleset),
      winRuleset,
      {
        piece: "white:runner:0",
        to: { x: 2, y: 2 },
      },
    );
    expect(applied.ok && applied.state.status).toEqual({
      state: "won",
      winner: "white",
      by: "militaryDefeat",
    });
  });

  it("does NOT fire while the opponent keeps an offensive piece", () => {
    const pieces: Piece[] = [
      { id: "white:king:0", type: "king", owner: "white", x: 0, y: 0 },
      { id: "white:runner:0", type: "runner", owner: "white", x: 2, y: 1 },
      { id: "black:king:0", type: "king", owner: "black", x: 4, y: 4 },
      { id: "black:runner:0", type: "runner", owner: "black", x: 2, y: 2 },
      { id: "black:runner:1", type: "runner", owner: "black", x: 0, y: 4 },
    ];
    const applied = applyAction(
      mkState(pieces, "white", winRuleset),
      winRuleset,
      {
        piece: "white:runner:0",
        to: { x: 2, y: 2 }, // capture one of black's two runners; one offensive piece survives
      },
    );
    expect(applied.ok && applied.state.status).toEqual({ state: "playing" });
  });

  it("never fires vacuously for a ruleset with no offensive piece type", () => {
    const passive: Ruleset = {
      version: "passive@1",
      board: { width: 3, height: 3 },
      turnOrder: ["white", "black"],
      winConditions: ["militaryDefeat"],
      pieceTypes: {
        king: { id: "king", moves: ORTH1, attacks: [], roles: ["royal"] },
      },
      setup: [],
    };
    const pieces: Piece[] = [
      { id: "white:king:0", type: "king", owner: "white", x: 0, y: 0 },
      { id: "black:king:0", type: "king", owner: "black", x: 2, y: 2 },
    ];
    const applied = applyAction(mkState(pieces, "white", passive), passive, {
      piece: "white:king:0",
      to: { x: 0, y: 1 },
    });
    // Both sides hold only a (non-offensive) King, but no piece type can attack, so militaryDefeat is
    // meaningless and must not fire — the game continues.
    expect(applied.ok && applied.state.status).toEqual({ state: "playing" });
  });
});

// ---------------------------------------------------------------------------
describe("noMovesLoses terminal", () => {
  // 3x3: black King(0,0) + an offensive Runner(1,0), both walled in by WHITE walls (invulnerable to
  // the runner). Black is genuinely boxed but NOT militarily defeated (it keeps an offensive piece).
  const boxedPieces: Piece[] = [
    { id: "white:king:0", type: "king", owner: "white", x: 2, y: 2 },
    { id: "white:wall:0", type: "wall", owner: "white", x: 0, y: 1 },
    { id: "white:wall:1", type: "wall", owner: "white", x: 2, y: 0 },
    { id: "white:wall:2", type: "wall", owner: "white", x: 1, y: 1 },
    { id: "black:king:0", type: "king", owner: "black", x: 0, y: 0 },
    { id: "black:runner:0", type: "runner", owner: "black", x: 1, y: 0 },
  ];

  it("a boxed-in side (with a trapped offensive piece) loses by noLegalMove, NOT militaryDefeat", () => {
    const applied = applyAction(
      mkState(boxedPieces, "white", noMovesRuleset),
      noMovesRuleset,
      {
        piece: "white:king:0",
        to: { x: 2, y: 1 }, // a harmless white move; black is then stuck
      },
    );
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    expect(applied.state.status).toEqual({
      state: "won",
      winner: "white",
      by: "noLegalMove",
    });
    expect(applied.events).toContainEqual({
      type: "won",
      winner: "white",
      by: "noLegalMove",
    });
  });

  it("a side whose EVERY base-legal move is repetition-banned loses by noLegalMove (the ban's teeth)", () => {
    // The deepest coupled path: finalize → hasAnyLegalAction (repetition-aware) →
    // wouldRepeat → forward-safety (hasAnyBaseLegalAction). 3x3, runners only, NO
    // board-pattern win conditions (so nothing fires vacuously and the ban alone
    // decides). Black's runner at the corner has exactly two base-legal moves;
    // both resulting positions are seeded AT the limit, so after white's quiet
    // move black is repetition-stuck — not base-boxed — and loses.
    const repRuleset: Ruleset = {
      version: "rep-teeth@1",
      board: { width: 3, height: 3 },
      turnOrder: ["white", "black"],
      winConditions: [],
      repetitionLimit: 3,
      noMovesLoses: true,
      pieceTypes: { runner: PIECE_TYPES["runner"]! },
      setup: [],
    };
    const whiteR = {
      id: "white:runner:0",
      type: "runner",
      owner: "white",
      x: 2,
      y: 2,
    };
    const blackR = {
      id: "black:runner:0",
      type: "runner",
      owner: "black",
      x: 0,
      y: 0,
    };
    // Positions black's two moves would create (white runner already at (2,1), white to move).
    const afterA = positionKey({
      pieces: [
        { ...whiteR, x: 2, y: 1 },
        { ...blackR, x: 1, y: 0 },
      ],
      toMove: "white",
    });
    const afterB = positionKey({
      pieces: [
        { ...whiteR, x: 2, y: 1 },
        { ...blackR, x: 0, y: 1 },
      ],
      toMove: "white",
    });
    const seeded = { [afterA]: 3, [afterB]: 3 };

    // Direct surface first: hand-build the post-white-move state — black to move,
    // both candidate moves individually REPETITION, so legalActions is empty.
    const stuck = mkState(
      [{ ...whiteR, x: 2, y: 1 }, blackR],
      "black",
      repRuleset,
      seeded,
    );
    expect(
      validateAction(stuck, repRuleset, {
        piece: "black:runner:0",
        to: { x: 1, y: 0 },
      }),
    ).toEqual({ legal: false, reason: "REPETITION" });
    expect(
      validateAction(stuck, repRuleset, {
        piece: "black:runner:0",
        to: { x: 0, y: 1 },
      }),
    ).toEqual({ legal: false, reason: "REPETITION" });
    expect(legalActions(stuck, repRuleset)).toEqual([]);

    // Then the terminal: white's quiet move leaves black repetition-stuck ⇒ the
    // noMovesLoses terminal fires for WHITE inside applyAction.
    const before = mkState([whiteR, blackR], "white", repRuleset, seeded);
    const applied = applyAction(before, repRuleset, {
      piece: "white:runner:0",
      to: { x: 2, y: 1 },
    });
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    expect(applied.state.status).toEqual({
      state: "won",
      winner: "white",
      by: "noLegalMove",
    });
    expect(applied.events).toContainEqual({
      type: "won",
      winner: "white",
      by: "noLegalMove",
    });
  });

  it("stamps a custom noMovesWinCondition label (labels are data)", () => {
    const labelled: Ruleset = {
      ...noMovesRuleset,
      noMovesWinCondition: "zugzwang",
    };
    const applied = applyAction(
      mkState(boxedPieces, "white", labelled),
      labelled,
      {
        piece: "white:king:0",
        to: { x: 2, y: 1 },
      },
    );
    expect(applied.ok && applied.state.status).toEqual({
      state: "won",
      winner: "white",
      by: "zugzwang",
    });
  });

  it("leaves the position playing when noMovesLoses is off (the still-deferred Markov case)", () => {
    const { noMovesLoses: _omit, ...noTerminal } = noMovesRuleset;
    const applied = applyAction(
      mkState(boxedPieces, "white", noTerminal as Ruleset),
      noTerminal as Ruleset,
      {
        piece: "white:king:0",
        to: { x: 2, y: 1 },
      },
    );
    expect(applied.ok && applied.state.status).toEqual({ state: "playing" });
  });
});

// ---------------------------------------------------------------------------
describe("win-first ordering (a real win beats the no-moves fallthrough)", () => {
  it("a regicide that also leaves no reply registers as regicide", () => {
    // White runner adjacent to the lone black king; capturing it is regicide.
    const pieces: Piece[] = [
      { id: "white:king:0", type: "king", owner: "white", x: 4, y: 4 },
      { id: "white:runner:0", type: "runner", owner: "white", x: 0, y: 1 },
      { id: "black:king:0", type: "king", owner: "black", x: 0, y: 0 },
    ];
    const applied = applyAction(
      mkState(pieces, "white", banRuleset),
      banRuleset,
      {
        piece: "white:runner:0",
        to: { x: 0, y: 0 },
      },
    );
    expect(applied.ok && applied.state.status).toEqual({
      state: "won",
      winner: "white",
      by: "regicide",
    });
  });

  it("a militaryDefeat that also boxes the loser registers as militaryDefeat, not noLegalMove", () => {
    // Black King(0,0) walled in by its OWN walls + a single offensive Runner(2,2). White captures the
    // runner: black is reduced to King + Walls (militaryDefeat) AND has no legal move — ordering must
    // report militaryDefeat (docs/ANTI_STALLING.md §4 HIGH-C).
    const pieces: Piece[] = [
      { id: "white:king:0", type: "king", owner: "white", x: 4, y: 4 },
      { id: "white:runner:0", type: "runner", owner: "white", x: 2, y: 3 },
      { id: "black:king:0", type: "king", owner: "black", x: 0, y: 0 },
      { id: "black:wall:0", type: "wall", owner: "black", x: 1, y: 0 },
      { id: "black:wall:1", type: "wall", owner: "black", x: 0, y: 1 },
      { id: "black:runner:0", type: "runner", owner: "black", x: 2, y: 2 },
    ];
    const applied = applyAction(
      mkState(pieces, "white", banRuleset),
      banRuleset,
      {
        piece: "white:runner:0",
        to: { x: 2, y: 2 },
      },
    );
    expect(applied.ok && applied.state.status).toEqual({
      state: "won",
      winner: "white",
      by: "militaryDefeat",
    });
  });
});

// ---------------------------------------------------------------------------
describe("positionKey", () => {
  const base: Piece[] = [
    { id: "a", type: "king", owner: "white", x: 1, y: 2 },
    { id: "b", type: "runner", owner: "black", x: 3, y: 4 },
  ];

  it("is order-independent (a multiset, not a sequence)", () => {
    expect(positionKey({ pieces: base, toMove: "white" })).toBe(
      positionKey({ pieces: [...base].reverse(), toMove: "white" }),
    );
  });

  it("ignores PieceId (interchangeable same-type/owner/square pieces are the same board)", () => {
    const renamed = base.map((p) => ({ ...p, id: `${p.id}-renamed` }));
    expect(positionKey({ pieces: renamed, toMove: "white" })).toBe(
      positionKey({ pieces: base, toMove: "white" }),
    );
  });

  it("is side-to-move-sensitive (situational superko)", () => {
    expect(positionKey({ pieces: base, toMove: "white" })).not.toBe(
      positionKey({ pieces: base, toMove: "black" }),
    );
  });

  it("does not collide for adversarial multi-char ids / multi-digit coords (delimited)", () => {
    const a: Piece[] = [{ id: "x", type: "a", owner: "bb", x: 1, y: 2 }];
    const b: Piece[] = [{ id: "x", type: "ab", owner: "b", x: 1, y: 2 }];
    expect(positionKey({ pieces: a, toMove: "w" })).not.toBe(
      positionKey({ pieces: b, toMove: "w" }),
    );
    const c: Piece[] = [{ id: "x", type: "k", owner: "w", x: 1, y: 23 }];
    const d: Piece[] = [{ id: "x", type: "k", owner: "w", x: 12, y: 3 }];
    expect(positionKey({ pieces: c, toMove: "w" })).not.toBe(
      positionKey({ pieces: d, toMove: "w" }),
    );
  });
});

// ---------------------------------------------------------------------------
describe("positionCounts state (seed / append / serialize / immutability)", () => {
  it("seeds the initial position at count 1 when the ban is active", () => {
    const s = createInitialState({
      ...banRuleset,
      setup: [
        { type: "king", owner: "white", x: 0, y: 0 },
        { type: "king", owner: "black", x: 4, y: 4 },
      ],
    });
    expect(s.positionCounts).toEqual({ [positionKey(s)]: 1 });
  });

  it("omits positionCounts entirely for a Markov ruleset", () => {
    const { repetitionLimit: _omit, ...markov } = banRuleset;
    const s = createInitialState({
      ...(markov as Ruleset),
      setup: [
        { type: "king", owner: "white", x: 0, y: 0 },
        { type: "king", owner: "black", x: 4, y: 4 },
      ],
    });
    expect(s.positionCounts).toBeUndefined();
  });

  it("appends the new position on each move (old counts preserved)", () => {
    const s = createInitialState({
      ...banRuleset,
      setup: [
        { type: "king", owner: "white", x: 0, y: 0 },
        { type: "runner", owner: "white", x: 2, y: 2 },
        { type: "king", owner: "black", x: 4, y: 4 },
        { type: "runner", owner: "black", x: 3, y: 0 },
      ],
    });
    const oldKey = positionKey(s);
    const move = legalActions(s, banRuleset)[0] as Action;
    const applied = applyAction(s, banRuleset, move);
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    expect(applied.state.positionCounts?.[positionKey(applied.state)]).toBe(1);
    expect(applied.state.positionCounts?.[oldKey]).toBe(1); // the prior position is kept
  });

  it("does not mutate the input state's positionCounts (a new map is built)", () => {
    const s = createInitialState({
      ...banRuleset,
      setup: [
        { type: "king", owner: "white", x: 0, y: 0 },
        { type: "runner", owner: "white", x: 2, y: 2 },
        { type: "king", owner: "black", x: 4, y: 4 },
      ],
    });
    const ref = s.positionCounts;
    const snapshot = JSON.parse(JSON.stringify(ref));
    const move = legalActions(s, banRuleset)[0] as Action;
    const applied = applyAction(s, banRuleset, move);
    expect(applied.ok).toBe(true);
    expect(s.positionCounts).toBe(ref); // same reference
    expect(s.positionCounts).toEqual(snapshot); // unchanged values
    if (applied.ok) expect(applied.state.positionCounts).not.toBe(ref); // new map
  });

  it("survives a JSON round-trip (plain object, not a Map)", () => {
    const s = createInitialState({
      ...banRuleset,
      setup: [
        { type: "king", owner: "white", x: 0, y: 0 },
        { type: "king", owner: "black", x: 4, y: 4 },
      ],
    });
    const round = JSON.parse(JSON.stringify(s)) as GameState;
    expect(round.positionCounts).toEqual(s.positionCounts);
  });
});

// ---------------------------------------------------------------------------
describe("repetition-ban forward-safety (S017 review HIGH fix)", () => {
  // 3x3: black King(0,0) + an offensive Runner(1,0) boxed in by WHITE walls. White's king move leaves
  // black with NO base-legal reply (a genuine boxing win → noLegalMove). We seed positionCounts so the
  // move's RESULTING position is already at the limit: it WOULD be a repeat, but it ENDS THE GAME as a
  // win, so it must NOT be banned (else a forced win inverts into a loss).
  const pieces: Piece[] = [
    { id: "white:king:0", type: "king", owner: "white", x: 2, y: 2 },
    { id: "white:wall:0", type: "wall", owner: "white", x: 0, y: 1 },
    { id: "white:wall:1", type: "wall", owner: "white", x: 2, y: 0 },
    { id: "white:wall:2", type: "wall", owner: "white", x: 1, y: 1 },
    { id: "black:king:0", type: "king", owner: "black", x: 0, y: 0 },
    { id: "black:runner:0", type: "runner", owner: "black", x: 1, y: 0 },
  ];
  const M: Action = { piece: "white:king:0", to: { x: 2, y: 1 } };
  const afterKey = positionKey({
    pieces: pieces.map((p) =>
      p.id === "white:king:0" ? { ...p, x: 2, y: 1 } : p,
    ),
    toMove: "black",
  });

  it("a genuine boxing WIN is not banned even when its resulting position is at the limit", () => {
    const state = mkState(pieces, "white", noMovesRuleset, { [afterKey]: 3 });
    expect(validateAction(state, noMovesRuleset, M).legal).toBe(true); // exempt — it's a win, not a stall
    expect(legalActions(state, noMovesRuleset)).toContainEqual(M);
    const applied = applyAction(state, noMovesRuleset, M);
    expect(applied.ok && applied.state.status).toEqual({
      state: "won",
      winner: "white",
      by: "noLegalMove", // the mover WINS — not inverted into a REPETITION-stuck loss
    });
  });
});

// ---------------------------------------------------------------------------
describe("malformed ruleset guard", () => {
  it("createInitialState throws on a repetitionLimit below 2", () => {
    expect(() =>
      createInitialState({ ...banRuleset, repetitionLimit: 1, setup: [] }),
    ).toThrow(/repetitionLimit/);
  });

  it("throws on a non-integer repetitionLimit", () => {
    expect(() =>
      createInitialState({ ...banRuleset, repetitionLimit: 2.5, setup: [] }),
    ).toThrow(/repetitionLimit/);
  });

  it("fires on the apply/validate path too, not only createInitialState (review LOW)", () => {
    // A hand-built state under a malformed limit must fail loudly everywhere — never run with the ban
    // silently inert. The guard now lives in repetitionActive (called on every gated path).
    const bad = { ...banRuleset, repetitionLimit: 1 } as Ruleset;
    const state = mkState(
      [
        { id: "white:king:0", type: "king", owner: "white", x: 0, y: 0 },
        { id: "black:king:0", type: "king", owner: "black", x: 4, y: 4 },
      ],
      "white",
      bad,
    );
    expect(() => legalActions(state, bad)).toThrow(/repetitionLimit/);
    expect(() =>
      validateAction(state, bad, { piece: "white:king:0", to: { x: 0, y: 1 } }),
    ).toThrow(/repetitionLimit/);
  });
});
