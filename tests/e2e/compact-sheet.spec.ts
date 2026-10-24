// Spec 001 on a phone (390 × 844, touch): fit, one-finger pan, two-finger
// pinch, one gesture owner (paper or minimap).
import type { CDPSession, Page } from "@playwright/test";
import { cardItemLines, expect, test } from "./helpers";
import { sheet } from "./sheet-base";

function view(page: Page) {
  return page.evaluate(() => {
    const vp = document.querySelector<HTMLElement>("#vp")!;
    const t = getComputedStyle(document.querySelector("#world")!).transform;
    return {
      z: t === "none" ? 1 : new DOMMatrix(t).a,
      left: vp.scrollLeft,
      top: vp.scrollTop,
    };
  });
}

/** The phone's top inset above the sheet, screen px (owner, option A). */
const insetOf = (page: Page) =>
  page
    .locator("#vp")
    .evaluate((vp) => parseFloat(getComputedStyle(vp).paddingTop));

interface Logged {
  t: string;
  id: number;
  on: string;
}

/** Opens /next with a pointer event log (test instrumentation, capture phase). */
async function open(page: Page): Promise<CDPSession> {
  await page.addInitScript(() => {
    const log: { t: string; id: number; on: string }[] = [];
    for (const t of [
      "pointerdown",
      "pointermove",
      "pointerup",
      "pointercancel",
    ])
      addEventListener(
        t,
        (e) => {
          const p = e as PointerEvent;
          log.push({ t, id: p.pointerId, on: (p.target as Element).id });
        },
        true,
      );
    Object.assign(window, { __log: log });
  });
  await page.goto(sheet());
  await expect(page.locator("#world")).toHaveAttribute("style", /scale\(/);
  return page.context().newCDPSession(page);
}

const events = (page: Page) =>
  page.evaluate(() => (window as unknown as { __log: Logged[] }).__log);

/** Waits until an event matching `f` is logged at index `from` or later. */
async function waitFor(
  page: Page,
  f: (e: Logged) => boolean,
  from = 0,
): Promise<Logged> {
  let hit: Logged | undefined;
  await expect
    .poll(async () => {
      hit = (await events(page)).slice(from).find(f);
      return !!hit;
    })
    .toBe(true);
  return hit!;
}

type Pt = [number, number];
/** Real touch input; ids are the list order unless given. */
const touch = (
  cdp: CDPSession,
  type: "touchStart" | "touchMove" | "touchEnd",
  pts: [number, number, number?][],
) =>
  cdp.send("Input.dispatchTouchEvent", {
    type,
    touchPoints: pts.map(([x, y, id], i) => ({ x, y, id: id ?? i })),
  });

test("R5.b fit at 390 × 844 shows the whole sheet @live", async ({ page }) => {
  await open(page);
  await page.click("#zFit");
  await expect(page.locator("#zPct")).toHaveText("13%");
  const box = (await page.locator("#world").boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(-0.5);
  expect(box.y).toBeGreaterThanOrEqual(-0.5);
  expect(box.x + box.width).toBeLessThanOrEqual(390.5);
  expect(box.y + box.height).toBeLessThanOrEqual(844.5);
});

test.describe("R5 fit in a height-limited phone view", () => {
  // landscape, still ≤ 760 px wide: a phone, with the bar's top inset
  test.use({ viewport: { width: 760, height: 390 } });
  test("760 × 390: fit uses the full view and shows the whole sheet", async ({
    page,
  }) => {
    await open(page);
    await page.click("#zFit");
    const [w, h] = await page
      .locator("#vp")
      .evaluate((vp) => [vp.clientWidth, vp.clientHeight]);
    // R5: the whole sheet in the full view
    const want = Math.min(w / 3000, h / 1640);
    expect(h / 1640).toBeLessThan(w / 3000);
    await expect.poll(async () => (await view(page)).z).toBeCloseTo(want, 6);
    await expect(page.locator("#zPct")).toHaveText(
      `${Math.round(want * 100)}%`,
    );
    const box = (await page.locator("#world").boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(-0.5);
    expect(box.y).toBeGreaterThanOrEqual(-0.5);
    expect(box.x + box.width).toBeLessThanOrEqual(760.5);
    expect(box.y + box.height).toBeLessThanOrEqual(390.5);
  });
});

// paper right of and below CastleSiege at the phone start view (R15)
const DEMO: Pt = [375, 480];

test("R4 one finger pans the sheet @live", async ({ page }) => {
  const cdp = await open(page);
  const s0 = await view(page);
  await touch(cdp, "touchStart", [DEMO]);
  for (let i = 1; i <= 10; i++)
    await touch(cdp, "touchMove", [[DEMO[0] - 15 * i, DEMO[1] - 10 * i]]);
  // touch moves arrive with the next frame; the finger is still down
  await expect
    .poll(async () => {
      const s = await view(page);
      return Math.max(
        Math.abs(s.left - s0.left - 150),
        Math.abs(s.top - s0.top - 100),
      );
    })
    .toBeLessThanOrEqual(1);
  await touch(cdp, "touchEnd", []);
});

test("R5 two fingers pinch at the midpoint; lifting one ends it with no jump", async ({
  page,
}) => {
  const cdp = await open(page);
  // a on the paper below CastleSiege, clear of it: since 002 its demo area
  // is the running app's (a touch there, or one the browser snaps to it,
  // is the app's, not the sheet's)
  const a: Pt = [DEMO[0], DEMO[1] + 10];
  const b: Pt = [DEMO[0] + 10, DEMO[1] + 310];
  await touch(cdp, "touchStart", [a]);
  const A = (await waitFor(page, (e) => e.t === "pointerdown")).id;
  await touch(cdp, "touchStart", [a, b]);
  const B = (await waitFor(page, (e) => e.t === "pointerdown" && e.id !== A))
    .id;
  const s0 = await view(page);
  const mid: Pt = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const inset = await insetOf(page);
  const sheet = [(mid[0] + s0.left) / s0.z, (mid[1] + s0.top - inset) / s0.z];
  for (let i = 1; i <= 5; i++)
    await touch(cdp, "touchMove", [
      [a[0], a[1] - 10 * i],
      [b[0], b[1] + 10 * i],
    ]);
  // distance 300.2 → 400.1; touch moves arrive with the next frame
  await expect
    .poll(async () => (await view(page)).z)
    .toBeCloseTo(s0.z * 1.332, 2);
  const s1 = await view(page);
  expect(Math.abs(sheet[0] * s1.z - s1.left - mid[0])).toBeLessThanOrEqual(1);
  expect(
    Math.abs(sheet[1] * s1.z + inset - s1.top - mid[1]),
  ).toBeLessThanOrEqual(1);
  // lift B (touch id 1): its pointerup arrives while A is still down
  await touch(cdp, "touchEnd", [[b[0], b[1] + 50, 1]]);
  await waitFor(page, (e) => e.t === "pointerup" && e.id === B);
  const ended = (await events(page)).filter((e) => e.t === "pointerup");
  expect(ended.map((e) => e.id)).toEqual([B]);
  // then move A: the view does not jump
  const from = (await events(page)).length;
  await touch(cdp, "touchMove", [[a[0] - 60, a[1] - 90, 0]]);
  await waitFor(page, (e) => e.t === "pointermove" && e.id === A, from);
  const s2 = await view(page);
  await touch(cdp, "touchEnd", []);
  expect([s2.z, s2.left, s2.top]).toEqual([s1.z, s1.left, s1.top]);
});

/** Corners and centre of the minimap on screen. */
async function mapPoints(page: Page): Promise<{ corner: Pt; centre: Pt }> {
  const m = (await page.locator("#mini").boundingBox())!;
  return {
    corner: [m.x + 3, m.y + 3],
    centre: [m.x + m.width / 2, m.y + m.height / 2],
  };
}

test("one gesture owner: a minimap press during a paper pan is ignored", async ({
  page,
}) => {
  const cdp = await open(page);
  const { centre } = await mapPoints(page);
  const s0 = await view(page);
  await touch(cdp, "touchStart", [DEMO]);
  await waitFor(page, (e) => e.t === "pointerdown");
  await touch(cdp, "touchStart", [DEMO, centre]);
  await waitFor(page, (e) => e.t === "pointerdown" && e.on === "mini");
  const s1 = await view(page);
  await touch(cdp, "touchEnd", []);
  expect([s1.left, s1.top]).toEqual([s0.left, s0.top]);
});

test("one gesture owner: a paper press or a second map finger during a minimap drag is ignored", async ({
  page,
}) => {
  const cdp = await open(page);
  const { corner, centre } = await mapPoints(page);
  // the map's top-left corner centres the view on the sheet's corner: scroll 0, 0
  await touch(cdp, "touchStart", [corner]);
  const M = (await waitFor(page, (e) => e.t === "pointerdown")).id;
  const s0 = await view(page);
  expect([s0.left, s0.top]).toEqual([0, 0]);
  // a second finger on the map
  await touch(cdp, "touchStart", [corner, centre]);
  await waitFor(page, (e) => e.t === "pointerdown" && e.id !== M);
  expect(await view(page)).toEqual(s0);
  await touch(cdp, "touchEnd", [[...centre, 1]]);
  await waitFor(page, (e) => e.t === "pointerup" && e.id !== M);
  // a finger on the paper, moved
  await touch(cdp, "touchStart", [corner, [...DEMO, 2]]);
  const P = (
    await waitFor(
      page,
      (e) => e.t === "pointerdown" && e.on !== "mini" && e.id !== M,
    )
  ).id;
  const from = (await events(page)).length;
  await touch(cdp, "touchMove", [corner, [DEMO[0] - 80, DEMO[1] - 80, 2]]);
  await waitFor(page, (e) => e.t === "pointermove" && e.id === P, from);
  const s1 = await view(page);
  await touch(cdp, "touchEnd", []);
  expect(s1).toEqual(s0);
});

// ---- T5: a held window owns the gesture (R21) ----

/** CastleSiege's inline position, sheet px. */
const pos = (page: Page) =>
  page.locator('[data-win="castlesiege"]').evaluate((w) => {
    const m = /translate\(([-\d.e]+)px(?:, ([-\d.e]+)px)?\)/.exec(
      (w as HTMLElement).style.transform,
    )!;
    return [+m[1], +(m[2] ?? 0)];
  });

/** Zoom 100 % (one ctrl-wheel event), and the sheet's top edge at the top
 * of the view: CastleSiege's bar at y 100, below the card's bar. */
async function clearOfCard(page: Page): Promise<void> {
  const z0 = (await view(page)).z;
  await page.locator("#vp").evaluate(
    (vp, dy) =>
      vp.dispatchEvent(
        new WheelEvent("wheel", {
          bubbles: true,
          cancelable: true,
          ctrlKey: true,
          deltaY: dy,
          clientX: 195,
          clientY: 422,
        }),
      ),
    100 * Math.log(z0),
  );
  await expect.poll(async () => (await view(page)).z).toBeCloseTo(1, 6);
  const inset = await insetOf(page);
  await page.locator("#vp").evaluate((vp, top) => vp.scrollTo(100, top), inset);
  await expect
    .poll(async () => {
      const v = await view(page);
      return v.left === 100 && Math.abs(v.top - inset) < 1;
    })
    .toBe(true);
}
// on CastleSiege's bar, right of the card, out of the 56 px edge zones
const BAR: Pt = [320, 115];
// paper below CastleSiege, right of the minimap
const PAPER: Pt = [380, 790];

test("R21.a a second finger on the paper while a window is held: the drag goes on, no pinch", async ({
  page,
}) => {
  const cdp = await open(page);
  await clearOfCard(page);
  const s0 = await view(page);
  await touch(cdp, "touchStart", [BAR]);
  const A = (await waitFor(page, (e) => e.t === "pointerdown")).id;
  await touch(cdp, "touchStart", [BAR, PAPER]);
  const B = await waitFor(page, (e) => e.t === "pointerdown" && e.id !== A);
  expect(B.on).toBe("world");
  let from = (await events(page)).length;
  for (let i = 1; i <= 5; i++)
    await touch(cdp, "touchMove", [
      [BAR[0] + 2 * i, BAR[1] + 8 * i],
      [PAPER[0], PAPER[1] + 8 * i],
    ]);
  // both fingers' last moves have arrived
  await waitFor(page, (e) => e.t === "pointermove" && e.id === A, from);
  await expect
    .poll(async () => {
      const ev = (await events(page)).slice(from);
      return ev.filter((e) => e.t === "pointermove" && e.id === B.id).length;
    })
    .toBeGreaterThan(0);
  // the window follows finger A 1:1 (zoom 1); the view neither zooms nor pans
  await expect.poll(() => pos(page)).toEqual([360 + 10, 100 + 40]);
  const s1 = await view(page);
  expect(s1).toEqual(s0);
  from = (await events(page)).length;
  await touch(cdp, "touchEnd", []);
  await waitFor(page, (e) => e.t === "pointerup" && e.id === A, from);
  expect((await view(page)).z).toBe(s0.z);
});

test("R21.b a touch cancel ends the drag with no throw", async ({ page }) => {
  const cdp = await open(page);
  await clearOfCard(page);
  await touch(cdp, "touchStart", [BAR]);
  const A = (await waitFor(page, (e) => e.t === "pointerdown")).id;
  const from = (await events(page)).length;
  // a fast move, so a release here would throw
  for (let i = 1; i <= 3; i++)
    await touch(cdp, "touchMove", [[BAR[0] + 3 * i, BAR[1] + 20 * i]]);
  await expect.poll(() => pos(page)).toEqual([360 + 9, 100 + 60]);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchCancel",
    touchPoints: [],
  });
  await waitFor(page, (e) => e.t === "pointercancel" && e.id === A, from);
  // the window has stopped: no change of place, no rotation and (009 R2)
  // no scale; anything after the rotation (a scale) fails the match
  await expect
    .poll(() =>
      page
        .locator('[data-win="castlesiege"]')
        .evaluate((w) => (w as HTMLElement).style.transform),
    )
    .toMatch(/^translate\([^)]*\) rotate\(0deg\)$/);
  expect(await pos(page)).toEqual([369, 160]);
});

