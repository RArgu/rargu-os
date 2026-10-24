// Spec 002 on a phone (390 × 844, touch through CDP): a running app's input
// takes part in the one gesture owner (001 R21; full routing is T5), and a
// tap activates a window whose background start is pending (R11).
import type { CDPSession, Page } from "@playwright/test";
import { expect, test } from "./helpers";
import { sheet } from "./sheet-base";

type Pt = [number, number];
const touch = (
  cdp: CDPSession,
  type: "touchStart" | "touchMove" | "touchEnd",
  pts: [number, number, number?][],
) =>
  cdp.send("Input.dispatchTouchEvent", {
    type,
    touchPoints: pts.map(([x, y, id], i) => ({ x, y, id: id ?? i })),
  });

// moves go right and down: the view can always pan back toward the origin
// there (Paint's view is at the scroll limit below)
const scroll = (page: Page) =>
  page
    .locator("#vp")
    .evaluate((vp) => [vp.scrollLeft, vp.scrollTop] as [number, number]);

/** The middle of the visible part of `sel`'s box. */
async function centre(page: Page, sel: string): Promise<Pt> {
  return page.locator(sel).evaluate((el) => {
    const r = el.getBoundingClientRect();
    const x0 = Math.max(r.left, 0);
    const x1 = Math.min(r.right, innerWidth);
    const y0 = Math.max(r.top, 0);
    const y1 = Math.min(r.bottom, innerHeight);
    return [(x0 + x1) / 2, (y0 + y1) / 2] as Pt;
  });
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

/** /next with Paint running, the view on it (card navigation). */
async function paint(page: Page): Promise<CDPSession> {
  await page.goto(sheet());
  await expect(page.locator("#world")).toHaveAttribute("style", /scale\(/);
  await page.locator(".railtoggle").click();
  await page.locator('[data-go="paint"]').click();
  await expect(page.locator('[data-win="paint"] .demo-area')).toHaveAttribute(
    "data-host",
    "running",
  );
  // the navigation pan has ended
  let last = "";
  await expect
    .poll(async () => {
      const now = (await scroll(page)).join();
      const same = now === last;
      last = now;
      return same;
    })
    .toBe(true);
  return page.context().newCDPSession(page);
}

const CANVAS = '[data-win="paint"] .demo-area canvas';

test("R21 a touch drag on Paint's canvas does not pan the sheet @live", async ({
  page,
}) => {
  const cdp = await paint(page);
  const c = await centre(page, CANVAS);
  const s0 = await scroll(page);
  await touch(cdp, "touchStart", [c]);
  for (let i = 1; i <= 5; i++)
    await touch(cdp, "touchMove", [[c[0] + 10 * i, c[1] + 10 * i]]);
  await touch(cdp, "touchEnd", []);
  expect(await scroll(page), "the paper did not pan").toEqual(s0);
});

test("R21 a finger held in Paint: a second finger on the paper does not pan", async ({
  page,
}) => {
  const cdp = await paint(page);
  const c = await centre(page, CANVAS);
  const p = await paper(page);
  const s0 = await scroll(page);
  await touch(cdp, "touchStart", [c]);
  await touch(cdp, "touchStart", [c, p]);
  for (let i = 1; i <= 5; i++)
    await touch(cdp, "touchMove", [c, [p[0] + 20 * i, p[1] + 20 * i]]);
  await touch(cdp, "touchEnd", []);
  expect(await scroll(page), "the paper did not pan").toEqual(s0);
  // the app's pointer is released: the paper pans again
  await touch(cdp, "touchStart", [p]);
  for (let i = 1; i <= 5; i++)
    await touch(cdp, "touchMove", [[p[0] + 20 * i, p[1] + 20 * i]]);
  await touch(cdp, "touchEnd", []);
  await expect.poll(() => scroll(page)).not.toEqual(s0);
});

test("R11 a tap on a window whose background start is pending activates it", async ({
  page,
}) => {
  let release!: () => void;
  const held = new Promise<void>((r) => (release = r));
  await page.route(/\/app-fx-focus-[^/]*\.js$/, async (route) => {
    await held;
    await route.continue();
  });
  await page.goto(sheet("?host=castlesiege:fx-focus"), {
    waitUntil: "domcontentloaded",
  });
  const a = page.locator('[data-win="castlesiege"] .demo-area');
  await expect(a).toHaveAttribute("data-host", "starting");
  const cdp = await page.context().newCDPSession(page);
  const t = await centre(page, '[data-win="castlesiege"] .demo-area');
  await touch(cdp, "touchStart", [t]);
  await touch(cdp, "touchEnd", []);
  release();
  await expect(a).toHaveAttribute("data-host", "running");
  await expect(page.locator(".fx-focus")).toBeFocused();
});

test("R21 a finger held in Paint: a second finger on Music's app does not reach Music (one app owns the gesture)", async ({
  page,
}) => {
  const cdp = await paint(page);
  // Music runs too, and both windows are in view
  const fold = page.locator(".railtoggle");
  if ((await fold.getAttribute("aria-expanded")) !== "true") await fold.click();
  await page.locator('[data-go="music"]').click();
  await expect(page.locator('[data-win="music"] .demo-area')).toHaveAttribute(
    "data-host",
    "running",
  );
  await page.locator("#zFit").click();
  const music = '[data-win="music"] .host-root:not(.host-bar)';
  await page.locator(music).evaluate((r) => {
    const w = window as unknown as { __musicDown: number };
    w.__musicDown = 0;
    r.addEventListener("pointerdown", () => w.__musicDown++);
  });
  const c = await centre(page, CANVAS);
  const m = await centre(page, music);
  await touch(cdp, "touchStart", [c]);
  await touch(cdp, "touchMove", [[c[0] + 2, c[1] + 2]]);
  await touch(cdp, "touchStart", [[c[0] + 2, c[1] + 2], m]);
  await touch(cdp, "touchEnd", []);
  expect(
    await page.evaluate(
      () => (window as unknown as { __musicDown: number }).__musicDown,
    ),
  ).toBe(0);
  // released: a press in Music reaches it again
  await touch(cdp, "touchStart", [m]);
  await touch(cdp, "touchEnd", []);
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as { __musicDown: number }).__musicDown,
      ),
    )
    .toBe(1);
});

