// Pan, zoom and minimap of the sheet (spec 001 R4–R6). A port of the mock's
// part2.js with the spec's fixes: fit uses the full view (no 15 % floor, no
// margin), deltaMode and Safari gesture events, and no animation frame runs
// while nothing moves (R22).
import { cancel, claim, free } from "./gestures";
import { LAYOUT, SHEET } from "./layout";

const Z_MAX = 1.6;
const PAN_MS = 320; // the card's navigation pan (R12)
const GLIDE_TAU = 0.18; // s: the paper's glide decay (the mock's)
/** Phone widths: the card folds into a bar (R15). Matches sheet.css. */
export const PHONE = "(max-width: 760px)";
const KEY_STEP = 64; // screen px per arrow key on the sheet
const MAP_STEP = 120; // sheet px per arrow key on the minimap
const KEYS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};
// presses here belong to the content, not to a touch pan
const NOPAN =
  ".bar, a, button, input, textarea, select, label, [contenteditable]";

export const REDUCE = "(prefers-reduced-motion: reduce)";
// read at each action, so a preference change applies at once (R17)
export const reduced = () => matchMedia(REDUCE).matches;
const arrow = (e: KeyboardEvent) =>
  e.altKey || e.ctrlKey || e.metaKey || e.shiftKey ? undefined : KEYS[e.key];

/** A text field's caret is collapsed at the end that arrow `d` moves it to
 * (fields with no caret, such as number inputs, never are). */
function caretAtEnd(t: HTMLElement, d: [number, number]): boolean {
  if (!(t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement))
    return false;
  const [s, e] = [t.selectionStart, t.selectionEnd];
  if (s === null || s !== e) return false;
  return d[0] + d[1] < 0 ? s === 0 : s === t.value.length;
}

/** A window on the minimap, in sheet px. */
export interface MapRect {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  tool: boolean;
}

export interface View {
  /** Current zoom: 1 sheet px = Z screen px. */
  zoom(): number;
  toSheet(clientX: number, clientY: number): [number, number];
  toScreen(x: number, y: number): [number, number];
  /** Zoom at once, keeping the screen point (ax, ay) still; default the view centre. */
  setZoom(z: number, ax?: number, ay?: number): void;
  /** Schedule one minimap redraw, for example after a window moves. */
  redraw(): void;
  /** Stops the zoom animation, the paper's glide and a navigation pan. */
  stop(): void;
  /** Pans so the sheet rect is centred in the view beside the card (R12). */
  panTo(x: number, y: number, w: number, h: number): void;
  /** panTo, only if the sheet rect is not wholly in the view beside the card (R19). */
  reveal(x: number, y: number, w: number, h: number, instant?: boolean): void;
  /** Focuses `el` for the card's navigation: no scroll and no reveal, the
   * navigation pan goes there (R12). A function: the focus changes it makes
   * reveal nothing (004 R11, the app a Quick tools icon activates). */
  navFocus(el: HTMLElement | (() => void)): void;
  /** The start view: 100 %, or on a phone the zoom that shows CastleSiege's
   * full width, with CastleSiege's home framed (R13, R15). */
  start(): void;
  /** Calls `cb` after every zoom or scroll, at once. */
  onChange(cb: () => void): void;
}

