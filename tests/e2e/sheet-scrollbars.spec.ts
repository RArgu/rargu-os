// Spec 001 R5.b with classic (non-overlay) scrollbars, as on Windows or on
// macOS with "always show scroll bars". Chromium only: it draws them when
// --hide-scrollbars is dropped and the scroller's bars are styled; Firefox
// and WebKit here keep overlay scrollbars.
import { expect, test } from "./helpers";
import { sheet } from "./sheet-base";

test.use({
  viewport: { width: 1280, height: 500 },
  launchOptions: { ignoreDefaultArgs: ["--hide-scrollbars"] },
});

test("R5.b fit with classic scrollbars: the whole sheet is inside them", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "classic scrollbars: Chromium only");
  await page.goto(sheet());
  await expect(page.locator("#world")).toHaveAttribute("style", /scale\(/);
  // styled bars take room; scrollbar-width would turn the styling off
  await page.addStyleTag({
    content:
      "#vp { scrollbar-width: auto; } #vp::-webkit-scrollbar { width: 15px; height: 15px; background: #888; }",
  });
  const vp = page.locator("#vp");
  const bars = await vp.evaluate((vp: HTMLElement) => [
    vp.offsetWidth - vp.clientWidth,
    vp.offsetHeight - vp.clientHeight,
  ]);
  expect(bars, "classic scrollbars").toEqual([15, 15]);
  await page.click("#zFit");
  await expect(page.locator("#zPct")).not.toHaveText("100%");
  const [cw, ch] = await vp.evaluate((vp) => [vp.clientWidth, vp.clientHeight]);
  const box = (await page.locator("#world").boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(-0.5);
  expect(box.y).toBeGreaterThanOrEqual(-0.5);
  expect(box.x + box.width).toBeLessThanOrEqual(cw + 0.5);
  expect(box.y + box.height).toBeLessThanOrEqual(ch + 0.5);
});
