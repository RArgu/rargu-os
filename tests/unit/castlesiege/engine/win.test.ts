import { describe, it, expect } from "vitest";
import {
  applyAction,
  validateAction,
  legalActions,
} from "../../../../src/apps/castlesiege/engine/core.js";
import { defaultRuleset } from "../../../../src/apps/castlesiege/engine/rulesets/default.js";
import type {
  GameState,
  Piece,
  Ruleset,
} from "../../../../src/apps/castlesiege/engine/types.js";

// ---------------------------------------------------------------------------
// Helpers: hand-craft minimal GameStates / Rulesets so each win condition can
// be triggered by a single applyAction. We assert the CONTRACT (spec §6 /
// ENGINE_DESIGN §5.6): after the action that satisfies a win predicate, the
// mover wins, state.status reflects it, and a "won" event is emitted.
// ---------------------------------------------------------------------------

function piece(
  id: string,
  type: string,
  owner: string,
  x: number,
  y: number,
): Piece {
  return { id, type, owner, x, y };
}

function stateOf(ruleset: Ruleset, toMove: string, pieces: Piece[]): GameState {
  return {
    rulesetVersion: ruleset.version,
    board: { width: ruleset.board.width, height: ruleset.board.height },
    pieces,
    toMove,
    status: { state: "playing" },
  };
}

// A compact custom ruleset exercising all three win conditions via roles.
// "general" is a melee attacker (8-neighbour attacks, swaps on capture).
// "soldier" is a plain non-royal, non-castle piece.
// "king" has role royal. "wall" has role castle, only attackable by "breaker".
// "breaker" is a hammer-like piece that can break walls (orthogonal range-1).
const customRuleset: Ruleset = {
  version: "wintest@1.0.0",
  board: { width: 8, height: 8 },
  turnOrder: ["white", "black"],
  winConditions: ["regicide", "castleClear", "decapitation"],
  pieceTypes: {
    king: {
      id: "king",
      moves: [
        { dx: 1, dy: 0 },
        { dx: -1, dy: 0 },
        { dx: 0, dy: 1 },
        { dx: 0, dy: -1 },
      ],
      attacks: [],
      roles: ["royal"],
    },
    general: {
      id: "general",
      moves: [
        { dx: 1, dy: 0 },
        { dx: -1, dy: 0 },
        { dx: 0, dy: 1 },
        { dx: 0, dy: -1 },
        { dx: 1, dy: 1 },
        { dx: -1, dy: 1 },
        { dx: 1, dy: -1 },
        { dx: -1, dy: -1 },
      ],
      attacks: [
        { dx: 1, dy: 0 },
        { dx: -1, dy: 0 },
        { dx: 0, dy: 1 },
        { dx: 0, dy: -1 },
        { dx: 1, dy: 1 },
        { dx: -1, dy: 1 },
        { dx: 1, dy: -1 },
        { dx: -1, dy: -1 },
      ],
    },
    soldier: {
      id: "soldier",
      moves: [
        { dx: 1, dy: 0 },
        { dx: -1, dy: 0 },
        { dx: 0, dy: 1 },
        { dx: 0, dy: -1 },
      ],
      attacks: [
        { dx: 1, dy: 0 },
        { dx: -1, dy: 0 },
        { dx: 0, dy: 1 },
        { dx: 0, dy: -1 },
      ],
    },
    breaker: {
      id: "breaker",
      moves: [
        { dx: 1, dy: 0 },
        { dx: -1, dy: 0 },
        { dx: 0, dy: 1 },
        { dx: 0, dy: -1 },
      ],
      attacks: [
        { dx: 1, dy: 0 },
        { dx: -1, dy: 0 },
        { dx: 0, dy: 1 },
        { dx: 0, dy: -1 },
      ],
    },
    wall: {
      id: "wall",
      moves: [],
      attacks: [],
      blocksPath: true,
      onlyAttackableBy: ["breaker"],
      roles: ["castle"],
    },
  },
  setup: [],
};

// A ruleset with only regicide + decapitation (NO castleClear), so states with
// no walls don't accidentally trigger a castle win. Used to isolate regicide /
// decapitation behavior precisely. Same piece catalog as customRuleset.
const royalRuleset: Ruleset = {
  ...customRuleset,
  version: "royaltest@1.0.0",
  winConditions: ["regicide", "decapitation"],
};

