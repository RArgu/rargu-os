// Spec 006 T3: the Focused Web Crawler window at /next (R1, R3, R5, R9).
//
// R1.a in the page: the page streams its seeded stream, and nothing a
// visitor can reach selects another source. This test does not use the data
// module: it records every render of the window (a snapshot per mutation
// batch: one per step) and counts ✓ and ✗ per column itself, from the rows
// at rest (fewer than 14, so every page shows) and each step's new top row.
// Each column head must show round(✓ ÷ pages × 100) % and the footer the sum
// of pages. The R1.a fixture's literal values are checked through mount in
// tests/unit/crawler-mount.test.ts (jsdom).
//
// Time is Playwright's fake clock, paused: timers and animation frames run
// only when a test runs the clock. "Callbacks" are the crawler's step timers
// (700 ms timeouts, counted while pending) and its updates of the rows.
import type { Page } from "@playwright/test";
import { expect, test } from "./helpers";
import { sheet } from "./sheet-base";

const STRATEGIES = [
  "URL keywords",
  "static sim.",
  "adaptive sim.",
  "LLM judge",
];
const ROW_CAP = 14;

const R3 =
  "Simulated demo. The interactive tool is planned and is not available here.";
const STEP = 700;

async function open(page: Page) {
  const T0 = new Date("2026-10-01T00:00:00Z").getTime();
  await page.clock.install({ time: T0 });
  await page.clock.pauseAt(T0 + 1000);
  await page.addInitScript((step) => {
    const w = window as unknown as Record<string, unknown>;
    const st = window.setTimeout;
    const ct = window.clearTimeout;
    const live = new Map<number, number>();
    window.setTimeout = ((cb: () => void, ms?: number) => {
      const id: number = st(() => {
        live.delete(id);
        cb();
      }, ms);
      live.set(id, ms ?? 0);
      return id;
    }) as typeof setTimeout;
    window.clearTimeout = ((id: number) => {
      live.delete(id);
      ct(id);
    }) as typeof clearTimeout;
    w.__steps = () => [...live.values()].filter((ms) => ms === step).length;
    // every change to the crawler's rows or footer, and a snapshot of the
    // window after each batch of changes (one batch per step)
    let n = 0;
    w.__updates = () => n;
    const snaps: unknown[] = [];
    w.__snaps = snaps;
    addEventListener("DOMContentLoaded", () => {
      const win = document.querySelector('[data-win="crawler"]')!;
      const snap = () =>
        snaps.push({
          prec: [...win.querySelectorAll(".col h4 span:last-child")].map(
            (s) => s.textContent,
          ),
          rows: [...win.querySelectorAll(".col ul")].map((u) =>
            [...u.querySelectorAll("li")].map(
              (li) =>
                `${li.className === "no" ? "no" : "ok"} ${li.textContent}`,
            ),
          ),
          stat: win.querySelector(".cr-stat")!.textContent,
        });
      snap(); // at rest: after mount, before any step
      new MutationObserver((m) => {
        n += m.length;
        snap();
      }).observe(win, {
        childList: true,
        subtree: true,
        characterData: true,
      });
    });
  }, STEP);
  await page.goto(sheet(), { waitUntil: "commit" });
  await expect(page.locator("#world")).toHaveAttribute("style", /scale\(/);
}

const win = (page: Page) => page.locator('[data-win="crawler"]');
const pauseBtn = (page: Page) => win(page).locator(".bar .cr-pause");
const steps = (page: Page) =>
  page.evaluate(() => (window as unknown as { __steps(): number }).__steps());
const updates = (page: Page) =>
  page.evaluate(() =>
    (window as unknown as { __updates(): number }).__updates(),
  );

interface Shown {
  heads: string[];
  prec: string[];
  rows: string[][];
  total: number;
}
async function shown(page: Page): Promise<Shown> {
  return win(page).evaluate((w) => {
    const cols = [...w.querySelectorAll(".col")];
    const stat = w.querySelector(".cr-stat")!.textContent!;
    return {
      heads: cols.map((c) => c.querySelector("h4 span")!.textContent!),
      prec: cols.map(
        (c) => c.querySelector("h4 span:last-child")!.textContent!,
      ),
      rows: cols.map((c) =>
        [...c.querySelectorAll("li")].map(
          (li) => `${li.className === "no" ? "no" : "ok"} ${li.textContent}`,
        ),
      ),
      total: Number(/^(\d+) pages/.exec(stat)?.[1] ?? NaN),
    };
  });
}

interface Snap {
  prec: string[];
  rows: string[][];
  stat: string;
}
const pct = (ok: number, n: number) =>
  n ? `${Math.round((ok / n) * 100)}%` : "–";

/** Counts ✓ and pages per column from every recorded render, and checks
 * each render's precision heads and footer against the counts. */
async function tally(page: Page) {
  const snaps = await page.evaluate(
    () => (window as unknown as { __snaps: Snap[] }).__snaps,
  );
  const [base, ...rest] = snaps;
  for (const r of base.rows)
    expect(r.length, "at rest every page shows").toBeLessThan(ROW_CAP);
  const ok = base.rows.map((r) => r.filter((x) => x.startsWith("ok ✓")).length);
  const n = base.rows.map((r) => r.length);
  const check = (s: Snap, i: number) => {
    expect(s.prec, `heads at render ${i}`).toEqual(
      ok.map((o, c) => pct(o, n[c])),
    );
    const sum = n.reduce((a, b) => a + b, 0);
    expect(s.stat, `footer at render ${i}`).toBe(
      `${sum} pages · precision shown per strategy`,
    );
    for (const r of s.rows) expect(r.length).toBeLessThanOrEqual(ROW_CAP);
  };
  check(base, 0);
  let prev = base;
  rest.forEach((s, i) => {
    s.rows.forEach((r, c) => {
      const old = prev.rows[c];
      if (JSON.stringify(r) === JSON.stringify(old)) return;
      // one new page on top; the rest moved down by one
      expect(r.slice(1), `column ${c} at render ${i + 1}`).toEqual(
        old.slice(0, r.length - 1),
      );
      expect(r.length).toBe(Math.min(old.length + 1, ROW_CAP));
      expect(r[0]).toMatch(/^(ok ✓|no ✗) [01]\.\d\d \S+\/\S+$/);
      n[c]++;
      if (r[0].startsWith("ok ✓")) ok[c]++;
    });
    check(s, i + 1);
    prev = s;
  });
  return { ok, n, total: n.reduce((a, b) => a + b, 0), renders: snaps.length };
}

/** The card's navigation: the view pans to the window and centres it. */
async function centre(page: Page) {
  // on a phone the card is folded: open it first
  const toggle = page.locator(".railtoggle");
  if (await toggle.isVisible()) await toggle.click();
  await page
    .getByRole("navigation", { name: "Go to" })
    .getByRole("button", { name: /Focused Crawler/ })
    .click();
  await page.clock.runFor(1500);
}

async function inView(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const vp = document.querySelector<HTMLElement>("#vp")!;
    const b = vp.getBoundingClientRect();
    const v = {
      l: b.left + vp.clientLeft,
      t: b.top + vp.clientTop,
      r: b.left + vp.clientLeft + vp.clientWidth,
      b: b.top + vp.clientTop + vp.clientHeight,
    };
    const w = document
      .querySelector('[data-win="crawler"]')!
      .getBoundingClientRect();
    return w.left < v.r && v.l < w.right && w.top < v.b && v.t < w.bottom;
  });
}
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
  await page.mouse.click(p![0], p![1]);
}
async function arrowUntil(
  page: Page,
  key: string,
  done: () => Promise<boolean>,
) {
  for (let i = 0; i < 40 && !(await done()); i++)
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

test("R1 four columns, precision per column, the footer and Pause", async ({
  page,
}) => {
  await open(page);
  const s = await shown(page);
  expect(s.heads).toEqual([...STRATEGIES]);
  await expect(pauseBtn(page)).toBeVisible();
  await expect(pauseBtn(page)).toHaveAccessibleName("Pause");
  await expect(win(page).locator(".wfoot")).toContainText("✓ relevant");
});

test("R1.a, R5 at rest rows show; each step's precision and footer match the counted rows", async ({
  page,
}) => {
  await open(page);
  // at rest: rows in every column, before any timer runs
  const t0 = await tally(page);
  expect(t0.renders, "no step yet").toBe(1);
  for (const n of t0.n) expect(n).toBeGreaterThan(0);
  await centre(page);
  expect(await steps(page), "one step timer while visible").toBe(1);
  await page.clock.runFor(STEP * 6);
  const t1 = await tally(page);
  expect(t1.total, "advanced").toBeGreaterThan(t0.total);
  // after many steps each column keeps exactly 14 rows; counters go on
  await page.clock.runFor(STEP * 60);
  const t2 = await tally(page);
  for (const r of (await shown(page)).rows) expect(r).toHaveLength(ROW_CAP);
  for (const n of t2.n) expect(n).toBeGreaterThan(ROW_CAP);
});

test("layout as in the mock: 178 px lists, the footer below the demo area, nothing cut off", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page);
  const r = await win(page).evaluate(async (w) => {
    // measure the settled layout: a face still loading lays text out in
    // fallback metrics (font-display block/swap), and the window's height
    // is fixed, so the gap under the footer changes until it loads
    w.getBoundingClientRect(); // style and layout: starts every face in use
    await document.fonts.ready;
    const h = (e: Element) => e.getBoundingClientRect().height;
    const area = w.querySelector(".demo-area")!;
    const foot = w.querySelector(".wfoot")!;
    const inner = w.getBoundingClientRect().bottom - w.clientTop;
    return {
      lists: [...w.querySelectorAll(".col ul")].map((u) => Math.round(h(u))),
      footAfterArea: area.nextElementSibling === foot,
      // the window's content fits its height (no clip at the bottom)
      spare: inner - foot.getBoundingClientRect().bottom,
      notePlace:
        w.querySelector(".note")!.getBoundingClientRect().bottom <=
        area.getBoundingClientRect().bottom + 0.5,
    };
  });
  expect(r.lists).toEqual([178, 178, 178, 178]);
  expect(r.footAfterArea).toBe(true);
  expect(r.notePlace).toBe(true);
  expect(r.spare).toBeGreaterThanOrEqual(-0.5);
  expect(r.spare, "no gap under the footer").toBeLessThan(1.5);
});

