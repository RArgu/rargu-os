// Spec 004 T4 (R5.a) on a phone (390 × 844, touch through CDP): Paint's
// two-finger canvas pan follows the fingers at sheet zoom 60 %, 100 % and
// 160 %: the picture moves with them, its pixels stay, and the sheet view
// does not move; also on a rotated window and when the sheet zooms during
// the pan (Codex T4 review 1, 2). In a "compact" file because the mobile
// project runs only those. The sheet zoom is set with real ctrl-wheel input.
import type { CDPSession, Page } from "@playwright/test";
import { expect, test } from "./helpers";
import { chooseMenu } from "./host-helpers";
import { sheet as sheetUrl } from "./sheet-base";

type Pt = [number, number];
const touch = (
  cdp: CDPSession,
  type: "touchStart" | "touchMove" | "touchEnd",
  pts: Pt[],
) =>
  cdp.send("Input.dispatchTouchEvent", {
    type,
    touchPoints: pts.map(([x, y], id) => ({ x, y, id })),
  });

const win = (page: Page) => page.locator('[data-win="paint"]');
const CANVAS = '[data-win="paint"] .paint-canvas';
const VIEW = '[data-win="paint"] .paint-view';

/** The sheet zoom (#world's scale). */
const zoom = (page: Page) =>
  page
    .locator("#world")
    .evaluate((w) => Number(/scale\(([\d.]+)\)/.exec(w.style.transform)![1]));

/** The sheet view's state: scroll and zoom. */
const sheet = (page: Page) =>
  page
    .locator("#vp")
    .evaluate((vp) => [
      vp.scrollLeft,
      vp.scrollTop,
      vp.querySelector<HTMLElement>("#world")!.style.transform,
    ]);

/** The middle of the visible part of `sel`'s box. */
function centre(page: Page, sel: string): Promise<Pt> {
  return page.locator(sel).evaluate((el) => {
    const r = el.getBoundingClientRect();
    const x0 = Math.max(r.left, 0);
    const x1 = Math.min(r.right, innerWidth);
    const y0 = Math.max(r.top, 0);
    const y1 = Math.min(r.bottom, innerHeight);
    return [(x0 + x1) / 2, (y0 + y1) / 2] as Pt;
  });
}

/** A hash of the picture's pixels. */
const pixels = (page: Page) =>
  page.locator(CANVAS).evaluate((c: HTMLCanvasElement) => {
    const d = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data;
    let h = 0;
    for (let i = 0; i < d.length; i++) h = (h * 31 + d[i]) | 0;
    return [c.width, c.height, h];
  });

/** Waits until the sheet's scroll stops changing (a navigation pan ended). */
async function settled(page: Page): Promise<void> {
  let last = "";
  await expect
    .poll(async () => {
      const now = JSON.stringify(await sheet(page));
      const same = now === last;
      last = now;
      return same;
    })
    .toBe(true);
}

/** Ctrl-wheel at the canvas until the sheet zoom is `z` (± 0.5 %). */
async function setZoom(page: Page, z: number): Promise<void> {
  for (let i = 0; i < 6; i++) {
    const now = await zoom(page);
    if (Math.abs(now - z) < 0.005) return;
    const [x, y] = await centre(page, VIEW);
    await page.mouse.move(x, y);
    await page.keyboard.down("Control");
    // view.ts: Z · exp(−deltaY · 0.01)
    await page.mouse.wheel(0, -Math.log(z / now) / 0.01);
    await page.keyboard.up("Control");
    await expect.poll(() => zoom(page)).not.toBe(now);
  }
  expect(Math.abs((await zoom(page)) - z)).toBeLessThan(0.005);
}

/** /next on a phone, Paint running with a 640 × 400 picture at Paint zoom 2,
 * the sheet at zoom `z`, Paint's view scrolled away from its limits. */
