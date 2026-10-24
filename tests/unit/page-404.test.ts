// Spec 009 R6.a–c: the 404 page (public/404.html). R6.a checks the file; R6.b
// and R6.c run the page's own script in jsdom through its real pointer and
// keyboard handlers, with a controlled clock (animation frames, performance.now
// and event time stamps) and stubbed layout. These fixtures are the primary
// guard against drift from the sheet's physics (001 Approach "Physics", 009 R3).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { JSDOM } from "jsdom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const root = join(import.meta.dirname, "../..");
const html = readFileSync(join(root, "public/404.html"), "utf8");
const css = readFileSync(join(root, "src/sheet/sheet.css"), "utf8");
const physics = readFileSync(join(root, "src/sheet/physics.ts"), "utf8");

// ---- R6.a: the file ----

/** Custom properties of the first `:root { … }` after `from` in `text`. */
function tokens(text: string, from: number): Record<string, string> {
  const start = text.indexOf(":root", from);
  const body = text.slice(
    text.indexOf("{", start) + 1,
    text.indexOf("}", start),
  );
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g))
    out[m[1]] = m[2].replace(/\s+/g, " ").trim();
  return out;
}
const dark = (text: string) =>
  tokens(text, text.indexOf("@media (prefers-color-scheme: dark)"));

/**
 * The defined extraction for the secondary constants check: `const NAME = expr`
 * (also inside one `const a = 1, b = 2;` list), and the pin kick
 * `Math.sign(t) * KICK * Math.log1p(Math.abs(t) / SOFT)`, its factor and
 * softness as names or numbers. Values are evaluated with the other constants.
 */
function constants(src: string): Record<string, number> {
  // in order, each evaluated with the ones before it
  const scope: Record<string, number> = {};
  const value = (expr: string): number =>
    Function(...Object.keys(scope), `return ${expr}`)(...Object.values(scope));
  for (const decl of src.matchAll(/\bconst\s+([^;]+);/g))
    for (const m of decl[1].matchAll(
      /(?:^|,)\s*([A-Z][A-Z_]*)\s*=\s*((?:[^,(]|\([^)]*\))+)/g,
    ))
      try {
        scope[m[1]] = value(m[2].trim());
      } catch {
        // not a number (a list of names, say): not a physics constant
      }
  const kick = src.match(
    /Math\.sign\(t\)\s*\*\s*(\w+|[\d.]+)\s*\*\s*Math\.log1p\(Math\.abs\(t\)\s*\/\s*(\w+|[\d.]+)\)/,
  );
  if (!kick) throw new Error("no pin kick expression");
  return {
    TAU: value("TAU"),
    MAX_THROW: value("MAX_THROW"),
    OMEGA: value("OMEGA"),
    // 009 removes the held ζ, so the free one may lose its suffix
    ZETA_FREE: value("ZETA_FREE" in scope ? "ZETA_FREE" : "ZETA"),
    KICK: value(kick[1]),
    SOFT: value(kick[2]),
    // 010 R1: the held lean
    ZETA_HELD: value("ZETA_HELD"),
    SWAY: value("SWAY"),
    SWAY_MAX: value("SWAY_MAX"),
  };
}

