import { describe, expect, it } from "vitest";
import {
  applyAction,
  createInitialState,
  defaultRuleset,
  legalActions,
} from "../../../../src/apps/castlesiege/engine/index.js";
import { makeZobrist } from "../../../../src/apps/castlesiege/ai/zobrist.js";

describe("makeZobrist", () => {
  it("is deterministic given a seed", () => {
    const s = createInitialState(defaultRuleset);
    const z1 = makeZobrist(defaultRuleset, 123);
    const z2 = makeZobrist(defaultRuleset, 123);
    expect(z1.key(s)).toBe(z2.key(s));
  });

  it("same position → same key; flipping the side to move changes it", () => {
    const z = makeZobrist(defaultRuleset, 1);
    const s = createInitialState(defaultRuleset);
    // A clone of the same position hashes identically (order-independent over the piece list).
    expect(z.key({ ...s, pieces: s.pieces.map((p) => ({ ...p })) })).toBe(
      z.key(s),
    );
    expect(z.key({ ...s, toMove: "black" })).not.toBe(z.key(s));
  });

  it("moving a piece changes the key", () => {
    const z = makeZobrist(defaultRuleset, 7);
    const s = createInitialState(defaultRuleset);
    const a = legalActions(s, defaultRuleset)[0];
    if (a === undefined) throw new Error("expected a legal action");
    const r = applyAction(s, defaultRuleset, a);
    expect(r.ok).toBe(true);
    if (r.ok) expect(z.key(r.state)).not.toBe(z.key(s));
  });

  it("different seeds yield different key tables (collision-resistant)", () => {
    const s = createInitialState(defaultRuleset);
    expect(makeZobrist(defaultRuleset, 1).key(s)).not.toBe(
      makeZobrist(defaultRuleset, 2).key(s),
    );
  });
});
