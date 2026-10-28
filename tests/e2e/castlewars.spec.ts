// Spec 005 T3, T4: the Castle Wars window at /next (R1, R3, R4, R5, R8) and
// the visibility helper on the real page (T1/T2 review, finding 1).
//
// The page is observed from outside: every sprite drawImage call is logged
// with the page's time and the frame it draws (the source x ÷ the frame
// width), and the page's pending timeouts are counted. Time is Playwright's
// fake clock, paused: timers and animation frames run only when a test
// runs the clock.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./helpers";
import { clock, frame, open as openControlled, settle } from "./sheet-clock";
import { entryAsset, sheet } from "./sheet-base";

const UNITS = [
  "swordsman",
  "spearman",
  "hammerman",
  "archer",
  "knight",
  "wizard",
] as const;
type Unit = (typeof UNITS)[number];
const ANIMS = ["idle", "walk", "attack", "victory", "death"] as const;
type Anim = (typeof ANIMS)[number];

/** Frame data read from the Aseprite JSON here, apart from the generator. */
interface Frames {
  w: number;
  tags: Record<string, [number, number]>;
  durations: number[];
}
const ART = join(import.meta.dirname, "../../src/apps/castlewars/art");
const DATA = Object.fromEntries(
  UNITS.map((u) => {
    const d = JSON.parse(readFileSync(join(ART, `${u}.json`), "utf8")) as {
      frames: Record<string, { frame: { w: number }; duration: number }>;
      meta: { frameTags: { name: string; from: number; to: number }[] };
    };
    const f = Object.values(d.frames);
    return [
      u,
      {
        w: f[0].frame.w,
        tags: Object.fromEntries(
          d.meta.frameTags.map((t) => [t.name, [t.from, t.to]]),
        ),
        durations: f.map((x) => x.duration),
      } satisfies Frames,
    ];
  }),
) as Record<Unit, Frames>;
/** One loop of `anim` for unit u, ms. */
const loop = (u: Unit, anim: Anim) => {
  const [a, b] = DATA[u].tags[anim];
  return DATA[u].durations.slice(a, b + 1).reduce((s, d) => s + d, 0);
};

const SPRITE =
  /\/(swordsman|spearman|hammerman|archer|knight|wizard)[^/]*\.png$/;
const unitOf = (url: string) => SPRITE.exec(new URL(url).pathname)?.[1];

interface Draw {
  t: number;
  u: Unit;
  f: number;
}

