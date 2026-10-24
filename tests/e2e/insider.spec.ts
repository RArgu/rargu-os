// Spec 006 T4: the Insider Trading window at /next (R2, R3, R5, R6, R9, R10).
//
// The page is observed from outside: every drawing call on the insider
// canvas is logged in CSS px (the call's point through the context's
// transform, divided by the backing store's scale), with the fill or stroke
// colour at that moment. A draw of the chart starts with a fill of the whole
// canvas. Time is Playwright's fake clock, paused: timers and animation
// frames run only when a test runs the clock. The expected data comes from
// the seeded generator, computed here.
import type { Browser, Locator, Page } from "@playwright/test";
import { expect, test } from "./helpers";
import {
  flagged,
  HOURS,
  insiderMarket,
  SEED,
  SPIKE,
} from "../../src/sheet/demos/insider-data.ts";
import { sheet } from "./sheet-base";

const MARKET = insiderMarket(SEED);
const FLAGS = flagged(MARKET);
const R3 =
  "Simulated demo. The interactive tool is planned and is not available here.";
const CANDIDATES = /flags candidates and does not prove insider trading/;

interface Op {
  op: string;
  /** points in CSS px */
  p: [number, number][];
  /** arc radius, CSS px */
  r?: number;
  style?: string;
  text?: string;
  w?: number;
  h?: number;
}

async function instrument(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown>;
    // the last draw's calls (a draw starts with a fill of the whole
    // canvas) and the number of draws
    let ops: Record<string, unknown>[] = [];
    let draws = 0;
    w.__last = () => ops;
    w.__draws = () => draws;
    const P = CanvasRenderingContext2D.prototype as unknown as Record<
      string,
      (...a: unknown[]) => unknown
    >;
    const css = (x: CanvasRenderingContext2D, px: number, py: number) => {
      const m = x.getTransform();
      const k = x.canvas.width / x.canvas.clientWidth;
      return [(m.a * px + m.c * py + m.e) / k, (m.b * px + m.d * py + m.f) / k];
    };
    const mine = (x: CanvasRenderingContext2D) =>
      !!x.canvas.closest?.('[data-win="insider"]');
    const wrap = (
      name: string,
      log: (x: CanvasRenderingContext2D, a: number[]) => object,
    ) => {
      const raw = P[name];
      P[name] = function (this: CanvasRenderingContext2D, ...a: unknown[]) {
        if (mine(this)) {
          const o = { op: name, ...log(this, a as number[]) } as Record<
            string,
            unknown
          >;
          const c = this.canvas;
          const p = (o.p as number[][] | undefined)?.[0];
          if (
            name === "fillRect" &&
            Math.abs(p![0]) < 0.01 &&
            Math.abs(p![1]) < 0.01 &&
            Math.abs((o.w as number) - c.clientWidth) < 0.01 &&
            Math.abs((o.h as number) - c.clientHeight) < 0.01
          ) {
            ops = [];
            draws++;
          }
          ops.push(o);
        }
        return raw.apply(this, a);
      };
    };
    const k = (x: CanvasRenderingContext2D) =>
      (x.getTransform().a / x.canvas.width) * x.canvas.clientWidth;
    wrap("fillRect", (x, [a, b, c, d]) => ({
      p: [css(x, a, b)],
      w: c * k(x),
      h: d * k(x),
      style: String(x.fillStyle),
    }));
    wrap("moveTo", (x, [a, b]) => ({ p: [css(x, a, b)] }));
    wrap("lineTo", (x, [a, b]) => ({ p: [css(x, a, b)] }));
    wrap("arc", (x, [a, b, r]) => ({ p: [css(x, a, b)], r: r * k(x) }));
    wrap("fill", (x) => ({ p: [], style: String(x.fillStyle) }));
    wrap("stroke", (x) => ({ p: [], style: String(x.strokeStyle) }));
    const ft = P.fillText;
    P.fillText = function (this: CanvasRenderingContext2D, ...a: unknown[]) {
      if (mine(this))
        ops.push({
          op: "fillText",
          text: a[0],
          p: [css(this, a[1] as number, a[2] as number)],
          style: String(this.fillStyle),
        });
      return ft.apply(this, a);
    };
    // pending timeouts and the callbacks run, by delay, so a test sees the
    // insider's step chain (TICK ms) apart from the other demos' timers
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
    // the resolution queries the page listens to (R10), so a test can send
    // one a change: real browsers fire it when the device pixel ratio changes
    const res: MediaQueryList[] = [];
    w.__res = res;
    const mm = window.matchMedia.bind(window);
    window.matchMedia = (q: string) => {
      const l = mm(q);
      if (q.includes("resolution")) res.push(l);
      return l;
    };
    Object.defineProperty(Event.prototype, "timeStamp", {
      get: () => performance.now(),
    });
  });
}