test("R1.b Pause: no rows for 2 s; Resume: rows resume", async ({ page }) => {
  await open(page);
  await centre(page);
  await page.clock.runFor(STEP * 2);
  await pauseBtn(page).click();
  await expect(pauseBtn(page)).toHaveAccessibleName("Resume");
  const before = await shown(page);
  const u = await updates(page);
  expect(await steps(page)).toBe(0);
  await page.clock.runFor(2000);
  expect(await shown(page)).toEqual(before);
  expect(await updates(page)).toBe(u);
  await pauseBtn(page).click();
  await expect(pauseBtn(page)).toHaveAccessibleName("Pause");
  expect(await steps(page)).toBe(1);
  await page.clock.runFor(STEP * 3);
  expect((await shown(page)).total).toBeGreaterThan(before.total);
  await tally(page);
});

for (const [width, height] of [
  [1440, 900],
  [390, 844],
] as const)
  test(`R3.a at ${width} × ${height} the R3 sentence shows without scrolling when the window is centred`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await open(page);
    await centre(page);
    const note = win(page).getByText(R3, { exact: true });
    await expect(note).toBeVisible();
    // the sentence's text (not its full-width block) is inside the window
    // (no clip, no scroll), inside the view, and on top
    const r = await note.evaluate((n) => {
      const text = document.createRange();
      text.selectNodeContents(n);
      const b = text.getBoundingClientRect();
      const w = n.closest(".sheet-win")!.getBoundingClientRect();
      const vp = document.querySelector<HTMLElement>("#vp")!;
      const v = vp.getBoundingClientRect();
      const inset = (x: number, y: number) =>
        n.contains(document.elementFromPoint(x, y));
      return {
        inWin:
          b.left >= w.left &&
          b.right <= w.right &&
          b.top >= w.top &&
          b.bottom <= w.bottom,
        inView:
          b.left >= v.left &&
          b.right <= v.left + vp.clientWidth &&
          b.top >= v.top &&
          b.bottom <= v.top + vp.clientHeight,
        onTop:
          inset(b.left + 2, b.top + b.height / 2) &&
          inset(b.right - 2, b.top + b.height / 2),
        oneLine: b.height < 30,
        scroll: [
          n.closest(".demo-area")!.scrollTop,
          n.closest(".sheet-win")!.scrollTop,
        ],
      };
    });
    expect(r).toEqual({
      inWin: true,
      inView: true,
      onTop: true,
      oneLine: true,
      scroll: [0, 0],
    });
  });

