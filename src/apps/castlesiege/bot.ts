// The bot: the vendored alpha-beta search, run on the main thread in slices
// so the window stays responsive (SPEC §7.14). Pure apart from the clock and
// the macrotask scheduler, both of which can be replaced in tests.
import { alphaBetaSliced } from "./ai/alphabeta";
import { aggressionEval } from "./ai/aggression";
import { mulberry32 } from "./ai/rng";
import {
  legalActions,
  type Action,
  type GameState,
  type Ruleset,
} from "./engine/index";

export type LevelId = "easy" | "normal" | "hard";

export interface BotLevel {
  id: LevelId;
  label: string;
  maxDepth: number;
  nodeBudget: number;
}

export const LEVELS: BotLevel[] = [
  { id: "easy", label: "Easy", maxDepth: 2, nodeBudget: 4_000 },
  { id: "normal", label: "Normal", maxDepth: 3, nodeBudget: 20_000 },
  { id: "hard", label: "Hard", maxDepth: 3, nodeBudget: 60_000 },
];

/** Hard looks one ply further when the position is narrow enough to afford it. */
const HARD_DEEP_ACTIONS = 12;

export type Style = -1 | 0 | 1;
export const STYLES: { value: Style; label: string }[] = [
  { value: -1, label: "Defensive" },
  { value: 0, label: "Balanced" },
  { value: 1, label: "Aggressive" },
];

export function levelOf(id: string): BotLevel {
  return LEVELS.find((l) => l.id === id) ?? LEVELS[1];
}

export interface ThinkOptions {
  signal: AbortSignal;
  /** milliseconds of searching before giving the page a turn (default 12) */
  yieldEvery?: number;
  /** tiebreak seed; the same seed and position give the same move */
  seed?: number;
  /** tests: a fixed depth instead of the level's depth and budget */
  fixedDepth?: number;
  /** tests and telemetry: the clock, and the length of every slice */
  now?: () => number;
  onSlice?: (ms: number) => void;
  /** tests: how to give the page a turn */
  nextTask?: () => Promise<void>;
}

/** Resolves on the next macrotask, so input and painting can run in between. */
export function nextTask(): Promise<void> {
  if (typeof MessageChannel !== "undefined") {
    return new Promise((resolve) => {
      const ch = new MessageChannel();
      ch.port1.onmessage = () => {
        ch.port1.close();
        ch.port2.close();
        resolve();
      };
      ch.port2.postMessage(0);
    });
  }
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function abortError(): Error {
  const err = new Error("The bot was stopped.");
  err.name = "AbortError";
  return err;
}

/** Picks the bot's action. Rejects with an AbortError when the signal fires. */
export async function think(
  state: GameState,
  ruleset: Ruleset,
  level: BotLevel,
  style: Style,
  opts: ThinkOptions,
): Promise<Action> {
  const now = opts.now ?? (() => performance.now());
  const every = opts.yieldEvery ?? 12;
  const turn = opts.nextTask ?? nextTask;
  if (opts.signal.aborted) throw abortError();
  const deep =
    level.id === "hard" &&
    legalActions(state, ruleset).length <= HARD_DEEP_ACTIONS;
  const agent = alphaBetaSliced(
    opts.fixedDepth !== undefined
      ? {
          maxDepth: opts.fixedDepth,
          useTT: true,
          evalFn: aggressionEval(style),
        }
      : {
          maxDepth: deep ? level.maxDepth + 1 : level.maxDepth,
          nodeBudget: level.nodeBudget,
          useTT: true,
          evalFn: aggressionEval(style),
        },
  )(mulberry32(opts.seed ?? 1));
  let sliceStart = now();
  const pause = async (): Promise<void> => {
    if (opts.signal.aborted) throw abortError();
    const t = now();
    if (t - sliceStart < every) return;
    opts.onSlice?.(t - sliceStart);
    await turn();
    if (opts.signal.aborted) throw abortError();
    sliceStart = now();
  };
  const action = await agent.selectAction(state, ruleset, pause);
  opts.onSlice?.(now() - sliceStart);
  if (opts.signal.aborted) throw abortError();
  return action;
}
