// Spec 005 R1, R3–R5, R8: the Castle Wars window, ported from the mock
// (reused.js "Castle Wars sprite sheets"). The controls, canvas and footer are
// in the page (scripts/sheet-content.ts); mount wires them and loads the six
// sprite PNGs. Fixes against the mock: each frame shows for its own JSON
// duration, per unit; Pause; a loading, error and Retry state.
//
// Time: one setTimeout chain, to the next frame change of any unit. Not an
// animation-frame loop: frames last 100–1000 ms, and 001 R22 counts every
// animation-frame callback. No timer runs while the window is not visible,
// while paused, before the sprites load, or with reduced motion (001 R22,
// R17); each unit keeps the time left on its frame, so it resumes from there.
import "./castlewars.css";
import FRAMES from "virtual:castlewars-frames";
import { REDUCE, reduced } from "../view";
import { ownPresses } from "./press";

const SCALE = 2;

interface Sprite {
  frames: (typeof FRAMES)[keyof typeof FRAMES];
  img: HTMLImageElement | null;
  /** the frame shown, by index in the sheet */
  f: number;
  /** ms left on it while stopped; `due` is its end while running */
  left: number;
  due: number;
}
const units: Sprite[] = Object.values(FRAMES).map((frames) => ({
  frames,
  img: null,
  f: 0,
  left: 0,
  due: 0,
}));

let root: HTMLElement | null = null;
let off: AbortController | null = null;
let ctx: CanvasRenderingContext2D | null = null;
let anim = "idle";
let paused = false;
let shown = false;
let ready = false;
let timer = 0;
let tries = 0; // a load's number: a later load or unmount voids it

const running = () => ready && shown && !paused && !reduced();

/** Every unit at the first frame of the chosen animation. */
function rewind(): void {
  for (const u of units) {
    u.f = u.frames.tags[anim][0];
    u.left = u.frames.durations[u.f];
  }
}

function draw(): void {
  if (!ready || !ctx) return;
  const c = ctx.canvas;
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, c.width, c.height);
  // the mock's 3 × 2 grid: columns 186 px, each row's feet on its baseline
  units.forEach(({ frames: { w, h }, img, f }, i) => {
    const cx = (i % 3) * 186 + 93;
    const base = Math.floor(i / 3) * 125 + 118;
    ctx!.drawImage(
      img!,
      f * w,
      0,
      w,
      h,
      Math.round(cx - (w * SCALE) / 2),
      base - h * SCALE,
      w * SCALE,
      h * SCALE,
    );
  });
}

function schedule(): void {
  const next = Math.min(...units.map((u) => u.due));
  timer = window.setTimeout(step, Math.max(0, next - performance.now()));
}

function step(): void {
  timer = 0;
  const now = performance.now();
  let moved = false;
  for (const u of units) {
    const [a, b] = u.frames.tags[anim];
    while (u.due <= now) {
      u.f = u.f >= b ? a : u.f + 1;
      u.due += u.frames.durations[u.f];
      moved = true;
    }
  }
  if (moved) draw();
  schedule();
}

/** Starts or stops the timer chain to match the state. */
function sync(): void {
  const now = performance.now();
  if (running() && !timer) {
    for (const u of units) u.due = now + u.left;
    schedule();
  } else if (!running() && timer) {
    clearTimeout(timer);
    timer = 0;
    for (const u of units) u.left = Math.max(0, u.due - now);
  }
}

/** Plays `a` from its first frame (R1); also before the sprites load (R5). */
function choose(a: string): void {
  anim = a;
  for (const b of root!.querySelectorAll<HTMLElement>("[data-anim]"))
    b.setAttribute("aria-pressed", `${b.dataset.anim === a}`);
  root!.closest(".sheet-win")!.querySelector(".cw-info")!.textContent = a;
  clearTimeout(timer);
  timer = 0;
  rewind();
  draw();
  sync();
}

/** Loads the sprites not loaded yet; one try at a time (R5). */
function load(): void {
  const n = ++tries;
  const state = root!.querySelector<HTMLElement>(".cw-state")!;
  const retry = state.querySelector<HTMLButtonElement>(".cw-retry")!;
  state.hidden = false;
  state.querySelector("[role=status]")!.textContent = "Loading units…";
  retry.hidden = true;
  Promise.allSettled(
    units
      .filter((u) => !u.img)
      .map(
        (u) =>
          new Promise<void>((ok, fail) => {
            const img = new Image();
            img.onload = () => {
              if (n === tries) u.img = img;
              ok();
            };
            img.onerror = fail;
            img.src = u.frames.src;
          }),
      ),
  ).then(() => {
    if (n !== tries) return;
    if (units.some((u) => !u.img)) {
      state.querySelector("[role=status]")!.textContent =
        "Couldn't load the units.";
      retry.hidden = false;
      return;
    }
    state.hidden = true;
    ready = true;
    draw();
    sync();
  });
}

/** Wires the window's demo area and loads the sprites; once (R3). */
/** `stop` ends the view's motion when a button is pressed (001 R21). */
export function mount(el: HTMLElement, stop?: () => void): void {
  if (root) return;
  root = el;
  off = new AbortController();
  const signal = off.signal;
  ctx = el.querySelector("canvas")!.getContext("2d");
  ownPresses(el, signal, stop);
  for (const b of el.querySelectorAll<HTMLElement>("[data-anim]"))
    b.addEventListener("click", () => choose(b.dataset.anim!), { signal });
  const pause = el.querySelector<HTMLElement>(".cw-pause")!;
  pause.addEventListener(
    "click",
    () => {
      paused = !paused;
      pause.textContent = paused ? "resume" : "pause";
      sync();
    },
    { signal },
  );
  const retry = el.querySelector<HTMLElement>(".cw-retry")!;
  retry.addEventListener(
    "click",
    () => {
      // the button hides while loading: the focus goes to the animation
      if (document.activeElement === retry)
        el.querySelector<HTMLElement>('[aria-pressed="true"]')!.focus();
      load();
    },
    { signal },
  );
  // reduced motion turned on: the first frame of the chosen animation (R7)
  matchMedia(REDUCE).addEventListener(
    "change",
    (e) => {
      sync();
      if (e.matches) {
        rewind();
        draw();
      }
    },
    { signal },
  );
  rewind();
  load();
}

/** The window's rectangle is in the view and the tab is visible (R4). */
export function show(visible: boolean): void {
  shown = visible;
  if (root) sync();
}

/** Stops every timer and load; a later mount starts again. */
export function unmount(): void {
  if (!root) return;
  off!.abort();
  clearTimeout(timer);
  timer = 0;
  tries++;
  ready = false;
  for (const u of units) u.img = null;
  root = ctx = off = null;
}