async function setup(page: Page, z: number): Promise<CDPSession> {
  await page.goto(sheetUrl());
  await expect(page.locator("#world")).toHaveAttribute("style", /scale\(/);
  await page.locator(".railtoggle").click();
  await page.locator('[data-go="paint"]').click();
  await expect(win(page).locator(".demo-area")).toHaveAttribute(
    "data-host",
    "running",
  );
  await settled(page);

  await chooseMenu(page, "paint", "File", "New…");
  const dlg = win(page).locator(".paint-new");
  await dlg.getByLabel("640 × 400").check();
  await dlg.getByRole("button", { name: "OK" }).click();
  await chooseMenu(page, "paint", "View", "Zoom 2x");
  await expect(win(page).locator(".statusbar")).toContainText("2x");
  expect((await pixels(page)).slice(0, 2)).toEqual([640, 400]);

  await setZoom(page, z);
  await settled(page);
  // scrolled away from its limits (setup, not the input under test)
  await page.locator(VIEW).evaluate((v) => {
    v.scrollLeft = (v.scrollWidth - v.clientWidth) / 2;
    v.scrollTop = (v.scrollHeight - v.clientHeight) / 2;
  });
  return page.context().newCDPSession(page);
}

/** The canvas box, two frames on: Chromium sends a pointer move with the next frame. */
async function box(page: Page) {
  await page.evaluate(
    () =>
      new Promise((done) =>
        requestAnimationFrame(() => requestAnimationFrame(done)),
      ),
  );
  return (await page.locator(CANVAS).boundingBox())!;
}

/** Expects the picture to have moved (dx, dy) screen px, ± 2. */
function moved(
  b0: { x: number; y: number },
  b1: { x: number; y: number },
  dx: number,
  dy: number,
): void {
  const got = `${b1.x - b0.x}, ${b1.y - b0.y}`;
  expect(Math.abs(b1.x - b0.x - dx), `moved ${got}`).toBeLessThanOrEqual(2);
  expect(Math.abs(b1.y - b0.y - dy), `moved ${got}`).toBeLessThanOrEqual(2);
}

/** Two fingers at a and b move `n` × 10 screen px left from `from` px left. */
async function slide(
  cdp: CDPSession,
  a: Pt,
  b: Pt,
  from: number,
  n: number,
): Promise<void> {
  for (let i = 1; i <= n; i++) {
    const d = from + 10 * i;
    await touch(cdp, "touchMove", [
      [a[0] - d, a[1]],
      [b[0] - d, b[1]],
    ]);
  }
}

for (const z of [0.6, 1, 1.6]) {
  test(`R5.a at sheet zoom ${z * 100} %, two fingers 100 screen px left move the picture 100 ± 2 px left; pixels and the sheet stay`, async ({
    page,
  }) => {
    const cdp = await setup(page, z);
    // Paint's view clips the canvas: aim at the visible part of the view
    const [cx, cy] = await centre(page, VIEW);
    const box0 = await box(page);
    const px0 = await pixels(page);
    const s0 = await sheet(page);

    const a: Pt = [cx + 50, cy - 20];
    const b: Pt = [cx + 50, cy + 20];
    await touch(cdp, "touchStart", [a]);
    await touch(cdp, "touchStart", [a, b]);
    await slide(cdp, a, b, 0, 10);
    await touch(cdp, "touchEnd", []);

    moved(box0, await box(page), -100, 0);
    expect(await pixels(page), "the pixels did not change").toEqual(px0);
    expect(await sheet(page), "the sheet view did not move").toEqual(s0);
  });
}

test("R5 on a rotated Paint window, two fingers 100 px left move the picture 100 px left and not up or down", async ({
  page,
}) => {
  const cdp = await setup(page, 1);
  // a window turns while it swings; here it is held at 8° (setup)
  await win(page).evaluate((w) => {
    w.style.transform = w.style.transform.replace(
      /rotate\([^)]*\)/,
      "rotate(8deg)",
    );
  });
  const [cx, cy] = await centre(page, VIEW);
  const box0 = await box(page);
  const a: Pt = [cx + 50, cy - 20];
  const b: Pt = [cx + 50, cy + 20];
  await touch(cdp, "touchStart", [a]);
  await touch(cdp, "touchStart", [a, b]);
  await slide(cdp, a, b, 0, 10);
  await touch(cdp, "touchEnd", []);
  moved(box0, await box(page), -100, 0);
});

test("R5 the sheet zooms (ctrl-wheel) during a pan: the picture then follows the fingers at the new zoom", async ({
  page,
}) => {
  const cdp = await setup(page, 1);
  const [cx, cy] = await centre(page, VIEW);
  const a: Pt = [cx + 50, cy - 20];
  const b: Pt = [cx + 50, cy + 20];
  await touch(cdp, "touchStart", [a]);
  await touch(cdp, "touchStart", [a, b]);
  await slide(cdp, a, b, 0, 3);
  // the fingers stay down
  await setZoom(page, 1.6);
  const box1 = await box(page);
  await slide(cdp, a, b, 30, 10);
  moved(box1, await box(page), -100, 0);
  await touch(cdp, "touchEnd", []);
});