/** Instrumentation, then /next with the fake clock paused at its start. */
async function open(page: Page): Promise<string[]> {
  const requests: string[] = [];
  page.on("request", (r) => {
    if (unitOf(r.url())) requests.push(r.url());
  });
  const T0 = new Date("2026-10-01T00:00:00Z").getTime();
  await page.clock.install({ time: T0 });
  await page.clock.pauseAt(T0 + 1000);
  await page.addInitScript((src) => {
    const re = new RegExp(src);
    const w = window as unknown as Record<string, unknown>;
    const draws: unknown[] = [];
    w.__draws = draws;
    const raw = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function (
      this: CanvasRenderingContext2D,
      ...a: unknown[]
    ) {
      const img = a[0];
      const m =
        img instanceof HTMLImageElement &&
        re.exec(new URL(img.src, location.href).pathname);
      if (m && a.length === 9)
        draws.push({
          t: performance.now(),
          u: m[1],
          f: Math.round((a[1] as number) / (a[3] as number)),
        });
      return (raw as (...x: unknown[]) => void).apply(this, a);
    } as typeof raw;
    // pending timeouts, so a test sees how many timer chains run
    const st = window.setTimeout;
    const ct = window.clearTimeout;
    const live = new Set<number>();
    window.setTimeout = ((cb: () => void, ms?: number) => {
      const id: number = st(() => {
        live.delete(id);
        cb();
      }, ms);
      live.add(id);
      return id;
    }) as typeof setTimeout;
    window.clearTimeout = ((id: number) => {
      live.delete(id);
      ct(id);
    }) as typeof clearTimeout;
    w.__timers = () => live.size;
    // the order of sprite loads and scroll events (a view change reaches
    // the visibility watcher with the scroll event)
    const ev: string[] = [];
    w.__ev = ev;
    const srcProp = Object.getOwnPropertyDescriptor(
      HTMLImageElement.prototype,
      "src",
    )!;
    Object.defineProperty(HTMLImageElement.prototype, "src", {
      ...srcProp,
      set(v: string) {
        if (re.test(new URL(v, location.href).pathname)) ev.push("img");
        srcProp.set!.call(this, v);
      },
    });
    addEventListener("scroll", () => ev.push("scroll"), true);
    // event times on the fake clock, so a throw's release velocity comes
    // from the clock the test runs between moves
    Object.defineProperty(Event.prototype, "timeStamp", {
      get: () => performance.now(),
    });
  }, SPRITE.source);
  // "commit": a held sprite also holds the page's load event
  await page.goto(sheet(), { waitUntil: "commit" });
  await expect(page.locator("#world")).toHaveAttribute("style", /scale\(/);
  return requests;
}

const win = (page: Page) => page.locator('[data-win="castlewars"]');
const button = (page: Page, name: string) =>
  win(page).getByRole("button", { name, exact: true });
const draws = (page: Page) =>
  page.evaluate(() => (window as unknown as { __draws: Draw[] }).__draws);
const drawn = async (page: Page) => (await draws(page)).length;
const timers = (page: Page) =>
  page.evaluate(() => (window as unknown as { __timers(): number }).__timers());
/** Each unit's latest drawn frame. */
const lastFrames = async (page: Page) => {
  const d = await draws(page);
  return Object.fromEntries(
    UNITS.map((u) => [u, d.filter((x) => x.u === u).at(-1)?.f]),
  );
};
const loaded = (page: Page) =>
  expect(win(page).getByText("Loading units…")).toBeHidden();

/** The window's box and the scroller's client box, client px. */
async function boxes(page: Page) {
  return page.evaluate(() => {
    const vp = document.querySelector<HTMLElement>("#vp")!;
    const b = vp.getBoundingClientRect();
    const w = document
      .querySelector('[data-win="castlewars"]')!
      .getBoundingClientRect();
    return {
      win: { l: w.left, t: w.top, r: w.right, b: w.bottom },
      vp: {
        l: b.left + vp.clientLeft,
        t: b.top + vp.clientTop,
        r: b.left + vp.clientLeft + vp.clientWidth,
        b: b.top + vp.clientTop + vp.clientHeight,
      },
      scroll: [vp.scrollLeft, vp.scrollTop],
    };
  });
}
async function inView(page: Page): Promise<boolean> {
  const { win: w, vp: v } = await boxes(page);
  return w.l < v.r && v.l < w.r && w.t < v.b && v.t < w.b;
}

/** A point on the bare paper, for pressing the sheet itself. */
async function paper(page: Page): Promise<[number, number]> {
  const p = await page.evaluate(() => {
    const ok = new Set(["vp", "sizer", "world"]);
    // clear of the view's edges (scrollbars, edge zones)
    for (let y = Math.min(40, innerHeight / 2); y < innerHeight; y += 16)
      for (let x = innerWidth - 64; x > 0; x -= 16) {
        const e = document.elementFromPoint(x, y);
        if (e && ok.has(e.id)) return [x, y] as [number, number];
      }
    return null;
  });
  expect(p, "a point on the bare paper").not.toBeNull();
  return p!;
}

/** Presses the paper (no move), so the sheet has the focus for arrow keys
 * and any view motion under way stops. */
async function pressPaper(page: Page) {
  const [x, y] = await paper(page);
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.up();
}

/** Arrow keys on the sheet until `done`. */
async function arrowUntil(
  page: Page,
  key: string,
  done: () => Promise<boolean>,
) {
  for (let i = 0; i < 40 && !(await done()); i++)
    await page.keyboard.press(key);
  expect(await done(), `${key} reached the goal`).toBe(true);
}

/** Fakes a hidden or visible tab and sends visibilitychange. */
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

/** Each unit's frame changes in `d`: the frame and the time it showed. */
const changes = (d: Draw[], u: Unit) =>
  d
    .filter((x) => x.u === u)
    .filter((x, i, all) => i === 0 || all[i - 1].f !== x.f);

test("R1 the window shows the five animations, Pause, the unit names and the footer", async ({
  page,
}) => {
  await open(page);
  for (const a of ANIMS) await expect(button(page, a)).toBeVisible();
  await expect(button(page, "idle")).toHaveAttribute("aria-pressed", "true");
  for (const a of ANIMS.slice(1))
    await expect(button(page, a)).toHaveAttribute("aria-pressed", "false");
  await expect(button(page, "pause")).toBeVisible();
  const names = win(page).locator(".cw-units");
  await expect(names).toBeVisible();
  for (const u of UNITS) await expect(names).toContainText(u);
  // the names sit below the canvas
  const c = (await win(page).locator("canvas").boundingBox())!;
  const n = (await names.boundingBox())!;
  expect(n.y).toBeGreaterThanOrEqual(c.y + c.height - 0.5);
  await expect(win(page).locator(".wfoot .cw-info")).toHaveText("idle");
  await loaded(page);
  await button(page, "walk").click();
  await expect(win(page).locator(".wfoot .cw-info")).toHaveText("walk");
});

test("R1.a each animation loops all six units in order with each frame's JSON duration", async ({
  page,
}) => {
  await open(page);
  await loaded(page);
  for (const anim of ANIMS) {
    const from = await drawn(page);
    await button(page, anim).click();
    await expect(button(page, anim)).toHaveAttribute("aria-pressed", "true");
    const span = Math.max(...UNITS.map((u) => loop(u, anim)));
    await page.clock.runFor(2 * span + 50);
    const d = (await draws(page)).slice(from);
    for (const u of UNITS) {
      const [a, b] = DATA[u].tags[anim];
      const len = b - a + 1;
      const seen = changes(d, u);
      // two loops and the wrap to the first frame again
      expect(seen.length, `${u} ${anim} frames shown`).toBeGreaterThanOrEqual(
        2 * len + 1,
      );
      seen.forEach((x, i) => {
        expect(x.f, `${u} ${anim} frame ${i}`).toBe(a + (i % len));
        if (i)
          expect(
            Math.abs(x.t - seen[i - 1].t - DATA[u].durations[seen[i - 1].f]),
            `${u} ${anim} frame ${seen[i - 1].f} time`,
          ).toBeLessThanOrEqual(20);
      });
    }
  }
});

test("R1.b at zoom 160 % the canvas draws pixel-sharp", async ({ page }) => {
  await open(page);
  await loaded(page);
  for (let i = 0; i < 3; i++) {
    await page.locator("#zIn").click();
    await page.clock.runFor(300);
  }
  await expect(page.locator("#zPct")).toHaveText("160%");
  const c = win(page).locator("canvas");
  expect(await c.evaluate((el) => getComputedStyle(el).imageRendering)).toBe(
    "pixelated",
  );
  expect(
    await c.evaluate(
      (el) => (el as HTMLCanvasElement).getContext("2d")!.imageSmoothingEnabled,
    ),
  ).toBe(false);
});

test.describe("R3.a loading", () => {
  test("no sprite request until the view comes near the window; then the six load once", async ({
    page,
  }) => {
    // a view 60 px high: Castle Wars (sheet y 140) is outside the view
    // expanded by half its height above and below
    await page.setViewportSize({ width: 1280, height: 60 });
    const requests = await open(page);
    const { vp } = await boxes(page);
    expect(140, "Castle Wars is outside the expanded view").toBeGreaterThan(
      1.5 * (vp.b - vp.t),
    );
    await page.waitForLoadState("networkidle");
    expect(requests).toEqual([]);
    await pressPaper(page);
    // sideways: still not near
    await page.keyboard.press("ArrowRight");
    await page.waitForLoadState("networkidle");
    expect(requests).toEqual([]);
    // down until the expanded view reaches it
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await expect.poll(() => requests.length).toBe(6);
    await loaded(page);
    // more moves load nothing again
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowRight");
    await page.waitForLoadState("networkidle");
    expect(new Set(requests.map(unitOf))).toEqual(new Set(UNITS));
    expect(requests).toHaveLength(6);
  });

  // Each first activation from far away. A pointer press cannot come first:
  // a window that can be pressed is in the view, so it is eligible already.
  test("first activation by the card's navigation loads before the view moves", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 60 });
    const requests = await open(page);
    await page.waitForLoadState("networkidle");
    expect(requests).toEqual([]);
    const scroll = (await boxes(page)).scroll;
    await page
      .getByRole("navigation", { name: "Go to" })
      .getByRole("button", { name: /Castle Wars/ })
      .click();
    // the navigation pan waits for a frame (clock paused): the view is
    // where it was, still far from the window
    await expect.poll(() => requests.length).toBe(6);
    expect((await boxes(page)).scroll).toEqual(scroll);
    await loaded(page);
  });

  test("first activation by focus into the window loads before the view's scroll", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 60 });
    const requests = await open(page);
    await page.waitForLoadState("networkidle");
    expect(requests).toEqual([]);
    const ev = () =>
      page.evaluate(() => (window as unknown as { __ev: string[] }).__ev);
    const from = (await ev()).length;
    // focus moves the view to the window; the watcher hears of it only
    // with the scroll event, which comes after the loads started
    await win(page).focus();
    await expect.poll(() => requests.length).toBe(6);
    await expect.poll(async () => (await ev()).slice(from)).toContain("scroll");
    const after = (await ev()).slice(from);
    expect(after.indexOf("img")).toBeGreaterThanOrEqual(0);
    expect(after.indexOf("img")).toBeLessThan(after.indexOf("scroll"));
    await loaded(page);
  });

  test("activating again keeps the state, mounts once, and one press runs one handler", async ({
    page,
  }) => {
    const requests = await open(page);
    await loaded(page);
    await button(page, "walk").click();
    await button(page, "pause").click();
    // a pointer press inside it, focus into it and the card's navigation,
    // each twice
    for (let i = 0; i < 2; i++) {
      const b = (await win(page).locator(".blurb").boundingBox())!;
      await page.mouse.click(b.x + 20, b.y + 5);
      await win(page).focus();
      await page
        .getByRole("navigation", { name: "Go to" })
        .getByRole("button", { name: /Castle Wars/ })
        .click();
      await page.clock.runFor(400);
    }
    await page.waitForLoadState("networkidle");
    expect(requests).toHaveLength(6);
    await expect(button(page, "walk")).toHaveAttribute("aria-pressed", "true");
    await expect(button(page, "resume")).toBeVisible();
    await expect(win(page).locator(".wfoot .cw-info")).toHaveText("walk");
    expect(await timers(page), "still paused").toBe(0);
    // one press: one draw of the six units
    const n = await drawn(page);
    await button(page, "attack").click();
    expect(await drawn(page)).toBe(n + 6);
    await button(page, "resume").click();
    expect(await timers(page), "one timer chain").toBe(1);
  });
});