/** Instrumentation, then /next with the fake clock paused at its start. */
async function open(page: Page) {
  // the clock first, so the timer log wraps the fake clock's timers
  const T0 = new Date("2026-10-01T00:00:00Z").getTime();
  await page.clock.install({ time: T0 });
  await page.clock.pauseAt(T0 + 1000);
  await instrument(page);
  await page.goto(sheet());
  await expect(page.locator("#world")).toHaveAttribute("style", /scale\(/);
}

const win = (page: Page) => page.locator('[data-win="insider"]');
const replay = (page: Page) =>
  win(page).getByRole("button", { name: "Replay", exact: true });
const hour = async (page: Page) => {
  const t = (await win(page).locator(".wfoot").textContent())!;
  const m = /t = (\d+)h of 160h/.exec(t);
  expect(m, `footer "${t}"`).not.toBeNull();
  return Number(m![1]);
};
/** The flagged entries shown: [wallet, the line under it]. */
const shown = (page: Page) =>
  win(page)
    .locator(".flags > div")
    .evaluateAll((all) =>
      all
        .filter((d) => (d as HTMLElement).offsetParent !== null)
        .map((d) => [
          d.querySelector("b")!.textContent!,
          d.textContent!.slice(d.querySelector("b")!.textContent!.length),
        ]),
    );
const EXPECTED = FLAGS.map((f) => [
  f.wallet,
  `$${f.amount}k · ${f.hoursBefore}h before`,
]);

/** The last draw of the chart: its calls in order. */
const last = (page: Page) =>
  page.evaluate(() => (window as unknown as { __last(): Op[] }).__last());
const draws = (page: Page) =>
  page.evaluate(() => (window as unknown as { __draws(): number }).__draws());
/** The canvas's CSS size and backing store. */
const size = (page: Page) =>
  win(page)
    .locator("canvas")
    .evaluate((c: HTMLCanvasElement) => ({
      w: c.clientWidth,
      h: c.clientHeight,
      bw: c.width,
      bh: c.height,
      dpr: devicePixelRatio,
    }));
/** The price line: the last path of a draw, one point per hour drawn. */
function priceLine(f: Op[]): [number, number][] {
  let cur: [number, number][] = [];
  for (const o of f)
    if (o.op === "moveTo") cur = [o.p[0]];
    else if (o.op === "lineTo") cur.push(o.p[0]);
  return cur;
}
/** The plot box in CSS px, from a draw's grid lines (the first five
 * segments, 100¢ to 0¢ in any order). It must be the mock's plot box: 40 of
 * 900 units in from each side, the canvas 900 units wide. */
async function plotBox(page: Page, f: Op[]) {
  const segs = f.filter((o) => o.op === "moveTo" || o.op === "lineTo");
  const grid: [number, number, number][] = [];
  for (let i = 0; i < 10; i += 2) {
    expect([segs[i].op, segs[i + 1].op]).toEqual(["moveTo", "lineTo"]);
    const [a, b] = [segs[i].p[0], segs[i + 1].p[0]];
    expect(b[1], "a horizontal grid line").toBeCloseTo(a[1], 6);
    grid.push([a[0], b[0], a[1]]);
  }
  const ys = grid.map((g) => g[2]).sort((a, b) => a - b);
  const box = {
    left: grid[0][0],
    right: grid[0][1],
    top: ys[0],
    bottom: ys[4],
  };
  for (const g of grid) {
    expect(g[0]).toBeCloseTo(box.left, 6);
    expect(g[1]).toBeCloseTo(box.right, 6);
  }
  // the grid at 0, 25, 50, 75 and 100¢
  ys.forEach((y, i) =>
    expect(y).toBeCloseTo(box.top + (i / 4) * (box.bottom - box.top), 4),
  );
  const s = await size(page);
  const unit = s.w / 900;
  expect(box.left).toBeCloseTo(40 * unit, 4);
  expect(box.right).toBeCloseTo(860 * unit, 4);
  expect(box.top).toBeCloseTo(40 * unit, 4);
  expect(box.bottom).toBeCloseTo(s.h - 40 * unit, 4);
  return box;
}
/** The trade dots of a draw: each arc with the colour of its fill. */
function dots(f: Op[]) {
  const out: { x: number; y: number; r: number; style: string }[] = [];
  f.forEach((o, i) => {
    if (o.op !== "arc") return;
    const fill = f.slice(i + 1).find((n) => n.op === "fill");
    out.push({ x: o.p[0][0], y: o.p[0][1], r: o.r!, style: fill!.style! });
  });
  return out;
}
/** A CSS colour as the canvas writes it back. */
const canvasColor = (page: Page, prop: string) =>
  win(page)
    .locator("canvas")
    .evaluate((c, prop) => {
      const x = document.createElement("canvas").getContext("2d")!;
      x.fillStyle = getComputedStyle(c).getPropertyValue(prop).trim();
      return String(x.fillStyle);
    }, prop);

/** Goes to the window with the card's navigation; the pan runs. */
async function go(page: Page, phone = false) {
  if (phone) await page.locator(".railtoggle").click();
  await page.locator('[data-go="insider"]').click();
  await page.clock.runFor(1500);
  await expect(win(page)).toBeInViewport();
}
/** Runs the clock in small steps until `done` (at most `ms`). */
async function until(page: Page, done: () => Promise<boolean>, ms = 10000) {
  for (let t = 0; t <= ms && !(await done()); t += 50)
    await page.clock.runFor(50);
  expect(await done(), "reached").toBe(true);
}
const ended = async (page: Page) =>
  (await hour(page)) === HOURS - 1 &&
  (await shown(page)).length === FLAGS.length;

/** The window's box and the scroller's client box, client px. */
async function inView(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const vp = document.querySelector<HTMLElement>("#vp")!;
    const b = vp.getBoundingClientRect();
    const w = document
      .querySelector('[data-win="insider"]')!
      .getBoundingClientRect();
    const v = {
      l: b.left + vp.clientLeft,
      t: b.top + vp.clientTop,
      r: b.left + vp.clientLeft + vp.clientWidth,
      b: b.top + vp.clientTop + vp.clientHeight,
    };
    return w.left < v.r && v.l < w.right && w.top < v.b && v.t < w.bottom;
  });
}
/** Presses the bare paper (no move), so arrow keys scroll the sheet. */
async function pressPaper(page: Page) {
  const p = await page.evaluate(() => {
    const ok = new Set(["vp", "sizer", "world"]);
    for (let y = Math.min(40, innerHeight / 2); y < innerHeight; y += 16)
      for (let x = innerWidth - 64; x > 0; x -= 16) {
        const e = document.elementFromPoint(x, y);
        if (e && ok.has(e.id)) return [x, y] as [number, number];
      }
    return null;
  });
  expect(p, "a point on the bare paper").not.toBeNull();
  await page.mouse.move(p![0], p![1]);
  await page.mouse.down();
  await page.mouse.up();
}
async function arrowUntil(
  page: Page,
  key: string,
  done: () => Promise<boolean>,
) {
  for (let i = 0; i < 60 && !(await done()); i++)
    await page.keyboard.press(key);
  expect(await done(), `${key} reached the goal`).toBe(true);
}
const hide = (page: Page, hidden: boolean) =>
  page.evaluate((hidden) => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => hidden,
    });
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => (hidden ? "hidden" : "visible"),
    });
    document.dispatchEvent(new Event("visibilitychange"));
  }, hidden);