test.describe("R5.a streaming only while visible", () => {
  test("off screen for 2 s: callbacks stop; back, they advance from the same state", async ({
    page,
  }) => {
    await open(page);
    await centre(page);
    await page.clock.runFor(STEP * 2);
    await pressPaper(page);
    await arrowUntil(page, "ArrowUp", async () => !(await inView(page)));
    await expect.poll(() => steps(page), "no step timer while away").toBe(0);
    const before = await shown(page);
    const u = await updates(page);
    await page.clock.runFor(2000);
    expect(await updates(page), "unchanged while away").toBe(u);
    expect(await steps(page)).toBe(0);
    await arrowUntil(page, "ArrowDown", () => inView(page));
    await expect.poll(() => steps(page)).toBe(1);
    expect(await shown(page), "the same state on return").toEqual(before);
    await page.clock.runFor(STEP * 3);
    expect(await updates(page)).toBeGreaterThan(u);
    // it goes on with the same stream, from where it stopped
    expect((await tally(page)).total).toBeGreaterThan(before.total);
  });

  test("a hidden tab: callbacks stop and resume", async ({ page }) => {
    await open(page);
    await centre(page);
    await page.clock.runFor(STEP);
    await hide(page, true);
    expect(await steps(page)).toBe(0);
    const u = await updates(page);
    await page.clock.runFor(2000);
    expect(await updates(page)).toBe(u);
    await hide(page, false);
    expect(await steps(page)).toBe(1);
    await page.clock.runFor(STEP * 2);
    expect(await updates(page)).toBeGreaterThan(u);
    await tally(page);
  });

  test("a visitor's Pause stays across a hidden tab and leaving", async ({
    page,
  }) => {
    await open(page);
    await centre(page);
    await pauseBtn(page).click();
    const u = await updates(page);
    await hide(page, true);
    await page.clock.runFor(1000);
    await hide(page, false);
    expect(await steps(page)).toBe(0);
    await pressPaper(page);
    await arrowUntil(page, "ArrowUp", async () => !(await inView(page)));
    await arrowUntil(page, "ArrowDown", () => inView(page));
    await page.clock.runFor(2000);
    expect(await steps(page)).toBe(0);
    expect(await updates(page)).toBe(u);
    await expect(pauseBtn(page)).toHaveAccessibleName("Resume");
  });
});

