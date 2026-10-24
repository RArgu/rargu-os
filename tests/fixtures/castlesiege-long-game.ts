// 003 R10 (Codex review): a long legal CastleSiege game for import tests.
// Seeded: each turn a random legal move that does not end the game.
import {
  applyAction,
  legalActions,
  type Action,
  type GameState,
} from "../../src/apps/castlesiege/engine/index";
import { RULESET, newSave, replay } from "../../src/apps/castlesiege/session";

export function longGame(n: number, seed = 1): Action[] {
  let s = seed;
  const rnd = () => (s = (s * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
  let state = replay(newSave())[0];
  const out: Action[] = [];
  while (out.length < n) {
    const next: [Action, GameState][] = [];
    for (const a of legalActions(state, RULESET)) {
      const r = applyAction(state, RULESET, a);
      if (r.ok && r.state.status.state === "playing") next.push([a, r.state]);
    }
    if (next.length === 0) throw new Error(`no quiet move at ${out.length}`);
    const [a, after] = next[Math.floor(rnd() * next.length)];
    out.push(a);
    state = after;
  }
  return out;
}