/** The insider's step timer (src/sheet/demos/insider.ts TICK). */
const TICK = 40;
/** Step callbacks run, and step timers pending. */
const ran = (page: Page) =>
  page.evaluate(
    (ms) => (window as unknown as { __ran(ms: number): number }).__ran(ms),
    TICK,
  );
const timers = (page: Page) =>
  page.evaluate(
    (ms) =>
      (window as unknown as { __timers(ms: number): number }).__timers(ms),
    TICK,
  );
const place = (page: Page) =>
  win(page).evaluate((w) => (w as HTMLElement).style.transform);
const isFocused = (l: Locator) =>
  l.evaluate((el) => el === document.activeElement).catch(() => false);

test("at rest, before the window is first visible, the full chart and list show", async ({
  page,
}) => {
  await open(page);
  expect(await inView(page), "off the start view").toBe(false);
  expect(await hour(page)).toBe(HOURS - 1);
  expect(await shown(page)).toEqual(EXPECTED);
  const f = await last(page);
  expect(priceLine(f)).toHaveLength(HOURS);
  expect(dots(f)).toHaveLength(MARKET.trades.length);
  await page.clock.runFor(3000);
  expect(await hour(page), "nothing plays off view").toBe(HOURS - 1);
});

test("R2.a seed S: the flagged list equals flagged(insiderMarket(SEED)), each with a highlighted dot at its hour", async ({
  page,
}) => {
  await open(page);
  await go(page);
  await until(page, () => ended(page));
  expect(await shown(page)).toEqual(EXPECTED);
  const f = await last(page);
  const line = priceLine(f);
  expect(line, "one point per hour").toHaveLength(HOURS);
  const all = dots(f);
  // the plot box, from the drawn axes: the five grid lines (0¢ to 100¢)
  // are the first five segments of a draw
  const grid = await plotBox(page, f);
  const at = (h: number) => [
    grid.left + (h / (HOURS - 1)) * (grid.right - grid.left),
    grid.bottom - MARKET.price[h] * (grid.bottom - grid.top),
  ];
  // the price line: hour h at its place in the box, at the seed's price
  line.forEach((p, h) => {
    const [x, y] = at(h);
    expect(p[0], `hour ${h} x`).toBeCloseTo(x, 2);
    expect(p[1], `hour ${h} y`).toBeCloseTo(y, 2);
  });
  // one dot per trade, in hour order, at its hour and that hour's price
  expect(all).toHaveLength(MARKET.trades.length);
  MARKET.trades.forEach((t, i) => {
    const [x, y] = at(t.hour);
    expect(all[i].x, `trade ${i} x`).toBeCloseTo(x, 2);
    expect(all[i].y, `trade ${i} y`).toBeCloseTo(y, 2);
  });
  // dots by size: a bigger trade has a bigger dot
  const bySize = MARKET.trades
    .map((t, i) => [t.size, all[i].r] as const)
    .sort((a, b) => a[0] - b[0]);
  for (let i = 1; i < bySize.length; i++)
    if (bySize[i][0] > bySize[i - 1][0])
      expect(bySize[i][1]).toBeGreaterThan(bySize[i - 1][1]);
  // highlighted: exactly the flagged trades
  const flag = await canvasColor(page, "--chart-flag");
  const hi = MARKET.trades.filter((_, i) => all[i].style === flag);
  expect(hi.map((t) => [t.wallet, SPIKE - t.hour])).toEqual(
    FLAGS.map((x) => [x.wallet, x.hoursBefore]),
  );
  // each flagged dot at its hour (spike − hours before) and price
  for (const x of FLAGS) {
    const i = MARKET.trades.findIndex((t) => t.wallet === x.wallet);
    const [ex, ey] = at(SPIKE - x.hoursBefore);
    expect(all[i].style, `${x.wallet} highlighted`).toBe(flag);
    expect(all[i].x, `${x.wallet} x`).toBeCloseTo(ex, 2);
    expect(all[i].y, `${x.wallet} y`).toBeCloseTo(ey, 2);
  }
  // the spike is marked
  expect(f.some((o) => o.op === "fillText" && o.text === "spike")).toBe(true);
});

