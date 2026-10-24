// Spec 004 T4 (R4, R13): Paint on the sheet starts with a blank 320 × 200
// canvas; Save, Save As and Export download a PNG (decoded here in the page,
// pixels checked); Open… loads a PNG up to 800 × 800, and a larger or invalid
// file shows Paint's error and keeps the picture. The two-finger pan (R5) is
// in compact-quick-tools-paint.spec.ts (the mobile project runs only
// "compact" files). Real clicks, keys and the mouse; downloads and the file
// picker through Playwright's `download` and `filechooser` events.
import { readFile } from "node:fs/promises";
import type { Download, Page } from "@playwright/test";
import { expect, test } from "./helpers";
import { chooseMenu } from "./host-helpers";
import { sheet } from "./sheet-base";

const FIX = "tests/fixtures/quick-tools";
const win = (page: Page) => page.locator('[data-win="paint"]');
const panel = (page: Page) => win(page).locator('.host-panel[role="dialog"]');
const canvas = (page: Page) => win(page).locator(".paint-canvas");
// the default theme's palette slot 8, #ff004d
const RED = [255, 0, 77, 255];
const WHITE = [255, 255, 255, 255];

async function start(page: Page): Promise<void> {
  // the card's move lands at once
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(sheet());
  await page.locator('.apps [data-go="paint"]').click();
  await expect(win(page).locator(".demo-area")).toHaveAttribute(
    "data-host",
    "running",
  );
}

/** Width, height and the RGBA of each point of Paint's canvas. */
function shown(page: Page, pts: [number, number][]) {
  return canvas(page).evaluate((c: HTMLCanvasElement, pts) => {
    const ctx = c.getContext("2d")!;
    return [
      c.width,
      c.height,
      ...pts.map(([x, y]) => [...ctx.getImageData(x, y, 1, 1).data]),
    ];
  }, pts);
}