// ---------------------------------------------------------------------------
// Regicide
// ---------------------------------------------------------------------------

describe("regicide", () => {
  it("capturing the only enemy royal wins by regicide for the mover", () => {
    // White general at (3,3) melee-attacks black king at (4,3).
    // Black has another (non-royal) soldier so it is regicide, not decapitation.
    const state = stateOf(royalRuleset, "white", [
      piece("white:general:0", "general", "white", 3, 3),
      piece("white:king:0", "king", "white", 0, 0),
      piece("black:king:0", "king", "black", 4, 3),
      piece("black:soldier:0", "soldier", "black", 7, 7),
    ]);

    const res = applyAction(state, royalRuleset, {
      piece: "white:general:0",
      to: { x: 4, y: 3 },
    });

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.state.status).toEqual({
      state: "won",
      winner: "white",
      by: "regicide",
    });
    // Mover swapped onto the king's square (melee capture).
    const general = res.state.pieces.find((p) => p.id === "white:general:0");
    expect(general).toMatchObject({ x: 4, y: 3 });
    // King removed.
    expect(
      res.state.pieces.find((p) => p.id === "black:king:0"),
    ).toBeUndefined();
    // Won event present and last.
    expect(res.events).toContainEqual({
      type: "won",
      winner: "white",
      by: "regicide",
    });
    expect(res.events[res.events.length - 1]).toEqual({
      type: "won",
      winner: "white",
      by: "regicide",
    });
    // Captured event accompanies it.
    expect(res.events).toContainEqual({
      type: "captured",
      victim: "black:king:0",
      by: "white:general:0",
      swapped: true,
      class: "melee",
    });
  });

  it("black can win by regicide too (winner is the mover, not a fixed side)", () => {
    const state = stateOf(royalRuleset, "black", [
      piece("white:king:0", "king", "white", 4, 4),
      piece("white:soldier:0", "soldier", "white", 0, 0),
      piece("black:general:0", "general", "black", 3, 4),
      piece("black:king:0", "king", "black", 7, 7),
    ]);
    const res = applyAction(state, royalRuleset, {
      piece: "black:general:0",
      to: { x: 4, y: 4 },
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.state.status).toEqual({
      state: "won",
      winner: "black",
      by: "regicide",
    });
  });

  it("a ranged kill of the king still wins (no swap; bow-style)", () => {
    // Use default ruleset: a bow snipes the enemy king from range 2.
    // White bow at (3,3) attacks black king at (3,5) — orthogonal range 2.
    const state = stateOf(defaultRuleset, "white", [
      piece("white:bow:0", "bow", "white", 3, 3),
      piece("white:king:0", "king", "white", 0, 0),
      piece("black:king:0", "king", "black", 3, 5),
      piece("black:sword:0", "sword", "black", 6, 6),
      // A surviving wall keeps castleClear from firing — isolate regicide.
      piece("black:wall:0", "wall", "black", 0, 7),
    ]);
    const res = applyAction(state, defaultRuleset, {
      piece: "white:bow:0",
      to: { x: 3, y: 5 },
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.state.status).toEqual({
      state: "won",
      winner: "white",
      by: "regicide",
    });
    // Ranged: attacker stays in place, king removed.
    expect(res.state.pieces.find((p) => p.id === "white:bow:0")).toMatchObject({
      x: 3,
      y: 3,
    });
    expect(
      res.state.pieces.find((p) => p.id === "black:king:0"),
    ).toBeUndefined();
    expect(res.events).toContainEqual({
      type: "captured",
      victim: "black:king:0",
      by: "white:bow:0",
      swapped: false,
      class: "ranged",
    });
  });
});

// ---------------------------------------------------------------------------
// Castle clear
// ---------------------------------------------------------------------------

describe("castleClear", () => {
  it("breaking the last enemy wall wins by castleClear", () => {
    // Black has exactly one wall (castle role) left, plus a king and a soldier
    // (so it is NOT decapitation and NOT regicide). White breaker smashes it.
    const state = stateOf(customRuleset, "white", [
      piece("white:breaker:0", "breaker", "white", 3, 3),
      piece("white:king:0", "king", "white", 0, 0),
      piece("black:king:0", "king", "black", 7, 7),
      piece("black:soldier:0", "soldier", "black", 6, 6),
      piece("black:wall:0", "wall", "black", 4, 3),
    ]);
    const res = applyAction(state, customRuleset, {
      piece: "white:breaker:0",
      to: { x: 4, y: 3 },
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.state.status).toEqual({
      state: "won",
      winner: "white",
      by: "castleClear",
    });
    expect(
      res.state.pieces.find((p) => p.id === "black:wall:0"),
    ).toBeUndefined();
    expect(res.events[res.events.length - 1]).toEqual({
      type: "won",
      winner: "white",
      by: "castleClear",
    });
  });

  it("breaking a wall when other walls remain does NOT win", () => {
    const state = stateOf(customRuleset, "white", [
      piece("white:breaker:0", "breaker", "white", 3, 3),
      piece("white:king:0", "king", "white", 0, 0),
      piece("black:king:0", "king", "black", 7, 7),
      piece("black:wall:0", "wall", "black", 4, 3),
      piece("black:wall:1", "wall", "black", 6, 0),
    ]);
    const res = applyAction(state, customRuleset, {
      piece: "white:breaker:0",
      to: { x: 4, y: 3 },
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.state.status).toEqual({ state: "playing" });
    // One wall remains; turn passed to black.
    expect(res.state.toMove).toBe("black");
    expect(res.events.some((e) => e.type === "won")).toBe(false);
  });

  it("a 3-wall castle falls sequentially: only the THIRD break wins, not the first or second", () => {
    // Full played-out sequence (not three hand-crafted states): the white breaker
    // smashes black's 3-wall castle one wall per turn while the black king
    // shuffles. White also owns a wall + king so black's interleaved moves can
    // never win vacuously (castleClear/regicide test the OPPONENT's holdings —
    // the per-side vacuous-fire gotcha in engine/CLAUDE.md). Black keeps a
    // soldier so the final position is unambiguously castleClear, not
    // decapitation.
    let state = stateOf(customRuleset, "white", [
      piece("white:breaker:0", "breaker", "white", 1, 0),
      piece("white:king:0", "king", "white", 0, 0),
      piece("white:wall:0", "wall", "white", 7, 0),
      piece("black:king:0", "king", "black", 6, 6),
      piece("black:soldier:0", "soldier", "black", 0, 7),
      piece("black:wall:0", "wall", "black", 1, 1),
      piece("black:wall:1", "wall", "black", 2, 1),
      piece("black:wall:2", "wall", "black", 3, 1),
    ]);

    const play = (pieceId: string, to: { x: number; y: number }) => {
      const res = applyAction(state, customRuleset, { piece: pieceId, to });
      expect(res.ok).toBe(true);
      if (!res.ok) throw new Error("unreachable");
      state = res.state;
      return res;
    };

    // Break 1 of 3 — no win.
    let res = play("white:breaker:0", { x: 1, y: 1 });
    expect(state.status).toEqual({ state: "playing" });
    expect(res.events.some((e) => e.type === "won")).toBe(false);
    expect(
      state.pieces.filter((p) => p.type === "wall" && p.owner === "black"),
    ).toHaveLength(2);

    play("black:king:0", { x: 6, y: 5 });
    expect(state.status).toEqual({ state: "playing" });

    // Break 2 of 3 — still no win.
    res = play("white:breaker:0", { x: 2, y: 1 });
    expect(state.status).toEqual({ state: "playing" });
    expect(res.events.some((e) => e.type === "won")).toBe(false);
    expect(
      state.pieces.filter((p) => p.type === "wall" && p.owner === "black"),
    ).toHaveLength(1);

    play("black:king:0", { x: 6, y: 6 });
    expect(state.status).toEqual({ state: "playing" });

    // Break 3 of 3 — castleClear fires exactly now.
    res = play("white:breaker:0", { x: 3, y: 1 });
    expect(state.status).toEqual({
      state: "won",
      winner: "white",
      by: "castleClear",
    });
    expect(res.events[res.events.length - 1]).toEqual({
      type: "won",
      winner: "white",
      by: "castleClear",
    });
    expect(
      state.pieces.filter((p) => p.type === "wall" && p.owner === "black"),
    ).toHaveLength(0);
    // White's own wall is untouched — castleClear counted the OPPONENT's castles only.
    expect(state.pieces.find((p) => p.id === "white:wall:0")).toBeDefined();
  });

  it("non-breaker cannot attack the wall (TARGET_INVULNERABLE) so no castleClear", () => {
    const state = stateOf(customRuleset, "white", [
      piece("white:soldier:0", "soldier", "white", 3, 3),
      piece("white:king:0", "king", "white", 0, 0),
      piece("black:king:0", "king", "black", 7, 7),
      piece("black:wall:0", "wall", "black", 4, 3),
    ]);
    const res = applyAction(state, customRuleset, {
      piece: "white:soldier:0",
      to: { x: 4, y: 3 },
    });
    expect(res).toEqual({ ok: false, reason: "TARGET_INVULNERABLE" });
  });
});

// ---------------------------------------------------------------------------
// Decapitation
// ---------------------------------------------------------------------------

describe("decapitation", () => {
  it("capturing the last non-royal enemy piece (leaving only the king) wins by decapitation", () => {
    // Black has a king + exactly one soldier. White general captures the soldier,
    // leaving black with only its royal -> decapitation (king still alive, so not regicide).
    const state = stateOf(royalRuleset, "white", [
      piece("white:general:0", "general", "white", 3, 3),
      piece("white:king:0", "king", "white", 0, 0),
      piece("black:king:0", "king", "black", 7, 7),
      piece("black:soldier:0", "soldier", "black", 4, 3),
    ]);
    const res = applyAction(state, royalRuleset, {
      piece: "white:general:0",
      to: { x: 4, y: 3 },
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.state.status).toEqual({
      state: "won",
      winner: "white",
      by: "decapitation",
    });
    // Black king survives.
    expect(res.state.pieces.find((p) => p.id === "black:king:0")).toMatchObject(
      { x: 7, y: 7 },
    );
    expect(
      res.state.pieces.find((p) => p.id === "black:soldier:0"),
    ).toBeUndefined();
    expect(res.events[res.events.length - 1]).toEqual({
      type: "won",
      winner: "white",
      by: "decapitation",
    });
  });

  it("capturing a non-royal when other non-royals remain does NOT win", () => {
    const state = stateOf(royalRuleset, "white", [
      piece("white:general:0", "general", "white", 3, 3),
      piece("white:king:0", "king", "white", 0, 0),
      piece("black:king:0", "king", "black", 7, 7),
      piece("black:soldier:0", "soldier", "black", 4, 3),
      piece("black:soldier:1", "soldier", "black", 0, 0),
    ]);
    const res = applyAction(state, royalRuleset, {
      piece: "white:general:0",
      to: { x: 4, y: 3 },
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.state.status).toEqual({ state: "playing" });
    expect(res.events.some((e) => e.type === "won")).toBe(false);
  });

  it("regicide takes precedence over decapitation when the king itself is the last piece captured", () => {
    // Black is down to ONLY the king. Capturing it satisfies BOTH regicide and
    // (vacuously not) decapitation. Per winConditions order, regicide is checked
    // first and reported. decapitation requires >=1 remaining opp piece, so with
    // zero pieces left it is false anyway — regicide is the correct id.
    const state = stateOf(royalRuleset, "white", [
      piece("white:general:0", "general", "white", 3, 3),
      piece("white:king:0", "king", "white", 0, 0),
      piece("black:king:0", "king", "black", 4, 3),
    ]);
    const res = applyAction(state, royalRuleset, {
      piece: "white:general:0",
      to: { x: 4, y: 3 },
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.state.status).toEqual({
      state: "won",
      winner: "white",
      by: "regicide",
    });
  });

  it("decapitation predicate requires a remaining royal — empty opponent is not decapitation", () => {
    // Win-condition order also matters: list regicide first as the default does,
    // so a board with zero opponent pieces reports regicide, never decapitation.
    const onlyDecap: Ruleset = {
      ...customRuleset,
      version: "decaponly@1.0.0",
      winConditions: ["decapitation"],
    };
    // Opponent reduced to zero pieces: decapitation predicate is false (needs >=1).
    const state = stateOf(onlyDecap, "white", [
      piece("white:general:0", "general", "white", 3, 3),
      piece("white:king:0", "king", "white", 0, 0),
      piece("black:soldier:0", "soldier", "black", 4, 3),
    ]);
    const res = applyAction(state, onlyDecap, {
      piece: "white:general:0",
      to: { x: 4, y: 3 },
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    // Opponent now has zero pieces -> decapitation is false (needs a remaining royal),
    // and regicide is not in this ruleset -> game continues.
    expect(res.state.status).toEqual({ state: "playing" });
  });
});

// ---------------------------------------------------------------------------
// Post-win lockout
// ---------------------------------------------------------------------------

describe("after a win the game is locked", () => {
  it("further actions return GAME_OVER", () => {
    const state = stateOf(customRuleset, "white", [
      piece("white:general:0", "general", "white", 3, 3),
      piece("white:king:0", "king", "white", 0, 0),
      piece("black:king:0", "king", "black", 4, 3),
      piece("black:soldier:0", "soldier", "black", 7, 7),
    ]);
    const won = applyAction(state, customRuleset, {
      piece: "white:general:0",
      to: { x: 4, y: 3 },
    });
    expect(won.ok).toBe(true);
    if (!won.ok) return;
    expect(won.state.status.state).toBe("won");

    // Black (or anyone) tries to act on the won state.
    const next = applyAction(won.state, customRuleset, {
      piece: "black:soldier:0",
      to: { x: 7, y: 6 },
    });
    expect(next).toEqual({ ok: false, reason: "GAME_OVER" });

    // validateAction agrees, and reports GAME_OVER before any other reason.
    expect(
      validateAction(won.state, customRuleset, {
        piece: "white:general:0",
        to: { x: 4, y: 3 },
      }),
    ).toEqual({ legal: false, reason: "GAME_OVER" });

    // No legal actions exist in a won state.
    expect(legalActions(won.state, customRuleset)).toEqual([]);
  });

  it("GAME_OVER takes precedence even over a non-existent piece", () => {
    const state = stateOf(customRuleset, "white", [
      piece("white:general:0", "general", "white", 3, 3),
      piece("white:king:0", "king", "white", 0, 0),
      piece("black:king:0", "king", "black", 4, 3),
      piece("black:soldier:0", "soldier", "black", 7, 7),
    ]);
    const won = applyAction(state, customRuleset, {
      piece: "white:general:0",
      to: { x: 4, y: 3 },
    });
    expect(won.ok).toBe(true);
    if (!won.ok) return;
    const next = applyAction(won.state, customRuleset, {
      piece: "no:such:piece",
      to: { x: 0, y: 0 },
    });
    expect(next).toEqual({ ok: false, reason: "GAME_OVER" });
  });
});

// ---------------------------------------------------------------------------
// Input immutability around win detection
// ---------------------------------------------------------------------------

describe("applyAction does not mutate the input state on a winning move", () => {
  it("leaves the original state's pieces and status untouched", () => {
    const pieces: Piece[] = [
      piece("white:general:0", "general", "white", 3, 3),
      piece("white:king:0", "king", "white", 0, 0),
      piece("black:king:0", "king", "black", 4, 3),
      piece("black:soldier:0", "soldier", "black", 7, 7),
    ];
    const state = stateOf(customRuleset, "white", pieces);
    const res = applyAction(state, customRuleset, {
      piece: "white:general:0",
      to: { x: 4, y: 3 },
    });
    expect(res.ok).toBe(true);
    // Original unchanged: still playing, king still present, general at origin.
    expect(state.status).toEqual({ state: "playing" });
    expect(state.toMove).toBe("white");
    expect(state.pieces.find((p) => p.id === "black:king:0")).toMatchObject({
      x: 4,
      y: 3,
    });
    expect(state.pieces.find((p) => p.id === "white:general:0")).toMatchObject({
      x: 3,
      y: 3,
    });
  });
});