test("R2 the chart draws over time; the spike mark and flags come only at the spike", async ({
  page,
}) => {
  await open(page);
  await go(page);
  await replay(page).click();
  const seen: { n: number; spike: boolean; flags: number; h: number }[] = [];
  const from = await draws(page);
  await until(page, async () => {
    const f = await last(page);
    seen.push({
      n: priceLine(f).length,
      spike: f.some((o) => o.op === "fillText" && o.text === "spike"),
      flags: (await shown(page)).length,
      h: await hour(page),
    });
    return ended(page);
  });
  expect(await draws(page)).toBeGreaterThan(from + 20);
  for (let i = 1; i < seen.length; i++)
    expect(seen[i].n).toBeGreaterThanOrEqual(seen[i - 1].n);
  expect(seen[0].n).toBeLessThan(HOURS / 4);
  for (const s of seen) {
    expect(s.n, "the line ends at the footer's hour").toBe(s.h + 1);
    if (s.h < SPIKE) expect([s.spike, s.flags]).toEqual([false, 0]);
    else expect(s.spike).toBe(true);
  }
  // the flags come one by one
  const counts = [...new Set(seen.map((s) => s.flags))];
  expect(counts).toEqual([...Array(FLAGS.length + 1).keys()]);
});

test("R9 a text summary of the chart sits next to the canvas", async ({
  page,
}) => {
  await open(page);
  const c = win(page).locator("canvas");
  await expect(c).toHaveAttribute("role", "img");
  const id = await c.getAttribute("aria-describedby");
  expect(id).toBeTruthy();
  const sum = win(page).locator(`[id="${id}"]`);
  const text = (await sum.textContent())!;
  const cents = (v: number) => `${Math.round(v * 100)}¢`;
  expect(text).toContain(`hour ${SPIKE}`);
  expect(text).toContain(cents(MARKET.price[SPIKE - 1]));
  expect(text).toContain(cents(MARKET.price[HOURS - 1]));
  expect(text).toContain(`${FLAGS.length} trades flagged`);
  // next to the canvas: its following sibling
  expect(
    await c.evaluate((el, id) => el.nextElementSibling?.id === id, id),
  ).toBe(true);
});

