// Spec 013 T9: the /p/<id>/ pages in the e2e build (R12; the fixture
// write-ups), served by `vite preview`. The Worker's 404 for /p/castlesiege/
// is in routing.spec.ts.
import { expect, test } from "./helpers";

test("R12.a, R4.c: /p/crawler/ loads its assets, opens the window expanded in Read, focus on the title", async ({
  page,
}) => {
  const bad: string[] = [];
  page.on("response", (r) => {
    if (r.status() >= 400) bad.push(`${r.status()} ${r.url()}`);
  });
  await page.goto("/p/crawler/");
  await expect(page).toHaveTitle("Generalized Focused Web Crawler · RArgu OS");
  const win = page.locator('[data-win="crawler"]');
  await expect(page.locator("#lift")).toBeVisible();
  await expect(page.locator("#lift [data-win]")).toHaveCount(1);
  await expect(win).toHaveClass(/expanded/);
  await expect(win.getByRole("tab", { name: "Read" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(win.locator(".r-title")).toBeFocused();
  const r = await win.evaluate((e) => {
    const b = e.getBoundingClientRect();
    return [b.left, b.top, b.width, b.height].map(Math.round);
  });
  expect(r).toEqual([0, 0, 1280, 800]);
  // every script, style, font and image answered
  await page.waitForLoadState("networkidle");
  expect(bad).toEqual([]);
  await win.locator(".bar .expand").click();
  await expect(page.locator("#lift")).toBeHidden();
  await expect(win.locator(".bar .expand")).toBeFocused();
});

test("R12: the insider page has its own title and canonical URL", async ({
  page,
}) => {
  await page.goto("/p/insider/");
  await expect(page).toHaveTitle(
    "Insider Trading Detection on Polymarket · RArgu OS",
  );
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    "https://rargu.dev/p/insider/",
  );
  await expect(page.locator('[data-win="insider"]')).toHaveClass(/expanded/);
});

test("R13: with JavaScript, / has no link to the write-up page", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".nojs-read")).toHaveCount(0);
});
