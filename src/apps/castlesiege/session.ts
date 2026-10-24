// A CastleSiege game as data: who plays, and the list of actions so far. The
// position is always rebuilt by replaying the actions through the engine, so
// a save can never hold a position the rules would not reach (and the
// repetition history comes back with it). No DOM here.
import {
  applyAction,
  createInitialState,
  defaultRuleset,
  type Action,
  type GameState,
  type PlayerId,
  type Ruleset,
} from "./engine/index";
import type { LevelId, Style } from "./bot";

export type Mode = "bot" | "hotseat";
export type Side = "white" | "black";

export interface Save {
  format: "cs-save@1";
  ruleset: string;
  mode: Mode;
  /** the side the visitor plays against the bot */
  human: Side;
  level: LevelId;
  style: Style;
  actions: Action[];
}

export const RULESET: Ruleset = defaultRuleset;

export function newSave(
  opts: Partial<Omit<Save, "format" | "actions">> = {},
): Save {
  return {
    format: "cs-save@1",
    ruleset: RULESET.version,
    mode: opts.mode ?? "bot",
    human: opts.human ?? "white",
    level: opts.level ?? "easy",
    style: opts.style ?? 0,
    actions: [],
  };
}

/**
 * Every position of the game, from the start to the current one. Throws on an
 * illegal action. A lesson passes its own small ruleset.
 */
export function replay(save: Save, ruleset: Ruleset = RULESET): GameState[] {
  let state = createInitialState(ruleset);
  const states = [state];
  save.actions.forEach((a, i) => {
    const r = applyAction(state, ruleset, a);
    if (!r.ok) throw new Error(`move ${i + 1} is not legal (${r.reason})`);
    state = r.state;
    states.push(state);
  });
  return states;
}

export function current(save: Save, ruleset: Ruleset = RULESET): GameState {
  const states = replay(save, ruleset);
  return states[states.length - 1];
}

/** Whose turn it is, as a side the UI knows. */
export function sideToMove(state: GameState): Side {
  return state.toMove === "black" ? "black" : "white";
}

export function isBotTurn(save: Save, state: GameState): boolean {
  return (
    save.mode === "bot" &&
    state.status.state === "playing" &&
    sideToMove(state) !== save.human
  );
}

/**
 * 003 R5: a new Opponent, bot level or style. The position and history stay.
 * `cancel`: drop a pending bot reply, as the bot no longer plays the side to
 * move. A new level or style is used from the next search.
 */
export function setOptions(
  save: Save,
  state: GameState,
  patch: Partial<Pick<Save, "mode" | "level" | "style">>,
): { save: Save; cancel: boolean } {
  const next = { ...save, ...patch };
  return { save: next, cancel: !isBotTurn(next, state) };
}

/**
 * Takes back one action in hot-seat, and in a bot game everything back to the
 * visitor's last turn (usually two: the bot's reply and the visitor's move).
 */
export function undo(save: Save): Save {
  if (save.actions.length === 0) return save;
  const actions = save.actions.slice(0, -1);
  if (save.mode === "bot") {
    while (actions.length > 0) {
      const toMove: PlayerId = actions.length % 2 === 0 ? "white" : "black";
      if (toMove === save.human) break;
      actions.pop();
    }
  }
  return { ...save, actions };
}

export function serialize(save: Save): string {
  return JSON.stringify(save, null, 1) + "\n";
}

const isSide = (v: unknown): v is Side => v === "white" || v === "black";

/**
 * 003 R10: the most moves the sheet opens. Replay work grows faster than
 * the move count (each position keeps its repetition counts); at this
 * length opening a game stays under 003 R8's 200 ms task limit at ×4 CPU
 * throttling (castlesiege-sheet-perf.spec.ts). Normal games are far shorter.
 */
export const MAX_IMPORT_ACTIONS = 500;

/** Reads a .siege file. Throws with a readable reason when it is not one, or does not replay. */
export function parseSave(text: string): Save {
  return readSave(text).save;
}

/**
 * Reads a .siege file and its positions (replayed once). `strict` (the
 * sheet, 003 R10): every setting must be present and allowed, and the game
 * at most MAX_IMPORT_ACTIONS long; otherwise unknown settings fall back to
 * the defaults (the old OS's files, R13).
 */
export function readSave(
  text: string,
  strict = false,
): { save: Save; states: GameState[] } {
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error("This is not a CastleSiege save (not JSON).");
  }
  if (!raw || typeof raw !== "object" || raw.format !== "cs-save@1") {
    throw new Error("This is not a CastleSiege save.");
  }
  if (raw.ruleset !== RULESET.version) {
    throw new Error(`This save uses rules ${String(raw.ruleset)}.`);
  }
  const actions = raw.actions;
  if (
    !Array.isArray(actions) ||
    !actions.every(
      (a: unknown) =>
        !!a &&
        typeof (a as Action).piece === "string" &&
        Number.isInteger((a as Action).to?.x) &&
        Number.isInteger((a as Action).to?.y),
    )
  ) {
    throw new Error("The move list in this save is damaged.");
  }
  if (strict) {
    const bad = (
      [
        ["mode", ["bot", "hotseat"]],
        ["human", ["white", "black"]],
        ["level", ["easy", "normal", "hard"]],
        ["style", [-1, 0, 1]],
      ] as const
    ).find(([k, ok]) => !(ok as readonly unknown[]).includes(raw[k]));
    if (bad) throw new Error(`The ${bad[0]} in this save is damaged.`);
    if (actions.length > MAX_IMPORT_ACTIONS)
      throw new Error(
        `This game is too long to open here (over ${MAX_IMPORT_ACTIONS} moves).`,
      );
  }
  const save: Save = {
    format: "cs-save@1",
    ruleset: RULESET.version,
    mode: raw.mode === "hotseat" ? "hotseat" : "bot",
    human: isSide(raw.human) ? raw.human : "white",
    level: raw.level === "normal" || raw.level === "hard" ? raw.level : "easy",
    style: raw.style === -1 || raw.style === 1 ? raw.style : 0,
    actions: (actions as Action[]).map((a) => ({
      piece: a.piece,
      to: { x: a.to.x, y: a.to.y },
    })),
  };
  return { save, states: replay(save) };
}