for (const [width, height] of [
  [1440, 900],
  [390, 844],
] as const)
  test(`R3.a at ${width} × ${height}, centred: both sentences show without scrolling`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await open(page);
    await go(page, width < 761);
    // during a run (the list empties) and at rest (all four cards)
    for (const when of ["during a run", "at rest"]) {
      if (when === "at rest") await until(page, () => ended(page));
      for (const text of [R3, CANDIDATES]) {
        const el = win(page).locator(".demo-area").getByText(text);
        await expect(el).toBeVisible();
        // the text (not its full-width block) is inside the demo area (no
        // clip; the window does not scroll), inside the view, and on top
        const r = await el.evaluate((n) => {
          const t = document.createRange();
          t.selectNodeContents(n);
          const b = t.getBoundingClientRect();
          const a = n.closest(".demo-area")!.getBoundingClientRect();
          const vp = document.querySelector<HTMLElement>("#vp")!;
          const v = vp.getBoundingClientRect();
          const on = (x: number, y: number) =>
            n.contains(document.elementFromPoint(x, y));
          return {
            inArea:
              b.left >= a.left &&
              b.right <= a.right &&
              b.top >= a.top &&
              b.bottom <= a.bottom,
            inView:
              b.left >= v.left &&
              b.right <= v.left + vp.clientWidth &&
              b.top >= v.top &&
              b.bottom <= v.top + vp.clientHeight,
            onTop: on(b.left + 2, b.top + 4) && on(b.left + 2, b.bottom - 4),
            scroll: [
              n.closest(".demo-area")!.scrollTop,
              n.closest(".sheet-win")!.scrollTop,
            ],
          };
        });
        expect(r, `${when}: ${text}`).toEqual({
          inArea: true,
          inView: true,
          onTop: true,
          scroll: [0, 0],
        });
      }
    }
    // the list fits beside the chart
    const fits = await win(page).evaluate((w) => {
      const a = w.querySelector(".demo-area")!.getBoundingClientRect();
      const l = w.querySelector(".flags")!.getBoundingClientRect();
      return l.bottom <= a.bottom + 0.5;
    });
    expect(fits).toBe(true);
  });

