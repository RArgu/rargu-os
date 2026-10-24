// Spec 001 e2e instrumentation for the sheet at /next: a pointer event log,
// pending animation-frame counts and, with `controlled`, a test clock that
// runs page frames only when a test asks (moved from sheet-a11y.spec.ts).
import type { Page } from "@playwright/test";
import { expect } from "./helpers";
import { sheet } from "./sheet-base";

type Pt = [number, number];

/** Test instrumentation: a pointer event log (capture phase). Real time:
 * counts pending animation frames. With `controlled`, a test clock: frames
 * run only when the test calls __frame(dt), and performance.now() moves only
 * with __frame and __clock; __ran counts the frame callbacks run. */
export async function open(page: Page, controlled = false): Promise<void> {
  await page.addInitScript((controlled) => {
    const w = window as unknown as Record<string, unknown>;
    const log: Logged[] = [];
    for (const type of ["pointerdown", "pointermove", "pointerup"])
      addEventListener(
        type,
        (e) => {
          const p = e as PointerEvent;
          log.push({ t: type, x: p.clientX, y: p.clientY, ts: p.timeStamp });
        },
        true,
      );
    w.__log = log;
    if (controlled) {
      const q = new Map<number, FrameRequestCallback>();
      let n = 0;
      let ran = 0;
      let t = performance.now();
      performance.now = () => t;
      // event times on the same clock, so a release velocity does not
      // depend on how fast the browser delivers the test's input
      Object.defineProperty(Event.prototype, "timeStamp", { get: () => t });
      // one real frame: with every page frame held, Firefox's refresh
      // driver may stop, and it is what fires media-query changes
      const raw = requestAnimationFrame.bind(window);
      w.__tick = () => new Promise<void>((r) => raw(() => r()));
      window.requestAnimationFrame = (cb) => (q.set(++n, cb), n);
      window.cancelAnimationFrame = (id) => void q.delete(id);
      w.__frame = (dt: number) => {
        const due = [...q.values()];
        q.clear();
        t += dt;
        for (const cb of due) cb(t);
        ran += due.length;
        return q.size;
      };
      w.__clock = (dt: number) => (t += dt);
      w.__ran = () => ran;
      w.__live = () => q.size;
      return;
    }
    const raw = requestAnimationFrame.bind(window);
    const cancel = cancelAnimationFrame.bind(window);
    const live = new Set<number>();
    window.requestAnimationFrame = (cb) => {
      const id = raw((t) => {
        live.delete(id);
        cb(t);
      });
      live.add(id);
      return id;
    };
    window.cancelAnimationFrame = (id) => {
      live.delete(id);
      cancel(id);
    };
    w.__live = () => live.size;
  }, controlled);
  await page.goto(sheet());
  await expect(page.locator("#world")).toHaveAttribute("style", /scale\(/);
}

export interface Logged {
  t: string;
  x: number;
  y: number;
  ts: number;
}

/** Controlled time: turns reduced motion on or off and waits until the page
 * has seen the change (a listener added after the page's own, so they have
 * run). Real frames tick, but no page frame runs. */
export async function setReduced(page: Page, on: boolean) {
  await page.evaluate(() => {
    const w = window as unknown as Record<string, unknown>;
    w.__changed = false;
    if (w.__watching) return;
    w.__watching = true;
    matchMedia("(prefers-reduced-motion: reduce)").addEventListener(
      "change",
      () => (w.__changed = true),
    );
  });
  await page.emulateMedia({ reducedMotion: on ? "reduce" : "no-preference" });
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const w = window as unknown as {
          __tick(): Promise<void>;
          __changed: boolean;
        };
        await w.__tick();
        return w.__changed;
      }),
    )
    .toBe(true);
}

export const live = (page: Page) =>
  page.evaluate(() => (window as unknown as { __live(): number }).__live());
/** Waits until the page schedules no animation frame: every motion is over.
 * One frame first, so a scroll event still queued has fired (and asked for
 * its minimap frame) before the count is read. */
export async function idle(page: Page) {
  await page.evaluate(
    () => new Promise<void>((r) => requestAnimationFrame(() => r())),
  );
  await expect.poll(() => live(page)).toBe(0);
}
/** Controlled time: moves the test clock `dt` ms with no frame. */
export const clock = (page: Page, dt: number) =>
  page.evaluate(
    (dt) => (window as unknown as { __clock(dt: number): void }).__clock(dt),
    dt,
  );
/** Controlled time: frame callbacks run so far. */
export const ran = (page: Page) =>
  page.evaluate(() => (window as unknown as { __ran(): number }).__ran());
/** Controlled time: runs frames `dt` ms apart until none is pending. */
export async function settle(page: Page, dt = 16) {
  for (let i = 0; i < 200 && (await frame(page, dt)) > 0; i++);
  expect(await frame(page, dt)).toBe(0);
}
/** Controlled time: runs one frame `dt` ms on; returns the frames pending. */
export const frame = (page: Page, dt: number) =>
  page.evaluate(
    (dt) => (window as unknown as { __frame(dt: number): number }).__frame(dt),
    dt,
  );

/** Throws CastleSiege by mouse from its home at 100 %: a fast drag right
 * and down. Returns where the spec's physics lands it, from the pointer
 * events the page saw: the release velocity over the last 80 ms (none if
 * the last sample is older than 50 ms), τ = 0.12 s cut at 2τ, capped at
 * 360 px, inside the sheet. `null` if the release had no velocity (a slow
 * run: the release came > 50 ms after the last move). */
export async function throwIt(page: Page): Promise<Pt | null> {
  const from = await page.evaluate(
    () => (window as unknown as { __log: Logged[] }).__log.length,
  );
  await page.mouse.move(500, 112);
  await page.mouse.down();
  for (let i = 1; i <= 5; i++) {
    // under the test clock, 10 ms between moves; else real time
    await page.evaluate(() =>
      (window as unknown as { __clock?(dt: number): void }).__clock?.(10),
    );
    await page.mouse.move(500 + 30 * i, 112 + 20 * i);
  }
  await page.mouse.up();
  const log = (
    await page.evaluate(() => (window as unknown as { __log: Logged[] }).__log)
  ).slice(from);
  const down = log.find((e) => e.t === "pointerdown")!;
  const up = log.find((e) => e.t === "pointerup")!;
  const s = log.filter(
    (e) => e.t !== "pointerup" && e.ts >= down.ts && e.ts <= up.ts,
  );
  const last = s[s.length - 1];
  const recent = s.filter((e) => up.ts - e.ts < 80);
  const [a, b] = [recent[0], recent[recent.length - 1]];
  if (recent.length < 2 || up.ts - b.ts > 50 || b.ts === a.ts) return null;
  const dt = (b.ts - a.ts) / 1000;
  const v = [(b.x - a.x) / dt, (b.y - a.y) / dt];
  const k = 0.12 * (1 - Math.exp(-2));
  const d = Math.hypot(v[0], v[1]) * k;
  const cap = d > 360 ? 360 / d : 1;
  const clamp = (x: number, max: number) => Math.min(max, Math.max(0, x));
  return [
    clamp(360 + last.x - 500 + v[0] * k * cap, 3000 - 620),
    clamp(100 + last.y - 112 + v[1] * k * cap, 1640 - 654),
  ];
}
