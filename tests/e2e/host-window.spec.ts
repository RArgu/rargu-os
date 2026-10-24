// Spec 002 T4: child windows and dialogs as modal panels in the app's sheet
// window (R3.a, R4.a, R4.b), used with real clicks and keys; Paint's
// File → New… is chosen on its menu row (T5).
import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./helpers";
import { chooseMenu } from "./host-helpers";
import { sheet } from "./sheet-base";

const win = (page: Page, id: string) => page.locator(`[data-win="${id}"]`);
const panel = (page: Page, id: string) =>
  win(page, id).locator('.host-panel[role="dialog"]');

async function run(page: Page, id: string, url = sheet()): Promise<void> {
  // the card's move lands at once: a pan that ends later would move the
  // focus to the window (001 card navigation) in the middle of a test
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(url);
  // on a phone the card is folded into a bar: open it first
  const fold = page.locator(".railtoggle");
  if (await fold.isVisible()) await fold.click();
  await page.locator(`[data-go="${id}"]`).click();
  await expect(win(page, id).locator(".demo-area")).toHaveAttribute(
    "data-host",
    "running",
  );
}

/** `inner`'s screen box lies inside `outer`'s (1 px rounding allowed). */
async function inside(page: Page, inner: string, outer: string) {
  const [a, b] = await Promise.all([
    page.locator(inner).boundingBox(),
    page.locator(outer).boundingBox(),
  ]);
  expect(a).not.toBeNull();
  expect(a!.x).toBeGreaterThanOrEqual(b!.x - 1);
  expect(a!.y).toBeGreaterThanOrEqual(b!.y - 1);
  expect(a!.x + a!.width).toBeLessThanOrEqual(b!.x + b!.width + 1);
  expect(a!.y + a!.height).toBeLessThanOrEqual(b!.y + b!.height + 1);
}

const results = (page: Page) =>
  page.evaluate(
    () =>
      (window as unknown as { __fxDialogs: { results: [string, unknown][] } })
        .__fxDialogs.results,
  );

/** Opens a control by keyboard: focus on it, then Enter (WebKit gives a
 * clicked button no focus, so a click leaves nothing to return to). */
async function press(page: Page, sel: Locator): Promise<void> {
  await sel.focus();
  await page.keyboard.press("Enter");
}

/** The focus is in window `id` (its frame or anything in it). */
const focusIn = (page: Page, id: string) =>
  win(page, id).evaluate((w) => w.contains(document.activeElement));

/** The element under the screen centre of `sel`. */
const hit = (page: Page, sel: string) =>
  page.evaluate((sel) => {
    const r = document.querySelector(sel)!.getBoundingClientRect();
    const el = document.elementFromPoint(
      r.left + r.width / 2,
      r.top + r.height / 2,
    );
    return el === document.querySelector(sel);
  }, sel);