test.describe("R5.a only while visible", () => {
  test("first visible: it plays from the start", async ({ page }) => {
    await open(page);
    await go(page);
    expect(await hour(page)).toBeLessThan(HOURS / 2);
    await until(page, () => ended(page));
  });

  test("off view for 2 s: nothing runs; back, it goes on from the same hour", async ({
    page,
  }) => {
    await open(page);
    await go(page);
    await page.clock.runFor(500);
    const h0 = await hour(page);
    expect(h0).toBeGreaterThan(0);
    expect(h0).toBeLessThan(HOURS - 1);
    await pressPaper(page);
    await arrowUntil(page, "ArrowUp", async () => !(await inView(page)));
    // the view change reaches the watcher with the next scroll event
    await expect
      .poll(async () => {
        const d = await draws(page);
        await page.clock.runFor(100);
        return (await draws(page)) - d;
      })
      .toBe(0);
    const h1 = await hour(page);
    const [n, r] = [await draws(page), await ran(page)];
    expect(await timers(page), "no step timer while away").toBe(0);
    await page.clock.runFor(2000);
    expect(await draws(page), "no draw while away").toBe(n);
    expect(await ran(page), "no step callback while away").toBe(r);
    expect(await timers(page)).toBe(0);
    expect(await hour(page)).toBe(h1);
    await arrowUntil(page, "ArrowDown", () => inView(page));
    expect(await hour(page), "the same hour").toBe(h1);
    // the view change reaches the watcher with the next scroll event
    await expect
      .poll(async () => {
        await page.clock.runFor(100);
        return hour(page);
      })
      .toBeGreaterThan(h1);
    // from the same hour, not from the start
    expect(await hour(page)).toBeLessThanOrEqual(h1 + 10);
    expect(await ran(page)).toBeGreaterThan(r);
    await until(page, () => ended(page));
  });

  test("a hidden tab: nothing runs; visible again, it goes on", async ({
    page,
  }) => {
    await open(page);
    await go(page);
    await page.clock.runFor(500);
    await hide(page, true);
    const h = await hour(page);
    const [n, r] = [await draws(page), await ran(page)];
    expect(await timers(page)).toBe(0);
    await page.clock.runFor(2000);
    expect(await draws(page)).toBe(n);
    expect(await ran(page), "no callback runs").toBe(r);
    expect(await timers(page)).toBe(0);
    expect(await hour(page)).toBe(h);
    await hide(page, false);
    expect(await hour(page)).toBe(h);
    expect(await timers(page), "one step chain").toBe(1);
    await page.clock.runFor(300);
    expect(await hour(page)).toBeGreaterThan(h);
    await until(page, () => ended(page));
  });

  test("a finished run stays still: no timer is left", async ({ page }) => {
    await open(page);
    await go(page);
    await until(page, () => ended(page));
    const [n, r] = [await draws(page), await ran(page)];
    expect(await timers(page), "no step timer pending").toBe(0);
    await page.clock.runFor(3000);
    expect(await draws(page)).toBe(n);
    expect(await ran(page), "no step callback runs").toBe(r);
    expect(await timers(page)).toBe(0);
    expect(await hour(page)).toBe(HOURS - 1);
    expect(await shown(page)).toEqual(EXPECTED);
  });
});

