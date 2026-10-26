// Spec 013 R3.b: a touch drag in the Read panel scrolls the panel and does
// not pan the sheet (phone emulation, 390 × 844, touch).
import { expect, test } from "./helpers";
import { sheet } from "./sheet-base";

test("R3.b: a touch drag scrolls the Read panel, not the sheet", async ({
  page,
}) => {
  await page.goto(sheet());
  await page.evaluate(() =>
    document.querySelector<HTMLElement>('#card [data-go="crawler"]')!.click(),
  );
  await page.waitForTimeout(500);
  await page
    .locator('[data-win="crawler"]')
    .getByRole("tab", { name: "Read" })
    .tap();
  const area = page.locator('[data-win="crawler"] .read-area');
  await expect(area).toBeVisible();
  const vp = () =>
    page.evaluate(() => {
      const v = document.querySelector("#vp")!;
      return [v.scrollLeft, v.scrollTop];
    });
  const at = await vp();
  const b = (await area.boundingBox())!;
  const x = b.x + b.width / 2;
  const y0 = Math.min(b.y + b.height - 20, 800);
  const cdp = await page.context().newCDPSession(page);
  const touch = (type: "touchStart" | "touchMove" | "touchEnd", y?: number) =>
    cdp.send("Input.dispatchTouchEvent", {
      type,
      touchPoints: y === undefined ? [] : [{ x, y }],
    });
  await touch("touchStart", y0);
  for (let i = 1; i <= 8; i++) await touch("touchMove", y0 - i * 25);
  await touch("touchEnd");
  await expect.poll(() => area.evaluate((a) => a.scrollTop)).toBeGreaterThan(0);
  expect(await vp()).toEqual(at);
});

test("R2.a, R3.b: on a phone Read expands to the viewport; Restore shows Demo again", async ({
  page,
}) => {
  await page.goto(sheet());
  const w = page.locator('[data-win="crawler"]');
  await page.evaluate(() =>
    document.querySelector<HTMLElement>('#card [data-go="crawler"]')!.click(),
  );
  await page.waitForTimeout(500);
  await w.getByRole("tab", { name: "Read" }).tap();
  await expect
    .poll(() => page.evaluate(() => document.getAnimations().length))
    .toBe(0);
  const r = await w.evaluate((e) => {
    const b = e.getBoundingClientRect();
    return [b.left, b.top, b.width, b.height].map(Math.round);
  });
  expect(r).toEqual([0, 0, 390, 844]);
  await w.locator(".bar .expand").tap();
  await expect(page.locator("#lift")).toBeHidden();
  await expect(w.getByRole("tab", { name: "Demo" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(w.locator(".demo-area")).toBeVisible();
});
