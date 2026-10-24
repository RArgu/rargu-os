import { describe, it, expect } from "vitest";
import {
  applyAction,
  createInitialState,
  legalActions,
  legalActionsForPiece,
  validateAction,
} from "../../../../src/apps/castlesiege/engine/core.js";
import {
  defaultRuleset,
  ruleset_1_0_0,
} from "../../../../src/apps/castlesiege/engine/rulesets/default.js";
import type {
  Action,
  ApplyResult,
  GameEvent,
  GameState,
  Ruleset,
} from "../../../../src/apps/castlesiege/engine/types.js";

// ---------------------------------------------------------------------------
// Property / invariant tests over whole SEEDED playouts (engine audit).
//
// A deterministic LCG stands in for randomness (the engine itself is pure and
// RNG-free, D3 — the seed only diversifies the games the properties are
// checked against). Every property here is a consequence of RULES_SPEC /
// ENGINE_DESIGN, asserted at EVERY ply of every playout:
//   1. determinism — same ruleset + same action sequence ⇒ identical states+events;
//   2. replay round-trip — re-folding the recorded actions reproduces every state;
//   3. JSON round-trip — a serialized state resumes indistinguishably;
//   4. validateAction ⟺ enumeration — full board × pieces equivalence;
//   5. structural soundness — occupancy, bounds, ids, capture-only shrinkage,
//      turn alternation, event/status consistency, positionCounts bookkeeping.
// ---------------------------------------------------------------------------

/** Deterministic 32-bit LCG (Numerical Recipes constants). */
function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

interface PlayoutStep {
  action: Action;
  state: GameState; // state AFTER the action
  events: GameEvent[];
}

interface Playout {
  initial: GameState;
  steps: PlayoutStep[];
}

/** Play a seeded random game to termination or plyCap. Pure + deterministic. */
function playout(ruleset: Ruleset, seed: number, plyCap: number): Playout {
  const rng = makeRng(seed);
  const initial = createInitialState(ruleset);
  let state = initial;
  const steps: PlayoutStep[] = [];
  for (let ply = 0; ply < plyCap; ply++) {
    if (state.status.state !== "playing") break;
    const actions = legalActions(state, ruleset);
    if (actions.length === 0) break; // only reachable when noMovesLoses is off
    const action = actions[Math.floor(rng() * actions.length)]!;
    const res: ApplyResult = applyAction(state, ruleset, action);
    expect(res.ok).toBe(true); // an enumerated action must apply cleanly
    if (!res.ok) throw new Error("unreachable");
    steps.push({ action, state: res.state, events: res.events });
    state = res.state;
  }
  return { initial, steps };
}

// 500 plies comfortably covers a full random game (measured 256–386 for these
// seeds), so the playouts genuinely REACH terminal states and the win-status
// branches of every invariant below are exercised — not just the mid-game ones.
const SEEDS = [1, 42, 0xc0ffee];
const PLY_CAP = 500;

// ---------------------------------------------------------------------------
// 1. Determinism
// ---------------------------------------------------------------------------

describe("determinism (same ruleset + same seed ⇒ byte-identical run)", () => {
  it("createInitialState is deterministic (two calls are deep-equal)", () => {
    expect(createInitialState(defaultRuleset)).toStrictEqual(
      createInitialState(defaultRuleset),
    );
    expect(createInitialState(ruleset_1_0_0)).toStrictEqual(
      createInitialState(ruleset_1_0_0),
    );
  });

  it("two identical playouts produce identical action, state, and event sequences", () => {
    for (const ruleset of [defaultRuleset, ruleset_1_0_0]) {
      for (const seed of SEEDS) {
        const a = playout(ruleset, seed, PLY_CAP);
        const b = playout(ruleset, seed, PLY_CAP);
        expect(a.initial).toStrictEqual(b.initial);
        expect(a.steps).toStrictEqual(b.steps);
        // The cap must not be what stopped the game — terminals are part of the property.
        expect(a.steps[a.steps.length - 1]!.state.status.state).toBe("won");
      }
    }
  });

  it("legalActions is stable — two enumerations of the same state are identical (order included)", () => {
    const state = createInitialState(defaultRuleset);
    expect(legalActions(state, defaultRuleset)).toStrictEqual(
      legalActions(state, defaultRuleset),
    );
  });
});

// ---------------------------------------------------------------------------
// 2. Replay round-trip (fold the recorded actions ⇒ recorded states)
// ---------------------------------------------------------------------------

