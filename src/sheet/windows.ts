// Window drag, throw, pin, wobble and Home (spec 001 R7–R10, R21). A port of
// the mock's makeWin (part2.js) on the pure physics in physics.ts.
//
// Held: the grab point P stays exactly under the pointer; the window leans
// about P (010 R1), with no scale. Released: a flight on the throw curve, a dead stop at
// 2τ, then the pin kick swings it about P (transform-origin at P) to rest.
// One animation loop runs for all windows and stops when nothing moves (R22).
// While a window moves it has `will-change: transform` (009 R1).
import { active, cancel as cancelGesture, claim, free } from "./gestures";
import { LAYOUT, SHEET } from "./layout";
import {
  flight,
  flightAt,
  releaseVelocity,
  swayTarget,
  swing,
  throwLanding,
  torque,
  type Flight,
  type Sample,
  type Vec,
} from "./physics";
import { REDUCE, reduced, type View } from "./view";

const EDGE = 56; // screen px: a window held this close to a view edge scrolls the sheet
// screen px/s per px of depth into the edge zone (the mock's 0.35 px a frame at 60 Hz)
const EDGE_RATE = 21;
const STEP = 24; // sheet px per Alt + arrow key (R19)
const NUDGE: Record<string, Vec> = {
  ArrowLeft: [-STEP, 0],
  ArrowRight: [STEP, 0],
  ArrowUp: [0, -STEP],
  ArrowDown: [0, STEP],
};

interface Win {
  el: HTMLElement;
  w: number;
  h: number;
  home: Vec;
  x: number;
  y: number;
  th: number; // degrees
  v: number; // degrees per second
  g: Vec; // the grab point P in window px
  pointer: number | null; // the pointer holding it
  c: Vec; // that pointer, client px
  d: Vec; // its path since the press: each move's screen motion ÷ the zoom then
  samples: Sample[]; // [time, d], for the release velocity
  fl: { f: Flight; t0: number } | null;
  /** 013 R7: expanded over the page: no drag, throw, Home or draw */
  lifted: boolean;
}

export interface Windows {
  /** A window's current top-left, sheet px. */
  pos(id: string): Vec;
  /** Where a window comes to rest: its flight's landing, else `pos`. */
  rest(id: string): Vec;
  /** Flies a window home (R9). */
  home(id: string): void;
  /** Ends any drag with no throw and stops every flight where it is. */
  cancel(): void;
  /** Calls `cb(id)` each time a window is drawn (every pointer move and every frame while it moves). */
  onMove(cb: (id: string) => void): void;
  /** 013 R2, R7: stops the window where it is (no flight, no tilt) and
   * leaves its transform to the expanded layer until `drop`. */
  lift(id: string): void;
  /** 013 R2: the window is back on the sheet at its place. */
  drop(id: string): void;
}

