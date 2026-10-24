// Spec 006 T5 and T6 (code part): reduced motion (R7.a), no network
// (R11.a) and a live theme change (R8) in the crawler and insider windows
// at /next, through the page.
//
// Time is Playwright's fake clock, paused: page timers and animation frames
// run only when a test runs the clock, so "at the next frame" means with no
// page time passing. The page is observed from outside: pending and run
// timeouts by delay (the crawler's 700 ms step, the insider's 40 ms tick),
// a snapshot of each window after every batch of DOM changes, and each draw
// of the insider chart (it starts with a fill of the canvas at 0, 0).
import { readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import type { Page } from "@playwright/test";
import { expect, test } from "./helpers";
import {
  flagged,
  HOURS,
  insiderMarket,
  SEED,
} from "../../src/sheet/demos/insider-data.ts";
import { sheet } from "./sheet-base";

const FLAGS = flagged(insiderMarket(SEED)).length;
const ROW_CAP = 14;
const STEP = 700; // crawler.ts STEP_MS
const TICK = 40; // insider.ts TICK
/** lineTo calls in a complete draw: 5 grid lines, the price line's hours. */
const FULL_LINES = 5 + HOURS - 1;

interface Snap {
  rows: number[];
  stat: string;
  t: string;
  flags: number;
}
interface Draw {
  lines: number;
  bg: string;
  texts: { text: string; style: string }[];
}

async function open(page: Page) {
  // the clock first, so the timer log wraps the fake clock's timers
  const T0 = new Date("2026-10-01T00:00:00Z").getTime();
  await page.clock.install({ time: T0 });
  await page.clock.pauseAt(T0 + 1000);
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown>;
    const st = window.setTimeout;
    const ct = window.clearTimeout;
    const live = new Map<number, number>();
    const ran = new Map<number, number>();
    window.setTimeout = ((cb: () => void, ms = 0) => {
      const id: number = st(() => {
        live.delete(id);
        ran.set(ms, (ran.get(ms) ?? 0) + 1);
        cb();
      }, ms);
      live.set(id, ms);
      return id;
    }) as typeof setTimeout;
    window.clearTimeout = ((id: number) => {
      live.delete(id);
      ct(id);
    }) as typeof clearTimeout;
    w.__timers = (ms: number) =>
      [...live.values()].filter((m) => m === ms).length;
    w.__ran = (ms: number) => ran.get(ms) ?? 0;
    // insider draws: lineTo count, the background fill, each text's colour
    const draws: Record<string, unknown>[] = [];
    w.__draws = draws;
    const P = CanvasRenderingContext2D.prototype;
    const mine = (x: CanvasRenderingContext2D) =>
      !!x.canvas.closest?.('[data-win="insider"]');
    const cur = () => draws[draws.length - 1] as Record<string, unknown>;
    const fr = P.fillRect;
    P.fillRect = function (this: CanvasRenderingContext2D, ...a: number[]) {
      if (mine(this) && a[0] === 0 && a[1] === 0)
        draws.push({ lines: 0, bg: String(this.fillStyle), texts: [] });
      return fr.apply(this, a as Parameters<typeof fr>);
    };
    const lt = P.lineTo;
    P.lineTo = function (this: CanvasRenderingContext2D, x: number, y: number) {
      if (mine(this) && draws.length) (cur().lines as number)++;
      return lt.call(this, x, y);
    };
    const ft = P.fillText;
    P.fillText = function (this: CanvasRenderingContext2D, ...a: unknown[]) {
      if (mine(this) && draws.length)
        (cur().texts as object[]).push({
          text: a[0],
          style: String(this.fillStyle),
        });
      return (ft as (...x: unknown[]) => void).apply(this, a);
    };
    // a snapshot of both windows after each batch of DOM changes
    const snaps: unknown[] = [];
    w.__snaps = snaps;
    addEventListener("DOMContentLoaded", () => {
      const cr = document.querySelector('[data-win="crawler"]')!;
      const ins = document.querySelector('[data-win="insider"]')!;
      const snap = () =>
        snaps.push({
          rows: [...cr.querySelectorAll(".col ul")].map(
            (u) => u.querySelectorAll("li").length,
          ),
          stat: cr.querySelector(".cr-stat")!.textContent,
          t: ins.querySelector(".ins-t")!.textContent,
          flags: [...ins.querySelectorAll<HTMLElement>(".flags > div")].filter(
            (d) => !d.hidden,
          ).length,
        });
      snap();
      const o = new MutationObserver(snap);
      for (const e of [cr, ins])
        o.observe(e, {
          childList: true,
          subtree: true,
          characterData: true,
          attributes: true,
          attributeFilter: ["hidden"],
        });
    });
    // listeners added before the page's: the change has reached the page
    // once the test reads them (one task fires every query's change)
    w.__changes = 0;
    for (const q of [
      "(prefers-reduced-motion: reduce)",
      "(prefers-color-scheme: dark)",
    ])
      matchMedia(q).addEventListener("change", () => (w.__changes as number)++);
  });
  await page.goto(sheet());
  await expect(page.locator("#world")).toHaveAttribute("style", /scale\(/);
}

