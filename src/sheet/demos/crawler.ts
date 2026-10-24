// Spec 006 R1, R3, R5, R6, R9: the Focused Web Crawler window, ported from
// the mock (reused.js "Crawler placeholder (simulated)"). The columns, the R3
// sentence, the footer and a hidden Pause are in the page
// (scripts/sheet-content.ts); mount fills the rows from the data module
// (crawler-data.ts) and shows Pause. Fixes against the mock: the stream is
// seeded; the timer runs only while the window is visible and not paused
// (its interval never stopped); Pause's name follows its action (it kept
// "Pause" while showing ▶); no row fades in under the contrast limit.
//
// At rest the rows show: mount takes the mock's 10 steps at once. Time: one
// setTimeout chain, a step each 700 ms (the mock's interval), not an
// animation-frame loop (001 R22). With reduced motion every column is full
// at once and nothing streams (R7; T5 covers the rest).
import "./crawler.css";
import "./demos.css";
import { REDUCE, reduced } from "../view";
import { ownPresses } from "./press";
import { crawl, precision, ROW_CAP, type Page } from "./crawler-data";

const STEP_MS = 700;
const PREFILL = 10;

let root: HTMLElement | null = null;
let off: AbortController | null = null;
let pause: HTMLButtonElement | null = null;
let state: ReturnType<typeof crawl> | null = null;
let ended = false;
let paused = false;
let shown = false;
let timer = 0;

const running = () => !!root && shown && !paused && !ended && !reduced();

/** Takes one step; false when the source has ended. */
function advance(): boolean {
  if (!ended && !state!.step()) ended = true;
  return !ended;
}

function row(p: Page): HTMLLIElement {
  const li = document.createElement("li");
  if (!p.ok) li.className = "no";
  const score = document.createElement("i");
  score.textContent = p.score.toFixed(2);
  li.append(`${p.ok ? "✓" : "✗"} `, score, ` ${p.host}/${p.path}`);
  return li;
}

function render(): void {
  const cols = root!.querySelectorAll(".col");
  state!.cols.forEach((c, k) => {
    const p = precision(c);
    cols[k].querySelector("h4 span:last-child")!.textContent =
      p === null ? "–" : `${Math.round(p * 100)}%`;
    cols[k].querySelector("ul")!.replaceChildren(...c.rows.map(row));
  });
  root!.closest(".sheet-win")!.querySelector(".cr-stat")!.textContent =
    `${state!.total()} pages · precision shown per strategy`;
}

/** Reduced motion: steps until every column is full, at once. */
function fill(): void {
  for (
    let i = 0;
    i < 1000 && state!.cols.some((c) => c.rows.length < ROW_CAP);
    i++
  )
    if (!advance()) break;
}

function tick(): void {
  timer = 0;
  if (!advance()) return;
  render();
  sync();
}

/** Starts or stops the timer chain to match the state. */
function sync(): void {
  if (running() && !timer) timer = window.setTimeout(tick, STEP_MS);
  else if (!running() && timer) {
    clearTimeout(timer);
    timer = 0;
  }
}

function label(): void {
  pause!.setAttribute("aria-label", paused ? "Resume" : "Pause");
  pause!.textContent = paused ? "▶" : "❚❚";
}

/** Fills the rows and wires Pause; once. `stop` ends the view's motion when
 * Pause is pressed (001 R21). `source` is for tests only (R1.a fixture);
 * the page passes none and streams the seeded stream. */
export function mount(
  el: HTMLElement,
  stop?: () => void,
  source?: Parameters<typeof crawl>[0],
): void {
  if (root) return;
  root = el;
  off = new AbortController();
  const signal = off.signal;
  state = crawl(source);
  ended = paused = false;
  for (let i = 0; i < PREFILL && advance(); i++);
  if (reduced()) fill();
  render();
  pause = el
    .closest(".sheet-win")!
    .querySelector<HTMLButtonElement>(".cr-pause")!;
  label();
  pause.hidden = false;
  ownPresses(pause, signal, stop);
  pause.addEventListener(
    "click",
    () => {
      paused = !paused;
      label();
      sync();
    },
    { signal },
  );
  matchMedia(REDUCE).addEventListener(
    "change",
    (e) => {
      if (e.matches) {
        fill();
        render();
      }
      sync();
    },
    { signal },
  );
  sync();
}

/** The window's rectangle is in the view and the tab is visible (R5). */
export function show(visible: boolean): void {
  shown = visible;
  if (root) sync();
}

/** Stops the timer and every listener; a later mount starts again. */
export function unmount(): void {
  if (!root) return;
  off!.abort();
  clearTimeout(timer);
  timer = 0;
  root = off = pause = state = null;
}
