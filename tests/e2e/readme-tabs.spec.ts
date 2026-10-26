// Spec 013 T3: the Demo · Try · Read tabs (R1), in the e2e build (fixture
// write-ups for the crawler and insider windows; a fixture tool registers
// through `__registerTool`).
import type { Page } from "@playwright/test";
import { expect, test } from "./helpers";
import { sheet } from "./sheet-base";

const win = (page: Page, id: string) => page.locator(`[data-win="${id}"]`);
const tab = (page: Page, id: string, name: string) =>
  win(page, id).getByRole("tab", { name });
const scroll = (page: Page) =>
  page.evaluate(() => {
    const vp = document.querySelector("#vp")!;
    return [vp.scrollLeft, vp.scrollTop];
  });
const box = (page: Page, id: string) =>
  win(page, id).evaluate((w) => (w as HTMLElement).style.transform);

test.describe("013 R1 tabs", () => {
  test("R1.a: Read selects its panel; the window does not move", async ({
    page,
  }) => {
    await page.goto(sheet());
    const before = await box(page, "crawler");
    await tab(page, "crawler", "Read").click();
    const read = tab(page, "crawler", "Read");
    const demo = tab(page, "crawler", "Demo");
    await expect(read).toHaveAttribute("aria-selected", "true");
    await expect(read).toHaveAttribute("tabindex", "0");
    await expect(demo).toHaveAttribute("aria-selected", "false");
    await expect(demo).toHaveAttribute("tabindex", "-1");
    const panel = win(page, "crawler").locator(".read-area");
    await expect(panel).toBeVisible();
    await expect(panel).toHaveAttribute("role", "tabpanel");
    await expect(panel).toHaveAttribute("aria-labelledby", "crawler-tab-read");
    await expect(read).toHaveAttribute("aria-controls", "crawler-read");
    await expect(win(page, "crawler").locator(".demo-area")).toBeHidden();
    await expect(win(page, "crawler").locator(".about")).toBeHidden();
    expect(await box(page, "crawler")).toBe(before);
    await demo.click();
    await expect(win(page, "crawler").locator(".demo-area")).toBeVisible();
    await expect(panel).toBeHidden();
  });

  test("R1.b: arrows, Home and End move the selection; the sheet does not pan", async ({
    page,
  }) => {
    await page.goto(sheet());
    await page.evaluate(() =>
      (
        window as unknown as { __registerTool(id: string): void }
      ).__registerTool("crawler"),
    );
    const names = ["Demo", "Try", "Read"];
    await expect(win(page, "crawler").getByRole("tab")).toHaveText(names);
    await tab(page, "crawler", "Demo").focus();
    const at = await scroll(page);
    const focused = () =>
      page.evaluate(() => document.activeElement?.textContent);
    for (const [key, want] of [
      ["ArrowRight", "Try"],
      ["ArrowRight", "Read"],
      ["ArrowRight", "Demo"],
      ["ArrowLeft", "Read"],
      ["Home", "Demo"],
      ["End", "Read"],
    ]) {
      await page.keyboard.press(key);
      expect(await focused()).toBe(want);
      await expect(tab(page, "crawler", want)).toHaveAttribute(
        "aria-selected",
        "true",
      );
    }
    expect(await scroll(page)).toEqual(at);
    // the tool's panel
    await tab(page, "crawler", "Try").click();
    await expect(win(page, "crawler").locator(".try-area")).toBeVisible();
    await expect(win(page, "crawler").locator(".try-area")).toHaveAttribute(
      "aria-labelledby",
      "crawler-tab-try",
    );
  });

  test("R1.c: a one-mode window has no strip; Quick tools have none", async ({
    page,
  }) => {
    await page.goto(sheet());
    for (const id of ["castlesiege", "castlewars", "pentimento"])
      await expect(win(page, id).locator(".tabs")).toBeHidden();
    await expect(win(page, "crawler").locator(".tabs")).toBeVisible();
    for (const id of ["paint", "music", "notes"])
      await expect(win(page, id).locator(".tabs")).toHaveCount(0);
    // CastleSiege's start control keeps its own role (no tab panel)
    await expect(
      win(page, "castlesiege").locator(".demo-area"),
    ).not.toHaveAttribute("role", "tabpanel");
  });

  test("a tab press does not drag the window", async ({ page }) => {
    await page.goto(sheet());
    const before = await box(page, "crawler");
    const t = tab(page, "crawler", "Read");
    const b = (await t.boundingBox())!;
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    await page.mouse.move(b.x + 120, b.y + 80, { steps: 5 });
    await page.mouse.up();
    expect(await box(page, "crawler")).toBe(before);
  });
});
