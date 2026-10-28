import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "@playwright/test";
import { cardItemLines, expect, test } from "./helpers";
import {
  HOSTED,
  appAssets,
  eligible,
  holdHost,
  idle,
  strayAssets,
} from "./host-helpers";
import { cfBeacon } from "./cf-beacon";
import { SHEET, sheet } from "./sheet-base";

test(`R1.a ${SHEET} shows the overlay card and the CastleSiege window @live`, async ({
  page,
}) => {
  await page.goto(sheet());
  await expect(page.locator("#card")).toBeVisible();
  await expect(page.locator('[data-win="castlesiege"]')).toBeVisible();
});

test(`R2.a ${SHEET} makes only same-origin requests and loads no old-OS code`, async ({
  page,
  baseURL,
}) => {
  const urls: string[] = [];
  page.on("request", (req) => urls.push(req.url()));
  await page.goto(sheet(), { waitUntil: "networkidle" });
  // the idle work: let any idle callbacks and late loads run
  await page.evaluate(
    // WebKit has no requestIdleCallback
    () =>
      new Promise((done) =>
        (window.requestIdleCallback ?? setTimeout)(() => done(null)),
      ),
  );
  await page.waitForLoadState("networkidle");
  const origin = new URL(baseURL!).origin;
  // Amendment 2: app chunks only for the apps of windows that meet the 002
  // R11 start rule (the view has not moved)
  const apps = (await eligible(page)).map((id) => HOSTED[id]);
  expect(urls.length).toBeGreaterThan(0);
  for (const url of urls) {
    expect(new URL(url).origin, url).toBe(origin);
    expect(url).not.toContain("system.img.json");
  }
  expect(strayAssets(urls, await appAssets(page), apps)).toEqual([]);
});

// 007 R11: the part of R2.a that needs no test-build file (host-assets.json);
// 010 R9: Cloudflare's own Web Analytics beacon (added at the edge) is allowed
test(`R2.a ${SHEET} makes only same-origin requests @live`, async ({
  page,
  baseURL,
}) => {
  const urls: string[] = [];
  page.on("request", (req) => urls.push(req.url()));
  await page.goto(sheet());
  await idle(page);
  const origin = new URL(baseURL!).origin;
  expect(urls.length).toBeGreaterThan(0);
  for (const url of urls.filter((u) => !cfBeacon(u))) {
    expect(new URL(url).origin, url).toBe(origin);
    expect(url).not.toContain("system.img.json");
  }
});

const identity = JSON.parse(
  readFileSync(
    join(import.meta.dirname, "../../content/identity.json"),
    "utf8",
  ),
) as {
  name: string;
  title: string;
  tagline: string;
  links: { github: string; linkedin: string };
};

test.describe("R3.a card without JavaScript", () => {
  test.use({ javaScriptEnabled: false });
  for (const [width, height] of [
    [1440, 900],
    [390, 844],
  ]) {
    test(`at ${width} × ${height} @live`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.goto(sheet());
      const card = page.locator("#card");
      // 015 R5, R3.c: no name, title or tagline; no Email link without JS
      for (const text of [identity.name, identity.title, identity.tagline])
        await expect(card.getByText(text, { exact: true })).toHaveCount(0);
      await expect(card.locator("a[data-mail]")).toBeHidden();
      const links: [string, string][] = [
        ["Resume", "/resume"],
        ["GitHub", identity.links.github],
        ["LinkedIn", identity.links.linkedin],
      ];
      for (const [name, href] of links) {
        const link = card.getByRole("link", { name });
        await expect(link).toBeVisible();
        await expect(link).toHaveAttribute("href", href);
      }
      // same-origin link: it must load (third-party links are not fetched in tests)
      expect((await page.request.get("/resume")).status()).toBe(200);
    });
  }
});

test("007 R6.a the resume's return link reads Back to RArgu OS and opens / @live", async ({
  page,
}) => {
  await page.goto("/resume");
  const back = page.getByRole("link", { name: "Back to RArgu OS" });
  await expect(back).toHaveAttribute("href", "./");
  await expect(page.locator("body")).not.toContainText(/devpageos/i);
  await back.click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator("#card")).toBeVisible();
});

