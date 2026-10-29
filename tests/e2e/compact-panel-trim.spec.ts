// Spec 015 R2.b on the phone: at 390 × 844 and 320 × 568, light and dark, the
// folded bar and the opened panel fit the screen width, with no wrapped
// project item or button; R4.b: the open panel's links are a 2 x 2 grid.
import type { Page } from "@playwright/test";
import { expect, test } from "./helpers";
import { sheet } from "./sheet-base";

const fit = (page: Page) =>
  page.evaluate(() => {
    const rail = document.querySelector<HTMLElement>("#card")!;
    const r = rail.getBoundingClientRect();
    // each text node on one line box, the nodes side by side (name and label)
    const oneLine = (el: Element) => {
      const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      const boxes: DOMRect[] = [];
      for (let n = walk.nextNode(); n; n = walk.nextNode()) {
        if (!n.textContent!.trim()) continue;
        const range = document.createRange();
        range.selectNodeContents(n);
        const rects = [...range.getClientRects()].filter((x) => x.width > 0);
        if (rects.length > 1) return false;
        boxes.push(...rects);
      }
      return boxes.every((b) =>
        boxes.every((c) => b.top < c.bottom && c.top < b.bottom),
      );
    };
    const cta = [...rail.querySelectorAll<HTMLElement>(".cta .btn")]
      .filter((e) => e.getClientRects().length)
      .map((e) => {
        const b = e.getBoundingClientRect();
        return {
          t: e.textContent!.trim(),
          top: b.top,
          left: b.left,
          w: b.width,
        };
      });
    return {
      cta,
      left: r.left,
      right: r.right,
      vw: document.documentElement.clientWidth,
      scroll: rail.scrollWidth - rail.clientWidth,
      wrapped: [
        ...rail.querySelectorAll<HTMLElement>("nav.index button, .cta .btn"),
      ]
        .filter((e) => e.getClientRects().length && !oneLine(e))
        .map((e) => e.textContent),
    };
  });

for (const [w, h] of [
  [390, 844],
  [320, 568],
] as const)
  for (const dark of [false, true])
    test(`015 R2.b (${dark ? "dark" : "light"}) at ${w} × ${h} the folded bar and the open panel fit the width`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: w, height: h });
      await page.emulateMedia({ colorScheme: dark ? "dark" : "light" });
      await page.goto(sheet());
      const toggle = page.locator("#card button[aria-expanded]");
      await expect(toggle).toBeVisible();
      for (const state of ["folded", "open"]) {
        if (state === "open") {
          await toggle.tap();
          await expect(page.locator("#card a[data-mail]")).toBeVisible();
        }
        const f = await fit(page);
        expect(f.left, state).toBeGreaterThanOrEqual(0);
        expect(f.right, state).toBeLessThanOrEqual(f.vw + 0.5);
        expect(f.scroll, state).toBeLessThanOrEqual(0);
        expect(f.wrapped, state).toEqual([]);
        if (state === "open") {
          const [a, b, c, d] = f.cta;
          expect(f.cta.map((x) => x.t)).toEqual([
            "Resume ↗",
            "GitHub",
            "LinkedIn",
            "Email",
          ]);
          expect(
            Math.abs(a.top - b.top) + Math.abs(c.top - d.top),
          ).toBeLessThanOrEqual(1);
          expect(c.top).toBeGreaterThan(a.top);
          expect(
            Math.abs(a.left - c.left) + Math.abs(b.left - d.left),
          ).toBeLessThanOrEqual(1);
          for (const x of f.cta) expect(x.w, x.t).toBeCloseTo(a.w, 0);
        }
      }
    });