test("R4.a a fixture's choose resolves 2 and its prompt null on Esc; focus goes back", async ({
  page,
}) => {
  await run(page, "notes", sheet("?host=notes:fx-dialogs"));
  const choose = win(page, "notes").locator(".fx-choose");
  await press(page, choose);
  await expect(panel(page, "notes")).toBeVisible();
  await expect(panel(page, "notes")).toContainText("?");
  await inside(page, '[data-win="notes"] .host-panel', '[data-win="notes"]');
  await page.keyboard.press("Escape");
  await expect(panel(page, "notes")).toHaveCount(0);
  await expect.poll(() => results(page)).toEqual([["choose", 2]]);
  await expect(choose).toBeFocused();

  const prompt = win(page, "notes").locator(".fx-prompt");
  await press(page, prompt);
  await expect(panel(page, "notes").locator("input")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect
    .poll(() => results(page))
    .toEqual([
      ["choose", 2],
      ["prompt", null],
    ]);
  await expect(prompt).toBeFocused();

  // by a click: the dialog takes the focus (the visitor is in the window)
  // and gives it back to the window
  await win(page, "notes").locator(".fx-confirm").click();
  await expect(
    panel(page, "notes").getByRole("button", { name: "OK" }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect
    .poll(async () => (await results(page)).at(-1))
    .toEqual(["confirm", false]);
  expect(await focusIn(page, "notes")).toBe(true);
});

test("R3 a child window made as Paint makes it: a panel of its size inside the window at 51 % zoom; the owner takes no clicks; the title bar still drags", async ({
  page,
}) => {
  await run(page, "notes", sheet("?host=notes:fx-dialogs"));
  for (const pct of ["80%", "64%", "51%"]) {
    await page.click("#zOut");
    await expect(page.locator("#zPct")).toHaveText(pct);
  }
  const child = win(page, "notes").locator(".fx-child");
  await press(page, child);
  const dlg = panel(page, "notes");
  await expect(dlg).toContainText("Child fixture");
  await expect(dlg.locator(".fx-cancel")).toBeFocused();
  await inside(page, '[data-win="notes"] .host-panel', '[data-win="notes"]');
  // the panel's content is 190 × 132 app px = sheet px, at zoom 0.512
  const z = await page.evaluate(
    () => parseFloat(document.querySelector("#zPct")!.textContent!) / 100,
  );
  const box = await dlg.locator(".fx-cancel").evaluate((b) => {
    const r = b.parentElement!.getBoundingClientRect();
    return [r.width, r.height];
  });
  expect(Math.abs(box[0] - 190 * z)).toBeLessThan(2);
  expect(Math.abs(box[1] - 132 * z)).toBeLessThan(2);
  // the owner's own button is covered and takes no click
  expect(await hit(page, '[data-win="notes"] .fx-choose')).toBe(false);
  const c = await child.boundingBox();
  await page.mouse.click(c!.x + c!.width / 2, c!.y + c!.height / 2);
  await expect(dlg).toHaveCount(1);
  expect(await results(page)).toEqual([]);

  // the sheet window's title bar drags while the panel is open
  const before = await win(page, "notes").boundingBox();
  const t = await win(page, "notes").locator(".bar .t").boundingBox();
  await page.mouse.move(t!.x + 10, t!.y + t!.height / 2);
  await page.mouse.down();
  await page.mouse.move(t!.x + 70, t!.y + t!.height / 2 + 40, { steps: 5 });
  await page.mouse.up();
  await expect
    .poll(async () => (await win(page, "notes").boundingBox())!.x)
    .toBeGreaterThan(before!.x + 20);
  await expect(dlg).toBeVisible();
  await inside(page, '[data-win="notes"] .host-panel', '[data-win="notes"]');

  await dlg.locator(".fx-cancel").click();
  await expect(dlg).toHaveCount(0);
  await expect.poll(() => results(page)).toEqual([["child", "closed"]]);
  await expect(child).toBeFocused();
  await expect(win(page, "notes").locator(".demo-area")).toHaveAttribute(
    "data-host",
    "running",
  );
});

test("R3.a Paint: File → New shows New Picture inside Paint's window, the canvas takes no clicks, Cancel gives focus back with Paint running", async ({
  page,
}) => {
  await run(page, "paint");
  const tool = win(page, "paint").locator(".paint-tool").first();
  await tool.focus();
  const canvas = '[data-win="paint"] canvas.paint-canvas';
  const pixels = () =>
    page.evaluate(
      (sel) => document.querySelector<HTMLCanvasElement>(sel)!.toDataURL(),
      canvas,
    );
  const clean = await pixels();
  await chooseMenu(page, "paint", "File", "New…");
  const dlg = panel(page, "paint");
  await expect(dlg).toContainText("New Picture");
  await inside(page, '[data-win="paint"] .host-panel', '[data-win="paint"]');
  // a click and a drag on the canvas reach neither Paint nor the sheet: the
  // drag is the app's gesture (001 R21), so the view does not pan
  expect(await hit(page, canvas)).toBe(false);
  const scroll = () =>
    page.evaluate(() => {
      const vp = document.querySelector<HTMLElement>("#vp")!;
      return [vp.scrollLeft, vp.scrollTop];
    });
  const at = await scroll();
  const cv = await page.locator(canvas).boundingBox();
  const [x, y] = [cv!.x + cv!.width / 2, cv!.y + cv!.height / 2];
  await page.mouse.click(x, y);
  await page.mouse.move(x - 30, y - 20);
  await page.mouse.down();
  await page.mouse.move(x + 30, y + 20, { steps: 4 });
  await page.mouse.up();
  await expect(dlg).toBeVisible();
  expect(await pixels()).toBe(clean);
  expect(await scroll()).toEqual(at);

  await dlg.getByRole("button", { name: "Cancel" }).click();
  await expect(dlg).toHaveCount(0);
  await expect(tool).toBeFocused();
  await expect(win(page, "paint").locator(".demo-area")).toHaveAttribute(
    "data-host",
    "running",
  );
  await expect(page.locator(canvas)).toBeVisible();
});

test("R4.b Tracker: a cancelled BPM prompt keeps the tempo; an entered value sets it", async ({
  page,
}) => {
  await run(page, "music");
  const bpm = win(page, "music")
    .locator(".trk-transport .stepper-value")
    .first();
  const before = (await bpm.textContent())!.trim();
  await press(page, bpm);
  const dlg = panel(page, "music");
  await expect(dlg).toContainText("Tempo");
  await expect(dlg.locator("input")).toBeFocused();
  await expect(dlg.locator("input")).toHaveValue(before);
  await page.keyboard.press("Escape");
  await expect(dlg).toHaveCount(0);
  await expect(bpm).toHaveText(before);
  await expect(bpm).toBeFocused();

  const next = before === "140" ? "150" : "140";
  await bpm.click();
  await dlg.locator("input").fill(next);
  await page.keyboard.press("Enter");
  await expect(dlg).toHaveCount(0);
  await expect(bpm).toHaveText(next);
  expect(await focusIn(page, "music")).toBe(true);
});

// R4 with T6 (R13, R14): a dialog and a child window look like the app: the
// scoped widget styles and the theme roles reach their buttons
// (/etc/themes/{default,night}.json: chrome, chrome-dark, text)
const ROLES = {
  light: {
    chrome: "rgb(194, 195, 199)",
    dark: "rgb(95, 87, 79)",
    text: "rgb(0, 0, 0)",
  },
  dark: {
    chrome: "rgb(29, 43, 83)",
    dark: "rgb(0, 0, 0)",
    text: "rgb(255, 241, 232)",
  },
};
for (const scheme of ["light", "dark"] as const)
  test(`R4 R14 (${scheme}) a dialog's button and a child window have the scoped widget styles and the ${scheme === "dark" ? "night" : "default"} roles`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await run(page, "notes", sheet("?host=notes:fx-dialogs"));
    const look = (sel: string) =>
      page.locator(sel).evaluate((b) => {
        const cs = getComputedStyle(b);
        return {
          bg: cs.backgroundColor,
          color: cs.color,
          border: cs.borderTopWidth,
          shadow: cs.boxShadow,
        };
      });
    const roles = ROLES[scheme];
    await press(page, win(page, "notes").locator(".fx-confirm"));
    // Cancel: OK has the focus, and the focus ring draws its own shadow
    const ok = await look(
      '[data-win="notes"] .host-panel .dialog .btn:not([data-primary])',
    );
    expect(ok.bg).toBe(roles.chrome);
    expect(ok.color).toBe(roles.text);
    // --u is 1 px: the .btn border is 1 px
    expect(ok.border).toBe("1px");
    expect(ok.shadow).toContain(roles.dark);
    await page.keyboard.press("Escape");

    // a child window's root: the app's chrome background, its size kept
    await press(page, win(page, "notes").locator(".fx-child"));
    const root = panel(page, "notes").locator(".host-root");
    const r = await root.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { bg: cs.backgroundColor, w: cs.width, h: cs.height };
    });
    expect(r).toEqual({ bg: roles.chrome, w: "190px", h: "132px" });
    await panel(page, "notes").locator(".fx-cancel").click();
  });