describe("replay round-trip (re-applying the recorded actions reproduces every state)", () => {
  it("holds at every ply for both the non-Markov 1.1.0 and the frozen Markov 1.0.0", () => {
    for (const ruleset of [defaultRuleset, ruleset_1_0_0]) {
      for (const seed of SEEDS) {
        const game = playout(ruleset, seed, PLY_CAP);
        let state = createInitialState(ruleset);
        expect(state).toStrictEqual(game.initial);
        for (const step of game.steps) {
          const res = applyAction(state, ruleset, step.action);
          expect(res.ok).toBe(true);
          if (!res.ok) throw new Error("unreachable");
          expect(res.state).toStrictEqual(step.state);
          expect(res.events).toStrictEqual(step.events);
          state = res.state;
        }
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 3. JSON serialization round-trip (PLATFORM_PLAN §4: state is wire-safe)
// ---------------------------------------------------------------------------

describe("JSON round-trip (a serialized state resumes indistinguishably)", () => {
  it("round-tripping any mid-game state preserves it exactly and yields identical continuations", () => {
    for (const ruleset of [defaultRuleset, ruleset_1_0_0]) {
      const game = playout(ruleset, 42, PLY_CAP);
      for (let i = 0; i < game.steps.length; i++) {
        const step = game.steps[i]!;
        const revived = JSON.parse(JSON.stringify(step.state)) as GameState;
        expect(revived).toStrictEqual(step.state);
        const next = game.steps[i + 1];
        if (next !== undefined) {
          const res = applyAction(revived, ruleset, next.action);
          expect(res.ok).toBe(true);
          if (!res.ok) throw new Error("unreachable");
          expect(res.state).toStrictEqual(next.state);
        }
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 4. validateAction ⟺ enumeration (full board × mover pieces)
// ---------------------------------------------------------------------------

describe("validateAction agrees with enumeration over the WHOLE board", () => {
  it("an action is legal iff it appears in legalActionsForPiece (sampled plies, every square)", () => {
    for (const ruleset of [defaultRuleset, ruleset_1_0_0]) {
      const game = playout(ruleset, 1, PLY_CAP);
      // Initial + a spread of mid-game states (skip the terminal state — both
      // surfaces are empty there and the GAME_OVER path is covered elsewhere).
      const states = [game.initial, ...game.steps.map((s) => s.state)]
        .filter((s) => s.status.state === "playing")
        .filter((_, i) => i % 25 === 0);
      for (const state of states) {
        for (const p of state.pieces) {
          const enumerated = new Set(
            legalActionsForPiece(state, ruleset, p.id).map(
              (a) => `${a.to.x},${a.to.y}`,
            ),
          );
          for (let x = 0; x < state.board.width; x++) {
            for (let y = 0; y < state.board.height; y++) {
              const verdict = validateAction(state, ruleset, {
                piece: p.id,
                to: { x, y },
              });
              expect(verdict.legal, `${p.id}->(${x},${y})`).toBe(
                enumerated.has(`${x},${y}`),
              );
            }
          }
        }
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 5. Structural invariants along every playout
// ---------------------------------------------------------------------------

describe("structural invariants hold at every ply", () => {
  it("occupancy, bounds, ids, shrink-only pieces, turn handoff, events, positionCounts", () => {
    for (const ruleset of [defaultRuleset, ruleset_1_0_0]) {
      const repetitionOn = ruleset.repetitionLimit !== undefined;
      for (const seed of SEEDS) {
        const game = playout(ruleset, seed, PLY_CAP);
        let prev = game.initial;
        for (const [i, step] of game.steps.entries()) {
          const { state, events } = step;

          // ≤1 piece per square; every piece in bounds; unique ids.
          const squares = new Set<string>();
          const ids = new Set<string>();
          for (const p of state.pieces) {
            const sq = `${p.x},${p.y}`;
            expect(
              squares.has(sq),
              `double occupancy at ${sq} (ply ${i})`,
            ).toBe(false);
            squares.add(sq);
            expect(ids.has(p.id)).toBe(false);
            ids.add(p.id);
            expect(p.x).toBeGreaterThanOrEqual(0);
            expect(p.x).toBeLessThan(state.board.width);
            expect(p.y).toBeGreaterThanOrEqual(0);
            expect(p.y).toBeLessThan(state.board.height);
          }

          // Pieces only leave via capture: count drops by exactly the captured events.
          const captured = events.filter((e) => e.type === "captured").length;
          expect(captured).toBeLessThanOrEqual(1); // one action ⇒ at most one capture
          expect(state.pieces.length).toBe(prev.pieces.length - captured);

          // Capture-swap semantics: swapped ⟺ melee (RULES_SPEC §4).
          for (const e of events) {
            if (e.type === "captured") {
              expect(e.swapped).toBe(e.class === "melee");
            }
          }

          // Turn handoff: the mover was prev.toMove; toMove advanced to the next player.
          const mover = prev.toMove;
          const actor = prev.pieces.find((p) => p.id === step.action.piece);
          expect(actor?.owner).toBe(mover);
          expect(state.toMove).not.toBe(mover); // 2-player rulesets here

          // Status/event consistency: a won status ⟺ a won event, winner = mover,
          // and `by` is an active win condition or the noMoves label.
          const wonEvent = events.find((e) => e.type === "won");
          if (state.status.state === "won") {
            expect(wonEvent).toBeDefined();
            expect(state.status.winner).toBe(mover);
            const allowed = [
              ...ruleset.winConditions,
              ruleset.noMovesWinCondition ?? "noLegalMove",
            ];
            expect(allowed).toContain(state.status.by);
          } else {
            expect(wonEvent).toBeUndefined();
          }

          // positionCounts bookkeeping: absent ⟺ Markov; when present, exactly one
          // occurrence appended per ply (sum = ply index + 2 counting the seed).
          if (repetitionOn) {
            const counts = state.positionCounts;
            expect(counts).toBeDefined();
            const sum = Object.values(counts!).reduce((a, b) => a + b, 0);
            expect(sum).toBe(i + 2);
            for (const v of Object.values(counts!)) {
              expect(v).toBeGreaterThanOrEqual(1);
            }
          } else {
            expect(state.positionCounts).toBeUndefined();
          }

          prev = state;
        }
      }
    }
  });

  it("applyAction never mutates its input state anywhere along a playout", () => {
    const ruleset = defaultRuleset;
    const rng = makeRng(7);
    let state = createInitialState(ruleset);
    for (let ply = 0; ply < PLY_CAP; ply++) {
      if (state.status.state !== "playing") break;
      const actions = legalActions(state, ruleset);
      if (actions.length === 0) break;
      const action = actions[Math.floor(rng() * actions.length)]!;
      const before = JSON.parse(JSON.stringify(state)) as GameState;
      const res = applyAction(state, ruleset, action);
      expect(state).toStrictEqual(before);
      expect(res.ok).toBe(true);
      if (!res.ok) throw new Error("unreachable");
      state = res.state;
    }
  });
});