test("one gesture owner: a cancelled pinch pointer ends the whole pinch", async ({
  page,
}) => {
  const cdp = await open(page);
  // a on the paper below CastleSiege, clear of it: since 002 its demo area
  // is the running app's (a touch there, or one the browser snaps to it,
  // is the app's, not the sheet's)
  const a: Pt = [DEMO[0], DEMO[1] + 10];
  const b: Pt = [DEMO[0] + 10, DEMO[1] + 310];
  await touch(cdp, "touchStart", [a]);
  const A = (await waitFor(page, (e) => e.t === "pointerdown")).id;
  await touch(cdp, "touchStart", [a, b]);
  const B = (await waitFor(page, (e) => e.t === "pointerdown" && e.id !== A))
    .id;
  // the browser cancels one pinch pointer
  await page
    .locator("#vp")
    .evaluate(
      (vp, id) =>
        vp.dispatchEvent(
          new PointerEvent("pointercancel", { pointerId: id, bubbles: true }),
        ),
      B,
    );
  // the pinch is over: a minimap press now owns the input
  const { centre } = await mapPoints(page);
  const s0 = await view(page);
  const inset = await insetOf(page);
  await touch(cdp, "touchStart", [a, b, centre]);
  await waitFor(page, (e) => e.t === "pointerdown" && e.on === "mini");
  await expect
    .poll(async () => {
      const s = await view(page);
      return Math.max(
        Math.abs(s.left + 390 / 2 - 1500 * s.z),
        Math.abs(s.top + 844 / 2 - 820 * s.z - inset),
      );
    })
    .toBeLessThanOrEqual(15);
  expect((await view(page)).left).not.toBe(s0.left);
  await touch(cdp, "touchEnd", []);
});

