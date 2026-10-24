import { describe, expect, it } from "vitest";
import {
  applyAction,
  createInitialState,
  defaultRuleset,
  legalActions,
  validateAction,
} from "../../../../src/apps/castlesiege/engine/index.js";
import { alphaBetaAgent } from "../../../../src/apps/castlesiege/ai/alphabeta.js";
import {
  evaluate,
  isRoyal,
  materialValue,
} from "../../../../src/apps/castlesiege/ai/evaluate.js";
import { mulberry32 } from "../../../../src/apps/castlesiege/ai/rng.js";
import type {
  Action,
  GameState,
  Ruleset,
} from "../../../../src/apps/castlesiege/ai/types.js";

/** A fresh depth-`d` alpha-beta agent seeded deterministically. */
const ab = (d: number, seed = 1) =>
  alphaBetaAgent({ maxDepth: d })(mulberry32(seed));

// A brute-force, FULL-WINDOW negamax oracle (no pruning) using the SAME value conventions as the
// agent (mate = -(MATE-ply), stuck = 0, evaluate at the horizon). It computes EXACT values, so the
// set of true-best root moves is unambiguous — the regression guard for the fail-soft-root bug.
const ORACLE_MATE = 1_000_000;

/** Capture predicate mirroring the agent's: an action onto an occupied square is a capture. */
function isCaptureT(state: GameState, action: Action): boolean {
  return state.pieces.some((p) => p.x === action.to.x && p.y === action.to.y);
}

/**
 * Reference quiescence (captures only): pure full-window minimax with stand-pat, so it returns the
 * EXACT q-value. The agent's alpha-beta quiescence, called full-window at the root, yields this same
 * value — so making the oracle's leaves quiescent keeps the agent ≡ oracle now that the agent does
 * q-search at the horizon (otherwise the static-leaf oracle would disagree with the quiescent agent).
 */
function quiesceOracle(
  state: GameState,
  ruleset: Ruleset,
  ply: number,
): number {
  if (state.status.state === "won") return -(ORACLE_MATE - ply);
  const acts = legalActions(state, ruleset);
  if (acts.length === 0) return 0;
  // Match the agent: stand-pat is a lower bound ONLY when a quiet move exists (no pass — RULES_SPEC §6).
  const hasQuiet = acts.some((a) => !isCaptureT(state, a));
  let best = hasQuiet ? evaluate(state, ruleset, state.toMove) : -Infinity;
  for (const a of acts) {
    if (!isCaptureT(state, a)) continue;
    const r = applyAction(state, ruleset, a);
    if (!r.ok) continue;
    best = Math.max(best, -quiesceOracle(r.state, ruleset, ply + 1));
  }
  return best;
}

function oracleValue(
  state: GameState,
  ruleset: Ruleset,
  depth: number,
  ply: number,
): number {
  if (state.status.state === "won") return -(ORACLE_MATE - ply);
  const acts = legalActions(state, ruleset);
  if (acts.length === 0) return 0;
  if (depth <= 0) return quiesceOracle(state, ruleset, ply); // quiescent leaves — match the agent
  let best = -Infinity;
  for (const a of acts) {
    const r = applyAction(state, ruleset, a);
    if (!r.ok) continue;
    best = Math.max(best, -oracleValue(r.state, ruleset, depth - 1, ply + 1));
  }
  return best;
}
function trueBestRootKeys(
  state: GameState,
  ruleset: Ruleset,
  depth: number,
): Set<string> {
  const scored = legalActions(state, ruleset).map((a) => {
    const r = applyAction(state, ruleset, a);
    return {
      key: `${a.piece}:${a.to.x},${a.to.y}`,
      v: r.ok ? -oracleValue(r.state, ruleset, depth - 1, 1) : -Infinity,
    };
  });
  let max = -Infinity;
  for (const s of scored) max = Math.max(max, s.v);
  const keys = new Set<string>();
  for (const s of scored) if (Math.abs(s.v - max) < 1e-9) keys.add(s.key);
  return keys;
}