/** Decodes a downloaded PNG in the page: width, height and the RGBA of each point. */
async function decode(page: Page, d: Download, pts: [number, number][]) {
  const bytes = await readFile(await d.path());
  expect([...bytes.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
  return page.evaluate(
    async ({ b64, pts }) => {
      const bin = Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
      const bmp = await createImageBitmap(
        new Blob([bin], { type: "image/png" }),
      );
      const c = new OffscreenCanvas(bmp.width, bmp.height);
      const ctx = c.getContext("2d")!;
      ctx.drawImage(bmp, 0, 0);
      return [
        bmp.width,
        bmp.height,
        ...pts.map(([x, y]) => [...ctx.getImageData(x, y, 1, 1).data]),
      ];
    },
    { b64: bytes.toString("base64"), pts },
  );
}

/** A whole screen px inside picture pixel (x, y) (pixels are ≥ 1 screen px):
 * Firefox and WebKit round mouse positions to whole px. */
async function at(page: Page, x: number, y: number): Promise<[number, number]> {
  const r = (await canvas(page).boundingBox())!;
  const [w, h] = (await shown(page, [])) as number[];
  return [
    Math.ceil(r.x + (x * r.width) / w),
    Math.ceil(r.y + (y * r.height) / h),
  ];
}

/** Answers the host's Save As prompt with `name`. */
async function answer(page: Page, name: string): Promise<void> {
  const input = panel(page).locator("input");
  await expect(input).toBeFocused();
  await input.fill(name);
  await panel(page).getByRole("button", { name: "OK" }).click();
}

/** File → Save (chooseMenu matches "Save As…" too). */
async function save(page: Page): Promise<void> {
  await chooseMenu(page, "paint", "File");
  await win(page)
    .locator(".menu .menu-item")
    .filter({ has: page.locator(".menu-label", { hasText: /^Save$/ }) })
    .click();
}

async function openFile(page: Page, file: string): Promise<void> {
  const chooser = page.waitForEvent("filechooser");
  await chooseMenu(page, "paint", "File", "Open…");
  await (await chooser).setFiles(`${FIX}/${file}`);
}

/** Paint's error panel says `text`; OK closes it. */
async function error(page: Page, text: RegExp): Promise<void> {
  await expect(panel(page)).toContainText(text);
  await panel(page).getByRole("button", { name: "OK" }).click();
  await expect(panel(page)).toHaveCount(0);
}

test("R4 Paint opens with a blank white 320 × 200 canvas @live", async ({
  page,
}) => {
  await start(page);
  await expect
    .poll(() =>
      shown(page, [
        [0, 0],
        [319, 199],
        [160, 100],
      ]),
    )
    .toEqual([320, 200, WHITE, WHITE, WHITE]);
  await expect(win(page).locator(".bar .t")).toHaveText(/^Paint - untitled/);
});

test("R4.a a red stroke, Save As a.png: a 320 × 200 PNG, red at (60, 20), white at (60, 100); Save and Export download it again", async ({
  page,
}) => {
  await start(page);
  await win(page).locator(".paint-swatch").nth(8).click();
  const [x0, y0] = await at(page, 20, 20);
  const [x1, y1] = await at(page, 100, 20);
  await page.mouse.move(x0, y0);
  await page.mouse.down();
  await page.mouse.move(x1, y1, { steps: 8 });
  await page.mouse.up();
  await expect.poll(() => shown(page, [[60, 20]])).toEqual([320, 200, RED]);

  const pts: [number, number][] = [
    [60, 20],
    [60, 100],
  ];
  const want = [320, 200, RED, WHITE];
  await chooseMenu(page, "paint", "File", "Save As…");
  let d = page.waitForEvent("download");
  await answer(page, "a.png");
  let got = await d;
  expect(got.suggestedFilename()).toBe("a.png");
  expect(await decode(page, got, pts)).toEqual(want);

  d = page.waitForEvent("download");
  await save(page);
  got = await d;
  expect(got.suggestedFilename()).toBe("a.png");
  expect(await decode(page, got, pts)).toEqual(want);

  d = page.waitForEvent("download");
  await chooseMenu(page, "paint", "File", "Export to Downloads");
  got = await d;
  expect(got.suggestedFilename()).toBe("a.png");
  expect(await decode(page, got, pts)).toEqual(want);
});

test("R4 Save of a new picture asks for a name and downloads a .png; Export of a new picture downloads untitled.png", async ({
  page,
}) => {
  await start(page);
  let d = page.waitForEvent("download");
  await chooseMenu(page, "paint", "File", "Export to Downloads");
  let got = await d;
  expect(got.suggestedFilename()).toBe("untitled.png");
  expect(await decode(page, got, [[0, 0]])).toEqual([320, 200, WHITE]);

  await save(page);
  d = page.waitForEvent("download");
  await answer(page, "b");
  got = await d;
  expect(got.suggestedFilename()).toBe("b.png");
  expect(await decode(page, got, [[0, 0]])).toEqual([320, 200, WHITE]);
});

test("R13 Export with downloads blocked shows the Download link, which downloads the PNG", async ({
  page,
}) => {
  await start(page);
  await page.evaluate(() =>
    Object.assign(globalThis, { __hostBlockDownloads: true }),
  );
  await chooseMenu(page, "paint", "File", "Export to Downloads");
  const link = win(page).getByRole("link", { name: "Download untitled.png" });
  await expect(link).toBeVisible();
  const d = page.waitForEvent("download");
  await link.click();
  const got = await d;
  expect(got.suggestedFilename()).toBe("untitled.png");
  expect(await decode(page, got, [[0, 0]])).toEqual([320, 200, WHITE]);
});

test("R4 Open… loads a small PNG and an 800 × 800 PNG; 801 × 800 and an invalid file show Paint's error and keep the picture", async ({
  page,
}) => {
  await start(page);
  await openFile(page, "small.png");
  await expect
    .poll(() =>
      shown(page, [
        [2, 1],
        [0, 0],
      ]),
    )
    .toEqual([8, 5, [0, 255, 0, 255], [0, 0, 255, 255]]);
  await expect(win(page).locator(".bar .t")).toHaveText(/^Paint - small\.png/);

  await openFile(page, "800x800.png");
  const big: [number, number][] = [
    [0, 0],
    [799, 799],
  ];
  const kept = [800, 800, [0, 128, 0, 255], [255, 0, 0, 255]];
  await expect.poll(() => shown(page, big)).toEqual(kept);

  await openFile(page, "801x800.png");
  await error(page, /Could not open[\s\S]*800x800/);
  expect(await shown(page, big)).toEqual(kept);
  await expect(win(page).locator(".bar .t")).toHaveText(
    /^Paint - 800x800\.png/,
  );

  await openFile(page, "invalid.png");
  await error(page, /Could not open/);
  expect(await shown(page, big)).toEqual(kept);
  await expect(win(page).locator(".bar .t")).toHaveText(
    /^Paint - 800x800\.png/,
  );
});
