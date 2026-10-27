// Spec 014 R4, R5, R9: shared checks of the stack chips in the browser, for
// the desktop and phone files. Expected backgrounds come from the colour
// table and the tint (Node side); the page's computed styles must match.
import type { Page } from "@playwright/test";
import type { expect as Expect, test as Test } from "./helpers";
import {
  chipColours,
  contrast,
  loadColours,
} from "../../scripts/stack-colours.ts";

const NEUTRAL = { light: "#ffe3cf", dark: "#2a3563" }; // --chip in sheet.css
const all = chipColours(loadColours());
const want = (label: string, theme: "light" | "dark") =>
  (all.get(label) ?? NEUTRAL)[theme];

/** Visible chips in `scope`: label, background and text colour as hex. */
const read = (page: Page, scope: string) =>
  page.evaluate((scope) => {
    const hex = (c: string) => {
      const m = c.match(/\d+(\.\d+)?/g)!.map(Number);
      return (
        "#" +
        m
          .slice(0, 3)
          .map((x) => x.toString(16).padStart(2, "0"))
          .join("")
      );
    };
    return [...document.querySelectorAll<HTMLElement>(`${scope} .chip`)]
      .filter((c) => c.getClientRects().length > 0)
      .map((c) => {
        const s = getComputedStyle(c);
        return {
          label: c.textContent!,
          bg: hex(s.backgroundColor),
          fg: hex(s.color),
        };
      });
  }, scope);

export async function expectChips(
  page: Page,
  expect: typeof Expect,
  scope: string,
  theme: "light" | "dark",
): Promise<number> {
  // after emulateMedia the styles change at the next style pass: poll
  await expect
    .poll(async () => {
      const c = await read(page, scope);
      return c.length > 0 && c.every((x) => x.bg === want(x.label, theme));
    })
    .toBe(true);
  const chips = await read(page, scope);
  for (const c of chips)
    expect(contrast(c.fg, c.bg), `${theme} ${c.label}`).toBeGreaterThanOrEqual(
      4.5,
    );
  return chips.length;
}

export function checks(
  test: typeof Test,
  expect: typeof Expect,
  sheet: () => string,
) {
  test("R4.a, R5.a: every window chip, light → dark → light with no reload", async ({
    page,
  }) => {
    await page.goto(sheet());
    const n = await expectChips(page, expect, "[data-win]", "light");
    expect(n).toBeGreaterThanOrEqual(30);
    await page.emulateMedia({ colorScheme: "dark" });
    await expectChips(page, expect, "[data-win]", "dark");
    await page.emulateMedia({ colorScheme: "light" });
    await expectChips(page, expect, "[data-win]", "light");
  });

  test("R5.a: the Read panel's chips, both themes", async ({ page }) => {
    await page.goto("/p/crawler/");
    const scope = '[data-win="crawler"] .read-area';
    expect(await expectChips(page, expect, scope, "light")).toBe(7);
    await page.emulateMedia({ colorScheme: "dark" });
    await expectChips(page, expect, scope, "dark");
  });

  test("R9.a: printed from the dark theme, chips have no background, black text and a border", async ({
    page,
  }) => {
    await page.goto(sheet());
    await page.emulateMedia({ media: "print", colorScheme: "dark" });
    const s = await page
      .locator('[data-win="castlesiege"] .chip')
      .first()
      .evaluate((c) => {
        const x = getComputedStyle(c);
        return [x.backgroundColor, x.color, x.borderTopWidth, x.borderTopStyle];
      });
    expect(s).toEqual(["rgba(0, 0, 0, 0)", "rgb(0, 0, 0)", "1px", "solid"]);
  });
}

export function noJsChecks(test: typeof Test, expect: typeof Expect) {
  test("R5.a: /p/crawler/ without JavaScript: chips in both themes", async ({
    page,
  }) => {
    await page.goto("/p/crawler/");
    const scope = '[data-win="crawler"] .read-area';
    expect(await expectChips(page, expect, scope, "light")).toBe(7);
    await page.emulateMedia({ colorScheme: "dark" });
    await expectChips(page, expect, scope, "dark");
  });
}