const crawler = (page: Page) => page.locator('[data-win="crawler"]');
const insider = (page: Page) => page.locator('[data-win="insider"]');
const pauseBtn = (page: Page) => crawler(page).locator(".bar .cr-pause");
const replay = (page: Page) =>
  insider(page).getByRole("button", { name: "Replay", exact: true });
const timers = (page: Page, ms: number) =>
  page.evaluate(
    (ms) =>
      (window as unknown as { __timers(ms: number): number }).__timers(ms),
    ms,
  );
const ran = (page: Page, ms: number) =>
  page.evaluate(
    (ms) => (window as unknown as { __ran(ms: number): number }).__ran(ms),
    ms,
  );
const snaps = (page: Page) =>
  page.evaluate(() => (window as unknown as { __snaps: Snap[] }).__snaps);
const draws = (page: Page) =>
  page.evaluate(() => (window as unknown as { __draws: Draw[] }).__draws);
const changes = (page: Page) =>
  page.evaluate(() => (window as unknown as { __changes: number }).__changes);
/** Changes a media feature and waits until the page's listeners ran; no
 * page time passes. */
async function emulate(page: Page, media: Parameters<Page["emulateMedia"]>[0]) {
  const n = await changes(page);
  await page.emulateMedia(media);
  await expect.poll(() => changes(page)).toBe(n + 1);
}

/** The window now: rows per column, footer total, insider hour and flags. */
async function now(page: Page) {
  const s = (await snaps(page)).at(-1)!;
  return {
    rows: s.rows,
    total: Number(/^(\d+) pages/.exec(s.stat)?.[1] ?? NaN),
    hour: Number(/^t = (\d+)h of/.exec(s.t)?.[1] ?? NaN),
    flags: s.flags,
  };
}
/** The crawler is complete: every column full; the footer counts at least
 * the rows shown. */
async function crawlerFull(page: Page) {
  const s = await now(page);
  expect(s.rows, "every column full").toEqual([
    ROW_CAP,
    ROW_CAP,
    ROW_CAP,
    ROW_CAP,
  ]);
  expect(s.total).toBeGreaterThanOrEqual(ROW_CAP * 4);
}
/** The insider is complete: the last hour, every flag, a full chart. */
async function insiderFull(page: Page) {
  const s = await now(page);
  expect(s.hour, "the footer at the last hour").toBe(HOURS - 1);
  expect(s.flags, "every flagged trade").toBe(FLAGS);
  expect((await draws(page)).at(-1)!.lines, "the full chart").toBe(FULL_LINES);
}

async function centre(page: Page, id: "crawler" | "insider") {
  const toggle = page.locator(".railtoggle");
  if (await toggle.isVisible()) await toggle.click();
  await page.locator(`[data-go="${id}"]`).click();
  await page.clock.runFor(1500);
  await expect(page.locator(`[data-win="${id}"]`)).toBeInViewport();
}
/** Runs the clock in small steps until the insider run ends. */
async function untilEnded(page: Page) {
  for (let t = 0; t <= 10000; t += 50) {
    const s = await now(page);
    if (s.hour === HOURS - 1 && s.flags === FLAGS) return;
    await page.clock.runFor(50);
  }
  throw new Error("the insider run did not end");
}

