import { describe, expect, it } from "vitest";
import { alphaBetaAgent } from "../../../src/apps/castlesiege/ai/alphabeta";
import { aggressionEval } from "../../../src/apps/castlesiege/ai/aggression";
import { mulberry32 } from "../../../src/apps/castlesiege/ai/rng";
import { LEVELS, think } from "../../../src/apps/castlesiege/bot";
import {
  applyAction,
  createInitialState,
  defaultRuleset,
  legalActions,
  type GameState,
} from "../../../src/apps/castlesiege/engine/index";

const ruleset = defaultRuleset;

/** 20 positions from a seeded random game (restarting if it ends). */
function positions(count: number, seed: number): GameState[] {
  const rng = mulberry32(seed);
  const out: GameState[] = [];
  let state = createInitialState(ruleset);
  while (out.length < count) {
    out.push(state);
    const acts = legalActions(state, ruleset);
    const r = applyAction(
      state,
      ruleset,
      acts[Math.floor(rng() * acts.length)],
    );
    state =
      r.ok && r.state.status.state === "playing"
        ? r.state
        : createInitialState(ruleset);
  }
  return out;
}

const now = (): Promise<void> => Promise.resolve();
const keyOf = (a: { piece: string; to: { x: number; y: number } }): string =>
  `${a.piece}@${a.to.x},${a.to.y}`;

describe("CastleSiege bot driver", () => {
  // depth 3 takes about 1 s a position in Node, so it checks fewer positions
  it.each([
    [2, 20],
    [3, 8],
  ])(
    "returns the synchronous search's move at depth %i (%i positions)",
    async (depth, count) => {
      for (const [i, state] of positions(count, 42).entries()) {
        const sync = alphaBetaAgent({
          maxDepth: depth,
          useTT: true,
          evalFn: aggressionEval(0),
        })(mulberry32(i + 1)).selectAction(state, ruleset);
        const sliced = await think(state, ruleset, LEVELS[0], 0, {
          signal: new AbortController().signal,
          fixedDepth: depth,
          seed: i + 1,
          nextTask: now,
          yieldEvery: 0,
        });
        expect(keyOf(sliced), `position ${i}`).toBe(keyOf(sync));
      }
    },
    120_000,
  );

  it("gives the page a turn at least every 150 ms (about 20 ms in practice)", async () => {
    const slices: number[] = [];
    for (const level of LEVELS) {
      for (const state of positions(4, 7)) {
        await think(state, ruleset, level, 0, {
          signal: new AbortController().signal,
          onSlice: (ms) => slices.push(ms),
        });
      }
    }
    expect(Math.max(...slices)).toBeLessThan(150);
  }, 120_000);

  it("stops with an AbortError when the signal fires mid-search", async () => {
    const ctl = new AbortController();
    let turns = 0;
    const run = think(createInitialState(ruleset), ruleset, LEVELS[2], 1, {
      signal: ctl.signal,
      yieldEvery: 0,
      nextTask: async () => {
        if (++turns === 3) ctl.abort();
      },
    });
    await expect(run).rejects.toMatchObject({ name: "AbortError" });
    // an already aborted signal never starts
    await expect(
      think(createInitialState(ruleset), ruleset, LEVELS[0], 0, {
        signal: ctl.signal,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
  });

  it("plays a legal move at every level and style", async () => {
    const state = positions(5, 3)[4];
    for (const level of LEVELS) {
      for (const style of [-1, 0, 1] as const) {
        const a = await think(state, ruleset, level, style, {
          signal: new AbortController().signal,
          nextTask: now,
        });
        expect(applyAction(state, ruleset, a).ok).toBe(true);
      }
    }
  }, 120_000);
});
