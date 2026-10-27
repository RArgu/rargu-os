// Spec 013 T10: the R20 transition table, one case per row (desktop rows
// here; the phone's row 3 is in compact-readme.spec.ts).
import type { Page } from "@playwright/test";
import { expect, test } from "./helpers";
import { sheet } from "./sheet-base";

const W = '[data-win="crawler"]';
const win = (page: Page) => page.locator(W);
const tab = (page: Page, name: string) => win(page).getByRole("tab", { name });
const expandBtn = (page: Page) => win(page).locator(".bar .expand");
const path = (page: Page) => new URL(page.url()).pathname;
const settled = (page: Page) =>
  expect
    .poll(() => page.evaluate(() => document.getAnimations().length))
    .toBe(0);
/** mode, expanded, path */
const state = async (page: Page) => ({
  mode: await win(page).getAttribute("data-mode"),
  expanded: await win(page).evaluate((w) => w.classList.contains("expanded")),
  path: path(page),
});
async function home(page: Page) {
  await page.goto(sheet());
  await page.locator('#card [data-go="crawler"]').click();
  await page.waitForTimeout(500);
}

test.describe("013 R20 transitions", () => {
  test("rows 1–3 (desktop): Read pushes /p/; Expand and Restore keep it", async ({
    page,
  }) => {
    await home(page);
    await tab(page, "Read").click(); // row 1
    expect(await state(page)).toEqual({
      mode: "read",
      expanded: false,
      path: "/p/crawler/",
    });
    await expect(tab(page, "Read")).toBeFocused();
    await expandBtn(page).click(); // row 2
    await settled(page);
    expect(await state(page)).toEqual({
      mode: "read",
      expanded: true,
      path: "/p/crawler/",
    });
    await expect(expandBtn(page)).toBeFocused();
    await expandBtn(page).click(); // row 3, desktop
    await settled(page);
    expect(await state(page)).toEqual({
      mode: "read",
      expanded: false,
      path: "/p/crawler/",
    });
    await expect(expandBtn(page)).toBeFocused();
  });

  test("row 4: another tab goes back to /, same expansion", async ({
    page,
  }) => {
    await home(page);
    await tab(page, "Read").click();
    await expandBtn(page).click();
    await settled(page);
    await tab(page, "Demo").click();
    await expect.poll(() => path(page)).toBe("/");
    expect(await state(page)).toEqual({
      mode: "demo",
      expanded: true,
      path: "/",
    });
    await expect(tab(page, "Demo")).toBeFocused();
  });

  test("rows 5, 7: Back gives the mode before Read, not expanded; Forward gives Read", async ({
    page,
  }) => {
    await home(page);
    await tab(page, "Read").click();
    await expandBtn(page).click();
    await settled(page);
    await page.goBack(); // row 5
    await settled(page);
    expect(await state(page)).toEqual({
      mode: "demo",
      expanded: false,
      path: "/",
    });
    await expect(win(page)).toBeFocused();
    await page.goForward(); // row 7
    await expect.poll(() => path(page)).toBe("/p/crawler/");
    expect(await state(page)).toEqual({
      mode: "read",
      expanded: false,
      path: "/p/crawler/",
    });
    await expect(tab(page, "Read")).toBeFocused();
  });

  test("row 6: Expand and Restore outside Read keep the URL", async ({
    page,
  }) => {
    await home(page);
    await expandBtn(page).click();
    await settled(page);
    expect(path(page)).toBe("/");
    await expandBtn(page).click();
    await settled(page);
    expect(await state(page)).toEqual({
      mode: "demo",
      expanded: false,
      path: "/",
    });
  });

  test("rows 8–10: a direct entry; Restore replaces the URL with / and centres the window; a tab then pushes nothing", async ({
    page,
  }) => {
    await page.goto("/p/crawler/"); // row 8
    expect(await state(page)).toEqual({
      mode: "read",
      expanded: true,
      path: "/p/crawler/",
    });
    await expect(win(page).locator(".r-title")).toBeFocused();
    const length = await page.evaluate(() => history.length);
    await expandBtn(page).click(); // row 9
    await settled(page);
    expect(await state(page)).toEqual({
      mode: "read",
      expanded: false,
      path: "/",
    });
    await expect(expandBtn(page)).toBeFocused();
    const r = (await win(page).boundingBox())!;
    expect(r.x).toBeGreaterThanOrEqual(0);
    expect(r.y).toBeGreaterThanOrEqual(0);
    expect(r.x + r.width).toBeLessThanOrEqual(1281);
    expect(r.y + r.height).toBeLessThanOrEqual(801);
    await tab(page, "Demo").click(); // row 10
    expect(await state(page)).toEqual({
      mode: "demo",
      expanded: false,
      path: "/",
    });
    expect(await page.evaluate(() => history.length)).toBe(length);
  });

  test("row 11: Back from a direct entry leaves the site", async ({ page }) => {
    await page.goto("about:blank");
    await page.goto("/p/crawler/");
    await page.goBack();
    await expect.poll(() => page.url()).toBe("about:blank");
  });

  test("the Read panel keeps its scroll position per window", async ({
    page,
  }) => {
    await home(page);
    await tab(page, "Read").click();
    const area = win(page).locator(".read-area");
    await area.evaluate((a) => (a.scrollTop = 300));
    await tab(page, "Demo").click();
    await tab(page, "Read").click();
    expect(await area.evaluate((a) => a.scrollTop)).toBe(300);
  });
});
