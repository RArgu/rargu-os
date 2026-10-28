// Spec 009 R1.b: the layer hint (R1) leaves no trace on a window at rest. At
// phone fit, 50 %, 100 % and 160 %, each reached by zooming in and by zooming
// out, CastleSiege (running, so with text inside a hosted app) is screenshot
// at rest; then it is dragged away and back with no throw (the hint is on
// for the drag and off at rest) and screenshot again. The two must be equal,
// pixel for pixel. The baseline is made fresh in the same run, so the test
// needs no committed images and holds on any machine and browser version.
// Chromium and WebKit (the spec's browsers).
//
// The one-time check against HEAD f54ed3c (before 009) used the same test:
// T1_SHOTS=<dir> saves both shots of each case, and the two builds' files
// were compared (ledger 2026-10-24, T1).
import { mkdirSync, writeFileSync } from "node:fs";
import type { Page } from "@playwright/test";
import { expect, test } from "./helpers";
import { sheet } from "./sheet-base";

type Pt = [number, number];
const WIN = '[data-win="castlesiege"]';
const SHOTS = process.env.T1_SHOTS;

test.skip(
  ({ browserName }) => browserName === "firefox",
  "R1.b: Chromium and WebKit",
);

/** Counts the page's pending animation frames (as in sheet-windows). */
async function open(page: Page, phone?: boolean): Promise<void> {
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
    const w = window as unknown as Record<string, unknown>;
    w.__live = () => live.size;
    w.__frameDone = () => new Promise<void>((r) => raw(() => r()));
  });
  await page.goto(sheet());
  await expect(page.locator("#world")).toHaveAttribute("style", /scale\(/);
  // on a phone the start rule starts it (the card is folded)
  if (!phone) await page.locator('[data-go="castlesiege"]').click();
  const area = page.locator(`${WIN} .demo-area`);
  await expect(area).toHaveAttribute("data-host", "running");
  await expect(area.locator(".cs-cell")).toHaveCount(63);
  await page.evaluate(() => document.fonts.ready);
  await settled(page);
}

/** No frame pending after a frame has run, and no CSS transition running. */
const settled = (page: Page) =>
  expect
    .poll(() =>
      page.evaluate(async () => {
        const w = window as unknown as {
          __live(): number;
          __frameDone(): Promise<void>;
        };
        await w.__frameDone();
        return w.__live() + document.getAnimations().length;
      }),
    )
    .toBe(0);

const zoom = (page: Page) =>
  page.evaluate(() => {
    const t = getComputedStyle(document.querySelector("#world")!).transform;
    return t === "none" ? 1 : new DOMMatrix(t).a;
  });

/** CastleSiege's box on screen. */
const box = async (page: Page) => (await page.locator(WIN).boundingBox())!;

/** Zooms at once (one ctrl-wheel event) about screen point `at`. */
async function zoomTo(page: Page, z: number, at: Pt): Promise<void> {
  const z0 = await zoom(page);
  await page.evaluate(
    ([dy, x, y]) =>
      document.querySelector("#vp")!.dispatchEvent(
        new WheelEvent("wheel", {
          bubbles: true,
          cancelable: true,
          ctrlKey: true,
          deltaY: dy,
          clientX: x,
          clientY: y,
        }),
      ),
    [-100 * Math.log(z / z0), ...at],
  );
  await expect.poll(() => zoom(page)).toBeCloseTo(z, 4);
  await settled(page);
}

/** The window and its shadow, inside the viewport. */
async function shot(page: Page): Promise<Buffer> {
  const b = await box(page);
  const vp = page.viewportSize()!;
  const x = Math.max(0, Math.floor(b.x) - 4);
  const y = Math.max(0, Math.floor(b.y) - 4);
  const clip = {
    x,
    y,
    width: Math.min(vp.width, Math.ceil(b.x + b.width) + 24) - x,
    height: Math.min(vp.height, Math.ceil(b.y + b.height) + 24) - y,
  };
  return page.screenshot({ clip, animations: "disabled", caret: "hide" });
}

/** A drag from `a` to `b` with no throw: the pointer is still for over 50 ms
 * of page time before the release (001 R8.b). */
