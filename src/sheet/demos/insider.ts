// Spec 006 R2, R5, R6, R9, R10: the Insider Trading window, ported from the
// mock (reused.js "Insider placeholder"). The canvas, the flagged list, the
// chart summary, the R3 sentences and the footer are in the page
// (scripts/sheet-content.ts), complete; mount draws the chart and plays it.
//
// Play: at rest the full chart and list show. The first time the window is
// visible (in the view, tab visible) the chart plays once from hour 0; Replay
// plays it again. A run's state is one number, `at` (ms into the run); the
// hour drawn and the entries shown follow from it, so a stop, a resize or a
// redraw keeps it. Time: one setTimeout chain, running only while visible;
// Replay and unmount clear it. With reduced motion a run ends at once.
//
// Drawing: the mock's units (900 wide) scaled to the canvas's CSS size, so
// the geometry is in sheet px whatever the device pixel ratio; the backing
// store is the CSS size × devicePixelRatio. Colours come from the canvas's
// --chart-* properties (demos.css).
import "./insider.css";
import { REDUCE, reduced } from "../view";
import {
  flagged,
  HOURS,
  insiderMarket,
  SEED,
  SPIKE,
  SPIKE_LEN,
} from "./insider-data";
import { ownPresses } from "./press";

const HOUR = 20; // ms of play per market hour (mock: 0.9 h a frame at 60 fps)
const TICK = 40; // ms between draws
const GAP = 250; // ms between flagged entries, as in the mock
const UNITS = 900; // the mock canvas's width
const PAD = 40;
const FONT = "20px 'Pixel Operator', monospace";

const market = insiderMarket(SEED);
const flags = new Set(flagged(market).map((f) => f.wallet));
const SPIKE_AT = SPIKE * HOUR;
const END = Math.max(
  (HOURS - 1) * HOUR,
  flags.size ? SPIKE_AT + (flags.size - 1) * GAP : 0,
);

let root: HTMLElement | null = null;
let canvas: HTMLCanvasElement | null = null;
let off: AbortController | null = null;
let sized: ResizeObserver | null = null;
let timer = 0;
let at = END;
let visible = false;
let played = false;

const hourAt = (t: number) => Math.min(HOURS - 1, Math.floor(t / HOUR));
const shownAt = (t: number) =>
  t < SPIKE_AT ? 0 : Math.min(flags.size, 1 + Math.floor((t - SPIKE_AT) / GAP));

function draw(): void {
  const c = canvas;
  const [w, h] = [c?.clientWidth ?? 0, c?.clientHeight ?? 0];
  if (!c || !w || !h) return;
  const dpr = devicePixelRatio || 1;
  const [bw, bh] = [Math.round(w * dpr), Math.round(h * dpr)];
  if (c.width !== bw || c.height !== bh) [c.width, c.height] = [bw, bh];
  const x = c.getContext("2d")!;
  const k = w / UNITS;
  x.setTransform((bw / w) * k, 0, 0, (bh / h) * k, 0, 0);
  const W = UNITS;
  const H = h / k;
  const css = getComputedStyle(c);
  const v = (p: string) => css.getPropertyValue(p).trim();
  const X = (i: number) => PAD + (i / (HOURS - 1)) * (W - PAD * 2);
  const Y = (p: number) => H - PAD - p * (H - PAD * 2);
  x.fillStyle = v("--chart-bg");
  x.fillRect(0, 0, W, H);
  x.strokeStyle = v("--chart-grid");
  x.lineWidth = 1;
  x.fillStyle = v("--chart-axis");
  x.font = FONT;
  for (const p of [0, 0.25, 0.5, 0.75, 1]) {
    x.beginPath();
    x.moveTo(PAD, Y(p));
    x.lineTo(W - PAD, Y(p));
    x.stroke();
    x.fillText(`${Math.round(p * 100)}¢`, 4, Y(p) + 6);
  }
  const upto = hourAt(at);
  if (upto >= SPIKE) {
    x.fillStyle = v("--chart-band");
    x.fillRect(X(SPIKE), PAD, X(SPIKE + SPIKE_LEN) - X(SPIKE), H - PAD * 2);
    x.fillStyle = v("--chart-spike");
    x.fillText("spike", X(SPIKE) + 4, PAD + 16);
  }
  const [dot, hot] = [v("--chart-dot"), v("--chart-flag")];
  for (const t of market.trades) {
    if (t.hour > upto) continue;
    x.beginPath();
    x.arc(X(t.hour), Y(market.price[t.hour]), Math.sqrt(t.size) * 2, 0, 7);
    x.fillStyle = flags.has(t.wallet) && upto >= SPIKE ? hot : dot;
    x.fill();
  }
  x.strokeStyle = v("--chart-line");
  x.lineWidth = 3;
  x.beginPath();
  for (let i = 0; i <= upto; i++) {
    const [px, py] = [X(i), Y(market.price[i])];
    if (i) x.lineTo(px, py);
    else x.moveTo(px, py);
  }
  x.stroke();
}

