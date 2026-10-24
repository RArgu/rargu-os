// Spec 005 demos on a phone (390 × 844, touch): the start view does not wait
// for the sprites, and a press on a demo control takes part in the one
// gesture owner (001 R21). Touch is real input through CDP. Time is
// Playwright's fake clock, paused: timers and animation frames run only
// when a test runs the clock.
import type { CDPSession, Page } from "@playwright/test";
import { expect, test } from "./helpers";
import { entryAsset, sheet } from "./sheet-base";

type Pt = [number, number];
const touch = (
  cdp: CDPSession,
  type: "touchStart" | "touchMove" | "touchEnd" | "touchCancel",
  pts: [number, number, number?][],
) =>
  cdp.send("Input.dispatchTouchEvent", {
    type,
    touchPoints: pts.map(([x, y, id], i) => ({ x, y, id: id ?? i })),
  });

const scroll = (page: Page) =>
  page
    .locator("#vp")
    .evaluate((vp) => [vp.scrollLeft, vp.scrollTop] as [number, number]);
const centre = async (page: Page, sel: string): Promise<Pt> => {
  const b = (await page.locator(sel).boundingBox())!;
  return [b.x + b.width / 2, b.y + b.height / 2];
};

/** /next on the paused clock, then the card's link to window `id`. */
async function goTo(page: Page, id: string): Promise<CDPSession> {
  const T0 = new Date("2026-10-01T00:00:00Z").getTime();
  await page.clock.install({ time: T0 });
  await page.clock.pauseAt(T0 + 1000);
  await page.goto(sheet());
  await expect(page.locator("#world")).toHaveAttribute("style", /scale\(/);
  await page.locator(".railtoggle").click();
  await page.locator(`[data-go="${id}"]`).click();
  await page.clock.runFor(2000); // the navigation pan
  return page.context().newCDPSession(page);
}

/** A point on the bare paper inside the view, clear of the card and map. */
async function paper(page: Page): Promise<Pt> {
  const p = await page.evaluate(() => {
    const ok = new Set(["vp", "sizer", "world"]);
    for (let y = innerHeight - 200; y > 150; y -= 10)
      for (let x = 40; x < innerWidth - 40; x += 10) {
        const e = document.elementFromPoint(x, y);
        if (e && ok.has(e.id)) return [x, y] as Pt;
      }
    return null;
  });
  expect(p, "a point on the bare paper").not.toBeNull();
  return p!;
}

test("late stylesheet: the phone start view comes before the sprites load", async ({
  page,
}) => {
  let css!: () => void;
  const cssHeld = new Promise<void>((r) => (css = r));
  await page.route(entryAsset("css"), async (route) => {
    await cssHeld;
    await route.continue();
  });
  let release!: () => void;
  const held = new Promise<void>((r) => (release = r));
  // knight.png and the card's Paint icon (an <img> in the HTML): the page's
  // load stays pending
  await page.route(/\/(knight[^/]*|sheet\/paint)\.png$/, async (route) => {
    await held;
    await route.continue();
  });
  const js = page.waitForEvent("requestfinished", (r) =>
    entryAsset("js").test(r.url()),
  );
  await page.goto(sheet(), { waitUntil: "commit" });
  await js;
  css();
  // R15: CastleSiege's full width framed, 16 px from the left
  await expect(page.locator("#zPct")).toHaveText("58%");
  const cs = page.locator('[data-win="castlesiege"]');
  await expect
    .poll(async () => {
      const b = (await cs.boundingBox())!;
      // within 1 px: browsers scroll in whole px
      return Math.abs(b.x - 16) <= 1 && Math.abs(b.width - 358) <= 1;
    })
    .toBe(true);
  await expect(page.locator("#world")).toHaveAttribute("style", /scale\(/);
  expect(await page.evaluate(() => document.readyState)).not.toBe("complete");
  await expect(
    page.locator('[data-win="castlewars"]').getByText("Loading units…"),
  ).toBeAttached();
  release();
});

test("R21: a window held, a tap on Run does not run the sketch", async ({
  page,
}) => {
  const cdp = await goTo(page, "pentimento");
  const win = page.locator('[data-win="pentimento"]');
  const cmd = win.locator(".cmd");
  const prompt = await cmd.textContent();
  const bar = await centre(page, '[data-win="pentimento"] .bar .t');
  const run = await centre(page, '[data-win="pentimento"] .tb button');
  // held by one pointer (the mouse), tapped by another (a finger): a tap
  // alone is a click; a second finger of one touch sequence is not
  await page.mouse.move(...bar);
  await page.mouse.down();
  await expect(win).toHaveClass(/lifted/);
  await touch(cdp, "touchStart", [run]);
  await touch(cdp, "touchEnd", []);
  await page.mouse.up();
  await page.clock.runFor(5000);
  await expect(cmd).toHaveText(prompt!);
  // the same tap alone runs it
  await touch(cdp, "touchStart", [run]);
  await touch(cdp, "touchEnd", []);
  await page.clock.runFor(5000);
  await expect(cmd).toContainText("done: 2 layers");
});

test("R21: a finger on a Castle Wars button, a second finger on the paper does not pan", async ({
  page,
}) => {
  const cdp = await goTo(page, "castlewars");
  const walk = await centre(
    page,
    '[data-win="castlewars"] button[data-anim="walk"]',
  );
  const p = await paper(page);
  const s0 = await scroll(page);
  await touch(cdp, "touchStart", [walk]);
  await touch(cdp, "touchStart", [walk, p]);
  for (let i = 1; i <= 5; i++)
    await touch(cdp, "touchMove", [walk, [p[0], p[1] - 20 * i]]);
  await touch(cdp, "touchEnd", []);
  await page.clock.runFor(1000);
  expect(await scroll(page), "the paper did not pan").toEqual(s0);
  // with the button let go, the same drag pans
  await touch(cdp, "touchStart", [p]);
  for (let i = 1; i <= 5; i++)
    await touch(cdp, "touchMove", [[p[0], p[1] - 20 * i]]);
  await touch(cdp, "touchEnd", []);
  await expect.poll(() => scroll(page)).not.toEqual(s0);
});

test("R21: a pressed button that loses its pointer capture lets the paper pan", async ({
  page,
}) => {
  const cdp = await goTo(page, "castlewars");
  await page.evaluate(() =>
    addEventListener(
      "pointerdown",
      (e) => Object.assign(window, { __pid: e.pointerId }),
      true,
    ),
  );
  const sel = '[data-win="castlewars"] button[data-anim="walk"]';
  const walk = await centre(page, sel);
  const p = await paper(page);
  const s0 = await scroll(page);
  await touch(cdp, "touchStart", [walk]);
  // a move, so the touch's implicit capture on the button takes effect
  await touch(cdp, "touchMove", [[walk[0], walk[1] + 1]]);
  // the browser takes the capture away (as when the button leaves the page)
  await expect
    .poll(() =>
      page.locator(sel).evaluate((b) => {
        const id = (window as unknown as { __pid?: number }).__pid;
        if (id === undefined || !b.hasPointerCapture(id)) return false;
        b.releasePointerCapture(id);
        return true;
      }),
    )
    .toBe(true);
  await touch(cdp, "touchStart", [walk, p]);
  for (let i = 1; i <= 5; i++)
    await touch(cdp, "touchMove", [walk, [p[0], p[1] - 20 * i]]);
  await expect.poll(() => scroll(page), "the paper pans").not.toEqual(s0);
  await touch(cdp, "touchEnd", []);
});

// Spec 006: the crawler's Pause and the insider's Replay own their presses
// as the 005 controls do (001 R21; src/sheet/demos/press.ts)
const CONTROLS = [
  {
    id: "crawler",
    name: "Pause",
    sel: '[data-win="crawler"] .cr-pause',
    /** the control's action shows: Pause became Resume */
    acted: (page: Page) =>
      page
        .locator('[data-win="crawler"] .cr-pause')
        .evaluate((b) => b.getAttribute("aria-label") === "Resume"),
    /** the state to hold before the tap */
    ready: async () => {},
  },
  {
    id: "insider",
    name: "Replay",
    sel: '[data-win="insider"] .ins-replay',
    /** a run started again: the footer's hour is back near 0 */
    acted: async (page: Page) =>
      !/t = 159h of 160h/.test(
        (await page.locator('[data-win="insider"] .wfoot').textContent())!,
      ),
    /** the first run ended */
    ready: (page: Page) =>
      expect
        .poll(async () => {
          await page.clock.runFor(500);
          return page.locator('[data-win="insider"] .wfoot').textContent();
        })
        .toContain("t = 159h of 160h"),
  },
] as const;

/** A point on the bare paper with bare paper 16 px around it and along a
 * five-step sideways drag of `dx` px a step (a touch near a window can land
 * on it). */
async function clearPaper(page: Page, dx: number): Promise<Pt> {
  const p = await page.evaluate((dx) => {
    const ok = new Set(["vp", "sizer", "world"]);
    const bare = (x: number, y: number) =>
      ok.has(document.elementFromPoint(x, y)?.id ?? "");
    const [x0, x1] = [Math.min(0, dx * 5) - 16, Math.max(0, dx * 5) + 16];
    for (let y = 80; y < innerHeight - 80; y += 10)
      for (let x = 20 - x0; x + x1 < innerWidth - 20; x += 10) {
        let all = true;
        for (let ty = -16; all && ty <= 16; ty += 8)
          for (let tx = x0; all && tx <= x1; tx += 8)
            all = bare(x + tx, y + ty);
        if (all) return [x, y] as [number, number];
      }
    return null;
  }, dx);
  expect(p, "a clear point on the bare paper").not.toBeNull();
  return p!;
}

for (const c of CONTROLS) {
  /** a one-finger drag on the paper; it pans unless another gesture owns the input */
  const drag = async (cdp: CDPSession, p: Pt, dx: number) => {
    await touch(cdp, "touchStart", [p]);
    for (let i = 1; i <= 5; i++)
      await touch(cdp, "touchMove", [[p[0] + dx * i, p[1]]]);
    await touch(cdp, "touchEnd", []);
  };

  test(`R21: a finger on ${c.name}, a second finger on the paper does not pan; let go, it pans`, async ({
    page,
  }) => {
    const cdp = await goTo(page, c.id);
    await expect(page.locator(c.sel)).toBeVisible();
    const btn = await centre(page, c.sel);
    const s0 = await scroll(page);
    // sideways, the way the paper can go
    const dx = s0[0] > 100 ? 20 : -20;
    const p = await clearPaper(page, dx);
    await touch(cdp, "touchStart", [btn]);
    await touch(cdp, "touchStart", [btn, p]);
    for (let i = 1; i <= 5; i++)
      await touch(cdp, "touchMove", [btn, [p[0] + dx * i, p[1]]]);
    await page.clock.runFor(1000);
    expect(await scroll(page), "the paper did not pan").toEqual(s0);
    await touch(cdp, "touchEnd", []);
    await page.clock.runFor(1000);
    expect(await scroll(page)).toEqual(s0);
    // with the control let go, the same drag pans
    await drag(cdp, p, dx);
    await expect.poll(() => scroll(page)).not.toEqual(s0);
  });

  test(`R21: a finger on ${c.name} cancelled: the paper pans after`, async ({
    page,
  }) => {
    const cdp = await goTo(page, c.id);
    const btn = await centre(page, c.sel);
    const s0 = await scroll(page);
    // sideways, the way the paper can go
    const dx = s0[0] > 100 ? 20 : -20;
    const p = await clearPaper(page, dx);
    await touch(cdp, "touchStart", [btn]);
    await touch(cdp, "touchCancel", []);
    await drag(cdp, p, dx);
    await expect.poll(() => scroll(page), "the paper pans").not.toEqual(s0);
  });

  test(`R21: a window held, a tap on ${c.name} does nothing; the tap alone acts`, async ({
    page,
  }) => {
    const cdp = await goTo(page, c.id);
    await c.ready(page);
    const win = page.locator(`[data-win="${c.id}"]`);
    const bar = await centre(page, `[data-win="${c.id}"] .bar .t`);
    const btn = await centre(page, c.sel);
    expect(await c.acted(page)).toBe(false);
    // held by one pointer (the mouse), tapped by another (a finger)
    await page.mouse.move(...bar);
    await page.mouse.down();
    await expect(win).toHaveClass(/lifted/);
    await touch(cdp, "touchStart", [btn]);
    await touch(cdp, "touchEnd", []);
    await page.mouse.up();
    await page.clock.runFor(100);
    expect(await c.acted(page), `${c.name} did not act`).toBe(false);
    // the same tap alone acts
    await touch(cdp, "touchStart", [btn]);
    await touch(cdp, "touchEnd", []);
    await page.clock.runFor(100);
    expect(await c.acted(page), `${c.name} acted`).toBe(true);
  });
}
