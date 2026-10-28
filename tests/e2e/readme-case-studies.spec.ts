// Spec 013 T12: the insider case studies (R18) and the write-ups' network use
// (R16), in the e2e build (fixture write-ups and case studies).
import type { Page } from "@playwright/test";
import { expect, test } from "./helpers";
import { sheet } from "./sheet-base";

const W = '[data-win="insider"]';
const JSON_PATH = "/p/insider/case-studies.json";
async function openOrigin(page: Page) {
  await page.locator(W).getByRole("tab", { name: "Read" }).click();
  await page
    .locator(`${W} .r-nav`)
    .getByRole("link", { name: "Origin" })
    .click();
}

test("R18.a: the notice comes first; the cases load once when Origin is in view", async ({
  page,
}) => {
  const asked: string[] = [];
  page.on("request", (r) => {
    if (r.url().endsWith(JSON_PATH)) asked.push(r.url());
  });
  await page.goto(sheet());
  await page.locator('#card [data-go="insider"]').click();
  await page.locator(W).getByRole("tab", { name: "Read" }).click();
  await page.waitForTimeout(300);
  expect(asked, "not before Origin is in view").toEqual([]);
  await openOrigin(page);
  const box = page.locator(`${W} .cases`);
  await expect(box.locator("h3")).toHaveText([
    "Fixture case 1",
    "Fixture case 2",
  ]);
  await expect(box).toHaveAttribute("data-nosnippet", "");
  // text only: the file's markup shows as text
  await expect(box.locator("p").nth(1)).toHaveText(
    "A second paragraph <b>not markup</b>.",
  );
  const notice = page.locator(`${W} .cs-notice`);
  await expect(notice).toContainText("not proof of insider trading");
  await expect(notice).toContainText("We reply within 7 days");
  await expect(notice).toContainText("A market can be hidden at once");
  await expect(notice).toContainText("removed with the next site update");
  // 015 R3: the Email link gets its href at start-up (fixture address)
  await expect(notice.locator('a[href^="mailto:"]')).toHaveCount(1);
  await expect(notice.locator("a[data-mail]")).toHaveAccessibleName("Email");
  expect(
    await notice.evaluate(
      (n) =>
        !!(
          n.compareDocumentPosition(document.querySelector(".cases h3")!) &
          Node.DOCUMENT_POSITION_FOLLOWING
        ),
    ),
  ).toBe(true);
  await page.locator(W).getByRole("tab", { name: "Demo" }).click();
  await openOrigin(page);
  expect(asked).toHaveLength(1);
});

test("R18.b: no wallet address and no case text in any page's HTML", async ({
  request,
}) => {
  for (const path of ["/", "/p/insider/", "/p/crawler/"]) {
    const html = await (await request.get(path)).text();
    expect(html, path).not.toMatch(/0x[0-9a-fA-F]{40}/);
    expect(html, path).not.toContain("Fixture case 1");
    expect(html, path).toContain(
      path === "/p/crawler/" ? "<body" : "not proof of insider trading",
    );
  }
});

test("R18.c: a failed load keeps the notice and says so", async ({
  page,
  errors,
}) => {
  await page.route(`**${JSON_PATH}`, (r) => r.abort());
  await page.goto(sheet());
  await page.locator('#card [data-go="insider"]').click();
  await openOrigin(page);
  await expect(page.locator(`${W} .cases-state`)).toHaveText(
    "The case studies did not load. Reload the page to try again.",
  );
  await expect(page.locator(`${W} .cs-notice`)).toBeVisible();
  // the blocked request is this test's own doing: the browser logs it
  errors.splice(
    0,
    errors.length,
    ...errors.filter((e) => !/Failed to load resource|net::ERR_FAILED/.test(e)),
  );
});

test("R16.a: Read, Expand, Restore, the nav and Origin request only the site's own files", async ({
  page,
  baseURL,
}) => {
  const other: string[] = [];
  page.on("request", (r) => {
    if (!r.url().startsWith(baseURL!)) other.push(r.url());
  });
  const settled = () =>
    expect
      .poll(() => page.evaluate(() => document.getAnimations().length))
      .toBe(0);
  const w = page.locator(W);
  // from the sheet: Read, Expand, the nav to Origin, Restore
  await page.goto(sheet());
  await page.locator('#card [data-go="insider"]').click();
  await w.getByRole("tab", { name: "Read" }).click();
  await w.locator(".bar .expand").click();
  await settled();
  await w.locator(".r-nav").getByRole("link", { name: "Origin" }).click();
  await expect(w.locator(".cases h3").first()).toBeVisible();
  await w.locator(".bar .expand").click();
  await settled();
  // a direct entry: the nav to Origin, Restore
  await page.goto("/p/insider/");
  await w.locator(".r-nav").getByRole("link", { name: "Origin" }).click();
  await expect(w.locator(".cases h3").first()).toBeVisible();
  await w.locator(".bar .expand").click();
  await settled();
  await page.waitForLoadState("networkidle");
  expect(other).toEqual([]);
});