// ---- Codex 002 T4 review: #2 focus into a child, #3 background child, #7 fit

test("R3 a child the app does not focus takes the focus at its first control; Tab stays in; Esc closes it and gives the focus back", async ({
  page,
}) => {
  await run(page, "notes", sheet("?host=notes:fx-dialogs"));
  const bare = win(page, "notes").locator(".fx-bare");
  await press(page, bare);
  const dlg = panel(page, "notes");
  await expect(dlg.locator(".fx-first")).toBeFocused();
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press("Tab");
    expect(await dlg.evaluate((d) => d.contains(document.activeElement))).toBe(
      true,
    );
  }
  await page.keyboard.press("Escape");
  await expect(dlg).toHaveCount(0);
  await expect.poll(() => results(page)).toEqual([["bare", "closed"]]);
  await expect(bare).toBeFocused();
});

test("R3 CastleSiege: New Game by keyboard takes the focus, Tab stays in it, Esc closes it and gives the focus back", async ({
  page,
}) => {
  await run(page, "castlesiege");
  const newGame = win(page, "castlesiege")
    .getByRole("button", { name: "New Game" })
    .first();
  await press(page, newGame);
  const dlg = panel(page, "castlesiege");
  await expect(dlg).toContainText("Opponent");
  await expect
    .poll(() => dlg.evaluate((d) => d.contains(document.activeElement)))
    .toBe(true);
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press("Tab");
    expect(await dlg.evaluate((d) => d.contains(document.activeElement))).toBe(
      true,
    );
  }
  await page.keyboard.press("Escape");
  await expect(dlg).toHaveCount(0);
  await expect(newGame).toBeFocused();
  await expect(win(page, "castlesiege").locator(".demo-area")).toHaveAttribute(
    "data-host",
    "running",
  );
});