export function createWindows(view: View): Windows {
  const vp = document.querySelector<HTMLElement>("#vp")!;
  const wins: Win[] = LAYOUT.map((s) => ({
    el: document.querySelector<HTMLElement>(`[data-win="${s.id}"]`)!,
    w: s.w,
    h: s.h,
    home: [s.x, s.y],
    x: s.x,
    y: s.y,
    th: 0,
    v: 0,
    // the pivot of a Home flight that starts before any grab: top centre
    g: [s.w / 2, 0],
    pointer: null,
    c: [0, 0],
    d: [0, 0],
    samples: [],
    fl: null,
    lifted: false,
  }));
  const byId = (id: string) => wins[LAYOUT.findIndex((s) => s.id === id)];
  const moved: ((id: string) => void)[] = [];

  // 009 R1: a layer hint only while the window moves, so a window at rest
  // is rastered at the current zoom, as before
  const hint = (s: Win) => {
    s.el.style.willChange =
      s.pointer !== null || s.fl || s.th || s.v ? "transform" : "";
  };
  const draw = (s: Win) => {
    if (s.lifted) return;
    s.el.style.transformOrigin = `${s.g[0]}px ${s.g[1]}px`;
    s.el.style.transform = `translate(${s.x}px, ${s.y}px) rotate(${s.th}deg)`;
    hint(s);
    view.redraw();
    for (const cb of moved) cb(s.el.dataset.win!);
  };
  // place a held window from its pointer, also after the sheet scrolls or zooms under it
  const follow = (s: Win) => {
    const [px, py] = view.toSheet(s.c[0], s.c[1]);
    s.x = px - s.g[0];
    s.y = py - s.g[1];
  };
  // sheet auto-scroll and zoom changes are not pointer motion (Approach)
  const sample = (s: Win, e: PointerEvent) => {
    const z = view.zoom();
    s.d = [
      s.d[0] + (e.clientX - s.c[0]) / z,
      s.d[1] + (e.clientY - s.c[1]) / z,
    ];
    s.c = [e.clientX, e.clientY];
    s.samples.push([e.timeStamp, s.d[0], s.d[1]]);
    if (s.samples.length > 16) s.samples.shift();
  };
  const arm = (s: Win): Vec => [s.w / 2 - s.g[0], s.h / 2 - s.g[1]];

  // ---- the loop: runs while something moves ----
  let raf = 0;
  let last = 0;
  const run = () => {
    if (raf) return;
    last = 0;
    raf = requestAnimationFrame(tick);
  };

  // scroll remainders, so the browser's whole-px scrollLeft does not change the rate
  const carry: Vec = [0, 0];
  /** Scrolls the sheet while P is in an edge zone; true while it can. */
  function edgeScroll(c: Vec, dt: number): boolean {
    const b = vp.getBoundingClientRect();
    const axis = (
      i: 0 | 1,
      p: number,
      lo: number,
      hi: number,
      key: "scrollLeft" | "scrollTop",
      max: number,
    ): boolean => {
      const d = Math.max(
        -EDGE,
        Math.min(
          EDGE,
          p < lo + EDGE ? p - lo - EDGE : p > hi - EDGE ? p - hi + EDGE : 0,
        ),
      );
      if (!d || (d < 0 ? vp[key] <= 0 : vp[key] >= max)) {
        carry[i] = 0;
        return false;
      }
      const want = vp[key] + d * EDGE_RATE * dt + carry[i];
      vp[key] = want;
      carry[i] = Math.max(-1, Math.min(1, want - vp[key]));
      return true;
    };
    const x = axis(
      0,
      c[0],
      b.left,
      b.left + vp.clientWidth,
      "scrollLeft",
      vp.scrollWidth - vp.clientWidth,
    );
    const y = axis(
      1,
      c[1],
      b.top,
      b.top + vp.clientHeight,
      "scrollTop",
      vp.scrollHeight - vp.clientHeight,
    );
    return x || y;
  }

  function tick(now: number): void {
    // frame-rate independent; a stalled tab does not jump (dt ≤ 50 ms)
    const dt = last ? Math.min(0.05, Math.max(0, now - last) / 1000) : 0;
    last = now;
    let busy = false;
    const still = reduced();
    for (const s of wins) {
      const held = s.pointer !== null;
      if (s.lifted || (!held && !s.fl && !s.th && !s.v)) continue;
      if (held) {
        busy = edgeScroll(s.c, dt) || busy;
        follow(s);
      }
      if (s.fl) {
        const t = Math.max(0, now - s.fl.t0) / 1000;
        [s.x, s.y] = flightAt(s.fl.f, t);
        // the pin: a dead stop, the momentum left becomes a swing
        if (t >= 2 * s.fl.f.tau) {
          s.v += s.fl.f.kick;
          s.fl = null;
        }
      }
      // held: lean by the pointer's torque about P (010 R1)
      const target =
        held && !still
          ? swayTarget(torque(arm(s), releaseVelocity(s.samples, now)))
          : 0;
      if (still) s.th = s.v = 0;
      else ({ th: s.th, v: s.v } = swing(s, dt, held, target));
      draw(s);
      busy ||= !!s.fl || target !== 0 || s.th !== 0 || s.v !== 0;
    }
    raf = busy ? requestAnimationFrame(tick) : 0;
  }

  /** Flies a window to `to` on the throw curve, then the pin rule. */
  function fly(s: Win, to: Vec): void {
    if (to[0] === s.x && to[1] === s.y) {
      // nowhere to go: settle a swing, else no frame at all (R22)
      if (s.fl || s.th || s.v) run();
      return;
    }
    if (reduced()) {
      [s.x, s.y] = to;
      s.th = s.v = 0;
      s.fl = null;
      return draw(s);
    }
    s.fl = { f: flight([s.x, s.y], to, arm(s)), t0: performance.now() };
    run();
  }

  /** Lets go of a held window; `thrown` at pointerup time `now`. */
  function letGo(s: Win, now?: number): void {
    s.pointer = null;
    s.el.classList.remove("lifted");
    const v: Vec = now === undefined ? [0, 0] : releaseVelocity(s.samples, now);
    s.samples = [];
    // cancelled (R21.b): the window stays where it is; a lean swings back
    if (now !== undefined) fly(s, throwLanding([s.x, s.y], v, s, SHEET));
    else if (s.th || s.v) run();
    // at rest now (no throw, or reduced motion): drop the layer hint; a
    // flight keeps it
    hint(s);
  }

  for (const s of wins) {
    const bar = s.el.querySelector<HTMLElement>(".bar")!;
    bar.addEventListener("pointerdown", (e) => {
      if (s.lifted) return;
      if (e.button !== 0 || (e.target as Element).closest("button")) return;
      if (!claim("win", e.pointerId, 1, () => letGo(s))) return;
      e.preventDefault(); // no text selection
      bar.setPointerCapture(e.pointerId);
      view.stop(); // the paper's glide is a gesture too
      // catch it (mock rule): a flight or wobble stops dead, θ = θ' = 0, and
      // the pivot is wherever the pointer landed
      s.fl = null;
      s.th = s.v = 0;
      s.pointer = e.pointerId;
      s.c = [e.clientX, e.clientY];
      const [px, py] = view.toSheet(e.clientX, e.clientY);
      s.g = [px - s.x, py - s.y];
      s.d = [0, 0];
      s.samples = [];
      sample(s, e);
      s.el.classList.add("lifted");
      draw(s);
      run();
    });
    bar.addEventListener("pointermove", (e) => {
      if (e.pointerId !== s.pointer) return;
      sample(s, e);
      follow(s);
      draw(s);
      run();
    });
    bar.addEventListener("pointerup", (e) => {
      if (e.pointerId !== s.pointer) return;
      free(e.pointerId);
      letGo(s, e.timeStamp);
    });
    // no pointerup will come: end with no throw (R21.b)
    for (const type of ["pointercancel", "lostpointercapture"])
      bar.addEventListener(type, (e) => {
        const id = (e as PointerEvent).pointerId;
        if (id !== s.pointer) return;
        free(id);
        letGo(s);
      });
    bar.addEventListener("dblclick", (e) => {
      if (!s.lifted && !(e.target as Element).closest("button")) home(s);
    });
    bar
      .querySelector<HTMLElement>("button.home")!
      .addEventListener("click", (e) => {
        // another pointer owns a gesture: a pointer click here must not end
        // it; a keyboard click (detail 0) still works
        if (e.detail && active()) return;
        home(s);
      });
    // R19: Alt + arrows move the focused window, Home sends it home; the
    // view follows it, so its focus stays beside the card
    s.el.addEventListener("keydown", (e) => {
      if (s.lifted) return;
      if (e.target !== s.el || e.ctrlKey || e.metaKey || e.shiftKey) return;
      const d = e.altKey ? NUDGE[e.key] : undefined;
      if (!d && (e.altKey || e.key !== "Home")) return;
      e.preventDefault(); // no native scroll, no Alt + arrow history step
      if (!d) return home(s);
      if (s.pointer === null) {
        // a flight under way ends at its landing; the move starts there
        if (s.fl) [s.x, s.y] = s.fl.f.to;
        s.fl = null;
        // inside the sheet, like a landing
        s.x = Math.min(SHEET.w - s.w, Math.max(0, s.x + d[0]));
        s.y = Math.min(SHEET.h - s.h, Math.max(0, s.y + d[1]));
        draw(s);
      }
      view.reveal(s.x, s.y, s.w, s.h);
    });
    draw(s);
  }

  // R17: reduced motion turned on mid-motion ends each flight at its landing,
  // with no tilt
  matchMedia(REDUCE).addEventListener("change", (e) => {
    if (!e.matches) return;
    cancelAnimationFrame(raf);
    raf = 0;
    for (const s of wins) {
      if (s.fl) [s.x, s.y] = s.fl.f.to;
      s.fl = null;
      s.th = s.v = 0;
      draw(s);
    }
    // a held window still needs the loop (edge auto-scroll)
    if (wins.some((s) => s.pointer !== null)) run();
  });

  // the sheet scrolled or zoomed under a held window: keep P under the
  // pointer, and restart the loop, so edge auto-scroll can go on
  view.onChange(() => {
    for (const s of wins)
      if (s.pointer !== null) {
        follow(s);
        draw(s);
        run();
      }
  });

  function home(s: Win): void {
    if (s.lifted) return;
    if (s.pointer !== null) cancelGesture();
    fly(s, s.home);
    // R19: a focus in this window (it, or its Home control) follows it home
    if (s.el.contains(document.activeElement))
      view.reveal(s.home[0], s.home[1], s.w, s.h);
  }

  return {
    pos: (id) => {
      const s = byId(id);
      return [s.x, s.y];
    },
    rest: (id) => {
      const s = byId(id);
      return s.fl ? s.fl.f.to : [s.x, s.y];
    },
    home: (id) => home(byId(id)),
    lift(id) {
      const s = byId(id);
      if (s.pointer !== null) cancelGesture();
      if (s.fl) [s.x, s.y] = s.fl.f.to;
      s.fl = null;
      s.th = s.v = 0;
      draw(s); // at rest, untilted: the place it comes back to
      s.lifted = true;
      s.el.style.transform = "";
      s.el.style.willChange = "";
    },
    drop(id) {
      const s = byId(id);
      s.lifted = false;
      draw(s);
    },
    onMove: (cb) => void moved.push(cb),
    cancel() {
      if (wins.some((s) => s.pointer !== null)) cancelGesture();
      cancelAnimationFrame(raf);
      raf = 0;
      for (const s of wins) {
        s.fl = null;
        s.th = s.v = 0;
        draw(s);
      }
    },
  };
}