test("R21 a finger held in Paint: a click on Tracker's Play by another pointer does not start playback; after the release a tap does (Codex 002 #2)", async ({
  page,
}) => {
  // counts the AudioContexts the page makes: Play makes Tracker's first one
  await page.addInitScript(() => {
    const Base = window.AudioContext;
    const w = window as unknown as { __made: number };
    w.__made = 0;
    window.AudioContext = class extends Base {
      constructor(o?: AudioContextOptions) {
        super(o);
        w.__made++;
      }
    };
  });
  const made = () =>
    page.evaluate(() => (window as unknown as { __made: number }).__made);
  const cdp = await paint(page);
  const fold = page.locator(".railtoggle");
  if ((await fold.getAttribute("aria-expanded")) !== "true") await fold.click();
  await page.locator('[data-go="music"]').click();
  await expect(page.locator('[data-win="music"] .demo-area')).toHaveAttribute(
    "data-host",
    "running",
  );
  await page.locator("#zFit").click();
  const PLAY = '[data-win="music"] button[data-guide="play"]';
  const c = await centre(page, CANVAS);
  const p = await centre(page, PLAY);
  await touch(cdp, "touchStart", [c]);
  await touch(cdp, "touchMove", [[c[0] + 2, c[1] + 2]]);
  // the other pointer is a mouse (a touch screen with a mouse): Chromium
  // makes no click from a second finger's tap, but a mouse press makes one
  await page.evaluate(() => {
    const w = window as unknown as { __clicked: Promise<void> };
    w.__clicked = new Promise<void>((r) =>
      addEventListener("click", () => setTimeout(r), {
        capture: true,
        once: true,
      }),
    );
  });
  await page.mouse.click(...p);
  // the click's handlers have all run
  await page.evaluate(
    () => (window as unknown as { __clicked: Promise<void> }).__clicked,
  );
  await touch(cdp, "touchEnd", []);
  expect(await made(), "Play ran under Paint's gesture").toBe(0);
  // released: a tap on Play plays
  await touch(cdp, "touchStart", [p]);
  await touch(cdp, "touchEnd", []);
  await expect.poll(made).toBe(1);
});
