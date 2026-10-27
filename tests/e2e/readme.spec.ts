// Spec 013: the Read panel and its diagram, in the e2e build (fixture
// write-ups from tests/fixtures/writeups).
import { expect, test } from "./helpers";
import { sheet } from "./sheet-base";

test.describe("013 R9 diagram", () => {
  test("R9.a: no sideways scroll in a 390 px wide window", async ({ page }) => {
    await page.goto(sheet());
    const fits = await page.evaluate(() => {
      const w = document.querySelector<HTMLElement>('[data-win="crawler"]')!;
      w.style.width = "390px";
      w.querySelector<HTMLElement>(".read-area")!.hidden = false;
      const fig = w.querySelector<HTMLElement>(".dg")!;
      const tier = fig.querySelectorAll<HTMLElement>(".dg-boxes")[4];
      return {
        scroll: fig.scrollWidth,
        client: fig.clientWidth,
        columns: getComputedStyle(tier).gridTemplateColumns.split(" ").length,
      };
    });
    expect(fits.scroll).toBe(fits.client);
    // the four gates wrap to two columns
    expect(fits.columns).toBe(2);
  });
});

const vpScroll = (page: import("@playwright/test").Page) =>
  page.evaluate(() => {
    const vp = document.querySelector("#vp")!;
    return [vp.scrollLeft, vp.scrollTop];
  });
/** Opens the crawler's Read panel at the start view; returns its locator. */
async function openRead(page: import("@playwright/test").Page) {
  await page.goto(sheet());
  await page.locator('#card [data-go="crawler"]').click();
  await page.waitForTimeout(500); // the card's navigation pan (320 ms)
  await page
    .locator('[data-win="crawler"]')
    .getByRole("tab", { name: "Read" })
    .click();
  const area = page.locator('[data-win="crawler"] .read-area');
  await expect(area).toBeVisible();
  return area;
}
const panelTop = (area: import("@playwright/test").Locator) =>
  area.evaluate((a) => a.scrollTop);
const toEnd = (area: import("@playwright/test").Locator) =>
  area.evaluate((a) => (a.scrollTop = a.scrollHeight));

test.describe("013 R3 the Read panel owns its input", () => {
  test("R3.a: the wheel scrolls the panel, not the sheet, also at its end", async ({
    page,
  }) => {
    const area = await openRead(page);
    const at = await vpScroll(page);
    await area.hover();
    await page.mouse.wheel(0, 300);
    await expect.poll(() => panelTop(area)).toBeGreaterThan(0);
    expect(await vpScroll(page)).toEqual(at);
    await toEnd(area);
    await page.mouse.wheel(0, 600);
    await page.waitForTimeout(300);
    expect(await vpScroll(page)).toEqual(at);
  });

  test("R3.c: keys in the panel scroll it and never pan the sheet", async ({
    page,
  }) => {
    const area = await openRead(page);
    const at = await vpScroll(page);
    await area.focus();
    for (const key of ["ArrowDown", "PageDown", "Space", "End"]) {
      const before = await panelTop(area);
      await page.keyboard.press(key);
      await expect.poll(() => panelTop(area)).toBeGreaterThan(before);
      expect(await vpScroll(page), key).toEqual(at);
    }
    // at the end
    for (const key of ["ArrowDown", "ArrowRight", "PageDown", "Space", "End"]) {
      await page.keyboard.press(key);
      await page.waitForTimeout(100);
      expect(await vpScroll(page), `${key} at the end`).toEqual(at);
    }
  });
});

test.describe("013 R8 section nav", () => {
  test("R8.a: the section at the top is marked; a nav link scrolls only the panel", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    const area = await openRead(page);
    const nav = area.locator(".r-nav");
    await expect(nav.getByRole("link", { name: "Overview" })).toHaveAttribute(
      "aria-current",
      "true",
    );
    const at = await vpScroll(page);
    await nav.getByRole("link", { name: "Challenges" }).click();
    await expect(nav.getByRole("link", { name: "Challenges" })).toHaveAttribute(
      "aria-current",
      "true",
    );
    await expect(nav.locator("[aria-current]")).toHaveCount(1);
    expect(await vpScroll(page)).toEqual(at);
    expect(page.url()).not.toContain("#");
    // scrolled by hand: the heading under the nav is the current one
    await area.evaluate((a) => {
      const h = a.querySelector<HTMLElement>("#crawler-sec-uses")!;
      const nav = a.querySelector<HTMLElement>(".r-nav")!;
      a.scrollTop = h.offsetTop - nav.offsetHeight;
    });
    await expect(nav.getByRole("link", { name: "Uses" })).toHaveAttribute(
      "aria-current",
      "true",
    );
    await toEnd(area);
    await expect(nav.getByRole("link", { name: "Origin" })).toHaveAttribute(
      "aria-current",
      "true",
    );
  });
});

test("R8: expanded at 1280 × 800 the nav is a left column beside a text column of at most 68 ch", async ({
  page,
}) => {
  const area = await openRead(page);
  await page.locator('[data-win="crawler"] .bar .expand').click();
  await expect
    .poll(() => page.evaluate(() => document.getAnimations().length))
    .toBe(0);
  const r = await area.evaluate((a) => {
    const nav = a.querySelector(".r-nav")!.getBoundingClientRect();
    const body = a.querySelector<HTMLElement>(".r-body")!;
    const ch = parseFloat(getComputedStyle(body).fontSize) * 0.5;
    return {
      beside: nav.right <= body.getBoundingClientRect().left,
      width: body.getBoundingClientRect().width,
      // 68 ch of the body font, measured with a 0 glyph
      max: (() => {
        const s = document.createElement("span");
        s.textContent = "0".repeat(68);
        body.append(s);
        const w = s.getBoundingClientRect().width;
        s.remove();
        return w + ch;
      })(),
    };
  });
  expect(r.beside).toBe(true);
  expect(r.width).toBeLessThanOrEqual(r.max);
});
