// Spec 005 T5: the Pentimento sketch (R6, R8) through the page. Time is
// Playwright's fake clock: the step timer runs only when a test moves it.
// Unmount has no control in the page; tests/unit/pentimento.test.ts covers it.
import type { Page } from "@playwright/test";
import { expect, test } from "./helpers";
import { sheet } from "./sheet-base";

const STEP = 550; // ms between the mock's lines (reused.js)
const PROMPT = "agent> pull the text in this image onto its own layer";
const LINES = [
  "$ pentimento detect-text in.png  → 1 region (22,36 248×48)",
  '$ pentimento layer extract --region 0 --name "SUMMER SALE"',
  "$ pentimento inpaint --layer 0 --region 0",
  "done: 2 layers",
];
const SKETCH = "Sketch of the planned agent CLI · nothing built yet";

const win = (page: Page) => page.locator('[data-win="pentimento"]');
const run = (page: Page) =>
  win(page).getByRole("button", { name: "Run the agent" });
const cmd = (page: Page) => win(page).locator(".cmd");
const layers = (page: Page) =>
  win(page)
    .locator(".layers > *")
    .evaluateAll((all) => all.map((d) => d.textContent!.replace(/\s+/g, " ")));

/** Opens /next on the fake clock and goes to the Pentimento window. */
async function openPent(page: Page, phone = false) {
  await page.clock.install();
  await page.goto(sheet());
  await expect(page.locator("#world")).toHaveAttribute("style", /scale\(/);
  // on a phone the Go list is in the folded card
  if (phone) await page.locator(".railtoggle").click();
  await page.locator('[data-go="pentimento"]').click();
  await page.clock.runFor(2000); // the navigation pan
  if (!phone) await expect(run(page)).toBeInViewport();
}

/** 005 option C: after a run the panel needs no scroll, and all five lines
 * are inside it and inside the window (which clips its content). */
async function allFiveShown(page: Page) {
  await expect(cmd(page)).toHaveText([PROMPT, ...LINES].join("\n"));
  const m = await cmd(page).evaluate((c) => {
    const r = document.createRange();
    r.selectNodeContents(c);
    const text = r.getBoundingClientRect();
    const box = c.getBoundingClientRect();
    const area = c.closest(".demo-area")!.getBoundingClientRect();
    return {
      scroll: c.scrollHeight - c.clientHeight,
      inPanel: text.top >= box.top && text.bottom <= box.bottom,
      inArea: box.bottom <= area.bottom + 0.5,
    };
  });
  expect(m).toEqual({ scroll: 0, inPanel: true, inArea: true });
}

const place = (page: Page) =>
  win(page).evaluate((w) => (w as HTMLElement).style.transform);

/** Each line of the command panel once, in order: [line, count]. */
const counts = async (page: Page) => {
  const text = (await cmd(page).textContent())!;
  return [PROMPT, ...LINES].map((l) => text.split(l).length - 1);
};

test("R6.a Run plays the four lines in order and ends with the text layer above Background @live", async ({
  page,
}) => {
  await openPent(page);
  await expect(cmd(page)).toHaveText(PROMPT);
  expect(await layers(page)).toEqual(["◉ Background"]);
  await run(page).click();
  for (let i = 0; i < LINES.length; i++) {
    await page.clock.runFor(STEP);
    await expect(cmd(page)).toHaveText(
      [PROMPT, ...LINES.slice(0, i + 1)].join("\n"),
    );
  }
  expect(await layers(page)).toEqual(["◉ Text: SUMMER SALE", "◉ Background"]);
  // the short completion message, for screen readers
  await expect(win(page).getByRole("status")).toHaveText(/done: 2 layers/i);
  await allFiveShown(page);
  // no timer is left: later time changes nothing
  await page.clock.runFor(10 * STEP);
  expect(await counts(page)).toEqual([1, 1, 1, 1, 1]);
});

test.describe("at 390 × 844", () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test("R6.a after a run all five lines show with no scroll", async ({
    page,
  }) => {
    await openPent(page, true);
    await run(page).focus();
    await page.keyboard.press("Enter");
    await page.clock.runFor(10 * STEP);
    await allFiveShown(page);
  });
});

test("R6.a a second press during the extract step cancels the first run", async ({
  page,
}) => {
  await openPent(page);
  await run(page).click();
  await page.clock.runFor(2 * STEP); // the extract line is showing
  await expect(cmd(page)).toContainText(LINES[1]);
  await expect(cmd(page)).not.toContainText(LINES[2]);
  await run(page).click();
  // the new run starts again from the prompt, with Background only
  await expect(cmd(page)).toHaveText(PROMPT);
  expect(await layers(page)).toEqual(["◉ Background"]);
  await expect(win(page).getByRole("status")).toHaveText("");
  await page.clock.runFor(20 * STEP);
  expect(await counts(page)).toEqual([1, 1, 1, 1, 1]);
  expect(await layers(page)).toEqual(["◉ Text: SUMMER SALE", "◉ Background"]);
});

test("R6.b the 'nothing built yet' line shows before, during and after a run, and in the footer", async ({
  page,
}) => {
  await openPent(page);
  const line = win(page).locator(".demo-area").getByText(SKETCH);
  const foot = win(page).locator(".wfoot");
  await expect(foot).toHaveText(SKETCH);
  await expect(line).toBeVisible();
  await run(page).click();
  await page.clock.runFor(STEP);
  await expect(line).toBeVisible();
  await page.clock.runFor(10 * STEP);
  await expect(cmd(page)).toContainText(LINES[3]);
  await expect(line).toBeVisible();
  await expect(foot).toBeVisible();
});

test("R6 the canvas draws the sample image and has an accessible name", async ({
  page,
}) => {
  await openPent(page);
  const c = win(page).locator("canvas");
  await expect(c).toHaveAttribute("aria-label", /sample image/i);
  // drawn at its CSS size × devicePixelRatio, with pixels in it (the
  // backing store follows the CSS size once the stylesheet applies)
  await expect
    .poll(() =>
      c.evaluate((c: HTMLCanvasElement) => {
        const px = c.getContext("2d")!.getImageData(c.width / 2, 2, 1, 1).data;
        return [c.width - Math.round(c.clientWidth * devicePixelRatio), px[3]];
      }),
    )
    .toEqual([0, 255]);
});

for (const key of ["Enter", " "]) {
  test(`R8 Run by keyboard (${key === " " ? "Space" : key}): it plays, focus stays, the window does not move`, async ({
    page,
  }) => {
    await openPent(page);
    const at = await place(page);
    await run(page).focus();
    await page.keyboard.press(key);
    await page.clock.runFor(10 * STEP);
    await expect(cmd(page)).toContainText(LINES[3]);
    await expect(run(page)).toBeFocused();
    expect(await place(page)).toBe(at);
  });
}

test("R8 a mouse drag that starts on Run never drags the window", async ({
  page,
}) => {
  await openPent(page);
  const at = await place(page);
  const b = (await run(page).boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x - 200, b.y + 120, { steps: 6 });
  await page.mouse.up();
  await page.clock.runFor(2000);
  expect(await place(page)).toBe(at);
});

test("R6 reduced motion: a run jumps to its final state", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openPent(page);
  await run(page).click();
  await allFiveShown(page);
  expect(await layers(page)).toEqual(["◉ Text: SUMMER SALE", "◉ Background"]);
  const anim = await win(page)
    .locator(".layers > :first-child")
    .evaluate((d) => getComputedStyle(d).animationName);
  expect(anim).toBe("none");
});