test("the card text is in Instrument Sans, served from this site @live", async ({
  page,
}) => {
  await page.goto(sheet());
  await page.evaluate(() => document.fonts.ready);
  const loaded = await page.evaluate(() =>
    [...document.fonts]
      .filter((f) => f.family.replace(/"/g, "") === "Instrument Sans")
      .map((f) => f.status),
  );
  expect(loaded).toContain("loaded");
});

test("owner 2026-10-24: at 1440 × 900 each card project item is one line, with the short names @live", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(sheet());
  const items = await cardItemLines(page);
  for (const i of items)
    expect(i, i.text).toMatchObject({ lines: 1, oneLine: true });
  expect(items.map((i) => i.text.replace(/\s+\S+$/, ""))).toEqual([
    "CastleSiege",
    "Castle Wars",
    "Pentimento",
    "Focused Crawler",
    "Insider Trading",
  ]);
  // the window titles keep the full names
  await expect(page.locator('[data-win="crawler"] .phead h2')).toHaveText(
    "Generalized Focused Web Crawler",
  );
});

// ---- T4: the sheet, pan, zoom, minimap, windows (R4–R7, R16) ----

/** The view state, read from the DOM only. */
function view(page: Page) {
  return page.evaluate(() => {
    const vp = document.querySelector<HTMLElement>("#vp")!;
    const t = getComputedStyle(document.querySelector("#world")!).transform;
    return {
      z: t === "none" ? 1 : new DOMMatrix(t).a,
      // scroll from the sheet's own origin: the start view is (0, 0)
      left: vp.scrollLeft - parseFloat(getComputedStyle(vp).paddingLeft),
      top: vp.scrollTop - parseFloat(getComputedStyle(vp).paddingTop),
      w: vp.clientWidth,
      h: vp.clientHeight,
    };
  });
}

/** Opens /next and waits until the script owns the zoom. */
async function open(page: Page): Promise<void> {
  await page.goto(sheet());
  await expect(page.locator("#world")).toHaveAttribute("style", /scale\(/);
}

/** Test instrumentation: tracks the page's pending animation frames. */
async function watchFrames(page: Page): Promise<void> {
  await page.addInitScript(() => {
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
    Object.assign(window, { __live: () => live.size, __raw: raw });
  });
}

/** Counts frames until the page has no animation frame pending (max + 1 if never). */
function framesUntilIdle(page: Page, max: number) {
  return page.evaluate(
    (max) =>
      new Promise<number>((done) => {
        const w = window as unknown as {
          __live(): number;
          __raw(cb: () => void): number;
        };
        let n = 0;
        const f = () => (w.__live() === 0 || ++n > max ? done(n) : w.__raw(f));
        w.__raw(f);
      }),
    max,
  );
}

// a point on the paper at 1280 × 800: right of CastleSiege, above Insider
const PAPER: [number, number] = [1010, 740];

test("R4.a a mouse drag on the paper pans 1:1 before any glide", async ({
  page,
}) => {
  await open(page);
  const s0 = await view(page);
  await page.mouse.move(...PAPER);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++)
    await page.mouse.move(PAPER[0] - 20 * i, PAPER[1]);
  // still held, so no glide yet
  await expect
    .poll(async () => Math.abs((await view(page)).left - s0.left - 200))
    .toBeLessThanOrEqual(1);
  expect((await view(page)).top).toBe(s0.top);
  await page.mouse.up();
});

test("R4 the glide after a flick runs, then stops scheduling frames", async ({
  page,
}) => {
  await watchFrames(page);
  await open(page);
  await page.mouse.move(...PAPER);
  await page.mouse.down();
  for (let i = 1; i <= 5; i++)
    await page.mouse.move(PAPER[0] - 40 * i, PAPER[1]);
  await expect.poll(async () => (await view(page)).left).toBe(200);
  await page.mouse.up();
  await expect.poll(async () => (await view(page)).left).toBeGreaterThan(200);
  const n = await framesUntilIdle(page, 240);
  expect(n).toBeLessThanOrEqual(240);
});

test("R22 a flick against the scroll limit schedules no glide frames", async ({
  page,
}) => {
  await watchFrames(page);
  await open(page);
  // at scroll 0, 0 (the insets beside the card in view) a flick right and
  // down cannot move it; paper below CastleSiege, clear of the minimap
  await page.locator("#vp").evaluate((vp) => vp.scrollTo(0, 0));
  const at = await view(page);
  expect(at.left).toBeLessThan(-300);
  await page.mouse.move(700, 740);
  await page.mouse.down();
  for (let i = 1; i <= 5; i++)
    await page.mouse.move(700 + 40 * i, 740 + 10 * i);
  await page.mouse.up();
  expect(await framesUntilIdle(page, 30)).toBeLessThanOrEqual(1);
  const s = await view(page);
  expect([s.left, s.top]).toEqual([at.left, at.top]);
});

test("R4.b arrow keys pan the focused sheet, not a focused text field", async ({
  page,
}) => {
  await open(page);
  await page.locator("#vp").focus();
  await page.keyboard.press("ArrowRight");
  await expect.poll(async () => (await view(page)).left).toBe(64);
  // no text field exists in 001; add one on the sheet, in view
  await page.evaluate(() => {
    const input = document.createElement("input");
    input.style.cssText = "position:absolute;left:600px;top:760px";
    document.querySelector("#world")!.append(input);
    input.focus({ preventScroll: true });
  });
  await page.keyboard.press("ArrowRight");
  // keys are handled in order: once ArrowDown has moved the view, the
  // ArrowRight before it has had its chance
  await page.locator("#vp").focus();
  await page.keyboard.press("ArrowDown");
  await expect.poll(async () => (await view(page)).top).toBe(64);
  expect((await view(page)).left).toBe(64);
});

test("R5.a ctrl + wheel zooms at the pointer", async ({ page }) => {
  await open(page);
  const [px, py] = [700, 400];
  await page.mouse.move(px, py);
  const s0 = await view(page);
  const sheet = [(px + s0.left) / s0.z, (py + s0.top) / s0.z];
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, -20);
  await page.keyboard.up("Control");
  await expect.poll(async () => (await view(page)).z).toBeGreaterThan(1.05);
  const s1 = await view(page);
  expect(s1.z).toBeLessThanOrEqual(1.6);
  expect(Math.abs(sheet[0] * s1.z - s1.left - px)).toBeLessThanOrEqual(1);
  expect(Math.abs(sheet[1] * s1.z - s1.top - py)).toBeLessThanOrEqual(1);
});