/** The footer and the list for `at`, then the chart. */
function render(): void {
  if (!root) return;
  const win = root.closest(".sheet-win")!;
  win.querySelector(".ins-t")!.textContent = `t = ${hourAt(at)}h of ${HOURS}h`;
  const n = shownAt(at);
  root
    .querySelectorAll<HTMLElement>(".flags > div")
    .forEach((d, i) => (d.hidden = i >= n));
  root.querySelector<HTMLElement>(".flags > .note")!.hidden = n > 0;
  draw();
}

const running = () => visible && at < END && !reduced();

function tick(): void {
  timer = 0;
  at = Math.min(END, at + TICK);
  render();
  sync();
}

/** Starts or stops the one timer chain to match the state. */
function sync(): void {
  if (running() && !timer) timer = window.setTimeout(tick, TICK);
  else if (!running() && timer) {
    clearTimeout(timer);
    timer = 0;
  }
}

/** A run from hour 0; the last run's timer is cleared first (R6). */
function play(): void {
  played = true;
  clearTimeout(timer);
  timer = 0;
  at = reduced() ? END : 0;
  render();
  sync();
}

/** `stop` ends the view's motion when Replay is pressed (001 R21). */
export function mount(el: HTMLElement, stop?: () => void): void {
  if (root) return;
  root = el;
  canvas = el.querySelector("canvas")!;
  off = new AbortController();
  const signal = off.signal;
  const replay = el
    .closest(".sheet-win")!
    .querySelector<HTMLButtonElement>(".ins-replay")!;
  replay.hidden = false;
  replay.addEventListener("click", play, { signal });
  ownPresses(replay, signal, stop);
  // the backing store follows the CSS size and the device pixel ratio; a
  // ratio change at the same CSS size reaches only the resolution query,
  // re-armed for each new ratio. A redraw keeps `at`.
  sized = new ResizeObserver(draw);
  sized.observe(canvas);
  const ratio = () =>
    matchMedia(`(resolution: ${devicePixelRatio}dppx)`).addEventListener(
      "change",
      () => {
        draw();
        ratio();
      },
      { once: true, signal },
    );
  ratio();
  // R8: the colours come from CSS; a live theme change draws again
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", draw, {
    signal,
  });
  // the canvas text needs the self-hosted font: draw again once it is in
  document.fonts?.load(FONT).then(() => {
    if (root === el) draw();
  });
  // reduced motion turned on mid-run: the end at once (R7)
  matchMedia(REDUCE).addEventListener(
    "change",
    (e) => {
      if (e.matches && at < END) {
        at = END;
        render();
      }
      sync();
    },
    { signal },
  );
  render();
  sync();
}

/** The window's rectangle is in the view and the tab is visible (R5). */
export function show(v: boolean): void {
  visible = v;
  if (!root) return;
  if (v && !played) play();
  else sync();
}

/** Stops the timer and every listener; the page keeps the full chart's
 * list. A later mount starts again. */
export function unmount(): void {
  if (!root) return;
  clearTimeout(timer);
  timer = 0;
  off!.abort();
  sized!.disconnect();
  at = END;
  render();
  root
    .closest(".sheet-win")!
    .querySelector<HTMLElement>(".ins-replay")!.hidden = true;
  played = false;
  root = canvas = off = sized = null;
}
