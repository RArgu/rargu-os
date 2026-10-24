import { describe, expect, it } from "vitest";
import {
  applyAction,
  legalActions,
  validateAction,
  type Action,
} from "../../../src/apps/castlesiege/engine/index";
import {
  RULESET,
  current,
  isBotTurn,
  newSave,
  MAX_IMPORT_ACTIONS,
  parseSave,
  readSave,
  replay,
  serialize,
  setOptions,
  undo,
  type Save,
} from "../../../src/apps/castlesiege/session";
import { longGame } from "../../fixtures/castlesiege-long-game";

/** The first legal action that moves without capturing, for a quiet game. */
function quiet(save: Save): Action {
  const state = current(save);
  return legalActions(state, RULESET).find(
    (a) => !state.pieces.some((p) => p.x === a.to.x && p.y === a.to.y),
  )!;
}

function play(save: Save, n: number): Save {
  let s = save;
  for (let i = 0; i < n; i++) s = { ...s, actions: [...s.actions, quiet(s)] };
  return s;
}

describe("CastleSiege session", () => {
  it("rebuilds the position by folding the actions", () => {
    const save = play(newSave(), 4);
    const states = replay(save);
    expect(states).toHaveLength(5);
    expect(states[4].toMove).toBe("white");
    let state = states[0];
    for (const a of save.actions) {
      const r = applyAction(state, RULESET, a);
      expect(r.ok).toBe(true);
      if (r.ok) state = r.state;
    }
    expect(current(save)).toEqual(state);
  });

  it("undoes one action in hot-seat and back to the visitor's turn against the bot", () => {
    const hot = play(newSave({ mode: "hotseat" }), 3);
    expect(undo(hot).actions).toHaveLength(2);
    const bot = play(newSave({ mode: "bot", human: "white" }), 4);
    expect(undo(bot).actions).toHaveLength(2);
    // the visitor moved and the bot has not replied yet: just the visitor's move
    expect(undo(play(newSave(), 3)).actions).toHaveLength(2);
    // playing Black: the bot's opening move stays
    const black = play(newSave({ human: "black" }), 3);
    expect(undo(black).actions).toHaveLength(1);
    expect(undo(newSave()).actions).toHaveLength(0);
    expect(isBotTurn(black, current(undo(black)))).toBe(false);
  });

  it("round-trips a save", () => {
    const save = play(newSave({ mode: "hotseat", level: "hard", style: 1 }), 6);
    expect(parseSave(serialize(save))).toEqual(save);
  });

  it("rejects a corrupt save with a reason", () => {
    expect(() => parseSave("nope")).toThrow(/not a CastleSiege save/);
    expect(() => parseSave('{"format":"other"}')).toThrow(/not a CastleSiege/);
    const save = play(newSave(), 2);
    const text = serialize(save).replace(/"x": \d+/, '"x": 99');
    expect(() => parseSave(text)).toThrow(/not legal/);
    expect(() =>
      parseSave(JSON.stringify({ ...save, actions: [{ piece: 3 }] })),
    ).toThrow(/damaged/);
  });

  it("keeps the repetition history across a save and reload", () => {
    // White and Black each shuffle one piece out and back until the next
    // shuffle would repeat a position too often
    let save = newSave({ mode: "hotseat" });
    /** A quiet move for the side to move, and the move that undoes it. */
    const shuffle = (s: Save): [Action, Action] => {
      const state = current(s);
      const a = quiet(s);
      const p = state.pieces.find((q) => q.id === a.piece)!;
      return [a, { piece: a.piece, to: { x: p.x, y: p.y } }];
    };
    const [w1, w2] = shuffle(save);
    const [b1, b2] = shuffle({ ...save, actions: [w1] });
    const cycle = [w1, b1, w2, b2];
    let blocked: Action | null = null;
    for (let i = 0; i < 40 && !blocked; i++) {
      const next = cycle[save.actions.length % 4];
      if (!validateAction(current(save), RULESET, next).legal) blocked = next;
      else save = { ...save, actions: [...save.actions, next] };
    }
    expect(blocked).not.toBeNull();
    const reloaded = parseSave(serialize(save));
    expect(validateAction(current(reloaded), RULESET, blocked!).legal).toBe(
      false,
    );
  });

  it("keeps the position on an Opponent change and cancels a pending bot reply only when the bot no longer moves (003 R5)", () => {
    // three moves against the bot: the bot (Black) is to move
    const save = play(newSave(), 3);
    const state = current(save);
    expect(isBotTurn(save, state)).toBe(true);
    const hot = setOptions(save, state, { mode: "hotseat" });
    expect(hot.cancel).toBe(true);
    expect(hot.save.actions).toEqual(save.actions);
    expect(hot.save.mode).toBe("hotseat");
    // a new level or style keeps the reply; the next search uses them
    const level = setOptions(save, state, { level: "hard", style: 1 });
    expect(level.cancel).toBe(false);
    expect(level.save).toEqual({ ...save, level: "hard", style: 1 });
    // the bot not to move: cancel (a no-op when nothing is pending)
    const mine = play(newSave({ mode: "hotseat" }), 2);
    expect(setOptions(mine, current(mine), { mode: "bot" }).cancel).toBe(true);
  });
});