/** A run from a Replay press: each 50 ms step's [hour, flags, draws]. */
async function record(page: Page) {
  const out: [number, string[][], number][] = [];
  const d0 = await draws(page);
  for (let t = 0; t <= 6000; t += 50) {
    out.push([await hour(page), await shown(page), (await draws(page)) - d0]);
    if (await ended(page)) break;
    await page.clock.runFor(50);
  }
  return out;
}

test("R6.a Replay right after the first wallet shows: no old entry comes back, one timer chain", async ({
  page,
}) => {
  await open(page);
  await go(page);
  await until(page, () => ended(page));
  // a clean replay, as the reference
  await replay(page).click();
  const clean = await record(page);
  expect(clean.at(-1)![1]).toEqual(EXPECTED);
  // replay again, then once more right after its first wallet shows
  await replay(page).click();
  await until(page, async () => (await shown(page)).length === 1);
  await replay(page).click();
  expect(await shown(page), "the list empties").toEqual([]);
  const again = await record(page);
  for (const [h, list] of again) {
    if (h < SPIKE) expect(list, `hour ${h}`).toEqual([]);
    expect(EXPECTED.slice(0, list.length), "in order, no repeat").toEqual(list);
  }
  // the same run as the clean one: same hours, list and draw count at each
  // step (a second chain would draw more or run faster)
  expect(again).toEqual(clean);
});

test.describe("R9.a Replay", () => {
  test("a native button named Replay in the title bar", async ({ page }) => {
    await open(page);
    expect(await replay(page).evaluate((b) => b.tagName)).toBe("BUTTON");
    await expect(replay(page)).toHaveAttribute("type", "button");
    expect(await replay(page).evaluate((b) => !!b.closest(".bar"))).toBe(true);
  });

  for (const key of ["Enter", " "])
    test(`${key === " " ? "Space" : key} replays, focus stays, the window does not move`, async ({
      page,
    }) => {
      await open(page);
      await go(page);
      await until(page, () => ended(page));
      const at = await place(page);
      await replay(page).focus();
      await page.keyboard.press(key);
      expect(await hour(page)).toBeLessThan(HOURS / 4);
      expect(await shown(page)).toEqual([]);
      expect(await isFocused(replay(page))).toBe(true);
      await until(page, () => ended(page));
      expect(await isFocused(replay(page))).toBe(true);
      expect(await place(page)).toBe(at);
    });

  test("a mouse drag that starts on Replay never drags the window", async ({
    page,
  }) => {
    await open(page);
    await go(page);
    const at = await place(page);
    const b = (await replay(page).boundingBox())!;
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    await page.mouse.move(b.x - 200, b.y + 120, { steps: 6 });
    await page.mouse.up();
    await page.clock.runFor(1000);
    await expect(win(page)).not.toHaveClass(/lifted/);
    expect(await place(page)).toBe(at);
  });
});

/** The chart's axis geometry in CSS px at a device pixel ratio. */
async function geometry(browser: Browser, dpr: number) {
  const ctx = await browser.newContext({
    deviceScaleFactor: dpr,
    viewport: { width: 1280, height: 800 },
  });
  const page = await ctx.newPage();
  await open(page);
  const s = await size(page);
  const f = await last(page);
  const g = {
    css: [s.w, s.h],
    backing: [s.bw, s.bh],
    // the grid lines and their labels, the price line's ends
    lines: f
      .filter((o) => o.op === "moveTo" || o.op === "lineTo")
      .slice(0, 10)
      .map((o) => o.p[0].map((v) => +v.toFixed(2))),
    labels: f
      .filter((o) => o.op === "fillText")
      .map((o) => [o.text, ...o.p[0].map((v) => +v.toFixed(2))]),
    ends: [priceLine(f)[0], priceLine(f).at(-1)!].map((p) =>
      p.map((v) => +v.toFixed(2)),
    ),
  };
  await ctx.close();
  return g;
}