async function carry(page: Page, a: Pt, b: Pt): Promise<void> {
  await page.mouse.move(...a);
  await page.mouse.down();
  await page.mouse.move(...b, { steps: 4 });
  const t0 = await page.evaluate(() => performance.now());
  await expect
    .poll(() => page.evaluate(() => performance.now()))
    .toBeGreaterThan(t0 + 80);
  await page.mouse.up();
  await settled(page);
}

const CASES: { name: string; phone?: boolean; path: number[] }[] = [
  { name: "phone fit", phone: true, path: [] },
  { name: "phone fit (zoomed in and out)", phone: true, path: [1, 0] },
  { name: "50 % (zoomed out)", path: [0.5] },
  { name: "50 % (zoomed in)", path: [0.45, 0.5] },
  { name: "100 % (zoomed in)", path: [0.5, 1] },
  { name: "100 % (zoomed out)", path: [1.6, 1] },
  { name: "160 % (zoomed in)", path: [1.6] },
  { name: "160 % (zoomed out and in)", path: [0.5, 1.6] },
];

for (const c of CASES)
  test.describe(() => {
    if (c.phone) test.use({ viewport: { width: 390, height: 844 } });
    test(`009 R1.b no new blur at rest: ${c.name}`, async ({
      page,
      browserName,
    }) => {
      await open(page, c.phone);
      const fit = await zoom(page);
      // 0 in a path: back to the start zoom
      // 015: each zoom is about the bar's middle where it is now (the card is
      // narrower, so a zoom out and in about a fixed point can end with the
      // window off the left edge)
      for (const z of c.path) {
        const bb = await box(page);
        const zn = await zoom(page);
        await zoomTo(page, z || fit, [
          Math.round(Math.min(Math.max(bb.x + bb.width / 2, 60), 1000)),
          Math.round(bb.y + 12 * zn),
        ]);
      }
      // the bar's middle now (a zoom near the sheet's edge may shift it)
      const b = await box(page);
      const z = await zoom(page);
      const v = (await page.locator("#vp").boundingBox())!;
      // 015: the card is narrower, so the view's left inset is smaller and the
      // bar's middle can land inside the left edge zone; press on the bar,
      // clear of the 56 px edge zones
      const lo = Math.max(b.x + 8, v.x + 60);
      const hi = Math.min(b.x + b.width - 8, v.x + v.width - 60);
      const press: Pt = [
        Math.round(Math.min(hi, Math.max(lo, b.x + b.width / 2))),
        Math.round(b.y + 12 * z),
      ];
      const vp = page.viewportSize()!;
      const moved: Pt = [press[0] + 30, press[1] + 24];
      // both ends clear of the 56 px edge zones (no auto-scroll, R10)
      for (const p of [press, moved]) {
        expect(p[0]).toBeGreaterThan(v.x + 56);
        expect(p[0]).toBeLessThan(v.x + v.width - 56);
        expect(p[1]).toBeGreaterThan(v.y + 56);
        expect(p[1]).toBeLessThan(v.y + v.height - 56);
      }
      // a resting place for the mouse off the window, the same for both shots
      const away: Pt = [
        Math.min(vp.width - 2, Math.round(b.x + b.width + 30)),
        Math.round(b.y + b.height / 2),
      ];
      await page.mouse.move(...away);
      await settled(page);
      const before = await shot(page);
      await carry(page, press, moved);
      // it was carried
      const b1 = await box(page);
      expect([b1.x - b.x, b1.y - b.y].map(Math.round)).toEqual([30, 24]);
      // the hint is off at rest
      expect(
        await page.locator(WIN).evaluate((w) => getComputedStyle(w).willChange),
      ).toBe("auto");
      await carry(page, moved, press);
      await page.mouse.move(...away);
      await settled(page);
      const after = await shot(page);
      if (SHOTS) {
        const dir = `${SHOTS}/${browserName}`;
        mkdirSync(dir, { recursive: true });
        const f = c.name.replace(/[^\w]+/g, "-");
        writeFileSync(`${dir}/${f}-before.png`, before);
        writeFileSync(`${dir}/${f}-after.png`, after);
      }
      expect(after.equals(before), "the same pixels after the drag").toBe(true);
    });
  });