test.describe("R7.a reduced motion", () => {
  test("at start: each window complete in every render; no streaming when visible or after Pause/Resume", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await open(page);
    await centre(page, "crawler");
    await crawlerFull(page);
    await pauseBtn(page).click();
    await pauseBtn(page).click();
    await expect(pauseBtn(page)).toHaveAccessibleName("Pause");
    await centre(page, "insider");
    await insiderFull(page);
    expect(await timers(page, STEP), "no crawler step").toBe(0);
    expect(await timers(page, TICK), "no insider tick").toBe(0);
    const [n, d] = [(await snaps(page)).length, (await draws(page)).length];
    await page.clock.runFor(STEP * 4);
    expect((await snaps(page)).length, "no DOM change").toBe(n);
    expect((await draws(page)).length, "no draw").toBe(d);
    expect(await ran(page, STEP)).toBe(0);
    expect(await ran(page, TICK)).toBe(0);
    // never a partial state, from the first render on
    for (const s of await snaps(page)) {
      expect(s.rows).toEqual([ROW_CAP, ROW_CAP, ROW_CAP, ROW_CAP]);
      expect(s.t).toMatch(new RegExp(`^t = ${HOURS - 1}h`));
      expect(s.flags).toBe(FLAGS);
    }
    for (const x of await draws(page)) expect(x.lines).toBe(FULL_LINES);
  });

  test("after Replay: the chart and list complete with no page time; no tick", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await open(page);
    await centre(page, "insider");
    const d = (await draws(page)).length;
    await replay(page).click();
    expect((await draws(page)).length, "Replay drew").toBeGreaterThan(d);
    await insiderFull(page);
    expect(await timers(page, TICK)).toBe(0);
    for (const s of await snaps(page)) expect(s.flags).toBe(FLAGS);
    for (const x of await draws(page)) expect(x.lines).toBe(FULL_LINES);
  });

  test("turned on mid-run: both windows complete with no page time; nothing streams after", async ({
    page,
  }) => {
    await open(page);
    await centre(page, "crawler");
    await page.clock.runFor(STEP);
    expect(Math.min(...(await now(page)).rows)).toBeLessThan(ROW_CAP);
    expect(await timers(page, STEP)).toBe(1);
    // the crawler holds its partial rows while the insider plays
    await pauseBtn(page).click();
    await centre(page, "insider");
    await replay(page).click();
    await page.clock.runFor(300);
    expect((await now(page)).hour).toBeLessThan(HOURS - 1);
    expect(await timers(page, TICK)).toBe(1);
    expect(Math.min(...(await now(page)).rows)).toBeLessThan(ROW_CAP);
    await emulate(page, { reducedMotion: "reduce" });
    await crawlerFull(page);
    await insiderFull(page);
    await pauseBtn(page).click();
    await expect(pauseBtn(page)).toHaveAccessibleName("Pause");
    expect(await timers(page, STEP), "no crawler step left").toBe(0);
    expect(await timers(page, TICK), "no insider tick left").toBe(0);
    const [n, d] = [(await snaps(page)).length, (await draws(page)).length];
    await page.clock.runFor(STEP * 4);
    expect((await snaps(page)).length).toBe(n);
    expect((await draws(page)).length).toBe(d);
    // and Replay after the change is complete at once too
    await replay(page).click();
    await insiderFull(page);
    expect(await timers(page, TICK)).toBe(0);
  });
});

/** Every file of the build, as URL paths (`/next` is next.html). */
function buildPaths(): Set<string> {
  // the test build Playwright serves (playwright.config.ts)
  const dist = join(import.meta.dirname, "../../dist-e2e");
  const out = new Set<string>();
  for (const f of readdirSync(dist, { recursive: true, withFileTypes: true }))
    if (f.isFile())
      out.add(
        "/" + relative(dist, join(f.parentPath, f.name)).split(sep).join("/"),
      );
  out.add(sheet());
  return out;
}