// ---- T6: the card as a bar, phone fit, navigation and Reset (R12, R13, R15) ----

/** CastleSiege's box on screen, and the zoom label. */
async function castleSiege(page: Page) {
  return {
    box: (await page.locator('[data-win="castlesiege"]').boundingBox())!,
    pct: await page.locator("#zPct").textContent(),
  };
}

/** Expects CastleSiege's full width on screen. */
async function fullWidth(page: Page) {
  const { box } = await castleSiege(page);
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  // and in view vertically: its bottom edge is on screen
  expect(box.y + box.height).toBeLessThanOrEqual(844);
}

test("R15.a at 390 × 844 the card is a bar and CastleSiege's full width is on screen @live", async ({
  page,
}) => {
  await open(page);
  const toggle = page.locator("#card button[aria-expanded]");
  await expect(toggle).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator("#email")).toBeHidden();
  const card = (await page.locator("#card").boundingBox())!;
  expect(card.height).toBeLessThan(90);
  // zoomed out from 100 % so the window fits
  const { pct } = await castleSiege(page);
  expect(pct).not.toBe("100%");
  await fullWidth(page);
});

test("R15 the about toggle opens the card; Escape closes it and returns focus to the toggle @live", async ({
  page,
}) => {
  await open(page);
  const toggle = page.locator("#card button[aria-expanded]");
  await toggle.tap();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator("#email")).toBeVisible();
  await expect(page.getByRole("link", { name: "GitHub" })).toBeVisible();
  // focus inside the card, away from the toggle
  await page.getByRole("link", { name: "GitHub" }).focus();
  await page.keyboard.press("Escape");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator("#email")).toBeHidden();
  await expect(toggle).toBeFocused();
});

