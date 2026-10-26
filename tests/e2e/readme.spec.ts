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