test("R10.a DPR 1 and 2: the same geometry in CSS px; the backing store follows DPR", async ({
  browser,
}) => {
  const one = await geometry(browser, 1);
  const two = await geometry(browser, 2);
  expect(one.labels.length).toBeGreaterThanOrEqual(5);
  expect(two.css).toEqual(one.css);
  expect(two.lines).toEqual(one.lines);
  expect(two.labels).toEqual(one.labels);
  expect(two.ends).toEqual(one.ends);
  expect(one.backing).toEqual(one.css.map(Math.round));
  expect(two.backing).toEqual(one.css.map((v) => Math.round(v * 2)));
});

test("R10 a resize mid-run keeps the playback state", async ({ page }) => {
  await open(page);
  await go(page);
  await page.clock.runFor(1500);
  const h = await hour(page);
  const list = await shown(page);
  expect(h).toBeGreaterThan(0);
  expect(h).toBeLessThan(HOURS - 1);
  const c = win(page).locator("canvas");
  await c.evaluate((el: HTMLCanvasElement) => (el.style.width = "300px"));
  await expect
    .poll(async () => {
      const s = await size(page);
      return [s.w, s.bw - s.w * s.dpr, s.bh - s.h * s.dpr];
    })
    .toEqual([300, 0, 0]);
  expect(await hour(page)).toBe(h);
  expect(await shown(page)).toEqual(list);
  // the redraw shows the same hour at the new size
  const f = await last(page);
  expect(priceLine(f)).toHaveLength(h + 1);
  expect(Math.max(...priceLine(f).map((p) => p[0]))).toBeLessThan(300);
  await until(page, () => ended(page));
  expect(await shown(page)).toEqual(EXPECTED);
});

test("R10 a device pixel ratio change at rest redraws the backing store; the chart stays complete", async ({
  page,
}) => {
  // Real: the page's listener on its resolution query, the redraw and the
  // backing store. Simulated: the ratio itself (devicePixelRatio is
  // overridden) and the query's change event (dispatched here); a CDP
  // ratio override fires no change event in headless Chromium.
  await open(page);
  expect(await inView(page), "at rest, off view").toBe(false);
  const before = await size(page);
  const n = await draws(page);
  // from the context's ratio (1; WebKit's Desktop Safari: 2) to another
  const to = before.dpr === 1 ? 2 : 1;
  const fired = await page.evaluate((to) => {
    const w = window as unknown as { __res: MediaQueryList[] };
    const q = w.__res.at(-1);
    const now = `resolution: ${devicePixelRatio}dppx`;
    if (!q || !q.media.includes(now)) return q?.media ?? null;
    Object.defineProperty(window, "devicePixelRatio", {
      configurable: true,
      get: () => to,
    });
    q.dispatchEvent(new Event("change"));
    return "sent";
  }, to);
  expect(fired, "the current ratio's query is listened to").toBe("sent");
  const s = await size(page);
  expect(s.dpr).toBe(to);
  expect([s.w, s.h]).toEqual([before.w, before.h]);
  expect([s.bw, s.bh]).toEqual([before.w * to, before.h * to]);
  expect(await draws(page)).toBe(n + 1);
  // the same state: the full chart, the full list
  expect(priceLine(await last(page))).toHaveLength(HOURS);
  expect(await hour(page)).toBe(HOURS - 1);
  expect(await shown(page)).toEqual(EXPECTED);
  // re-armed for the new ratio
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { __res: MediaQueryList[] }).__res.at(-1)!.media,
    ),
  ).toContain(`resolution: ${to}dppx`);
});

test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false });
  test("the list, the summary and both sentences are in the page", async ({
    page,
  }) => {
    await page.goto(sheet());
    await expect(win(page).getByText(R3)).toBeAttached();
    await expect(win(page).getByText(CANDIDATES)).toBeAttached();
    for (const f of FLAGS)
      await expect(
        win(page).getByText(f.wallet, { exact: true }),
      ).toBeAttached();
    await expect(win(page).locator(".wfoot")).toContainText("dot size");
  });
});