describe("404 page file (R6.a)", () => {
  it("is at most 8 KiB gzipped", () => {
    expect(gzipSync(html, { level: 9 }).length).toBeLessThanOrEqual(8192);
  });

  it("uses no storage and no cookies", () => {
    expect(html).not.toMatch(
      /localStorage|sessionStorage|indexedDB|document\.cookie/,
    );
  });

  it("is noindex, titled, and loads only same-origin /fonts/", () => {
    expect(html).toMatch(/<meta name="robots" content="noindex"/);
    expect(html).toMatch(/<title>404 · RArgu OS<\/title>/);
    const urls = [...html.matchAll(/url\(\s*["']?([^"')]+)/g)].map((m) => m[1]);
    expect(urls.length).toBeGreaterThan(0);
    for (const u of urls) expect(u).toMatch(/^\/fonts\/[\w.-]+$/);
    // no external script, stylesheet or image
    expect(html).not.toMatch(/<(script|link|img)[^>]+(src|href)=/);
  });

  it("has the sheet's light and dark token values", () => {
    for (const [own, sheet] of [
      [tokens(html, 0), tokens(css, 0)],
      [dark(html), dark(css)],
    ]) {
      expect(Object.keys(own).length).toBeGreaterThan(8);
      for (const [k, v] of Object.entries(own)) expect(v, k).toBe(sheet[k]);
    }
  });

  // Secondary check. The 009 values (R3): kick 2.5°, ζ 0.45, ω 2π·2.6, τ 0.12 s, cap 360 px;
  // 010 R1: the held lean, ζ 0.65, target −0.012·torque within ±12°.
  it("has the sheet's physics constants (009 and 010 values)", () => {
    const page = constants(html);
    expect(page).toEqual({
      TAU: 0.12,
      MAX_THROW: 360,
      OMEGA: 2 * Math.PI * 2.6,
      ZETA_FREE: 0.45,
      KICK: 2.5,
      SOFT: 150,
      ZETA_HELD: 0.65,
      SWAY: 0.012,
      SWAY_MAX: 12,
    });
    expect(constants(physics)).toEqual(page);
  });
});

// ---- R6.b–c: the page's script in jsdom ----

const W = 148; // a digit's box, px (stubbed layout)
const H = 160;
const TAU = 0.12;
const NORM = 1 - Math.exp(-2);

interface Page {
  win: Window & typeof globalThis;
  digits: HTMLElement[];
  /** pending animation frames */
  frames: Map<number, FrameRequestCallback>;
  /** the paper (main's client box), px; change it and fire resize */
  paper: { w: number; h: number };
  reduce(on: boolean): void;
  /** runs one frame `ms` later */
  frame(ms?: number): void;
  /** runs frames until none is pending; returns the time it took, s */
  settle(ms?: number): number;
  at(ms: number): void;
  ptr(el: HTMLElement, type: string, x: number, y: number, id?: number): void;
  key(el: HTMLElement, key: string): void;
  /** [x, y, θ] of a digit, from its transform */
  pose(el: HTMLElement): [number, number, number];
}

let clock = 1000;

function load(reduced = false): Page {
  clock = 1000;
  vi.setSystemTime(clock);
  const frames = new Map<number, FrameRequestCallback>();
  let next = 0;
  const paper = { w: 4000, h: 3000 };
  const heard: ((e: { matches: boolean }) => void)[] = [];
  const mq = {
    matches: reduced,
    media: "(prefers-reduced-motion: reduce)",
    addEventListener: (_: string, cb: (e: { matches: boolean }) => void) =>
      heard.push(cb),
  };
  const dom = new JSDOM(html, {
    runScripts: "dangerously",
    url: "http://localhost/nope",
    beforeParse(w) {
      w.requestAnimationFrame = (cb) => (frames.set(++next, cb), next);
      w.cancelAnimationFrame = (id) => void frames.delete(id);
      Object.defineProperty(w.performance, "now", { value: () => clock });
      w.matchMedia = (() => mq) as unknown as typeof w.matchMedia;
      w.Element.prototype.setPointerCapture = () => {};
      w.Element.prototype.releasePointerCapture = () => {};
      w.Math.random = () => 0; // keyboard throws go right
      const p = w.HTMLElement.prototype;
      const get = (name: string, f: (el: HTMLElement) => number) =>
        Object.defineProperty(p, name, {
          configurable: true,
          get() {
            return f(this as HTMLElement);
          },
        });
      const index = (el: HTMLElement) =>
        [...el.parentElement!.children].indexOf(el);
      const isWin = (el: HTMLElement) => el.classList.contains("win");
      get("offsetWidth", (el) => (isWin(el) ? W : 0));
      get("offsetHeight", (el) => (isWin(el) ? H : 0));
      get("offsetLeft", (el) => (isWin(el) ? 400 + index(el) * 172 : 0));
      get("offsetTop", (el) => (isWin(el) ? 100 : 0));
      get("clientWidth", (el) => (el.tagName === "MAIN" ? paper.w : 0));
      get("clientHeight", (el) => (el.tagName === "MAIN" ? paper.h : 0));
    },
  });
  const win = dom.window;
  const at = (ms: number) => {
    clock = ms;
    vi.setSystemTime(ms); // event time stamps
  };
  const frame = (ms = 10) => {
    at(clock + ms);
    const due = [...frames.values()];
    frames.clear();
    for (const cb of due) cb(clock);
  };
  return {
    win,
    digits: [...win.document.querySelectorAll<HTMLElement>(".win")],
    frames,
    paper,
    reduce(on) {
      mq.matches = on;
      for (const cb of heard) cb({ matches: on });
    },
    frame,
    settle(ms = 10) {
      const t0 = clock;
      for (let i = 0; frames.size && i < 1000; i++) frame(ms);
      expect(frames.size, "still animating after 10 s").toBe(0);
      return (clock - t0) / 1000;
    },
    at,
    ptr(el, type, x, y, id = 1) {
      el.dispatchEvent(
        new win.PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          pointerId: id,
          clientX: x,
          clientY: y,
          button: 0,
        }),
      );
    },
    key(el, key) {
      el.dispatchEvent(
        new win.KeyboardEvent("keydown", {
          key,
          bubbles: true,
          cancelable: true,
        }),
      );
    },
    pose(el) {
      const t = el.style.transform;
      const n = (re: RegExp) => Number(t.match(re)?.[1] ?? 0);
      expect(t).not.toMatch(/scale/);
      return [
        n(/translate\((-?[\d.e-]+)px/),
        n(/translate\([^,]+,\s*(-?[\d.e-]+)px/),
        n(/rotate\((-?[\d.e-]+)deg/),
      ];
    },
  };
}

/** A 5000 px/s drag right from the bar of `el`: 240 px in 48 ms, released at once. */
function flick(p: Page, el: HTMLElement, id = 1) {
  const t = clock;
  p.ptr(el, "pointerdown", 74, 12, id);
  for (let i = 1; i <= 6; i++) {
    p.at(t + i * 8);
    p.ptr(el, "pointermove", 74 + i * 40, 12, id);
  }
  p.ptr(el, "pointerup", 314, 12, id);
}

/** Max |θ| and the time after the pin until rest, for a digit flying now. */
function wobble(p: Page, el: HTMLElement, pinAt: number) {
  let peak = 0;
  let pin = NaN;
  while (p.frames.size) {
    p.frame(10);
    const [, , th] = p.pose(el);
    peak = Math.max(peak, Math.abs(th));
    if (Number.isNaN(pin) && clock >= pinAt) pin = clock;
  }
  return { peak, settle: (clock - pin) / 1000 };
}

beforeEach(() => vi.useFakeTimers({ toFake: ["Date"] }));
afterEach(() => vi.useRealTimers());

describe("404 page behaviour (R6.b)", () => {
  it("a 5000 px/s release flies on the throw curve and lands at release + 360 px", () => {
    const p = load();
    const d = p.digits[0];
    flick(p, d);
    const t0 = clock;
    expect(p.pose(d)).toEqual([240, 0, 0]);
    // midpoint: x(τ) = x0 + L·(1 − e^−1)/(1 − e^−2)
    while (clock < t0 + TAU * 1000) p.frame(10);
    expect(p.pose(d)[0]).toBeCloseTo(
      240 + (360 * (1 - Math.exp(-1))) / NORM,
      6,
    );
    // the pin at 2τ: exactly the landing
    while (clock < t0 + 2 * TAU * 1000) p.frame(10);
    expect(p.pose(d).slice(0, 2)).toEqual([600, 0]);
  });

  it("the pin kicks a swing that peaks ≤ 2.5° and rests < 0.8 s after the pin", () => {
    const p = load();
    const d = p.digits[0];
    flick(p, d);
    const t0 = clock;
    // the kick of the sheet's rule: r = centre − grab = (0, 68), pin velocity (L·e^−2/(τ·NORM), 0)
    const v = (360 * Math.exp(-2)) / (TAU * NORM);
    const t = (-68 * v) / (Math.hypot(0, 68) + 1);
    const kick =
      Math.sign(t) * 2.5 * Math.log1p(Math.abs(t) / 150) * 2 * Math.PI * 2.6;
    while (clock < t0 + 2 * TAU * 1000) p.frame(10);
    // the pin frame: θ′ = kick, then one semi-implicit step from θ = 0 at ζ = 0.45
    const dt = 0.01;
    const omega = 2 * Math.PI * 2.6;
    expect(p.pose(d)[2]).toBeCloseTo(
      kick * (1 - 2 * 0.45 * omega * dt) * dt,
      6,
    );
    const { peak, settle } = wobble(p, d, clock);
    expect(peak).toBeGreaterThan(1);
    expect(peak).toBeLessThanOrEqual(2.5);
    expect(settle).toBeLessThan(0.8);
    expect(p.pose(d)).toEqual([600, 0, 0]);
    expect(d.style.transform).not.toMatch(/rotate/);
  });

  it("Home flies back on the long-flight curve, peak ≤ 3°, rest < 0.8 s after the pin", () => {
    const p = load();
    const d = p.digits[1];
    for (let i = 0; i < 20; i++) p.key(d, "ArrowRight");
    for (let i = 0; i < 12; i++) p.key(d, "ArrowDown");
    expect(p.pose(d)).toEqual([480, 288, 0]);
    expect(p.frames.size).toBe(0);
    p.key(d, "Home");
    const t0 = clock;
    const tau = (TAU * Math.hypot(480, 288)) / 360;
    while (clock < t0 + tau * 1000) p.frame(10);
    const k = (1 - Math.exp(-(clock - t0) / 1000 / tau)) / NORM;
    expect(p.pose(d)[0]).toBeCloseTo(480 * (1 - k), 6);
    while (clock < t0 + 2 * tau * 1000) p.frame(10);
    const { peak, settle } = wobble(p, d, clock);
    expect(peak).toBeGreaterThan(0.5);
    expect(peak).toBeLessThanOrEqual(3);
    expect(settle).toBeLessThan(0.8);
    expect(p.pose(d)).toEqual([0, 0, 0]);
  });

  it("Home right after Enter, before any frame, replaces the throw: the digit rests at home", () => {
    const p = load();
    const d = p.digits[1];
    p.key(d, "Enter");
    p.key(d, "Home");
    p.settle();
    expect(p.pose(d)).toEqual([0, 0, 0]);
  });

  it("with reduced motion the same release lands at the same place at once, with no frame after", () => {
    const p = load(true);
    const d = p.digits[0];
    flick(p, d);
    expect(p.pose(d)).toEqual([600, 0, 0]);
    expect(p.frames.size).toBe(0);
    p.key(d, "Home");
    expect(p.pose(d)).toEqual([0, 0, 0]);
    expect(p.frames.size).toBe(0);
  });

  it("Enter and Space throw on the same capped landing as a pointer, with either motion setting", () => {
    for (const reduced of [false, true]) {
      const p = load(reduced);
      const d = p.digits[2];
      p.key(d, "Enter"); // Math.random() = 0: to the right
      p.settle();
      expect(p.pose(d)).toEqual([360, 0, 0]);
      p.key(d, " ");
      p.settle();
      expect(p.pose(d)).toEqual([720, 0, 0]);
    }
  });

  it("a release near the edge is clamped into the paper, as the sheet", () => {
    const p = load();
    p.paper.w = 900; // digit 0 sits at 400: room for 900 − 148 − 8 − 400 = 344 px
    const d = p.digits[0];
    flick(p, d);
    p.settle();
    expect(p.pose(d)).toEqual([344, 0, 0]);
  });
});

describe("404 page interruptions (R6.c)", () => {
  it("one gesture owner: a second pointer on another digit is ignored", () => {
    const p = load();
    const [a, b] = p.digits;
    p.ptr(a, "pointerdown", 74, 12, 1);
    p.ptr(b, "pointerdown", 74, 12, 2);
    p.ptr(b, "pointermove", 174, 112, 2);
    p.ptr(a, "pointermove", 124, 62, 1);
    expect(p.pose(b)).toEqual([0, 0, 0]);
    expect(b.classList.contains("lifted")).toBe(false);
    expect(p.pose(a)).toEqual([50, 50, 0]);
    p.ptr(b, "pointerup", 174, 112, 2);
    expect(a.classList.contains("lifted")).toBe(true);
  });

  it("010 R1.d held off centre: it leans with no scale, the grab point follows the pointer, it is focused and in front", () => {
    const p = load();
    const [a, b, c] = p.digits;
    // the bar, above the centre: r = (0, 68)
    p.ptr(b, "pointerdown", 74, 12);
    expect(p.win.document.activeElement).toBe(b);
    const z = (el: HTMLElement) => Number(el.style.zIndex || 0);
    expect(z(b)).toBeGreaterThan(Math.max(z(a), z(c)));
    let peak = 0;
    for (let i = 1; i <= 20; i++) {
      p.ptr(b, "pointermove", 74 + i * 10, 12 + i * 3);
      p.frame(16);
      const [x, y, th] = p.pose(b);
      expect([x, y]).toEqual([i * 10, i * 3]);
      peak = Math.max(peak, Math.abs(th));
    }
    expect(peak, "it leaned").toBeGreaterThan(0.5);
    // still: back to exactly 0, then no frame
    p.settle(16);
    expect(p.pose(b)).toEqual([200, 60, 0]);
    expect(b.classList.contains("lifted")).toBe(true);
    // keyboard focus brings a digit to the front too
    c.focus();
    expect(z(c)).toBeGreaterThan(Math.max(z(a), z(b)));
  });

  it("010 R1.d held at the centre: no torque, no lean", () => {
    const p = load();
    const d = p.digits[0];
    p.ptr(d, "pointerdown", 74, 80);
    for (let i = 1; i <= 10; i++) {
      p.ptr(d, "pointermove", 74 + i * 10, 80 + i * 10);
      p.frame(16);
      expect(p.pose(d)).toEqual([i * 10, i * 10, 0]);
    }
  });

  it("010 R1.c reduced motion: a held digit does not lean", () => {
    const p = load(true);
    const d = p.digits[0];
    p.ptr(d, "pointerdown", 74, 12);
    for (let i = 1; i <= 10; i++) {
      p.ptr(d, "pointermove", 74 + i * 10, 12);
      p.frame(16);
      expect(p.pose(d)).toEqual([i * 10, 0, 0]);
    }
  });

  it("010 R1.c reduced motion on during a lean: θ = 0 at once, the pointer still leads, no lean after, no frame when still", () => {
    const p = load();
    const d = p.digits[0];
    p.ptr(d, "pointerdown", 74, 12);
    for (let i = 1; i <= 5; i++) {
      p.ptr(d, "pointermove", 74 + i * 10, 12);
      p.frame(16);
    }
    expect(Math.abs(p.pose(d)[2])).toBeGreaterThan(0.5);
    p.reduce(true);
    expect(p.pose(d)).toEqual([50, 0, 0]);
    for (let i = 6; i <= 10; i++) {
      p.ptr(d, "pointermove", 74 + i * 10, 12);
      p.frame(16);
      expect(p.pose(d)).toEqual([i * 10, 0, 0]);
    }
    for (let i = 0; i < 10 && p.frames.size; i++) p.frame(16);
    expect(p.frames.size).toBe(0);
  });

  it("010 R1.e a hold cancelled during a lean swings back to 0 where it is", () => {
    const p = load();
    const d = p.digits[0];
    p.ptr(d, "pointerdown", 74, 12);
    for (let i = 1; i <= 5; i++) {
      p.ptr(d, "pointermove", 74 + i * 20, 12);
      p.frame(16);
    }
    expect(Math.abs(p.pose(d)[2])).toBeGreaterThan(0.5);
    p.win.dispatchEvent(new p.win.Event("blur"));
    p.settle();
    expect(p.pose(d)).toEqual([100, 0, 0]);
    expect(d.style.willChange).toBe("");
  });

  it("Home during a hold ends the hold with no throw and flies home", () => {
    const p = load();
    const d = p.digits[0];
    p.ptr(d, "pointerdown", 74, 12);
    p.at(clock + 8);
    p.ptr(d, "pointermove", 274, 12);
    p.key(d, "Home");
    expect(d.classList.contains("lifted")).toBe(false);
    p.ptr(d, "pointermove", 474, 12); // the hold is over
    p.ptr(d, "pointerup", 474, 12);
    p.settle();
    expect(p.pose(d)).toEqual([0, 0, 0]);
  });

  for (const how of ["blur", "pointercancel", "lostpointercapture"])
    it(`${how} ends a hold with no throw`, () => {
      const p = load();
      const d = p.digits[0];
      p.ptr(d, "pointerdown", 74, 12);
      p.at(clock + 8);
      p.ptr(d, "pointermove", 274, 12); // 25 000 px/s: a hard throw if released
      if (how === "blur") p.win.dispatchEvent(new p.win.Event("blur"));
      else p.ptr(d, how, 274, 12);
      expect(d.classList.contains("lifted")).toBe(false);
      p.ptr(d, "pointerup", 274, 12);
      p.settle();
      expect(p.pose(d)).toEqual([200, 0, 0]);
      // a new gesture can start
      p.ptr(p.digits[1], "pointerdown", 74, 12, 5);
      expect(p.digits[1].classList.contains("lifted")).toBe(true);
    });

  it("a live switch to reduced motion ends a flight at its landing and leaves no frame", () => {
    const p = load();
    const d = p.digits[0];
    flick(p, d);
    for (let i = 0; i < 5; i++) p.frame(10);
    expect(p.frames.size).toBe(1);
    p.reduce(true);
    expect(p.frames.size).toBe(0);
    expect(p.pose(d)).toEqual([600, 0, 0]);
    expect(d.style.transform).not.toMatch(/rotate/);
  });

  it("a live switch to reduced motion ends a wobble with no tilt and leaves no frame", () => {
    const p = load();
    const d = p.digits[0];
    flick(p, d);
    for (let i = 0; i < 30; i++) p.frame(10); // past the pin at 240 ms
    expect(Math.abs(p.pose(d)[2])).toBeGreaterThan(0.1);
    p.reduce(true);
    expect(p.frames.size).toBe(0);
    expect(p.pose(d)).toEqual([600, 0, 0]);
  });

  it("a resize that reverses a flight goes on from where the digit is, with the kick of the new direction", () => {
    const p = load();
    const d = p.digits[0];
    flick(p, d); // right, from 240 to 600
    for (let i = 0; i < 6; i++) p.frame(10);
    const [x0] = p.pose(d);
    expect(x0).toBeGreaterThan(344);
    p.paper.w = 700; // room for 700 − 148 − 8 − 400 = 144 px: now to the left
    p.win.dispatchEvent(new p.win.Event("resize"));
    p.frame(10);
    const [x1] = p.pose(d);
    expect(x1).toBeLessThan(x0); // moving left
    expect(x0 - x1).toBeLessThan(30); // no jump
    // the pin: grab (74, 12), r = (0, 68); a leftward pin velocity gives a positive kick
    let th = 0;
    while (p.frames.size && !th) {
      p.frame(10);
      th = p.pose(d)[2];
    }
    expect(th).toBeGreaterThan(0);
    p.settle();
    expect(p.pose(d)).toEqual([144, 0, 0]);
  });

  it("a resize re-clamps resting digits and active landings into the paper", () => {
    const p = load();
    const [a, b] = p.digits;
    flick(p, a);
    p.settle();
    expect(p.pose(a)).toEqual([600, 0, 0]);
    flick(p, b, 2); // lands at 600 unless clamped
    p.frame(10);
    p.paper.w = 900;
    p.win.dispatchEvent(new p.win.Event("resize"));
    // a at 400: 900 − 148 − 8 − 400 = 344; b at 572: 172
    expect(p.pose(a)).toEqual([344, 0, 0]);
    p.settle();
    expect(p.pose(b)).toEqual([172, 0, 0]);
  });
});

describe("404 page markup without the script (R6.d)", () => {
  it("the digits are plain text: no role and no Tab stop before the script", () => {
    const doc = new JSDOM(html).window.document; // scripts do not run
    const wins = [...doc.querySelectorAll(".win")];
    expect(wins).toHaveLength(3);
    for (const w of wins) {
      expect(w.hasAttribute("role")).toBe(false);
      expect(w.hasAttribute("tabindex")).toBe(false);
    }
    const digits = [...doc.querySelectorAll(".digit")].map(
      (d) => d.textContent,
    );
    expect(digits.join("")).toBe("404");
  });

  it("after the script: distinct names, a key hint, roles and Tab stops", () => {
    const p = load();
    expect(p.digits.map((d) => d.getAttribute("aria-label"))).toEqual([
      "Digit 4, first",
      "Digit 0",
      "Digit 4, last",
    ]);
    const hint = p.win.document.getElementById(
      p.digits[0].getAttribute("aria-describedby")!,
    )!;
    // 010 R2: the key hint is never shown, only announced
    expect(hint.textContent!.replace(/\s+/g, " ").trim()).toBe(
      "Arrows move it. Enter or Space throws it. Home brings it back.",
    );
    expect(hint.hidden).toBe(true);
    expect(p.win.document.body.textContent).not.toMatch(
      /come off the sheet|Drag one/,
    );
    for (const d of p.digits) {
      expect(d.getAttribute("role")).toBe("button");
      expect(d.tabIndex).toBe(0);
    }
  });
});