describe("readSave strict (003 R10, the sheet's Open…)", () => {
  const good = play(newSave({ mode: "hotseat", human: "black" }), 4);
  const text = (patch: Record<string, unknown>, drop?: string) => {
    const raw: Record<string, unknown> = { ...good, ...patch };
    if (drop) delete raw[drop];
    return JSON.stringify(raw);
  };

  it("reads a good save with its positions, replayed once", () => {
    const r = readSave(serialize(good), true);
    expect(r.save).toEqual(good);
    expect(r.states).toEqual(replay(good));
  });

  const bad: [string, string][] = [
    ["mode {}", text({ mode: {} })],
    ["human 7", text({ human: 7 })],
    ["level []", text({ level: [] })],
    ['style "bad"', text({ style: "bad" })],
    ['mode "online"', text({ mode: "online" })],
    ['human "red"', text({ human: "red" })],
    ['level "expert"', text({ level: "expert" })],
    ["style 2", text({ style: 2 })],
    ["no mode", text({}, "mode")],
    ["no human", text({}, "human")],
    ["no level", text({}, "level")],
    ["no style", text({}, "style")],
    ["no actions", text({}, "actions")],
    ["actions {}", text({ actions: {} })],
    [
      'to.x "1"',
      text({ actions: [{ piece: "white:sword:1", to: { x: "1", y: 3 } }] }),
    ],
    ["piece 3", text({ actions: [{ piece: 3, to: { x: 4, y: 3 } }] })],
    ["action null", text({ actions: [null] })],
  ];
  for (const [name, t] of bad)
    it(`rejects ${name}`, () => {
      expect(() => readSave(t, true)).toThrow(/damaged|not a CastleSiege/);
    });

  it("the old OS still reads them leniently (R13)", () => {
    expect(
      parseSave(text({ mode: {}, human: 7, level: [], style: "bad" })),
    ).toEqual({
      ...good,
      mode: "bot",
      human: "white",
      level: "easy",
      style: 0,
    });
  });

  it(`opens ${MAX_IMPORT_ACTIONS} moves; one more is too long, before any replay`, () => {
    const actions = longGame(MAX_IMPORT_ACTIONS + 1);
    const at = (n: number) =>
      serialize({ ...newSave(), actions: actions.slice(0, n) });
    expect(readSave(at(MAX_IMPORT_ACTIONS), true).states).toHaveLength(
      MAX_IMPORT_ACTIONS + 1,
    );
    expect(() => readSave(at(MAX_IMPORT_ACTIONS + 1), true)).toThrow(
      /too long/,
    );
    // the old OS has no limit
    expect(parseSave(at(MAX_IMPORT_ACTIONS + 1)).actions).toHaveLength(
      MAX_IMPORT_ACTIONS + 1,
    );
  });
});