export function createView(rects: () => MapRect[]): View {
  const get = <T extends Element>(s: string) => document.querySelector<T>(s)!;
  const vp = get<HTMLElement>("#vp");
  const sizer = get<HTMLElement>("#sizer");
  const world = get<HTMLElement>("#world");
  const pct = get<HTMLElement>("#zPct");
  const mini = get<HTMLCanvasElement>("#mini");
  let Z = 1;
  // Insets in the scroller, so every part of the sheet can be shown clear of
  // the card (owner, option A). Phone: a top inset down to the folded bar's
  // bottom edge, so its 16 px top margin and any safe area are in it.
  // Desktop: a left inset to the card's right edge + 24 px and a 24 px top
  // inset. The sheet keeps its size; sheet x = (scroll x − insetL) / Z,
  // sheet y = (scroll y − inset) / Z.
  let inset = 0;
  let insetL = 0;
  const card = get<HTMLElement>("#card");
  /** The folded bar's bottom edge, client px, also while the card is open:
   * its top row plus the card's bottom padding and border. */
  function barBottom(): number {
    const cs = getComputedStyle(card);
    const px = (k: string) => parseFloat(cs.getPropertyValue(k));
    return (
      card.querySelector(".railtop")!.getBoundingClientRect().bottom +
      px("padding-bottom") +
      px("border-bottom-width")
    );
  }
  function measure(): void {
    const b = vp.getBoundingClientRect();
    const phone = matchMedia(PHONE).matches;
    const [wasT, wasL] = [inset, insetL];
    inset = phone ? barBottom() - b.top : 24;
    insetL = phone ? 0 : card.getBoundingClientRect().right + 24 - b.left;
    vp.style.paddingTop = `${inset}px`;
    vp.style.paddingLeft = `${insetL}px`;
    // the sheet stays where it was on screen
    vp.scrollTop += inset - wasT;
    vp.scrollLeft += insetL - wasL;
  }
  measure();

  const toSheet = (cx: number, cy: number): [number, number] => {
    const b = vp.getBoundingClientRect();
    return [
      (cx - b.left - insetL + vp.scrollLeft) / Z,
      (cy - b.top - inset + vp.scrollTop) / Z,
    ];
  };
  const toScreen = (x: number, y: number): [number, number] => {
    const b = vp.getBoundingClientRect();
    return [
      x * Z + insetL - vp.scrollLeft + b.left,
      y * Z + inset - vp.scrollTop + b.top,
    ];
  };
  // the whole sheet in the full view, inside any classic scrollbars (R5),
  // on a phone too
  const fit = () =>
    Math.min(Z_MAX, vp.clientWidth / SHEET.w, vp.clientHeight / SHEET.h);
  const clampZ = (z: number) => Math.min(Z_MAX, Math.max(fit(), z));

  function setZoom(z: number, ax?: number, ay?: number): void {
    const b = vp.getBoundingClientRect();
    ax ??= b.left + vp.clientWidth / 2;
    ay ??= b.top + vp.clientHeight / 2;
    zoomAround(z, toSheet(ax, ay), ax, ay);
  }

  /** Zooms and puts sheet point p under screen point (ax, ay). A pinch keeps
   * the p of its start, so scroll rounding does not add up over the moves. */
  function zoomAround(z: number, p: [number, number], ax: number, ay: number) {
    const b = vp.getBoundingClientRect();
    Z = clampZ(z);
    world.style.transform = `scale(${Z})`;
    // a window's focus ring keeps ≥ 2 screen px (sheet.css); whole px,
    // as browsers round outline widths down
    world.style.setProperty("--ring", `${Math.ceil(2 / Z)}px`);
    size();
    vp.scrollLeft = p[0] * Z + insetL - (ax - b.left);
    vp.scrollTop = p[1] * Z + inset - (ay - b.top);
    pct.textContent = `${Math.round(Z * 100)}%`;
    redraw();
    // the scroll may not change (clamped): tell held windows anyway
    changed();
  }
  /** The scrolled size: the sheet at Z. On a desktop at least the view, so
   * the scroll range can always take up the insets beside the card, also
   * when the sheet is smaller than the view (owner, option A). */
  function size(): void {
    const desk = !matchMedia(PHONE).matches;
    sizer.style.width = `${Math.max(SHEET.w * Z, desk ? vp.clientWidth : 0)}px`;
    sizer.style.height = `${Math.max(SHEET.h * Z, desk ? vp.clientHeight : 0)}px`;
  }
  const watchers: (() => void)[] = [];
  const changed = () => watchers.forEach((cb) => cb());

  // ---- animations: each stops scheduling frames when it is done ----
  let zRaf = 0;
  let glideRaf = 0;
  let panRaf = 0;
  // a Safari pinch: zoom and sheet point under the pointer at its start
  let gesture: { z: number; p: [number, number] } | null = null;
  // the navigation pan's sheet rect, so a resize can retarget it
  let goal: [number, number, number, number] | null = null;
  // the running animation's end state, for a reduced-motion change (R17)
  let finish: (() => void) | null = null;
  /** Ends every view motion where it is; returns its end state. */
  const halt = () => {
    cancelAnimationFrame(zRaf);
    cancelAnimationFrame(glideRaf);
    cancelAnimationFrame(panRaf);
    zRaf = glideRaf = panRaf = 0;
    const f = finish;
    finish = null;
    return f;
  };
  /** Ends every view motion, and a Safari pinch until its next gesturestart. */
  const stop = () => {
    halt();
    gesture = null;
  };
  // R17: reduced motion turned on mid-motion ends the motion at its target
  matchMedia(REDUCE).addEventListener("change", (e) => {
    if (e.matches) halt()?.();
  });

  /** The zoom buttons: 220 ms ease-out at the view centre. */
  function zoomTo(z: number): void {
    stop();
    const z0 = Z;
    const z1 = clampZ(z);
    if (z1 === z0) return;
    if (reduced()) return setZoom(z1);
    const t0 = performance.now();
    const step = (t: number) => {
      const k = Math.min(1, Math.max(0, (t - t0) / 220));
      setZoom(z0 + (z1 - z0) * (1 - (1 - k) ** 3));
      zRaf = k < 1 ? requestAnimationFrame(step) : 0;
      if (!zRaf) finish = null;
    };
    zRaf = requestAnimationFrame(step);
    finish = () => setZoom(z1);
  }

  /** The paper glides on after a flick at screen velocity v: the speed
   * decays with τ = 0.18 s and the glide stops at 20 px/s, at
   * T = τ·ln(|v| / 20). Closed form, so the frames, a reduced-motion commit
   * (R17) and a preference change all end at the same landing:
   * x(t) = x0 − v·τ·(1 − e^(−t/τ)), clamped to the scroll range. An axis at
   * its scroll limit stops at once, and the glide ends when every moving axis
   * has reached its limit, so no frames run for nothing (R22). */
  function glide(vx: number, vy: number): void {
    const maxX = vp.scrollWidth - vp.clientWidth;
    const maxY = vp.scrollHeight - vp.clientHeight;
    const x0 = vp.scrollLeft;
    const y0 = vp.scrollTop;
    // the paper moves against the pointer: vx > 0 lowers scrollLeft
    if ((vx > 0 && x0 <= 0) || (vx < 0 && x0 >= maxX)) vx = 0;
    if ((vy > 0 && y0 <= 0) || (vy < 0 && y0 >= maxY)) vy = 0;
    const speed = Math.hypot(vx, vy);
    if (speed <= 20) return;
    const T = GLIDE_TAU * Math.log(speed / 20);
    // the paper moves against the pointer: vx > 0 heads for scroll 0
    const limX = vx > 0 ? 0 : maxX;
    const limY = vy > 0 ? 0 : maxY;
    /** Moves to time t; true while a moving axis is short of its limit. */
    const at = (t: number) => {
      const k = GLIDE_TAU * (1 - Math.exp(-Math.min(t, T) / GLIDE_TAU));
      const x = Math.min(maxX, Math.max(0, x0 - vx * k));
      const y = Math.min(maxY, Math.max(0, y0 - vy * k));
      vp.scrollLeft = x;
      vp.scrollTop = y;
      return (vx !== 0 && x !== limX) || (vy !== 0 && y !== limY);
    };
    if (reduced()) return void at(T);
    const t0 = performance.now();
    const step = (t: number) => {
      const e = Math.max(0, t - t0) / 1000;
      glideRaf = at(e) && e < T ? requestAnimationFrame(step) : 0;
      if (!glideRaf) finish = null;
    };
    glideRaf = requestAnimationFrame(step);
    finish = () => at(T);
  }

  // ---- wheel and Safari trackpad pinch ----
  const pts = new Map<number, [number, number]>(); // pointers on the paper
  let mapId: number | null = null; // the minimap drag's pointer
  vp.addEventListener(
    "wheel",
    (e) => {
      // the visitor scrolls: every view motion ends where it is, with its
      // end state (R17)
      halt();
      if (!(e.ctrlKey || e.metaKey)) return; // plain scroll stays native
      e.preventDefault();
      // Safari sends the same pinch as gesture events: count it once (R5.d)
      if (gesture !== null) return;
      const unit =
        e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? vp.clientHeight : 1;
      stop();
      setZoom(Z * Math.exp(-e.deltaY * unit * 0.01), e.clientX, e.clientY);
    },
    { passive: false },
  );
  type Gesture = Event & { scale: number; clientX: number; clientY: number };
  vp.addEventListener("gesturestart", (e) => {
    e.preventDefault();
    stop();
    const g = e as Gesture;
    gesture = { z: Z, p: toSheet(g.clientX, g.clientY) };
  });
  vp.addEventListener("gesturechange", (e) => {
    e.preventDefault();
    // a touch pinch is already handled by the pointer events below
    if (gesture === null || pts.size) return;
    const g = e as Gesture;
    zoomAround(gesture.z * g.scale, gesture.p, g.clientX, g.clientY);
  });
  vp.addEventListener("gestureend", (e) => {
    e.preventDefault();
    gesture = null;
  });
  // a blur mid-pinch: no gestureend may come, and ctrl-wheel must zoom again
  addEventListener("blur", () => (gesture = null));

  // ---- pointer: one finger or the mouse pans the paper, two fingers pinch ----
  let pan: {
    x: number;
    y: number;
    sl: number;
    st: number;
    samples: [number, number, number][];
  } | null = null;
  let pinch: { d: number; z: number; p: [number, number] } | null = null;
  const two = () => {
    const [a, b] = [...pts.values()];
    return {
      d: Math.hypot(a[0] - b[0], a[1] - b[1]),
      mx: (a[0] + b[0]) / 2,
      my: (a[1] + b[1]) / 2,
    };
  };

  vp.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    const t = e.target as Element;
    // the mouse never pans from a window; touch may (demo placeholders, 001)
    if (e.pointerType === "mouse" ? t.closest(".sheet-win") : t.closest(NOPAN))
      return;
    // a held window or the minimap owns the input; a third finger is ignored
    if (!claim("paper", e.pointerId, 2, dropPaper)) return;
    stop();
    pts.set(e.pointerId, [e.clientX, e.clientY]);
    vp.setPointerCapture(e.pointerId);
    if (e.pointerType === "mouse") {
      e.preventDefault(); // no text selection; focus the sheet for arrow keys
      vp.focus({ preventScroll: true });
    }
    if (pts.size === 2) {
      const { d, mx, my } = two();
      pinch = { d, z: Z, p: toSheet(mx, my) };
      pan = null;
      vp.classList.remove("panning");
      return;
    }
    pan = {
      x: e.clientX,
      y: e.clientY,
      sl: vp.scrollLeft,
      st: vp.scrollTop,
      samples: [[performance.now(), e.clientX, e.clientY]],
    };
    vp.classList.add("panning");
  });

  vp.addEventListener("pointermove", (e) => {
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, [e.clientX, e.clientY]);
    if (pinch) {
      if (pts.size < 2) return;
      // zoom at the midpoint; the start point follows it, so two fingers also pan
      const { d, mx, my } = two();
      zoomAround((pinch.z * d) / pinch.d, pinch.p, mx, my);
      return;
    }
    if (!pan) return;
    vp.scrollLeft = pan.sl - (e.clientX - pan.x);
    vp.scrollTop = pan.st - (e.clientY - pan.y);
    pan.samples.push([performance.now(), e.clientX, e.clientY]);
    if (pan.samples.length > 8) pan.samples.shift();
  });

  // cancelled (blur, Reset, one pointer cancelled): every paper pointer
  // lets go, with no glide
  function dropPaper(): void {
    const ids = [...pts.keys()];
    pts.clear();
    pan = pinch = null;
    vp.classList.remove("panning");
    for (const id of ids)
      if (vp.hasPointerCapture(id)) vp.releasePointerCapture(id);
  }
  const end = (e: PointerEvent) => {
    if (!pts.has(e.pointerId)) return;
    // a cancelled or lost pointer ends the whole pan or pinch (R21.b)
    if (e.type !== "pointerup") return cancel();
    pts.delete(e.pointerId);
    free(e.pointerId);
    // lifting to one finger ends the pinch; the other finger does not pan
    if (pts.size < 2) pinch = null;
    if (!pan) return;
    const p = pan;
    pan = null;
    vp.classList.remove("panning");
    const now = performance.now();
    const k = p.samples.filter((s) => now - s[0] < 80);
    if (k.length < 2) return;
    const [a, b] = [k[0], k[k.length - 1]];
    const dt = (b[0] - a[0]) / 1000 || 1;
    glide((b[1] - a[1]) / dt, (b[2] - a[2]) / dt);
  };
  vp.addEventListener("pointerup", end);
  vp.addEventListener("pointercancel", end);
  vp.addEventListener("lostpointercapture", end);

  // ---- keyboard: the sheet, a window or a control in it; text fields and
  // content that takes the key itself keep it (R4.b) ----
  vp.addEventListener("keydown", (e) => {
    const d = arrow(e);
    const t = e.target as HTMLElement;
    if (!d || e.defaultPrevented) return;
    if (t.matches("input, textarea, select") || t.isContentEditable) {
      // WebKit scrolls the sheet by a key the field leaves: its caret is
      // already at that end, so the key would do nothing in the field
      if (caretAtEnd(t, d)) e.preventDefault();
      return;
    }
    e.preventDefault();
    stop();
    vp.scrollLeft += d[0] * KEY_STEP;
    vp.scrollTop += d[1] * KEY_STEP;
  });

  // ---- zoom buttons ----
  get("#zIn").addEventListener("click", () => zoomTo(Z * 1.25));
  get("#zOut").addEventListener("click", () => zoomTo(Z / 1.25));
  get("#zFit").addEventListener("click", () => {
    stop();
    setZoom(fit());
    // the new size may add classic scrollbars: fit again inside them
    if (Z > fit()) setZoom(fit());
    // the insets scrolled off, as far as the scroll range allows: the
    // sheet's top-left at the view's
    vp.scrollTo(insetL, inset);
  });

  // ---- minimap: drawn on demand, one frame per change ----
  const ctx = mini.getContext("2d")!;
  let mapRaf = 0;
  function redraw(): void {
    mapRaf ||= requestAnimationFrame(draw);
  }
  function draw(): void {
    mapRaf = 0;
    const { width: W, height: H } = mini;
    const kx = W / SHEET.w;
    const ky = H / SHEET.h;
    const css = getComputedStyle(document.documentElement);
    const c = (v: string) => css.getPropertyValue(v).trim();
    ctx.fillStyle = c("--paper");
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = c("--grid-major");
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x < SHEET.w; x += 120) {
      ctx.moveTo(x * kx, 0);
      ctx.lineTo(x * kx, H);
    }
    for (let y = 0; y < SHEET.h; y += 120) {
      ctx.moveTo(0, y * ky);
      ctx.lineTo(W, y * ky);
    }
    ctx.stroke();
    const all = rects();
    mark(all);
    for (const r of all) {
      ctx.fillStyle = c(r.tool ? "--ink-dim" : "--accent");
      ctx.fillRect(r.x * kx, r.y * ky, r.w * kx, r.h * ky);
    }
    ctx.strokeStyle = c("--accent-2");
    ctx.lineWidth = 4;
    ctx.strokeRect(
      ((vp.scrollLeft - insetL) / Z) * kx + 2,
      ((vp.scrollTop - inset) / Z) * ky + 2,
      (vp.clientWidth / Z) * kx - 4,
      (vp.clientHeight / Z) * ky - 4,
    );
  }

  /** The navigation area: the view beside the card (desktop) or below its
   * folded bar (phone, also while the card is open; navigation folds it),
   * screen px. #vp fills the window, so these are also client px. */
  function area() {
    const cb = card.getBoundingClientRect();
    const phone = matchMedia(PHONE).matches;
    const l = phone ? 16 : cb.right + 24;
    const t = phone ? barBottom() + 16 : 24;
    const bottom = phone
      ? get(".mapbox").getBoundingClientRect().top
      : vp.clientHeight;
    return { phone, l, t, w: vp.clientWidth - l - 16, h: bottom - t - 16 };
  }

  // R12.b: the project nearest the centre of that area is the current list
  // item; opening or closing the card does not change it (009 R7). It runs
  // with the minimap draw, so it costs no frame of its own.
  const nav = [...document.querySelectorAll<HTMLElement>("nav [data-go]")];
  function mark(all: MapRect[]): void {
    const a = area();
    const [cx, cy] = toSheet(a.l + a.w / 2, a.t + a.h / 2);
    let best = "";
    let bd = Infinity;
    for (const r of all) {
      const d = Math.hypot(r.x + r.w / 2 - cx, r.y + r.h / 2 - cy);
      if (!r.tool && d < bd) [best, bd] = [r.id, d];
    }
    for (const b of nav)
      if (b.dataset.go === best) b.setAttribute("aria-current", "location");
      else b.removeAttribute("aria-current");
  }

  function panTo(
    x: number,
    y: number,
    w: number,
    h: number,
    instant = false,
  ): void {
    stop();
    const a = area();
    const lim = (v: number, max: number) => Math.min(max, Math.max(0, v));
    // a rect larger than the area keeps its top-left in view (mock)
    const tx = lim(
      x * Z + insetL - a.l - Math.max(0, (a.w - w * Z) / 2),
      vp.scrollWidth - vp.clientWidth,
    );
    const ty = lim(
      // a phone puts the top edge just below the bar (owner, option A)
      y * Z + inset - a.t - (a.phone ? 0 : Math.max(0, (a.h - h * Z) / 2)),
      vp.scrollHeight - vp.clientHeight,
    );
    const x0 = vp.scrollLeft;
    const y0 = vp.scrollTop;
    if (
      instant ||
      reduced() ||
      (Math.abs(tx - x0) < 1 && Math.abs(ty - y0) < 1)
    ) {
      vp.scrollLeft = tx;
      vp.scrollTop = ty;
      return;
    }
    goal = [x, y, w, h];
    const t0 = performance.now();
    const step = (t: number) => {
      const k = Math.min(1, Math.max(0, (t - t0) / PAN_MS));
      const e = 1 - (1 - k) ** 3;
      vp.scrollLeft = x0 + (tx - x0) * e;
      vp.scrollTop = y0 + (ty - y0) * e;
      panRaf = k < 1 ? requestAnimationFrame(step) : 0;
      if (!panRaf) finish = null;
    };
    panRaf = requestAnimationFrame(step);
    finish = () => {
      vp.scrollLeft = tx;
      vp.scrollTop = ty;
    };
  }

  function reveal(
    x: number,
    y: number,
    w: number,
    h: number,
    instant = false,
  ): void {
    const a = area();
    const [l, t] = toScreen(x, y);
    if (
      l < a.l - 1 ||
      t < a.t - 1 ||
      l + w * Z > a.l + a.w + 1 ||
      t + h * Z > a.t + a.h + 1
    )
      panTo(x, y, w, h, instant);
  }

  // R19: a keyboard focus in the sheet comes into view beside the card at
  // once. The browser's own focus scroll moves only a wholly hidden target,
  // in the same task (before this event, or after it in WebKit), so the view
  // is painted once, at this place. A pointer's focus stays put; a
  // navigation pan ends there itself.
  let byPointer = false;
  addEventListener("pointerdown", () => (byPointer = true), true);
  addEventListener("keydown", () => (byPointer = false), true);
  let quiet = false;
  function navFocus(el: HTMLElement | (() => void)): void {
    quiet = true;
    try {
      if (typeof el === "function") el();
      else el.focus({ preventScroll: true });
    } finally {
      quiet = false;
    }
  }
  /** Brings the focused element in the sheet into view at once (R19). */
  function keepFocus(): void {
    const t = document.activeElement;
    if (!(t instanceof HTMLElement) || t === vp || !vp.contains(t)) return;
    const r = t.getBoundingClientRect();
    const [x, y] = toSheet(r.left, r.top);
    reveal(x, y, r.width / Z, r.height / Z, true);
  }
  vp.addEventListener("focusin", (e) => {
    if (e.target === vp || quiet || byPointer) return;
    // a keyboard focus elsewhere ends a navigation pan under way
    halt();
    keepFocus();
  });

  function start(): void {
    stop();
    const cs = LAYOUT[0]; // CastleSiege
    if (!matchMedia(PHONE).matches) {
      // 100 %: with the insets scrolled off, the view is the sheet's top-left
      // corner and CastleSiege's home sits beside the card
      setZoom(1);
      vp.scrollTo(insetL, inset);
      return;
    }
    setZoom(Math.min(1, area().w / cs.w));
    panTo(cs.x, cs.y, cs.w, cs.h, true);
  }

  /** Puts sheet point (x, y) at the view centre. */
  const centre = (x: number, y: number) => {
    vp.scrollLeft = x * Z + insetL - vp.clientWidth / 2;
    vp.scrollTop = y * Z + inset - vp.clientHeight / 2;
  };
  const mapGo = (e: PointerEvent) => {
    const r = mini.getBoundingClientRect();
    centre(
      ((e.clientX - r.left) * SHEET.w) / r.width,
      ((e.clientY - r.top) * SHEET.h) / r.height,
    );
  };
  mini.addEventListener("pointerdown", (e) => {
    // ignored while the paper, a window or another minimap pointer owns it
    if (e.button !== 0 || !claim("map", e.pointerId, 1, () => (mapId = null)))
      return;
    stop();
    mapId = e.pointerId;
    mini.setPointerCapture(e.pointerId);
    mapGo(e);
  });
  mini.addEventListener("pointermove", (e) => {
    if (e.pointerId === mapId) mapGo(e);
  });
  for (const type of ["pointerup", "pointercancel", "lostpointercapture"])
    mini.addEventListener(type, (e) => {
      if ((e as PointerEvent).pointerId !== mapId) return;
      mapId = null;
      free((e as PointerEvent).pointerId);
    });
  mini.addEventListener("keydown", (e) => {
    const d = arrow(e);
    if (!d) return;
    e.preventDefault();
    stop();
    vp.scrollLeft += d[0] * MAP_STEP * Z;
    vp.scrollTop += d[1] * MAP_STEP * Z;
  });

  vp.addEventListener(
    "scroll",
    () => {
      redraw();
      changed();
    },
    { passive: true },
  );
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", redraw);
  // a resize or rotation never leaves the zoom below fit (R5.b)
  const resized = () => {
    measure();
    if (Z < fit()) setZoom(fit());
    else {
      size();
      redraw();
    }
    // a navigation pan under way goes on to the target for the new size;
    // else the focus in the sheet stays in view (R19)
    if (panRaf && goal) panTo(...goal);
    else keepFocus();
  };
  addEventListener("resize", resized);
  matchMedia(PHONE).addEventListener("change", resized);
  // the card's real size: WebKit may run this module before the sheet's CSS
  // applies, and fonts can change the card later
  new ResizeObserver(() => {
    measure();
    if (!panRaf) keepFocus();
  }).observe(card);

  // the start view (R16): nothing is restored. WebKit may run this module
  // before the stylesheet applies (#vp is no scroller yet): then measure and
  // start when its stylesheet loads, not at the page's load, which also
  // waits for images (005's sprites). Once. Until then #vp is no scroller,
  // so there is no view the visitor could have moved.
  // WebKit applies a loaded stylesheet only once no other is pending, and
  // the host adds app stylesheets later: so try again on every load in the
  // document (capture: load does not bubble), not only the first links'.
  let begun = false;
  const begin = () => {
    if (begun || getComputedStyle(vp).position !== "fixed") return;
    begun = true;
    document.removeEventListener("load", begin, true);
    removeEventListener("load", begin);
    measure();
    start();
  };
  begin();
  if (!begun) {
    document.addEventListener("load", begin, true);
    addEventListener("load", begin);
  }

  return {
    zoom: () => Z,
    toSheet,
    toScreen,
    setZoom,
    redraw,
    stop,
    panTo,
    reveal,
    navFocus,
    start,
    onChange: (cb) => void watchers.push(cb),
  };
}