test("owner 2026-10-24: on the phone card each project item is one line @live", async ({
  page,
}) => {
  await open(page);
  await page.locator("#card button[aria-expanded]").tap();
  await expect(page.locator("#card nav [data-go]").first()).toBeVisible();
  const items = await cardItemLines(page);
  expect(items).toHaveLength(5);
  for (const i of items)
    expect(i, i.text).toMatchObject({ lines: 1, oneLine: true });
});

test("R12 on a phone choosing a project closes the bar and centres the window below it @live", async ({
  page,
}) => {
  await open(page);
  await page.locator("#card button[aria-expanded]").tap();
  await page
    .locator("#card")
    .getByRole("button", { name: /Pentimento/ })
    .tap();
  const toggle = page.locator("#card button[aria-expanded]");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator('[data-win="pentimento"]')).toBeFocused();
  // centred across the view (the sheet's top edge keeps it from going lower)
  await expect
    .poll(async () => {
      const b = (await page.locator('[data-win="pentimento"]').boundingBox())!;
      return Math.round(b.x + b.width / 2);
    })
    .toBe(195);
  const b = (await page.locator('[data-win="pentimento"]').boundingBox())!;
  expect(b.y + b.height).toBeLessThanOrEqual(844);
});

test("R13 on a phone Reset sets the phone fit again @live", async ({
  page,
}) => {
  await open(page);
  const start = await castleSiege(page);
  await page.click("#zIn");
  await expect(page.locator("#zPct")).not.toHaveText(start.pct!);
  await page.locator("#card button[aria-expanded]").tap();
  await page.getByRole("button", { name: /Reset page/ }).tap();
  await expect(page.locator("#zPct")).toHaveText(start.pct!);
  await expect(page.locator("#card button[aria-expanded]")).toHaveAttribute(
    "aria-expanded",
    "false",
  );
  await expect
    .poll(async () => (await castleSiege(page)).box)
    .toEqual(start.box);
  await fullWidth(page);
});