test("R9.a Space on the focused Pause: Resume, focus stays, the window does not move", async ({
  page,
}) => {
  await open(page);
  await centre(page);
  const at = () =>
    win(page).evaluate((w) => (w as HTMLElement).style.transform);
  const home = await at();
  await pauseBtn(page).focus();
  await page.keyboard.press(" ");
  await expect(pauseBtn(page)).toHaveAccessibleName("Resume");
  await expect(pauseBtn(page)).toBeFocused();
  expect(await steps(page)).toBe(0);
  await page.keyboard.press("Enter");
  await expect(pauseBtn(page)).toHaveAccessibleName("Pause");
  await expect(pauseBtn(page)).toBeFocused();
  expect(await steps(page)).toBe(1);
  await page.clock.runFor(500);
  expect(await at(), "the window did not move").toBe(home);
  // a mouse press dragged off the button moves nothing either
  const b = (await pauseBtn(page).boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x - 80, b.y + 40, { steps: 4 });
  await page.mouse.up();
  await page.clock.runFor(500);
  await expect(win(page)).not.toHaveClass(/lifted/);
  expect(await at()).toBe(home);
});

test("reduced motion (minimum for T3): complete rows at once, no streaming", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await open(page);
  await centre(page);
  await page.clock.runFor(STEP * 3);
  const s = await shown(page);
  for (const r of s.rows) expect(r).toHaveLength(ROW_CAP);
  expect(await steps(page)).toBe(0);
  const u = await updates(page);
  await page.clock.runFor(STEP * 3);
  expect(await updates(page)).toBe(u);
});

test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false });
  test("the columns, the R3 sentence and the footer show; no Pause", async ({
    page,
  }) => {
    await page.goto(sheet());
    await expect(win(page).getByText(R3, { exact: true })).toBeVisible();
    for (const s of STRATEGIES)
      await expect(win(page).getByText(s, { exact: true })).toBeVisible();
    await expect(pauseBtn(page)).toBeHidden();
    await expect(win(page).locator(".cr-stat")).toBeVisible();
  });
});