test("R11 a child that a background start opens and focuses does not take the focus; after the start it can be used", async ({
  page,
}) => {
  await page.goto(sheet("?host=castlesiege:fx-bgchild"));
  const area = win(page, "castlesiege").locator(".demo-area");
  await expect(area).toHaveAttribute("data-host", "running");
  const early = panel(page, "castlesiege").locator(".fx-early");
  await expect(early).toBeAttached();
  await expect(early).not.toBeFocused();
  expect(await focusIn(page, "castlesiege")).toBe(false);
  await expect(
    win(page, "castlesiege").locator(".host-scrim"),
  ).not.toHaveAttribute("inert", /.*/);
  await early.click();
  await expect(early).toBeFocused();
});

/** Paint's New Picture: every control is shown whole or reachable by scroll. */
async function paintNewFits(page: Page): Promise<void> {
  await run(page, "paint");
  await chooseMenu(page, "paint", "File", "New…");
  const dlg = panel(page, "paint");
  await expect(dlg).toContainText("New Picture");
  const clipped = await dlg.locator(".host-root").evaluate((root) => {
    const scrolls = /auto|scroll/.test(getComputedStyle(root).overflowY);
    const r = root.getBoundingClientRect();
    return [...root.querySelectorAll("button, input")]
      .map((c) => [c, c.getBoundingClientRect()] as const)
      .filter(
        ([, b]) =>
          !scrolls &&
          (b.bottom > r.bottom + 0.5 ||
            b.right > r.right + 0.5 ||
            b.top < r.top - 0.5 ||
            b.left < r.left - 0.5),
      )
      .map(([c]) => c.textContent || (c as HTMLInputElement).value);
  });
  expect(clipped).toEqual([]);
  for (const name of ["OK", "Cancel"])
    await dlg.getByRole("button", { name }).click({ trial: true });
  await dlg.getByRole("button", { name: "Cancel" }).click();
  await expect(dlg).toHaveCount(0);
}

test("R3 Paint's New Picture shows every control (none clipped)", async ({
  page,
}) => {
  await paintNewFits(page);
});

test.describe("R3 at phone width", () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test("Paint's New Picture shows every control (none clipped)", async ({
    page,
  }) => {
    await paintNewFits(page);
  });
});