test.describe("R5.b fit", () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  test("shows the whole sheet at 1440 × 900", async ({ page }) => {
    await open(page);
    await page.click("#zFit");
    await expect(page.locator("#zPct")).toHaveText("48%");
    const box = (await page.locator("#world").boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(-0.5);
    expect(box.y).toBeGreaterThanOrEqual(-0.5);
    expect(box.x + box.width).toBeLessThanOrEqual(1440.5);
    expect(box.y + box.height).toBeLessThanOrEqual(900.5);
  });
  test("a resize that puts the zoom below fit sets it to fit", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 800, height: 500 });
    await open(page);
    await page.click("#zFit");
    await expect(page.locator("#zPct")).toHaveText("27%");
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(page.locator("#zPct")).toHaveText("48%");
    expect((await view(page)).z).toBeCloseTo(0.48, 4);
  });
});

test("R5.c + at 160 % stays at 160 %", async ({ page }) => {
  // reduced motion: each button zoom commits at once, so no waiting
  await page.emulateMedia({ reducedMotion: "reduce" });
  await open(page);
  for (const pct of ["125%", "156%", "160%"]) {
    await page.click("#zIn");
    await expect(page.locator("#zPct")).toHaveText(pct);
  }
  expect((await view(page)).z).toBeCloseTo(1.6, 6);
  await page.click("#zIn");
  expect((await view(page)).z).toBeCloseTo(1.6, 6);
  await expect(page.locator("#zPct")).toHaveText("160%");
});

