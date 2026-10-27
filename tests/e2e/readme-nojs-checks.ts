// Spec 013 R13.a checks, shared by the desktop and phone files.
import type { expect as Expect, test as Test } from "./helpers";

const SECTIONS = [
  "Overview",
  "Uses",
  "How it works",
  "Challenges",
  "Results",
  "Origin",
];

export function checks(
  test: typeof Test,
  expect: typeof Expect,
  sheet: () => string,
): void {
  test("R13.a: /p/crawler/ shows the write-up as a page; every section is visible by page scroll", async ({
    page,
  }) => {
    await page.goto("/p/crawler/");
    const w = page.locator('[data-win="crawler"]');
    await expect(w.locator(".r-title")).toBeVisible();
    for (const name of SECTIONS) {
      const h = w.locator(".r-body h2", { hasText: name });
      await h.scrollIntoViewIfNeeded();
      await expect(h, name).toBeVisible();
      expect(await h.evaluate((e) => e.getClientRects().length), name).toBe(1);
    }
    await expect(w.locator(".dg")).toBeVisible();
    // only that window, no card, no sheet scroller
    await expect(page.locator('[data-win="insider"]')).toBeHidden();
    await expect(page.locator("#card")).toBeHidden();
    // the page scrolls, not a fixed box
    const scrolled = await page.evaluate(
      () => document.scrollingElement!.scrollTop,
    );
    expect(scrolled).toBeGreaterThan(0);
    // no sideways scroll
    expect(
      await page.evaluate(
        () =>
          document.scrollingElement!.scrollWidth <=
          document.scrollingElement!.clientWidth,
      ),
    ).toBe(true);
  });

  test("R13.a: on / a window with a write-up links to its page", async ({
    page,
  }) => {
    await page.goto(sheet());
    const a = page.locator('[data-win="crawler"] .nojs-read');
    await expect(a).toHaveAttribute("href", "/p/crawler/");
    await expect(a).toHaveText("Read the write-up");
    await expect(page.locator('[data-win="crawler"] .read-area')).toBeHidden();
    await expect(
      page.locator('[data-win="castlesiege"] .nojs-read'),
    ).toHaveCount(0);
  });
}