test("R11.a from navigation through playback, Pause/Resume and Replay: only the build's own files, none during playback", async ({
  page,
  baseURL,
}) => {
  const urls: string[] = [];
  let pending = 0;
  page.on("request", (r) => {
    urls.push(r.url());
    pending++;
  });
  page.on("requestfinished", () => pending--);
  page.on("requestfailed", () => pending--);
  const settled = async () => {
    await expect.poll(() => pending).toBe(0);
    return urls.length;
  };
  await open(page);
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  await centre(page, "crawler");
  let n = await settled();
  // crawler playback, Pause, Resume
  await page.clock.runFor(STEP * 4);
  expect(await ran(page, STEP), "the crawler streamed").toBeGreaterThan(0);
  await pauseBtn(page).click();
  await page.clock.runFor(2000);
  await pauseBtn(page).click();
  await page.clock.runFor(STEP * 4);
  expect(await settled(), "no request during the crawler's playback").toBe(n);
  await centre(page, "insider");
  n = await settled();
  // insider playback to the end, Replay, to the end again
  await untilEnded(page);
  await replay(page).click();
  await untilEnded(page);
  expect(await ran(page, TICK), "the insider played").toBeGreaterThan(0);
  expect(await settled(), "no request during the insider's playback").toBe(n);
  // everything since navigation: same origin, a file of the build
  const own = new URL(baseURL!).origin;
  const files = buildPaths();
  const bad = urls.filter((u) => {
    const x = new URL(u);
    return x.origin !== own || !files.has(decodeURIComponent(x.pathname));
  });
  expect(bad, "requests beyond the build's own files").toEqual([]);
  expect(urls.length).toBeGreaterThan(0);
});

test.describe("R8 a live theme change", () => {
  // the tokens of src/sheet/sheet.css, light and dark
  const THEME = {
    light: {
      ink: "rgb(29, 43, 83)",
      dim: "rgb(95, 87, 79)",
      accent: "rgb(126, 37, 83)",
      bg: "#ffffff",
      axis: "#5f574f",
      spike: "#ab5236",
      px: [255, 255, 255],
    },
    dark: {
      ink: "rgb(255, 241, 232)",
      dim: "rgb(194, 195, 199)",
      accent: "rgb(255, 119, 168)",
      bg: "#1d2b53",
      axis: "#c2c3c7",
      spike: "#ffa300",
      px: [29, 43, 83],
    },
  } as const;
  type Scheme = keyof typeof THEME;

  /** Row text colours (✓ row, its score, ✗ row, its score). */
  const rowColors = (page: Page) =>
    crawler(page).evaluate((w) => {
      const c = (s: string) => getComputedStyle(w.querySelector(s)!).color;
      return [
        c(".col li:not(.no)"),
        c(".col li:not(.no) i"),
        c(".col li.no"),
        c(".col li.no i"),
      ];
    });
  /** A pixel of the chart's backing store, near the top left corner. */
  const pixel = (page: Page) =>
    insider(page)
      .locator("canvas")
      .evaluate((c: HTMLCanvasElement) => [
        ...c.getContext("2d")!.getImageData(2, 2, 1, 1).data.slice(0, 3),
      ]);

  async function check(page: Page, s: Scheme) {
    const t = THEME[s];
    expect(await rowColors(page), `${s} rows`).toEqual([
      t.ink,
      t.accent,
      t.dim,
      t.dim,
    ]);
    const d = (await draws(page)).at(-1)!;
    expect(d.bg, `${s} chart background`).toBe(t.bg);
    expect(d.lines, "the full chart").toBe(FULL_LINES);
    const style = (text: string) => d.texts.find((x) => x.text === text)?.style;
    expect(style("0¢"), `${s} axis text`).toBe(t.axis);
    expect(style("100¢")).toBe(t.axis);
    expect(style("spike"), `${s} spike text`).toBe(t.spike);
    expect(await pixel(page), `${s} canvas pixel`).toEqual(t.px);
  }

  for (const [from, to] of [
    ["light", "dark"],
    ["dark", "light"],
  ] as const)
    test(`${from} to ${to}: rows and a finished chart take the new colours; no timer left`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme: from });
      await open(page);
      await centre(page, "insider");
      await untilEnded(page);
      await check(page, from);
      const [d, r] = [(await draws(page)).length, await ran(page, TICK)];
      await emulate(page, { colorScheme: to });
      // the change itself redrew the idle chart, with no page time
      expect((await draws(page)).length, "redrawn").toBeGreaterThan(d);
      await check(page, to);
      expect(await timers(page, TICK), "no tick pending").toBe(0);
      const d2 = (await draws(page)).length;
      await page.clock.runFor(2000);
      expect((await draws(page)).length, "idle after").toBe(d2);
      expect(await ran(page, TICK), "no tick ran").toBe(r);
      expect(await timers(page, TICK)).toBe(0);
    });
});