test("R5.d one ctrl-wheel or gesturechange event changes zoom once", async ({
  page,
}) => {
  await open(page);
  // Safari gesture events cannot be made by Playwright input: dispatch them
  const fire = (type: string, init: Record<string, number | boolean>) =>
    page.evaluate(
      ([type, init]) => {
        const vp = document.querySelector("#vp")!;
        const base = { bubbles: true, cancelable: true };
        let e: Event;
        if (type === "wheel") e = new WheelEvent(type, { ...base, ...init });
        else {
          e = new Event(type, base);
          for (const [k, v] of Object.entries(init))
            Object.defineProperty(e, k, { value: v });
        }
        vp.dispatchEvent(e);
        return e.defaultPrevented;
      },
      [type, init] as const,
    );
  const at = { clientX: 700, clientY: 400 };
  const z = async () => (await view(page)).z;
  expect(await fire("wheel", { ...at, deltaY: -10, ctrlKey: true })).toBe(true);
  const z1 = Math.exp(0.1);
  expect(await z()).toBeCloseTo(z1, 4);
  // line mode: one line is 16 px
  await fire("wheel", { ...at, deltaY: -1, deltaMode: 1, ctrlKey: true });
  const z2 = z1 * Math.exp(0.16);
  expect(await z()).toBeCloseTo(z2, 4);
  await fire("gesturestart", { ...at, scale: 1 });
  await fire("gesturechange", { ...at, scale: 1.1 });
  expect(await z()).toBeCloseTo(z2 * 1.1, 4);
  // Safari also sends ctrl-wheel events for the same pinch: they must not count
  expect(await fire("wheel", { ...at, deltaY: -10, ctrlKey: true })).toBe(true);
  expect(await z()).toBeCloseTo(z2 * 1.1, 4);
  await fire("gestureend", { ...at, scale: 1.1 });
  await fire("wheel", { ...at, deltaY: 10, ctrlKey: true });
  expect(await z()).toBeCloseTo(z2 * 1.1 * Math.exp(-0.1), 4);
});

test("R6.a the minimap moves the view by click, drag and arrow keys", async ({
  page,
}) => {
  await open(page);
  const map = (await page.locator("#mini").boundingBox())!;
  const at = (x: number, y: number): [number, number] => [
    map.x + (map.width * x) / 3000,
    map.y + (map.height * y) / 1640,
  ];
  // over the Quick tools (004 T2: the cluster, 1920..2956 × 700..1514, is
  // larger than the view at zoom 1, so each window shows at least in part)
  await page.mouse.click(...at(2440, 1100));
  for (const id of ["paint", "music", "notes"]) {
    await expect
      .poll(async () => {
        const b = (await page.locator(`[data-win="${id}"]`).boundingBox())!;
        return (
          b.x < 1280 && b.y < 800 && b.x + b.width > 0 && b.y + b.height > 0
        );
      }, id)
      .toBe(true);
  }
  // drag: the view centre follows the pointer
  await page.mouse.move(...at(1500, 800));
  await page.mouse.down();
  await page.mouse.move(...at(1200, 700), { steps: 4 });
  await page.mouse.up();
  // within one map px (15 sheet px): pointer positions may be whole px
  await expect
    .poll(async () => {
      const s = await view(page);
      return Math.max(
        Math.abs(s.left + s.w / 2 - 1200),
        Math.abs(s.top + s.h / 2 - 700),
      );
    })
    .toBeLessThanOrEqual(15);
  // keyboard
  const s0 = await view(page);
  await page.locator("#mini").focus();
  await page.keyboard.press("ArrowRight");
  await expect.poll(async () => (await view(page)).left).toBe(s0.left + 120);
});