// ---- the phone bar never covers a window's title bar (owner, option A) ----

/** Expects window `id`'s title bar fully below the card's bar, on screen. */
async function barClear(page: Page, id: string) {
  const card = (await page.locator("#card").boundingBox())!;
  const bar = (await page.locator(`[data-win="${id}"] .bar`).boundingBox())!;
  expect(bar.y).toBeGreaterThanOrEqual(card.y + card.height);
  expect(bar.y + bar.height).toBeLessThanOrEqual(844);
  expect(bar.x).toBeGreaterThanOrEqual(0);
  expect(bar.x + bar.width).toBeLessThanOrEqual(390);
}

/** Waits until nothing moves: every window at rest, the view still. */
async function settled(page: Page) {
  let last = "";
  await expect
    .poll(
      async () => {
        const key = await page.evaluate(() => {
          const vp = document.querySelector<HTMLElement>("#vp")!;
          return JSON.stringify([
            vp.scrollLeft,
            vp.scrollTop,
            document.querySelector("#zPct")!.textContent,
            [...document.querySelectorAll<HTMLElement>("[data-win]")].map(
              (w) => w.style.transform,
            ),
          ]);
        });
        const still = key === last && !/rotate\((?!0deg)/.test(key);
        last = key;
        return still;
      },
      { intervals: [100] },
    )
    .toBe(true);
}

test("option A: at load and after Reset CastleSiege's title bar is below the phone bar", async ({
  page,
}) => {
  await open(page);
  await barClear(page, "castlesiege");
  // move away: zoom in, pan, then Reset
  await page.click("#zIn");
  await page.locator("#vp").evaluate((vp) => vp.scrollTo(600, 400));
  await page.locator("#card button[aria-expanded]").tap();
  await page.getByRole("button", { name: /Reset page/ }).tap();
  await settled(page);
  await barClear(page, "castlesiege");
});

test("option A: after the card's navigation Pentimento's title bar is below the phone bar", async ({
  page,
}) => {
  await open(page);
  await page.locator("#card button[aria-expanded]").tap();
  await page
    .locator("#card")
    .getByRole("button", { name: /Pentimento/ })
    .tap();
  await settled(page);
  await barClear(page, "pentimento");
});

// ---- review fixes on a phone ----

test("the inset follows the bar's real bottom edge: a window at sheet y 0, navigated to, has its title bar below the bar", async ({
  page,
}) => {
  const cdp = await open(page);
  const go = async (id: string) => {
    await page.locator("#card button[aria-expanded]").tap();
    await page.locator(`#card [data-go="${id}"]`).tap();
    await settled(page);
  };
  // carry Pentimento up past the sheet's top edge: it lands at y 0
  await go("pentimento");
  const b = (await page.locator('[data-win="pentimento"] .bar').boundingBox())!;
  const at: Pt = [b.x + b.width / 2, b.y + b.height / 2];
  await touch(cdp, "touchStart", [at]);
  for (let i = 1; i <= 8; i++)
    await touch(cdp, "touchMove", [[at[0], at[1] - 10 * i]]);
  await touch(cdp, "touchEnd", []);
  await settled(page);
  const tf = await page
    .locator('[data-win="pentimento"]')
    .evaluate((w) => (w as HTMLElement).style.transform);
  expect(tf).toMatch(/^translate\([-\d.e]+px(, 0px)?\)/);
  // a lower bar, as a safe-area inset at the top would make it
  await page.addStyleTag({ content: "#card { top: 40px !important; }" });
  await page.setViewportSize({ width: 390, height: 840 });
  await expect.poll(() => page.evaluate(() => innerHeight)).toBe(840);
  await go("pentimento");
  await barClear(page, "pentimento");
});

test("phone Reset by keyboard moves focus to the about toggle", async ({
  page,
}) => {
  await open(page);
  const toggle = page.locator("#card button[aria-expanded]");
  await toggle.tap();
  await page.getByRole("button", { name: /Reset page/ }).focus();
  await page.keyboard.press("Enter");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(toggle).toBeFocused();
});

/** The project nearest the centre of the navigation area: below the folded
 * bar, also while the card is open (009 R7). Screen px: the nearest in screen
 * px is the nearest on the sheet. */
const nearest = (page: Page) =>
  page.evaluate(() => {
    const card = document.querySelector<HTMLElement>("#card")!;
    const cs = getComputedStyle(card);
    const bar =
      card.querySelector(".railtop")!.getBoundingClientRect().bottom +
      parseFloat(cs.paddingBottom) +
      parseFloat(cs.borderBottomWidth);
    const map = document.querySelector(".mapbox")!.getBoundingClientRect();
    const t = bar + 16;
    const cx = 16 + (innerWidth - 32) / 2;
    const cy = t + (map.top - t - 16) / 2;
    let best = "";
    let bd = Infinity;
    for (const b of document.querySelectorAll<HTMLElement>("nav [data-go]")) {
      const r = document
        .querySelector(`[data-win="${b.dataset.go}"]`)!
        .getBoundingClientRect();
      const d = Math.hypot(r.x + r.width / 2 - cx, r.y + r.height / 2 - cy);
      if (d < bd) [best, bd] = [b.dataset.go!, d];
    }
    return best;
  });
const marked = (page: Page) =>
  page.locator('nav [data-go][aria-current="location"]');

/** Two frames: the minimap draw (and the mark with it) has run. */
const frames = (page: Page) =>
  page.evaluate(
    () =>
      new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
  );

test("R12.b (009 R7.a) opening and closing the card keeps the mark and the scroll", async ({
  page,
}) => {
  const cdp = await open(page);
  const toggle = page.locator("#card button[aria-expanded]");
  const keeps = async (want: string) => {
    expect(await nearest(page)).toBe(want);
    await expect(marked(page)).toHaveAttribute("data-go", want);
    const s0 = await view(page);
    await toggle.tap();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await frames(page);
    await expect(marked(page)).toHaveAttribute("data-go", want);
    expect(await view(page)).toEqual(s0);
    await page.keyboard.press("Escape");
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await frames(page);
    await expect(marked(page)).toHaveAttribute("data-go", want);
    expect(await view(page)).toEqual(s0);
  };
  // the start view
  await keeps("castlesiege");
  // after a manual pan: one finger on the paper below CastleSiege
  const s0 = await view(page);
  await touch(cdp, "touchStart", [DEMO]);
  for (let i = 1; i <= 10; i++)
    await touch(cdp, "touchMove", [[DEMO[0] - 30 * i, DEMO[1] - 20 * i]]);
  await expect.poll(async () => (await view(page)).top).toBeGreaterThan(s0.top);
  await touch(cdp, "touchEnd", []);
  await settled(page);
  await keeps(await nearest(page));
  // after a navigation
  await toggle.tap();
  await page.locator('#card [data-go="crawler"]').tap();
  await settled(page);
  await keeps("crawler");
});

// ---- R19 on a phone ----

test("R19 on a phone Tab into the windows: each focused title bar is below the bar, with a ring of 2 screen px", async ({
  page,
}) => {
  await open(page);
  const toggle = page.locator("#card button[aria-expanded]");
  await toggle.focus();
  const seen: string[] = [];
  // on through Pentimento's controls (005) to the next window
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press("Tab");
    // every ring in the sheet (windows, Home controls, links) is ≥ 2 screen px
    const stop = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement;
      if (!el.closest("#world")) return null;
      const z = new DOMMatrix(
        getComputedStyle(document.querySelector("#world")!).transform,
      ).a;
      const cs = getComputedStyle(el);
      return {
        d: `${el.tagName} ${el.getAttribute("aria-label") ?? el.textContent}`,
        style: cs.outlineStyle,
        w: parseFloat(cs.outlineWidth) * z,
      };
    });
    if (stop) {
      expect(stop.style, stop.d).toBe("solid");
      expect(stop.w, `ring width of ${stop.d}`).toBeGreaterThanOrEqual(
        2 - 0.01,
      );
    }
    const win = await page.evaluate(
      () => (document.activeElement as HTMLElement).dataset.win ?? "",
    );
    if (!win) continue;
    // past Pentimento's controls: the next window (too wide for the phone
    // view at this zoom, so its bar is not checked)
    if (win === "crawler") break;
    seen.push(win);
    await settled(page);
    await barClear(page, win);
    const ring = await page.locator(`[data-win="${win}"]`).evaluate((w) => {
      const z = new DOMMatrix(
        getComputedStyle(document.querySelector("#world")!).transform,
      ).a;
      const cs = getComputedStyle(w);
      return [cs.outlineStyle, parseFloat(cs.outlineWidth) * z] as const;
    });
    expect(ring[0]).toBe("solid");
    expect(ring[1]).toBeGreaterThanOrEqual(2 - 0.01);
  }
  expect(seen).toEqual(["castlesiege", "castlewars", "pentimento"]);
  await expect(page.locator('[data-win="crawler"]')).toBeFocused();
});

test("R19 on a phone Tab out of the open card folds it, so the sheet's focus is not under it", async ({
  page,
}) => {
  await open(page);
  const toggle = page.locator("#card button[aria-expanded]");
  await toggle.tap();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await page.getByRole("button", { name: /Reset page/ }).focus();
  await page.keyboard.press("Tab");
  await expect(page.locator("#vp")).toBeFocused();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await page.keyboard.press("Tab");
  await expect(page.locator('[data-win="castlesiege"]')).toBeFocused();
  await settled(page);
  await barClear(page, "castlesiege");
});