test.describe("R1 without JavaScript", () => {
  test.use({ javaScriptEnabled: false });
  test("the window says the animations need JavaScript", async ({ page }) => {
    await page.goto(sheet());
    await expect(
      win(page).getByText("Animations need JavaScript."),
    ).toBeVisible();
    await expect(win(page).getByText("Loading units…")).toHaveCount(0);
  });
});

// T3+T4 review 1: the start view does not wait for the sprites. The CSS
// comes late (WebKit may then run the sheet's script before it applies) and
// one sprite is held until the start view is checked.
for (const [width, height] of [
  [1440, 900],
  [390, 844],
] as const) {
  test(`late stylesheet at ${width} × ${height}: the start view comes before the sprites load`, async ({
    page,
    browserName,
  }) => {
    await page.setViewportSize({ width, height });
    const { release } = await lateStart(page, browserName);
    await expectStartView(page, width < 761);
    expect(
      await page.evaluate(() => document.readyState),
      "the page's load is still pending",
    ).not.toBe("complete");
    await expect(win(page).getByText("Loading units…")).toBeVisible();
    // Pentimento's canvas is drawn at its styled size × devicePixelRatio
    await expect
      .poll(() =>
        page
          .locator('[data-win="pentimento"] canvas')
          .evaluate(
            (c: HTMLCanvasElement) =>
              c.width - Math.round(c.clientWidth * devicePixelRatio),
          ),
      )
      .toBe(0);
    release();
    await loaded(page);
  });
}