/** Minimap pixels at canvas points, as #rrggbb, and the palette it draws with. */
const mapPixels = (page: Page, at: [number, number][]) =>
  page.evaluate((at) => {
    const mini = document.querySelector<HTMLCanvasElement>("#mini")!;
    const ctx = mini.getContext("2d")!;
    const hex = (d: ArrayLike<number>) =>
      `#${[d[0], d[1], d[2]].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
    const css = getComputedStyle(document.documentElement);
    const c = (v: string) => css.getPropertyValue(v).trim().toLowerCase();
    return {
      px: at.map(([x, y]) => hex(ctx.getImageData(x, y, 1, 1).data)),
      paper: c("--paper"),
      win: c("--accent"),
      box: c("--accent-2"),
    };
  }, at);

test("R6 the minimap draws the grid, each window and the view, and redraws when a window moves", async ({
  page,
}) => {
  await open(page);
  // canvas 400 × 219 for the 3000 × 1640 sheet: 1 canvas px = 7.5 sheet px
  const k = 400 / 3000;
  const v = await view(page);
  // CastleSiege (360, 100, 620 × 631) spans canvas y 13–101
  const oldOnly: [number, number] = [89, 98]; // left after the move
  const newOnly: [number, number] = [89, 9]; // reached by the move
  const paper: [number, number] = [200, 200]; // sheet (1500, 1500)
  const grid: [number, number] = [191, 200]; // the line at sheet x 1440
  // the view box: its left and right edges, at the height of the view's middle
  const midY = Math.round(((v.top + v.h / 2) / v.z / 1640) * 219);
  const boxL: [number, number] = [Math.round((v.left / v.z) * k) + 1, midY];
  const boxR: [number, number] = [
    Math.round(((v.left + v.w) / v.z) * k) - 2,
    midY,
  ];
  await expect
    .poll(async () => {
      const m = await mapPixels(page, [oldOnly, newOnly, paper, boxL, boxR]);
      return m.px.join() === [m.win, m.paper, m.paper, m.box, m.box].join();
    })
    .toBe(true);
  const g = await mapPixels(page, [grid]);
  expect(g.px[0], "a grid line").not.toBe(g.paper);
  // CastleSiege up 72 sheet px by keyboard (no pan: it stays in view)
  await page.locator('[data-win="castlesiege"]').focus();
  for (let i = 0; i < 3; i++) await page.keyboard.press("Alt+ArrowUp");
  await expect(page.locator('[data-win="castlesiege"]')).toHaveAttribute(
    "style",
    /translate\(360px, 28px\)/,
  );
  expect(await view(page)).toEqual(v);
  await expect
    .poll(async () => {
      const m = await mapPixels(page, [oldOnly, newOnly]);
      return m.px.join() === [m.paper, m.win].join();
    })
    .toBe(true);
});

// every demo area is built now (005, 006); the app host's windows (002) hold
// their app's start control until the app starts
test("R7 each hosted window's demo area is its app's start control (\"Start <name>\") of the reserved height @live", async ({
  page,
}) => {
  // the host is held: no app starts, so every start control shows
  const release = await holdHost(page);
  await open(page);
  const areas = await page
    // 013: a project window's demo panel may be a tab panel
    .locator('[data-win] .demo-area[role="button"]')
    .evaluateAll((all) =>
      all.map((d) => ({
        id: d.closest<HTMLElement>("[data-win]")!.dataset.win,
        role: d.getAttribute("role"),
        name: d.getAttribute("aria-label"),
        tab: (d as HTMLElement).tabIndex,
        inert: (d as HTMLElement).inert,
        h: Math.round(d.getBoundingClientRect().height),
      })),
    );
  const NAMES: Record<string, string> = {
    castlesiege: "CastleSiege",
    paint: "Paint",
    music: "Music",
    notes: "Notes",
  };
  // start view: zoom 1, so screen px = sheet px
  expect(areas).toEqual(
    TABLE.filter(([id]) => id in HOSTED).map(([id, , , , , demoH]) => ({
      id,
      role: "button",
      name: `Start ${NAMES[id]}`,
      tab: 0,
      inert: false,
      h: demoH,
    })),
  );
  for (const name of Object.values(NAMES))
    await expect(
      page.getByRole("button", { name: `Start ${name}`, exact: true }),
    ).toHaveCount(1);
  await release();
});

test("R7.a pressing the lower of two overlapping windows draws it on top", async ({
  page,
}) => {
  await open(page);
  const s0 = await view(page);
  // fixture: move Castle Wars over CastleSiege (it is later in the DOM, so on top)
  await page
    .locator('[data-win="castlewars"]')
    .evaluate((w) => (w.style.transform = "translate(700px, 300px)"));
  const OVER: [number, number] = [850, 500]; // inside both windows
  const top = () =>
    page.evaluate(
      ([x, y]) =>
        document
          .elementFromPoint(x, y)
          ?.closest("[data-win]")
          ?.getAttribute("data-win"),
      OVER,
    );
  expect(await top()).toBe("castlewars");
  // press CastleSiege where it shows, and drag: a mouse drag on a window never pans
  const b = (await page
    .locator('[data-win="castlesiege"] .blurb')
    .boundingBox())!;
  await page.mouse.move(b.x + 20, b.y + 10);
  await page.mouse.down();
  await page.mouse.move(b.x - 180, b.y + 10, { steps: 5 });
  await page.mouse.up();
  expect(await top()).toBe("castlesiege");
  await page.mouse.click(...OVER);
  expect(await top()).toBe("castlesiege");
  // Castle Wars shows outside the overlap; pressing it there raises it again
  await page.mouse.click(1250, 600);
  expect(await top()).toBe("castlewars");
  const s1 = await view(page);
  expect([s1.left, s1.top]).toEqual([s0.left, s0.top]);
});

// the layout table of spec 001 (sheet px), independent of src/sheet/layout.ts
const TABLE: [string, number, number, number, number, number][] = [
  ["castlesiege", 360, 100, 620, 631, 427],
  ["castlewars", 1040, 140, 600, 522, 314],
  ["pentimento", 1720, 80, 600, 612, 404],
  ["crawler", 400, 860, 680, 499, 265],
  ["insider", 1160, 800, 680, 528, 320],
  // 004 T2: the Quick tools at mock v0.7's rectangles (owner, 2026-10-24)
  ["paint", 1920, 760, 434, 350, 313],
  ["music", 2400, 700, 556, 348, 311],
  ["notes", 1920, 1150, 424, 364, 327],
];

// 005 option C: Pentimento grew to the mock's after-run height (612, 015); at home
// its bottom stays above the windows below it
test("R7.b Pentimento at home ends above Paint and Insider", async ({
  page,
}) => {
  await open(page);
  const box = async (id: string) =>
    (await page.locator(`[data-win="${id}"]`).boundingBox())!;
  // start view: zoom 1, scroll 0, so screen px = sheet px
  const pent = await box("pentimento");
  expect(pent.y + pent.height).toBeLessThan((await box("paint")).y);
  expect(pent.y + pent.height).toBeLessThan((await box("insider")).y);
});

// 006 T3: the crawler grew to hold the real project text with the mock's
// lists and footer; at home it stays inside the sheet and clear of Insider
test("R7.b the crawler at home is inside the sheet and clear of Insider", async ({
  page,
}) => {
  await open(page);
  const box = async (id: string) =>
    (await page.locator(`[data-win="${id}"]`).boundingBox())!;
  // start view: zoom 1, scroll 0, so screen px = sheet px
  const c = await box("crawler");
  const sheet = (await page.locator("#world").boundingBox())!;
  expect(c.y + c.height).toBeLessThanOrEqual(sheet.y + sheet.height);
  const i = await box("insider");
  const apart =
    c.x + c.width <= i.x ||
    i.x + i.width <= c.x ||
    c.y + c.height <= i.y ||
    i.y + i.height <= c.y;
  expect(apart, "no overlap with Insider").toBe(true);
});

// 006 T4: the insider grew to hold the mock's four flagged cards beside the
// chart; at home it stays inside the sheet and clear of every other window
test("R7.b the insider at home is inside the sheet and clear of the others", async ({
  page,
}) => {
  await open(page);
  const box = async (id: string) =>
    (await page.locator(`[data-win="${id}"]`).boundingBox())!;
  // start view: zoom 1, scroll 0, so screen px = sheet px
  const i = await box("insider");
  const sheet = (await page.locator("#world").boundingBox())!;
  expect(i.y + i.height).toBeLessThanOrEqual(sheet.y + sheet.height);
  for (const [id] of TABLE) {
    if (id === "insider") continue;
    const o = await box(id);
    const apart =
      o.x + o.width <= i.x ||
      i.x + i.width <= o.x ||
      o.y + o.height <= i.y ||
      i.y + i.height <= o.y;
    expect(apart, `no overlap with ${id}`).toBe(true);
  }
});

test("R7.b eight windows at the layout table's homes and sizes @live", async ({
  page,
}) => {
  await open(page);
  await expect(page.locator("[data-win]")).toHaveCount(8);
  for (const [id, x, y, w, h, demoH] of TABLE) {
    const win = page.locator(`[data-win="${id}"]`);
    await expect(win).toHaveAttribute("role", "region");
    const b = (await win.boundingBox())!;
    // start view: zoom 1, scroll 0, so screen px = sheet px
    expect(Math.abs(b.x - x), `${id} x`).toBeLessThanOrEqual(1);
    expect(Math.abs(b.y - y), `${id} y`).toBeLessThanOrEqual(1);
    expect(Math.abs(b.width - w), `${id} w`).toBeLessThanOrEqual(2);
    expect(Math.abs(b.height - h), `${id} h`).toBeLessThanOrEqual(2);
    const demo = (await win.locator(".demo-area").boundingBox())!;
    expect(Math.abs(demo.height - demoH), `${id} demo h`).toBeLessThanOrEqual(
      0.5,
    );
  }
});

test("R7 windows name themselves and show the project text @live", async ({
  page,
}) => {
  await open(page);
  const cs = page.getByRole("region", { name: "CastleSiege" });
  await expect(cs).toHaveAttribute("data-win", "castlesiege");
  await expect(cs.locator(".bar")).toHaveText(/castlesiege — vs\. bot/);
  await expect(cs.locator(".status")).toHaveText("Playable");
  await expect(cs.getByText("TypeScript", { exact: true })).toBeVisible();
  await expect(cs.getByRole("link")).toHaveAttribute(
    "href",
    "https://castlesiege.fly.dev",
  );
  await expect(page.getByRole("region", { name: "Paint" })).toBeAttached();
});

test.describe("R7 windows without JavaScript", () => {
  test.use({ javaScriptEnabled: false });
  test("sit at their home positions", async ({ page }) => {
    await page.goto(sheet());
    const b = (await page.locator('[data-win="castlesiege"]').boundingBox())!;
    expect([Math.round(b.x), Math.round(b.y)]).toEqual([360, 100]);
  });
});

// The moved-window part of R16.a is in sheet-windows.spec.ts.
test("R16.a no saved state: reload resets the zoom and view, storage stays empty @live", async ({
  page,
}) => {
  await open(page);
  await page.click("#zIn");
  await expect(page.locator("#zPct")).toHaveText("125%");
  await page.mouse.move(...PAPER);
  await page.mouse.wheel(300, 200);
  await expect.poll(async () => (await view(page)).left).toBeGreaterThan(0);
  await page.reload();
  await expect(page.locator("#world")).toHaveAttribute("style", /scale\(/);
  await expect(page.locator("#zPct")).toHaveText("100%");
  const s = await view(page);
  expect([s.z, s.left, s.top]).toEqual([1, 0, 0]);
  const b = (await page.locator('[data-win="castlesiege"]').boundingBox())!;
  expect([Math.round(b.x), Math.round(b.y)]).toEqual([360, 100]);
  const stored = await page.evaluate(async () => ({
    local: localStorage.length,
    session: sessionStorage.length,
    cookie: document.cookie,
    idb: (await indexedDB.databases?.())?.length ?? 0,
    url: location.search + location.hash,
  }));
  expect(stored).toEqual({ local: 0, session: 0, cookie: "", idb: 0, url: "" });
});
