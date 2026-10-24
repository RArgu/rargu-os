// Spec 004 T6 (R9, R10): Notes (Writer) on the sheet. R9: an empty
// untitled.txt that takes the caret only when the visitor activates Notes;
// Save / Save As download under untitled.txt, a typed name or an opened
// file's own name; Open… takes the listed text formats up to 1 MiB. R10:
// Escape moves the focus from the editor to the Notes window region, then
// Tab and Shift+Tab go on through the sheet; in the editor Tab types spaces.
// Real clicks and keys; downloads and the picker by Playwright's events.
import { readFile } from "node:fs/promises";
import type { Download, Page } from "@playwright/test";
import { expect, test } from "./helpers";
import { chooseMenu, idle } from "./host-helpers";
import { sheet } from "./sheet-base";

const win = (page: Page) => page.locator('[data-win="notes"]');
const text = (page: Page) => win(page).locator("textarea");
const panel = (page: Page) => win(page).locator('.host-panel[role="dialog"]');
const title = (page: Page) => win(page).locator(".bar .t");

async function open(page: Page): Promise<void> {
  // the card's move lands at once
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(sheet());
}

/** Activates Notes by its card icon (it starts Notes if needed). */
async function run(page: Page): Promise<void> {
  await page.locator('.apps [data-go="notes"]').click();
  await expect(win(page).locator(".demo-area")).toHaveAttribute(
    "data-host",
    "running",
  );
}

const bytes = async (d: Download) => readFile(await d.path(), "utf8");

/** File → Save (chooseMenu matches "Save As…" too). */
async function save(page: Page): Promise<void> {
  await chooseMenu(page, "notes", "File");
  await win(page)
    .locator(".menu .menu-item")
    .filter({ has: page.locator(".menu-label", { hasText: /^Save$/ }) })
    .click();
}

/** The host's file-name prompt: checks its proposed name, then OK. */
async function accept(page: Page, proposed: string, name = proposed) {
  const input = panel(page).locator("input");
  await expect(input).toBeFocused();
  await expect(input).toHaveValue(proposed);
  await input.fill(name);
  await panel(page).getByRole("button", { name: "OK" }).click();
}

/** true when the focus is in the Notes window (its frame or inside it). */
const focusInNotes = (page: Page) =>
  page.evaluate(
    () =>
      !!document.activeElement?.closest('[data-win="notes"]') &&
      document.activeElement !== document.body,
  );