describe("alphaBetaAgent", () => {
  it("captures a winning target (win-in-1)", () => {
    // 5x1 so the alternative (bow→(1,0)) is a normal quiet move, not a stalemate of the lone king.
    // The black sword keeps black mobile; the white bow can snipe the king at range 2.
    const ruleset: Ruleset = {
      version: "winin1@1",
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
    expect(ab(2).selectAction(s, ruleset).to).toEqual({ x: 2, y: 0 });
  });

  it("picks a TRUE-BEST root move vs a full-window minimax oracle (guards the fail-soft-root bug)", () => {
    // On the real 26-piece opening the old narrowed-window root picked a strictly-worse move on
    // ~90% of seeds; the full-window root must agree with the exact oracle on every seed.
    const s = createInitialState(defaultRuleset);
    const depth = 2;
    const best = trueBestRootKeys(s, defaultRuleset, depth);
    for (let seed = 0; seed < 12; seed++) {
      const a = alphaBetaAgent({ maxDepth: depth })(
        mulberry32(seed),
      ).selectAction(s, defaultRuleset);
      expect(best.has(`${a.piece}:${a.to.x},${a.to.y}`)).toBe(true);
    }
  });

  it("does NOT hang its own king — negamax sign is correct", () => {
    // White king on (2,0); → (1,0) lets the black bow on (4,0) capture it next ply (range-3).
    // (3,0) is the bow's adjacent blind spot, (2,1) is off its lines → both safe. A sign-inverted
    // search would WALK INTO (1,0). Black king is tucked at (0,1), out of play.
    const ruleset: Ruleset = {
      version: "sign@1",
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
    expect(ab(3).selectAction(s, ruleset).to).not.toEqual({ x: 1, y: 0 });
  });

  it("declines a POISONED capture — quiescence sees the recapture (anti-baiting, the S015 fix)", () => {
    // White sword (1,1) can capture the black hammer (2,2) DIAGONALLY (melee swap onto (2,2)). But the
    // black sword (2,3) then recaptures on (2,2): white trades a sword (6) for a hammer (4) = NET −2.
    // The hammer attacks orthogonally, so it can't hit the sword on (1,1) — the sword is only exposed
    // if it TAKES the bait. Material is otherwise balanced (white king+hammer+sword vs black
    // king+hammer+sword), so a quiet move ≈ 0. A NON-quiescent depth-1 search scores the capture +4
    // (it never sees the recapture) and grabs it; quiescence scores it −2, so the agent must DECLINE.
    const ruleset: Ruleset = {
      version: "bait@1",
      board: { width: 5, height: 5 },
      turnOrder: ["white", "black"],
      winConditions: ["regicide"],
      pieceTypes: defaultRuleset.pieceTypes,
      setup: [
        { type: "king", owner: "white", x: 0, y: 0 },
        { type: "hammer", owner: "white", x: 0, y: 1 },
        { type: "sword", owner: "white", x: 1, y: 1 },
        { type: "hammer", owner: "black", x: 2, y: 2 }, // the bait
        { type: "sword", owner: "black", x: 2, y: 3 }, // the defender → recaptures on (2,2)
        { type: "king", owner: "black", x: 4, y: 4 },
      ],
    };
    const s = createInitialState(ruleset);
    // Robust across seeds: declining the bait is not a lucky tiebreak.
    for (let seed = 0; seed < 8; seed++) {
      const a = ab(1, seed).selectAction(s, ruleset);
      expect(a.to).not.toEqual({ x: 2, y: 2 }); // never grabs the poisoned hammer
    }
  });

  it("forced-capture zugzwang is NOT over-scored by stand-pat (no-pass guard — S015 review)", () => {
    // 5x1: white's ONLY legal move is sword (1,0)→(2,0), capturing the black hammer — an ALL-CAPTURE
    // node (no quiet move; this game has no pass). After the forced capture the black sword recaptures,
    // so white is really losing MORE than the static eval suggests. An unconditional stand-pat would
    // clamp the node to the (higher) static eval; the no-pass guard instead forces the mandatory capture
    // to be searched, so the quiescence value drops BELOW the static eval. (Pins the agent's guard,
    // which quiesceOracle mirrors — agent ≡ oracle is held by the value-identity gates above.)
    const ruleset: Ruleset = {
      version: "zugzwang@1",
      board: { width: 5, height: 1 },
      turnOrder: ["white", "black"],
      winConditions: ["regicide"],
      pieceTypes: defaultRuleset.pieceTypes,
      setup: [
        { type: "king", owner: "white", x: 0, y: 0 },
        { type: "sword", owner: "white", x: 1, y: 0 },
        { type: "hammer", owner: "black", x: 2, y: 0 },
        { type: "sword", owner: "black", x: 3, y: 0 },
        { type: "king", owner: "black", x: 4, y: 0 },
      ],
    };
    const s = createInitialState(ruleset);
    // Sanity: white really is in forced-capture-zugzwang (every legal move is a capture).
    const acts = legalActions(s, ruleset);
    expect(acts.length).toBeGreaterThan(0);
    expect(acts.every((a) => isCaptureT(s, a))).toBe(true);
    // The no-pass guard ⇒ the node is scored by its forced capture, strictly below the static stand-pat.
    expect(quiesceOracle(s, ruleset, 0)).toBeLessThan(
      evaluate(s, ruleset, "white"),
    );
  });

  it("returns only legal actions across a played-out game", () => {
    let s = createInitialState(defaultRuleset);
    const w = ab(2, 1);
    const b = ab(2, 2);
    for (let i = 0; i < 16 && s.status.state === "playing"; i++) {
      const a = (s.toMove === "white" ? w : b).selectAction(s, defaultRuleset);
      expect(validateAction(s, defaultRuleset, a).legal).toBe(true);
      const r = applyAction(s, defaultRuleset, a);
      if (!r.ok) throw new Error(r.reason);
      s = r.state;
    }
  });

  it("is reproducible (same seed + state ⇒ same action) and does not mutate state", () => {
    const s = createInitialState(defaultRuleset);
    const before = JSON.stringify(s);
    const a1 = ab(2, 7).selectAction(s, defaultRuleset);
    const after = JSON.stringify(s);
    const a2 = ab(2, 7).selectAction(s, defaultRuleset);
    expect(after).toBe(before); // no mutation of the input state
    expect(a2).toEqual(a1); // deterministic under a fixed seed
  });

  it("returns the only action when there is just one", () => {
    // White king on a 1x3 strip: (0,1) is its single legal move ((0,-1) off-board; the black king
    // on (0,2) is two away, out of range).
    const ruleset: Ruleset = {
      version: "single@1",
      board: { width: 1, height: 3 },
      turnOrder: ["white", "black"],
      winConditions: ["regicide"],
      pieceTypes: defaultRuleset.pieceTypes,
      setup: [
        { type: "king", owner: "white", x: 0, y: 0 },
        { type: "king", owner: "black", x: 0, y: 2 },
      ],
    };
    const s = createInitialState(ruleset);
    expect(ab(2).selectAction(s, ruleset).to).toEqual({ x: 0, y: 1 });
  });

  it("throws when there is no legal move (stuck)", () => {
    // White king boxed: enemy king on its only in-board neighbor → zero legal actions.
    const ruleset: Ruleset = {
      version: "stuck@1",
      board: { width: 1, height: 2 },
      turnOrder: ["white", "black"],
      winConditions: ["regicide"],
      pieceTypes: defaultRuleset.pieceTypes,
      setup: [
        { type: "king", owner: "white", x: 0, y: 0 },
        { type: "king", owner: "black", x: 0, y: 1 },
      ],
    };
    const s = createInitialState(ruleset);
    expect(() => ab(2).selectAction(s, ruleset)).toThrow();
  });
});

// A small, sharp board for the TT differential gate — the full-minimax oracle is cheap here at depth ≤3.
const SMALL_AB: Ruleset = {
  version: "ab-small@1",
  board: { width: 5, height: 5 },
  turnOrder: ["white", "black"],
  winConditions: ["regicide", "decapitation"],
  pieceTypes: defaultRuleset.pieceTypes,
  setup: [
    { type: "king", owner: "white", x: 2, y: 0 },
    { type: "sword", owner: "white", x: 1, y: 0 },
    { type: "sword", owner: "white", x: 3, y: 0 },
    { type: "king", owner: "black", x: 2, y: 4 },
    { type: "sword", owner: "black", x: 1, y: 4 },
    { type: "sword", owner: "black", x: 3, y: 4 },
  ],
};

/** A reproducible mid-game position: `plies` uniform-random legal moves from the start. */
function randomPosition(
  ruleset: Ruleset,
  seed: number,
  plies: number,
): GameState {
  const rng = mulberry32(seed);
  let s = createInitialState(ruleset);
  for (let i = 0; i < plies && s.status.state === "playing"; i++) {
    const acts = legalActions(s, ruleset);
    const a = acts[Math.floor(rng() * acts.length)];
    if (a === undefined) break;
    const r = applyAction(s, ruleset, a);
    if (!r.ok) break;
    s = r.state;
  }
  return s;
}

describe("alphaBetaAgent — transposition table", () => {
  it("with TT, ALWAYS picks a true-best root move (differential vs the minimax oracle)", () => {
    // A TT must only PRUNE — never change the value — so its move must lie in the oracle's exact
    // best-set (it may reorder among ties). The no-TT αβ already matches the oracle (test above), so
    // this transitively confirms TT-αβ ≡ no-TT-αβ in optimality.
    const positions = [
      createInitialState(SMALL_AB),
      randomPosition(SMALL_AB, 11, 3),
      randomPosition(SMALL_AB, 22, 5),
      randomPosition(SMALL_AB, 33, 7),
    ];
    for (const s of positions) {
      if (s.status.state !== "playing") continue;
      for (const depth of [1, 2, 3]) {
        const best = trueBestRootKeys(s, SMALL_AB, depth);
        if (best.size === 0) continue;
        for (let seed = 0; seed < 4; seed++) {
          const a = alphaBetaAgent({ maxDepth: depth, useTT: true })(
            mulberry32(seed),
          ).selectAction(s, SMALL_AB);
          expect(best.has(`${a.piece}:${a.to.x},${a.to.y}`)).toBe(true);
        }
      }
    }
  });

  it("with TT, agrees with the oracle on the real 26-piece board at depth 2", () => {
    const s = createInitialState(defaultRuleset);
    const best = trueBestRootKeys(s, defaultRuleset, 2);
    for (let seed = 0; seed < 8; seed++) {
      const a = alphaBetaAgent({ maxDepth: 2, useTT: true })(
        mulberry32(seed),
      ).selectAction(s, defaultRuleset);
      expect(best.has(`${a.piece}:${a.to.x},${a.to.y}`)).toBe(true);
    }
  });

  it("the TT prunes (nodes ≤ no-TT), is deterministic, and never returns an illegal move", () => {
    const s = createInitialState(defaultRuleset);
    let nodesNo = 0;
    let nodesTT = 0;
    alphaBetaAgent({
      maxDepth: 3,
      report: (i) => {
        nodesNo = i.nodes;
      },
    })(mulberry32(1)).selectAction(s, defaultRuleset);
    const a1 = alphaBetaAgent({
      maxDepth: 3,
      useTT: true,
      report: (i) => {
        nodesTT = i.nodes;
      },
    })(mulberry32(1)).selectAction(s, defaultRuleset);
    const a2 = alphaBetaAgent({ maxDepth: 3, useTT: true })(
      mulberry32(1),
    ).selectAction(s, defaultRuleset);
    expect(nodesTT).toBeGreaterThan(0);
    expect(nodesTT).toBeLessThanOrEqual(nodesNo);
    expect(a2).toEqual(a1);
    expect(validateAction(s, defaultRuleset, a1).legal).toBe(true);
  });

  it("TT-on picks the BYTE-IDENTICAL move to no-TT (move-identity, not just value — S015 review)", () => {
    // The ordering-only TT must only prune, never change the chosen move. The root orders by the ID
    // principal variation (NOT the TT), so the reservoir tiebreak sees the same move order TT-on vs
    // TT-off → the SAME move under the same seed. Asserting exact {piece,to} equality (not just
    // oracle-best-set membership) guards against a future value-caching regression that swaps to a
    // different EQUAL-value move — the cross-pass search-instability class behind the historical HIGH TT bug.
    const positions = [
      createInitialState(SMALL_AB),
      randomPosition(SMALL_AB, 11, 3),
      randomPosition(SMALL_AB, 22, 5),
      randomPosition(SMALL_AB, 5, 3),
    ];
    for (const s of positions) {
      if (s.status.state !== "playing") continue;
      for (const depth of [1, 2, 3, 4]) {
        for (let seed = 0; seed < 4; seed++) {
          const noTT = alphaBetaAgent({ maxDepth: depth })(
            mulberry32(seed),
          ).selectAction(s, SMALL_AB);
          const tt = alphaBetaAgent({ maxDepth: depth, useTT: true })(
            mulberry32(seed),
          ).selectAction(s, SMALL_AB);
          expect(tt).toEqual(noTT);
        }
      }
    }
  });
});

describe("alphaBetaAgent — node budget", () => {
  it("returns a legal move; the last completed depth used ≤ budget nodes", () => {
    const s = createInitialState(defaultRuleset);
    let nodes = -1;
    const a = alphaBetaAgent({
      nodeBudget: 5000,
      report: (i) => {
        nodes = i.nodes;
      },
    })(mulberry32(1)).selectAction(s, defaultRuleset);
    expect(validateAction(s, defaultRuleset, a).legal).toBe(true);
    expect(nodes).toBeGreaterThanOrEqual(0);
    expect(nodes).toBeLessThanOrEqual(5000);
  });

  it("is deterministic given a budget + seed", () => {
    const s = createInitialState(defaultRuleset);
    const mk = (): { piece: string; to: { x: number; y: number } } =>
      alphaBetaAgent({ nodeBudget: 8000 })(mulberry32(3)).selectAction(
        s,
        defaultRuleset,
      );
    expect(mk()).toEqual(mk());
  });

  it("a larger budget searches at least as deep", () => {
    const s = createInitialState(defaultRuleset);
    let dSmall = 0;
    let dBig = 0;
    alphaBetaAgent({
      nodeBudget: 1500,
      useTT: true,
      report: (i) => {
        dSmall = i.depth;
      },
    })(mulberry32(1)).selectAction(s, defaultRuleset);
    alphaBetaAgent({
      nodeBudget: 30000,
      useTT: true,
      report: (i) => {
        dBig = i.depth;
      },
    })(mulberry32(1)).selectAction(s, defaultRuleset);
    expect(dBig).toBeGreaterThanOrEqual(dSmall);
    expect(dBig).toBeGreaterThanOrEqual(2);
  });

  it("finds a forced win-in-1 within a tiny budget", () => {
    const ruleset: Ruleset = {
      version: "nb-winin1@1",
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
      alphaBetaAgent({ nodeBudget: 800 })(mulberry32(1)).selectAction(
        s,
        ruleset,
      ).to,
    ).toEqual({ x: 2, y: 0 });
  });

  it("throws if neither maxDepth nor nodeBudget is provided", () => {
    expect(() => alphaBetaAgent({})).toThrow();
  });
});

describe("alphaBetaAgent — TT value-identity (deep)", () => {
  // The TT is move-ordering-ONLY, so it must produce the IDENTICAL value to a no-TT search at every
  // depth — it can never change the chosen move, only prune faster. SMALL_AB at depth 6 is the position
  // where an earlier VALUE-caching TT diverged (it chose a true-value-(-8.5) move where (-8.1) was best,
  // a HIGH bug from the S010 adversarial review). We assert the TT agent's move achieves the SAME exact
  // value as the no-TT agent's (the proven oracle-correct baseline — see the depth-2 oracle test above),
  // via an αβ value oracle — guarding that the ordering-only design stays value-exact even deep.
  const MATE_V = 1_000_000;
  const orderCaps = (s: GameState, acts: Action[]): Action[] =>
    acts
      .map((a) => {
        const v = s.pieces.find((p) => p.x === a.to.x && p.y === a.to.y);
        const sc = v
          ? isRoyal(SMALL_AB, v.type)
            ? MATE_V
            : 100 + materialValue(v.type)
          : 0;
        return { a, sc };
      })
      .sort((x, y) => y.sc - x.sc)
      .map((e) => e.a);
  // Exact minimax value via alpha-beta pruning, NO transposition table (fast + oracle-correct).
  const abValue = (
    s: GameState,
    depth: number,
    alpha: number,
    beta: number,
    ply: number,
  ): number => {
    if (s.status.state === "won") return -(MATE_V - ply);
    const acts = legalActions(s, SMALL_AB);
    if (acts.length === 0) return 0;
    if (depth <= 0) return quiesceOracle(s, SMALL_AB, ply); // quiescent leaves — match the agent
    let best = -Infinity;
    for (const a of orderCaps(s, acts)) {
      const ap = applyAction(s, SMALL_AB, a);
      if (!ap.ok) continue;
      best = Math.max(
        best,
        -abValue(ap.state, depth - 1, -beta, -alpha, ply + 1),
      );
      if (best > alpha) alpha = best;
      if (alpha >= beta) break;
    }
    return best;
  };
  const moveValue = (s: GameState, a: Action, depth: number): number => {
    const ap = applyAction(s, SMALL_AB, a);
    return ap.ok
      ? -abValue(ap.state, depth - 1, -Infinity, Infinity, 1)
      : -Infinity;
  };

  it("the TT agent matches the no-TT agent at depth 6 (value-exact)", () => {
    // randomPosition(SMALL_AB,5,3): the position where a VALUE-caching TT diverged (chose a true-(-8.5)
    // move where (-8.1) was best). The ordering-only TT must pick a move of the SAME exact value.
    const s = randomPosition(SMALL_AB, 5, 3);
    const noTT = alphaBetaAgent({ maxDepth: 6 })(mulberry32(0)).selectAction(
      s,
      SMALL_AB,
    );
    const tt = alphaBetaAgent({ maxDepth: 6, useTT: true })(
      mulberry32(0),
    ).selectAction(s, SMALL_AB);
    expect(moveValue(s, tt, 6)).toBeCloseTo(moveValue(s, noTT, 6), 3);
  }, 20000);
});