/** Opens /next with the stylesheet held until the sheet's script has run
 * (WebKit) or has loaded (other browsers, which hold the script for the
 * stylesheet), and knight.png held until `release`. */
async function lateStart(page: Page, browserName: string) {
  let css!: () => void;
  const cssHeld = new Promise<void>((r) => (css = r));
  await page.route(entryAsset("css"), async (route) => {
    await cssHeld;
    await route.continue();
  });
  let release!: () => void;
  const held = new Promise<void>((r) => (release = r));
  // knight.png (made by script) and the card's Paint icon (an <img> in the
  // HTML): the page's load stays pending in every browser
  await page.route(/\/(knight[^/]*|sheet\/paint)\.png$/, async (route) => {
    await held;
    await route.continue();
  });
  const js = page.waitForEvent("requestfinished", (r) =>
    entryAsset("js").test(r.url()),
  );
  await page.goto(sheet(), { waitUntil: "commit" });
  if (browserName === "webkit")
    await expect(page.locator(".railtoggle")).toBeAttached();
  else await js;
  css();
  return { release };
}

/** The start view (001 R13, R15): desktop 100 % with the sheet's top-left
 * at the view's; phone CastleSiege's full width framed 16 px from the left. */
async function expectStartView(page: Page, phone: boolean) {
  const cs = page.locator('[data-win="castlesiege"]');
  // the start view sets the zoom
  await expect(page.locator("#world")).toHaveAttribute("style", /scale\(/);
  if (!phone) {
    await expect(page.locator("#zPct")).toHaveText("100%");
    await expect
      .poll(async () => {
        const b = (await cs.boundingBox())!;
        return [Math.round(b.x), Math.round(b.y)];
      })
      .toEqual([360, 100]);
    return;
  }
  await expect(page.locator("#zPct")).toHaveText("58%");
  await expect
    .poll(async () => {
      const b = (await cs.boundingBox())!;
      // within 1 px: browsers scroll in whole px
      return Math.abs(b.x - 16) <= 1 && Math.abs(b.width - 358) <= 1;
    })
    .toBe(true);
}

test.describe("R5.a loading state, failure and Retry", () => {
  test("Loading units… until all six load; a button pressed while loading sets the animation", async ({
    page,
  }) => {
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    await page.route(/\/knight[^/]*\.png$/, async (route) => {
      await held;
      await route.continue();
    });
    await open(page);
    await expect(win(page).getByText("Loading units…")).toBeVisible();
    await button(page, "walk").click();
    await expect(button(page, "walk")).toHaveAttribute("aria-pressed", "true");
    expect(await drawn(page), "nothing drawn before all six load").toBe(0);
    release();
    await loaded(page);
    // the first frames drawn are walk's first frame
    const first = await lastFrames(page);
    for (const u of UNITS) expect(first[u], u).toBe(DATA[u].tags.walk[0]);
    await page.clock.runFor(1000);
    expect(await drawn(page)).toBeGreaterThan(6);
  });

  test("one failed image shows an error and Retry; Retry loads once and starts one timer chain", async ({
    page,
    errors,
  }) => {
    let fail = true;
    await page.route(/\/knight[^/]*\.png$/, (route) =>
      fail ? route.fulfill({ status: 500, body: "" }) : route.continue(),
    );
    const requests = await open(page);
    const retry = button(page, "Retry");
    await expect(retry).toBeVisible();
    await expect(win(page).getByText(/couldn.t load/i)).toBeVisible();
    await expect(win(page).getByText("Loading units…")).toBeHidden();
    expect(await timers(page)).toBe(0);
    // other windows keep working: the zoom
    await page.locator("#zIn").click();
    await page.clock.runFor(300);
    await expect(page.locator("#zPct")).toHaveText("125%");
    fail = false;
    await retry.click();
    await loaded(page);
    await expect(retry).toBeHidden();
    await page.waitForLoadState("networkidle");
    // the failed one again, the five loaded ones not
    expect(requests.filter((u) => unitOf(u) === "knight")).toHaveLength(2);
    expect(requests).toHaveLength(7);
    const n = await drawn(page);
    // idle: every unit's frames last 400 ms
    await page.clock.runFor(1600);
    expect(await timers(page), "one timer chain").toBe(1);
    const d = (await draws(page)).slice(n);
    for (const u of UNITS)
      expect(changes(d, u).length, `${u} idle frames in 1.6 s`).toBe(4);
    // Chromium and WebKit log the 500 themselves (Firefox does not): the
    // one console error expected here
    const failed = errors.filter((e) => /status of 500/.test(e));
    expect(failed.length).toBeLessThanOrEqual(1);
    if (failed.length) errors.splice(errors.indexOf(failed[0]), 1);
  });
});

// The view leaves sideways: below Castle Wars are the crawler and insider
// windows (spec 006), whose own timers would count in __timers.
test.describe("R4.a animation only while visible", () => {
  test("off view for 2 s: frames stop and resume from the same frame", async ({
    page,
  }) => {
    await open(page);
    await loaded(page);
    let n = await drawn(page);
    await page.clock.runFor(1000);
    expect(await drawn(page), "advanced before").toBeGreaterThan(n);
    await pressPaper(page);
    await arrowUntil(page, "ArrowRight", async () => !(await inView(page)));
    // the scroll event comes with the next rendering step
    await expect.poll(() => timers(page), "no timer while away").toBe(0);
    const before = await lastFrames(page);
    n = await drawn(page);
    await page.clock.runFor(2000);
    expect(await drawn(page), "unchanged while away").toBe(n);
    await arrowUntil(page, "ArrowLeft", () => inView(page));
    await expect.poll(() => timers(page)).toBe(1);
    await page.clock.runFor(1000);
    const d = (await draws(page)).slice(n);
    expect(d.length, "advances after").toBeGreaterThan(0);
    // the first new frame follows the frame shown before leaving
    for (const u of UNITS) {
      const [a, b] = DATA[u].tags.idle;
      const next = before[u]! === b ? a : before[u]! + 1;
      expect(d.find((x) => x.u === u)?.f, u).toBe(next);
    }
  });

  test("a hidden tab: frames stop and resume", async ({ page }) => {
    await open(page);
    await loaded(page);
    let n = await drawn(page);
    await page.clock.runFor(1000);
    expect(await drawn(page)).toBeGreaterThan(n);
    await hide(page, true);
    n = await drawn(page);
    expect(await timers(page)).toBe(0);
    await page.clock.runFor(2000);
    expect(await drawn(page)).toBe(n);
    await hide(page, false);
    expect(await timers(page)).toBe(1);
    await page.clock.runFor(1000);
    expect(await drawn(page)).toBeGreaterThan(n);
  });

  test("Pause stays paused across a hidden tab", async ({ page }) => {
    await open(page);
    await loaded(page);
    await button(page, "pause").click();
    const n = await drawn(page);
    await hide(page, true);
    await page.clock.runFor(1000);
    await hide(page, false);
    expect(await timers(page), "no timer").toBe(0);
    await page.clock.runFor(2000);
    expect(await drawn(page), "still paused").toBe(n);
    await expect(button(page, "resume")).toBeVisible();
  });

  test("Pause stays paused across leaving and returning", async ({ page }) => {
    await open(page);
    await loaded(page);
    await button(page, "pause").click();
    await expect(button(page, "resume")).toBeVisible();
    const n = await drawn(page);
    expect(await timers(page)).toBe(0);
    await page.clock.runFor(1000);
    expect(await drawn(page)).toBe(n);
    await pressPaper(page);
    await arrowUntil(page, "ArrowRight", async () => !(await inView(page)));
    await page.clock.runFor(1000);
    await arrowUntil(page, "ArrowLeft", () => inView(page));
    await page.clock.runFor(2000);
    expect(await drawn(page), "still paused").toBe(n);
    expect(await timers(page)).toBe(0);
    await button(page, "resume").click();
    await page.clock.runFor(1000);
    expect(await drawn(page)).toBeGreaterThan(n);
  });
});

// T1/T2 review finding 1: the watcher sees real window moves (windows.ts
// onMove), with the view itself held still.
test.describe("visibility follows the window's own moves", () => {
  test("a throw out of the view stops it; Reset brings it back and it runs", async ({
    page,
  }) => {
    await open(page);
    await loaded(page);
    expect(await inView(page)).toBe(true);
    expect(await timers(page)).toBe(1);
    const bar = (await win(page).locator(".bar .t").boundingBox())!;
    const y = bar.y + bar.height / 2;
    const scroll = (await boxes(page)).scroll;
    // a fast drag right, still clear of the edge zone, and let go
    await page.mouse.move(bar.x + 30, y);
    await page.mouse.down();
    for (let i = 1; i <= 5; i++) {
      await page.clock.runFor(10);
      await page.mouse.move(bar.x + 30 + 22 * i, y);
    }
    // held: still in view, still running
    expect(await timers(page)).toBe(1);
    await page.mouse.up();
    await page.clock.runFor(1500);
    expect((await boxes(page)).scroll, "the view did not move").toEqual(scroll);
    expect(await inView(page), "thrown out of the view").toBe(false);
    expect(await timers(page)).toBe(0);
    const n = await drawn(page);
    await page.clock.runFor(2000);
    expect(await drawn(page)).toBe(n);
    await page.getByRole("button", { name: /Reset page/ }).click();
    await page.clock.runFor(1500);
    expect(await inView(page)).toBe(true);
    expect(await timers(page)).toBe(1);
    await page.clock.runFor(1000);
    expect(await drawn(page)).toBeGreaterThan(n);
  });

  test("Alt+Arrow moves it out of the view and it stops; dragged in, Home sends it out and it stops", async ({
    page,
  }) => {
    // 015: the card is narrower, so the view's left inset is 190 px: the
    // window's home (x 1040) is out of the view only when the view is narrower
    await page.setViewportSize({ width: 1100, height: 800 });
    await open(page);
    await loaded(page);
    expect(await timers(page)).toBe(1);
    // a pointer focus: the view stays where it is (a mouse click at a
    // point, not locator.click, which scrolls the target into view)
    const blurb = (await win(page).locator(".blurb").boundingBox())!;
    await page.mouse.click(blurb.x + 20, blurb.y + 5);
    await expect(win(page)).toBeFocused();
    const scroll = (await boxes(page)).scroll;
    // each key moves it at once; the view's reveal pan waits for a frame
    // (the clock is paused), so only the window moves
    for (let i = 0; i < 20 && (await inView(page)); i++) {
      expect(await timers(page)).toBe(1);
      await page.keyboard.press("Alt+ArrowRight");
    }
    expect(await inView(page), "moved out of the view").toBe(false);
    expect(await timers(page), "stopped at once").toBe(0);
    expect((await boxes(page)).scroll).toEqual(scroll);
    // a press on the paper ends the reveal pan
    await pressPaper(page);
    let n = await drawn(page);
    await page.clock.runFor(2000);
    expect((await boxes(page)).scroll).toEqual(scroll);
    expect(await drawn(page)).toBe(n);

    // Reset: home and the start view again; it runs
    await page.getByRole("button", { name: /Reset page/ }).click();
    await page.clock.runFor(1500);
    expect(await inView(page)).toBe(true);
    expect(await timers(page)).toBe(1);

    // drag it 330 px left (015: with the narrower card the 4 px the old 300 px
    // left over is not enough to put its home out of view), held still before
    // letting go (no throw)
    const bar = (await win(page).locator(".bar .t").boundingBox())!;
    const y = bar.y + bar.height / 2;
    await page.mouse.move(bar.x + 30, y);
    await page.mouse.down();
    for (let i = 1; i <= 10; i++) {
      await page.clock.runFor(16);
      await page.mouse.move(bar.x + 30 - 33 * i, y);
    }
    await page.clock.runFor(200);
    await page.mouse.up();
    await page.clock.runFor(1500);
    expect(await timers(page), "running while held and after").toBe(1);
    // the view left until its home is out of view; the window still shows
    await pressPaper(page);
    const homeOut = async () => {
      const { win: w, vp } = await boxes(page);
      return w.l + 300 >= vp.r;
    };
    await arrowUntil(page, "ArrowLeft", homeOut);
    expect(await inView(page)).toBe(true);
    await expect.poll(() => timers(page)).toBe(1);
    // double-click its title bar: it flies home, out of the view
    const at = (await boxes(page)).scroll;
    const t = (await win(page).locator(".bar .t").boundingBox())!;
    await page.mouse.dblclick(t.x + 20, t.y + t.height / 2);
    await page.clock.runFor(1500);
    expect((await boxes(page)).scroll, "the view did not move").toEqual(at);
    expect(await inView(page), "home, out of view").toBe(false);
    expect(await timers(page)).toBe(0);
    n = await drawn(page);
    await page.clock.runFor(2000);
    expect(await drawn(page)).toBe(n);
  });
});

test("R8.a Enter on a focused animation button plays it, keeps focus, never moves the window", async ({
  page,
  browserName,
}) => {
  await open(page);
  await loaded(page);
  const at = () =>
    win(page).evaluate((w) => (w as HTMLElement).style.transform);
  const home = await at();
  // keyboard: into the window and through its controls to "attack"
  await win(page).locator(".blurb").click();
  const tab = browserName === "webkit" ? "Alt+Tab" : "Tab";
  const attack = button(page, "attack");
  for (let i = 0; i < 12 && !(await isFocused(attack)); i++)
    await page.keyboard.press(tab);
  await expect(attack).toBeFocused();
  const n = await drawn(page);
  await page.keyboard.press("Enter");
  await expect(attack).toHaveAttribute("aria-pressed", "true");
  await expect(button(page, "idle")).toHaveAttribute("aria-pressed", "false");
  await expect(attack).toBeFocused();
  await expect(win(page).locator(".wfoot .cw-info")).toHaveText("attack");
  await page.clock.runFor(1000);
  const d = (await draws(page)).slice(n);
  for (const u of UNITS) {
    const [a, b] = DATA[u].tags.attack;
    const f = d.filter((x) => x.u === u).map((x) => x.f);
    expect(f.length, u).toBeGreaterThan(0);
    expect(
      f.every((x) => x >= a && x <= b),
      u,
    ).toBe(true);
  }
  // Space and a mouse press work too, and never start a window drag
  await page.keyboard.press(tab);
  await page.keyboard.press(" ");
  await expect(button(page, "victory")).toHaveAttribute("aria-pressed", "true");
  const b = (await button(page, "death").boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2 + 80, b.y + b.height / 2 + 40, {
    steps: 4,
  });
  await page.mouse.up();
  await page.clock.runFor(500);
  await expect(win(page)).not.toHaveClass(/lifted/);
  expect(await at(), "the window did not move").toBe(home);
});

const isFocused = (l: Locator) =>
  l.evaluate((el) => el === document.activeElement).catch(() => false);

// 001 R21 with the T3–T5 review, item 2: a control press is a gesture, so it
// ends the paper's glide as a window press does. Controlled frames
// (sheet-clock): the glide moves only when the test runs a frame.
test("a press on a Castle Wars button stops the paper's glide", async ({
  page,
}) => {
  await openControlled(page, true);
  await settle(page);
  await loaded(page);
  const [x, y] = await paper(page);
  const s0 = (await boxes(page)).scroll;
  // a flick left: 40 px each 10 ms
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= 5; i++) {
    await clock(page, 10);
    await page.mouse.move(x - 40 * i, y);
  }
  await page.mouse.up();
  await frame(page, 16);
  await frame(page, 16);
  const s1 = (await boxes(page)).scroll;
  expect(s1[0], "the paper glides").toBeGreaterThan(s0[0] + 200);
  const pending = await frame(page, 16);
  expect(pending, "the glide goes on").toBeGreaterThan(0);
  const b = (await button(page, "walk").boundingBox())!;
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  await expect(button(page, "walk")).toHaveAttribute("aria-pressed", "true");
  const s2 = (await boxes(page)).scroll;
  for (let i = 0; i < 10; i++) await frame(page, 16);
  expect((await boxes(page)).scroll, "the glide stopped").toEqual(s2);
});