test.describe("004 T6 R9 Notes document", () => {
  test("R9 Notes starts with an empty untitled document; the caret goes in only when the visitor activates Notes @live", async ({
    page,
  }) => {
    await page.goto(sheet());
    // fit zoom: every app starts in the background (002 R11)
    await page.locator("#zFit").click();
    await expect(win(page).locator(".demo-area")).toHaveAttribute(
      "data-host",
      "running",
    );
    await expect(text(page)).toHaveValue("");
    await expect(title(page)).toHaveText("Notes - untitled");
    await expect(text(page)).not.toBeFocused();
    expect(await focusInNotes(page)).toBe(false);

    // a press in Notes activates it
    await text(page).click();
    await expect(text(page)).toBeFocused();
  });

  test("R9 Notes started by its card icon (not yet started) takes the caret", async ({
    page,
  }) => {
    await open(page);
    await expect(win(page).locator(".demo-area")).not.toHaveAttribute(
      "data-host",
      /running|starting/,
    );
    await run(page);
    await expect(text(page)).toBeFocused();
    await page.keyboard.type("hi");
    await expect(text(page)).toHaveValue("hi");
  });

  test("R9.a typed 'hello', File → Save downloads untitled.txt with bytes 'hello'; a second Save downloads it again @live", async ({
    page,
  }) => {
    await open(page);
    await run(page);
    await text(page).click();
    await page.keyboard.type("hello");
    const first = page.waitForEvent("download");
    await save(page);
    await accept(page, "untitled.txt");
    const d1 = await first;
    expect(d1.suggestedFilename()).toBe("untitled.txt");
    expect(await bytes(d1)).toBe("hello");
    await expect(title(page)).toHaveText("Notes - untitled.txt");

    await text(page).press("End");
    await page.keyboard.type("!");
    const second = page.waitForEvent("download");
    await save(page);
    const d2 = await second;
    expect(d2.suggestedFilename()).toBe("untitled.txt");
    expect(await bytes(d2)).toBe("hello!");
  });

  test("R9 Save As downloads under a typed name; an opened .md saves under its own name; the picker lists the text formats", async ({
    page,
  }) => {
    await open(page);
    await run(page);
    await text(page).fill("draft");
    await chooseMenu(page, "notes", "File", "Save As…");
    const typed = page.waitForEvent("download");
    await accept(page, "untitled.txt", "mine.txt");
    expect((await typed).suggestedFilename()).toBe("mine.txt");

    const chooser = page.waitForEvent("filechooser");
    await chooseMenu(page, "notes", "File", "Open…");
    const fc = await chooser;
    expect(await fc.element().getAttribute("accept")).toBe(
      ".md,.txt,.json,.js,.trk,.log",
    );
    await fc.setFiles({
      name: "notes.md",
      mimeType: "text/markdown",
      buffer: Buffer.from("# Notes\n"),
    });
    await expect(text(page)).toHaveValue("# Notes\n");
    await expect(title(page)).toHaveText("Notes - notes.md");
    const own = page.waitForEvent("download");
    await save(page);
    const d = await own;
    expect(d.suggestedFilename()).toBe("notes.md");
    expect(await bytes(d)).toBe("# Notes\n");

    await chooseMenu(page, "notes", "File", "Save As…");
    const again = page.waitForEvent("download");
    await accept(page, "notes.md");
    expect((await again).suggestedFilename()).toBe("notes.md");
  });

  test("R9 Open… takes a 1 MiB text; a larger one is refused and the text stays", async ({
    page,
  }) => {
    await open(page);
    await run(page);
    const MiB = 1024 * 1024;
    let chooser = page.waitForEvent("filechooser");
    await chooseMenu(page, "notes", "File", "Open…");
    await (
      await chooser
    ).setFiles({
      name: "big.txt",
      mimeType: "text/plain",
      buffer: Buffer.alloc(MiB, "a"),
    });
    await expect(title(page)).toHaveText("Notes - big.txt");
    expect(
      await text(page).evaluate((t: HTMLTextAreaElement) => t.value.length),
    ).toBe(MiB);

    await text(page).fill("keep");
    chooser = page.waitForEvent("filechooser");
    await chooseMenu(page, "notes", "File", "Open…");
    // the edit is not saved: Writer asks first
    await panel(page).getByRole("button", { name: "Don't save" }).click();
    await (
      await chooser
    ).setFiles({
      name: "huge.txt",
      mimeType: "text/plain",
      buffer: Buffer.alloc(MiB + 1, "a"),
    });
    await expect(panel(page)).toContainText("1 MB");
    await panel(page).getByRole("button", { name: "OK" }).click();
    await expect(panel(page)).toHaveCount(0);
    await expect(text(page)).toHaveValue("keep");
    await expect(title(page)).toHaveText("Notes - big.txt *");
  });
});

/** A short name of the focused element: `#id`, `[data-win=x]`, the text
 * area, or its window and tag. */
const focused = (page: Page) =>
  page.evaluate(() => {
    const a = document.activeElement as HTMLElement | null;
    if (!a || a === document.body) return "body";
    if (a.id) return `#${a.id}`;
    if (a.dataset.win) return `[data-win=${a.dataset.win}]`;
    const w = a.closest<HTMLElement>("[data-win]")?.dataset.win ?? "-";
    return `${w}:${a.tagName.toLowerCase()}`;
  });

/** Elements in the Notes window (or the window) marked inert. */
const inertInNotes = (page: Page) =>
  win(page).evaluate(
    (r) =>
      [r, ...r.querySelectorAll("*")].filter((e) => (e as HTMLElement).inert)
        .length,
  );

/** The sheet's next Tab stop after Notes: WebKit's Tab skips buttons. */
const nextStop = (browserName: string) =>
  browserName === "webkit" ? "#mini" : "#zOut";

/** Moves the caret to the end of the text by keys (macOS: ⌘ + Down). */
const toEnd = (page: Page) =>
  page.keyboard.press(
    process.platform === "darwin" ? "Meta+ArrowDown" : "Control+End",
  );

/** The editor takes keys again: it is not inert and typing lands in it. */
async function usable(page: Page, typed: string, expected: string) {
  expect(await inertInNotes(page)).toBe(0);
  await expect(text(page)).toBeFocused();
  await page.keyboard.type(typed);
  await expect(text(page)).toHaveValue(expected);
}

