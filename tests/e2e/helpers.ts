import { expect, test as base, type Page } from "@playwright/test";

/** Every test fails on a console error, page error or unhandled rejection. */
export const test = base.extend<{ errors: string[] }>({
  errors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on("console", (msg) => {
        if (msg.type() === "error") errors.push(`console: ${msg.text()}`);
      });
      page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
      await use(errors);
      expect(errors, "console errors and unhandled rejections").toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

/** Owner 2026-10-24: each card project item, with the lines its name takes
 * and whether its height is that of one line (the same item with a one-word
 * name, in the same place). Measured after the fonts load. */
export async function cardItemLines(
  page: Page,
): Promise<{ text: string; lines: number; oneLine: boolean }[]> {
  await page.evaluate(() => document.fonts.ready);
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>("#card nav [data-go]")].map(
      (b) => {
        const range = document.createRange();
        range.selectNodeContents(b.firstChild!);
        const tops = new Set(
          [...range.getClientRects()]
            .filter((r) => r.width > 0)
            .map((r) => Math.round(r.top)),
        );
        const one = b.cloneNode(true) as HTMLElement;
        one.firstChild!.textContent = "X ";
        b.after(one);
        const single = one.getBoundingClientRect().height;
        one.remove();
        return {
          text: b.textContent!.trim(),
          lines: tops.size,
          oneLine: Math.abs(b.getBoundingClientRect().height - single) < 0.5,
        };
      },
    ),
  );
}