test.describe("004 T6 R10 Notes keyboard", () => {
  test("R10.a typed text, Escape moves the focus to the Notes window region; then Tab goes to the sheet's next stop; the text is unchanged", async ({
    page,
    browserName,
  }) => {
    await open(page);
    await run(page);
    await text(page).click();
    await page.keyboard.type("abc");
    // in the editor Tab still types spaces
    await page.keyboard.press("Tab");
    await expect(text(page)).toBeFocused();
    await expect(text(page)).toHaveValue("abc  ");

    await page.keyboard.press("Escape");
    expect(await focused(page)).toBe("[data-win=notes]");
    await expect(text(page)).toHaveValue("abc  ");
    await page.keyboard.press("Tab");
    expect(await focused(page)).toBe(nextStop(browserName));
    await expect(text(page)).toHaveValue("abc  ");
  });

  test("R10 after Escape and the skipped Tab, Shift+Tab at once comes back to the editor: nothing is left inert and typing works", async ({
    page,
    browserName,
  }) => {
    await open(page);
    await run(page);
    await text(page).click();
    await page.keyboard.type("abc");
    await page.keyboard.press("Escape");
    await page.keyboard.press("Tab");
    expect(await focused(page)).toBe(nextStop(browserName));
    // the editor is the window's last stop
    await page.keyboard.press("Shift+Tab");
    expect(await focused(page)).toBe("notes:textarea");
    // WebKit puts the caret at the start on a keyboard focus
    await toEnd(page);
    await usable(page, "d", "abcd");
  });

  test("R10 after Escape and the skipped Tab, a click in the editor types again", async ({
    page,
    browserName,
  }) => {
    await open(page);
    await run(page);
    await text(page).click();
    await page.keyboard.type("abc");
    await page.keyboard.press("Escape");
    await page.keyboard.press("Tab");
    expect(await focused(page)).toBe(nextStop(browserName));
    await text(page).click();
    await toEnd(page);
    await usable(page, "e", "abce");
  });

  test("R10 Escape then Shift+Tab goes to the stop before Notes; Tab comes back to the region, and the next Tab goes into Notes", async ({
    page,
  }) => {
    await open(page);
    await run(page);
    // Music (the window before Notes) may still be starting in the
    // background: its Tab stops settle first
    await idle(page);
    // the stop before Notes, by the browser's own Shift+Tab from the region
    await win(page).focus();
    await page.keyboard.press("Shift+Tab");
    const before = await focused(page);
    expect(before).toMatch(/^music:/);

    await text(page).click();
    await page.keyboard.type("abc");
    await page.keyboard.press("Escape");
    expect(await focused(page)).toBe("[data-win=notes]");
    await page.keyboard.press("Shift+Tab");
    expect(await focused(page)).toBe(before);
    await expect(text(page)).toHaveValue("abc");
    expect(await inertInNotes(page)).toBe(0);

    await page.keyboard.press("Tab");
    expect(await focused(page)).toBe("[data-win=notes]");
    // not right after an Escape: Tab goes into the window as before
    await page.keyboard.press("Tab");
    expect(await focused(page)).toMatch(/^notes:/);
  });

  test("R10 from the region, a later Tab (not right after Escape) goes into Notes", async ({
    page,
  }) => {
    await open(page);
    await run(page);
    await text(page).click();
    await page.keyboard.press("Escape");
    expect(await focused(page)).toBe("[data-win=notes]");
    // Alt+ArrowRight moves the window (001 R19); the Escape is used up
    await page.keyboard.press("Alt+ArrowRight");
    expect(await focused(page)).toBe("[data-win=notes]");
    await page.keyboard.press("Tab");
    expect(await focused(page)).toMatch(/^notes:/);
    expect(await inertInNotes(page)).toBe(0);
  });

  test("R10 Escape with a Notes menu open closes the menu only; the editor keeps the focus and types", async ({
    page,
  }) => {
    await open(page);
    await run(page);
    await text(page).click();
    await page.keyboard.type("abc");
    await win(page)
      .locator('[role="menubar"] button', { hasText: "File" })
      .click();
    await expect(win(page).locator(".menu")).toHaveCount(1);
    await page.keyboard.press("Escape");
    await expect(win(page).locator(".menu")).toHaveCount(0);
    expect(await focused(page)).toBe("notes:textarea");
    await usable(page, "d", "abcd");
    // the next Escape leaves the editor as usual
    await page.keyboard.press("Escape");
    expect(await focused(page)).toBe("[data-win=notes]");
  });

  test("R10 Escape in the Save As dialog cancels it only; the editor keeps the focus and types", async ({
    page,
  }) => {
    await open(page);
    await run(page);
    await text(page).click();
    await page.keyboard.type("abc");
    await chooseMenu(page, "notes", "File", "Save As…");
    await expect(panel(page).locator("input")).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(panel(page)).toHaveCount(0);
    expect(await focused(page)).toBe("notes:textarea");
    await usable(page, "d", "abcd");
  });

  test("R10 Escape in the Find bar closes it only; the editor keeps the focus and types", async ({
    page,
  }) => {
    await open(page);
    await run(page);
    await text(page).click();
    await page.keyboard.type("abc");
    await chooseMenu(page, "notes", "Edit", "Find…");
    const find = win(page).getByRole("textbox", { name: "Find" });
    await expect(find).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(find).toBeHidden();
    expect(await focused(page)).toBe("notes:textarea");
    await toEnd(page);
    await usable(page, "d", "abcd");
  });
});
