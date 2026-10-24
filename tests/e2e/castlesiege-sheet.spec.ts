// Spec 003 on the sheet (/next): CastleSiege live in its window.
// T2: each start is a new default game, no autosave (R1). T3: the wide
// layout on every screen (R2) and the phone fit (R3).
import type { Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import {
  applyAction,
  legalActions,
  type Action,
} from "../../src/apps/castlesiege/engine/index";
import {
  RULESET,
  newSave,
  replay,
  serialize,
} from "../../src/apps/castlesiege/session";
import { longGame as randomGame } from "../fixtures/castlesiege-long-game";
import { expect, test } from "./helpers";
import { chooseMenu, mainCounts } from "./host-helpers";
import { sheet } from "./sheet-base";

const WIN = '[data-win="castlesiege"]';
const CONFIG = "/home/guest/.config/castlesiege.json";

/** CastleSiege running in its window on /next (card navigation). */
async function startCastleSiege(page: Page): Promise<void> {
  await page.goto(sheet());
  await expect(page.locator("#world")).toHaveAttribute("style", /scale\(/);
  await page.locator('[data-go="castlesiege"]').click();
  await running(page);
}

async function running(page: Page): Promise<void> {
  const area = page.locator(`${WIN} .demo-area`);
  await expect(area).toHaveAttribute("data-host", "running");
  await expect(area.locator(".cs-cell")).toHaveCount(63);
}

/** Whether the app's config file is in the memory fs (test builds' hook). */
const configExists = (page: Page) =>
  page.evaluate(
    (p) =>
      (
        window as unknown as {
          __host: { fs: { exists(p: string): Promise<boolean> } };
        }
      ).__host.fs.exists(p),
    CONFIG,
  );

/** Whether Options → Music shows a check mark (the menu closes after). */
async function musicChecked(page: Page): Promise<boolean> {
  const win = page.locator(WIN);
  await win
    .locator('[role="menubar"]')
    .getByRole("button", { name: "Options", exact: true })
    .click();
  const row = win.locator(".menu .menu-item", { hasText: "Music" });
  const on = (await row.locator(".glyph.check").count()) > 0;
  await page.keyboard.press("Escape");
  await expect(win.locator(".menu")).toHaveCount(0);
  return on;
}

/** White's first move: the Sword on e3 (4,2) to e4 (4,3), by real clicks. */
async function moveSword(page: Page): Promise<void> {
  const win = page.locator(WIN);
  await win.locator('.cs-cell[data-cell="4,2"]').click();
  await expect(win.locator(".cs-cell.t-move").first()).toBeVisible();
  await win.locator('.cs-cell[data-cell="4,3"]').click();
}

test("R1.a at 1440 × 900 CastleSiege starts White to move against the bot at Easy, Balanced, Music off; a white piece shows its moves @live", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await startCastleSiege(page);
  const win = page.locator(WIN);
  await expect(win.locator(".cs-moves li")).toHaveCount(0);
  await expect(win.locator(".cs-turn")).toHaveText("Your move (White).");
  await expect(win.locator(".cs-statusbar")).toHaveText(
    "Vs bot · Easy · Balanced · Move 1",
  );
  expect(await musicChecked(page)).toBe(false);
  await win.locator('.cs-cell[data-cell="4,2"]').click();
  await expect(win.locator(".cs-cell.t-move").first()).toBeVisible();
});

/** Browser storage this origin holds: Web Storage keys and IndexedDB names. */
const storage = (page: Page) =>
  page.evaluate(async () => ({
    local: Object.keys(localStorage),
    session: Object.keys(sessionStorage),
    idb: indexedDB.databases
      ? (await indexedDB.databases()).map((d) => d.name)
      : [],
  }));

test("R1.b a move on the sheet autosaves nothing; after a reload CastleSiege is a new default game", async ({
  page,
}) => {
  await startCastleSiege(page);
  const win = page.locator(WIN);
  // change everything a start must reset: a move (and the bot's reply),
  // the level, the style, Music
  await moveSword(page);
  await expect(win.locator(".cs-moves li")).toHaveCount(2);
  await chooseMenu(page, "castlesiege", "Options", "Bot level", "Normal");
  await chooseMenu(page, "castlesiege", "Options", "Bot style", "Aggressive");
  await chooseMenu(page, "castlesiege", "Options", "Music");
  expect(await musicChecked(page)).toBe(true);
  expect(await configExists(page), "no autosave file").toBe(false);
  expect(await storage(page)).toEqual({ local: [], session: [], idb: [] });

  // Open… of a file works and writes no config.from (R1)
  const chooser = page.waitForEvent("filechooser");
  await chooseMenu(page, "castlesiege", "Game", "Open…");
  await (
    await chooser
  ).setFiles({
    name: "hot.siege",
    mimeType: "application/json",
    buffer: Buffer.from(
      serialize({
        ...newSave({ mode: "hotseat" }),
        actions: [{ piece: "white:sword:1", to: { x: 4, y: 3 } }],
      }),
    ),
  });
  await expect(win.locator(".cs-statusbar")).toHaveText("Hot-seat · Move 1");
  expect(await configExists(page), "no config.from after Open…").toBe(false);

  // reload in the same visit; the start view has CastleSiege in view
  await page.reload();
  await expect(page.locator("#world")).toHaveAttribute("style", /scale\(/);
  await running(page);
  await expect(win.locator(".cs-moves li")).toHaveCount(0);
  await expect(win.locator(".cs-turn")).toHaveText("Your move (White).");
  await expect(win.locator(".cs-statusbar")).toHaveText(
    "Vs bot · Easy · Balanced · Move 1",
  );
  expect(await musicChecked(page)).toBe(false);
  expect(await storage(page)).toEqual({ local: [], session: [], idb: [] });
});

/** R2.a: the wide layout, everything shown, nothing clipped, 16 px text. */
async function wideLayout(page: Page): Promise<void> {
  const win = page.locator(WIN);
  const cs = win.locator(".cs");
  await expect(cs).toHaveClass(/\bwide\b/);
  await expect(win.locator(".cs-cell")).toHaveCount(63);
  await expect(win.locator(".cs-side .cs-ref-item")).toHaveCount(6);
  // each of them shows: not hidden, not transparent, on the screen
  const unseen = await win.evaluate((w) =>
    [...w.querySelectorAll(".cs-cell, .cs-side .cs-ref-item")]
      .filter((e) => {
        const r = e.getBoundingClientRect();
        return !(
          e.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) &&
          r.width > 0 &&
          r.height > 0 &&
          r.left >= 0 &&
          r.top >= 0 &&
          r.right <= innerWidth &&
          r.bottom <= innerHeight
        );
      })
      .map((e) => e.getAttribute("data-cell") ?? e.textContent),
  );
  expect(unseen, "cells and reference entries not shown").toEqual([]);
  // 003 T8: the window ends at the status bar, in window px: no strip under
  // it, nothing cut off. Integer h 654 leaves 0.38 px (Chromium), 0.95
  // (WebKit), 1.02 (Firefox: its about block is 0.65 px shorter)
  const gap = await win.evaluate((w) => {
    const k = w.getBoundingClientRect().width / (w as HTMLElement).offsetWidth;
    const inner =
      w.getBoundingClientRect().top + (w.clientTop + w.clientHeight) * k;
    return (
      (inner -
        w.querySelector(".cs-statusbar")!.getBoundingClientRect().bottom) /
      k
    );
  });
  expect(gap, "status bar to window bottom, px").toBeGreaterThanOrEqual(-0.01);
  expect(gap, "status bar to window bottom, px").toBeLessThan(1.1);
  for (const sel of [
    ".cs-side .cs-moves",
    ".cs-side .cs-turn",
    ".cs-statusbar",
    ".cs-actions .btn >> nth=0",
    ".cs-actions .btn >> nth=1",
  ])
    await expect(win.locator(sel)).toBeVisible();
  const m = await cs.evaluate((root) => {
    const w = root.closest<HTMLElement>("[data-win]")!;
    const box = (e: Element) => e.getBoundingClientRect();
    const area = box(w.querySelector(".demo-area")!);
    // every element: no content beyond its own box where it clips, and
    // every visible box inside the demo area (screen px, any zoom)
    const clipped: string[] = [];
    const outside: string[] = [];
    for (const e of [w, ...w.querySelectorAll<HTMLElement>("*")]) {
      const s = getComputedStyle(e);
      if (s.display === "none" || e.closest(".hidden")) continue;
      const name = `${e.tagName.toLowerCase()}.${[...e.classList].join(".")}`;
      if (
        (s.overflowX !== "visible" && e.scrollWidth > e.clientWidth + 1) ||
        (s.overflowY !== "visible" && e.scrollHeight > e.clientHeight + 1)
      )
        clipped.push(name);
      if (!root.contains(e)) continue;
      const r = box(e);
      if (r.width === 0 && r.height === 0) continue;
      if (
        r.left < area.left - 1 ||
        r.right > area.right + 1 ||
        r.top < area.top - 1 ||
        r.bottom > area.bottom + 1
      )
        outside.push(name);
    }
    const style = getComputedStyle(root);
    return {
      clipped,
      outside,
      u: style.getPropertyValue("--u").trim(),
      font: style.fontSize,
      cell: root.style.getPropertyValue("--cs-cell"),
    };
  });
  expect(m.clipped, "elements with hidden overflow content").toEqual([]);
  expect(m.outside, "elements outside the demo area").toEqual([]);
  expect(m.u).toBe("1px");
  expect(m.font).toBe("16px");
  expect(m.cell).toContain("40");
}

test("R2.a at 1440 × 900 the window shows the wide layout with nothing clipped", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await startCastleSiege(page);
  await wideLayout(page);
});

test.describe("phone", () => {
  test.use({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });

  test("R2.a at 390 × 844 the window shows the same wide layout with nothing clipped", async ({
    page,
    browserName,
  }) => {
    test.skip(browserName === "firefox", "Firefox has no mobile emulation");
    await page.goto(sheet());
    await expect(page.locator("#world")).toHaveAttribute("style", /scale\(/);
    // the phone start view frames CastleSiege at 001's phone fit,
    // (390 − 2 × 16) / 620 ≈ 0.577 (R3); the start rule starts it
    const z = Number(
      /scale\(([\d.]+)\)/.exec(
        (await page.locator("#world").getAttribute("style")) ?? "",
      )?.[1],
    );
    expect(z).toBeGreaterThanOrEqual(0.57);
    expect(z).toBeLessThanOrEqual(0.59);
    await running(page);
    await wideLayout(page);
  });
});

// ----- T4: menu row, Help panel, Play online (R4, R12) -----

/** The labels of the open menu `i` (0: the header's menu, 1: a submenu). */
const menuLabels = (page: Page, i = 0) =>
  page
    .locator(WIN)
    .locator(".menu")
    .nth(i)
    .locator(".menu-label")
    .allTextContents();

/** Opens a header of the menu row and returns its item labels. */
async function headLabels(page: Page, head: string): Promise<string[]> {
  const win = page.locator(WIN);
  await win
    .locator('[role="menubar"]')
    .getByRole("button", { name: head, exact: true })
    .click();
  await expect(win.locator(".menu")).toHaveCount(1);
  return menuLabels(page);
}

async function closeMenu(page: Page): Promise<void> {
  const win = page.locator(WIN);
  while ((await win.locator(".menu").count()) > 0)
    await page.keyboard.press("Escape");
}

test("R4.a the menu row has Game, Options and Help with the R4 items in order, no Exit, lesson, Guide or rules (owner 2026-10-24) @live", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await startCastleSiege(page);
  const win = page.locator(WIN);
  expect(
    await win.locator('[role="menubar"] .menubar-item').allTextContents(),
  ).toEqual(["Game", "Options", "Help"]);
  expect(await headLabels(page, "Game")).toEqual([
    "New Game…",
    "Undo",
    "Flip board",
    "Save…",
    "Open…",
  ]);
  await closeMenu(page);
  expect(await headLabels(page, "Options")).toEqual([
    "Opponent",
    "Bot level",
    "Bot style",
    "Music",
  ]);
  await win.locator(".menu .menu-item", { hasText: "Opponent" }).hover();
  await expect(win.locator(".menu")).toHaveCount(2);
  expect(await menuLabels(page, 1)).toEqual(["Bot", "Hot-seat"]);
  await closeMenu(page);
  expect(await headLabels(page, "Help")).toEqual(["Play online ↗", "About"]);
  await closeMenu(page);
});

test("R12.a Help → Play online opens castlesiege.fly.dev in a new page; the sheet makes no request to that host", async ({
  page,
  context,
}) => {
  const fly = /^https?:\/\/([^/]*\.)?castlesiege\.fly\.dev(\/|$)/;
  const seen: string[] = [];
  page.on("request", (r) => seen.push(r.url()));
  // the new page's navigation is stopped here: the test never loads the site
  const opened: string[] = [];
  await context.route(fly, (route) => {
    opened.push(route.request().url());
    return route.abort();
  });
  await startCastleSiege(page);
  // the Help menu and its panel are open, nothing is asked of the host yet
  await headLabels(page, "Help");
  await closeMenu(page);
  const popup = context.waitForEvent("page");
  await chooseMenu(page, "castlesiege", "Help", "Play online ↗");
  await popup;
  await expect.poll(() => opened).toEqual(["https://castlesiege.fly.dev/"]);
  expect(
    seen.filter((u) => fly.test(u)),
    "sheet requests",
  ).toEqual([]);
});

// ----- T5: Opponent switch and menu state (R5, R6) -----

/** Moves any piece of `side` ("White" or "Black") that has a quiet move, by real clicks. */
async function moveAny(page: Page, side: "White" | "Black"): Promise<void> {
  const win = page.locator(WIN);
  const cells = win.locator(`.cs-cell[aria-label*=", ${side} "]`);
  for (let i = 0; i < (await cells.count()); i++) {
    await cells.nth(i).click();
    if ((await win.locator(".cs-cell.t-move").count()) > 0) {
      await win.locator(".cs-cell.t-move").first().click();
      return;
    }
  }
  throw new Error(`no ${side} piece can move`);
}

/** Selects a piece of `side` that has a move; returns that move's cell. */
async function selectWithTarget(
  page: Page,
  side: "White" | "Black",
): Promise<string> {
  const win = page.locator(WIN);
  const cells = win.locator(`.cs-cell[aria-label*=", ${side} "]`);
  for (let i = 0; i < (await cells.count()); i++) {
    await cells.nth(i).click();
    const t = win.locator(".cs-cell.t-move").first();
    if ((await t.count()) > 0) return (await t.getAttribute("data-cell"))!;
  }
  throw new Error(`no ${side} piece can move`);
}

/** Whether Game → Undo and the side Undo button are disabled. */
async function undoState(
  page: Page,
): Promise<{ menu: boolean; side: boolean }> {
  const win = page.locator(WIN);
  await headLabels(page, "Game");
  const menu = await win
    .locator(".menu .menu-item", { hasText: "Undo" })
    .evaluate((e) => e.classList.contains("disabled"));
  await closeMenu(page);
  const side = await win
    .locator(".cs-actions button", { hasText: "Undo" })
    .isDisabled();
  return { menu, side };
}

/** The checked labels of Options → `sub` (or of the Game menu with no `sub`). */
async function checked(page: Page, sub?: string): Promise<string[]> {
  const win = page.locator(WIN);
  await headLabels(page, sub ? "Options" : "Game");
  if (sub) {
    await win.locator(".menu .menu-item", { hasText: sub }).hover();
    await expect(win.locator(".menu")).toHaveCount(2);
  }
  const labels = await win
    .locator(".menu")
    .nth(sub ? 1 : 0)
    .locator(".menu-item:has(.glyph.check) .menu-label")
    .allTextContents();
  await closeMenu(page);
  return labels;
}

test("R5.a Opponent → Hot-seat during the bot's search: the bot does not move, the 3 moves stay, Black is the visitor's; level and style apply to the next search", async ({
  page,
}) => {
  await page.clock.install();
  await startCastleSiege(page);
  const win = page.locator(WIN);
  const moves = win.locator(".cs-moves li");
  await moveSword(page);
  await expect(moves).toHaveCount(2);
  // time stops: the bot's reply waits in its minimum delay until it runs
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
  await moveAny(page, "White");
  await expect(moves).toHaveCount(3);
  await expect(win.locator(".cs")).toHaveClass(/\bthinking\b/);
  await chooseMenu(page, "castlesiege", "Options", "Opponent", "Hot-seat");
  await page.clock.runFor(2000);
  await expect(win.locator(".cs")).not.toHaveClass(/\bthinking\b/);
  await expect(moves).toHaveCount(3);
  await expect(win.locator(".cs-statusbar")).toHaveText("Hot-seat · Move 2");
  expect(await checked(page, "Opponent")).toEqual(["Hot-seat"]);
  await moveAny(page, "Black");
  await expect(moves).toHaveCount(4);

  // a new level and style, then back to the bot: the next search uses them
  await page.clock.resume();
  await chooseMenu(page, "castlesiege", "Options", "Bot level", "Normal");
  await chooseMenu(page, "castlesiege", "Options", "Bot style", "Aggressive");
  await chooseMenu(page, "castlesiege", "Options", "Opponent", "Bot");
  expect(await checked(page, "Opponent")).toEqual(["Bot"]);
  expect(await checked(page, "Bot level")).toEqual(["Normal"]);
  expect(await checked(page, "Bot style")).toEqual(["Aggressive"]);
  await expect(moves).toHaveCount(4);
  await moveAny(page, "White");
  await expect(moves).toHaveCount(6);
  await expect(win.locator(".cs-statusbar")).toHaveText(
    "Vs bot · Normal · Aggressive · Move 4",
  );

  // a Black piece selected in Hot-seat, then Bot: the bot moves Black now,
  // the selection is gone and its old target does nothing
  await chooseMenu(page, "castlesiege", "Options", "Opponent", "Hot-seat");
  await moveAny(page, "White");
  await expect(moves).toHaveCount(7);
  const target = await selectWithTarget(page, "Black");
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
  await chooseMenu(page, "castlesiege", "Options", "Opponent", "Bot");
  await expect(win.locator(".cs")).toHaveClass(/\bthinking\b/);
  await expect(win.locator(".cs-cell.t-move, .cs-cell.t-attack")).toHaveCount(
    0,
  );
  await win.locator(`.cs-cell[data-cell="${target}"]`).click();
  await expect(moves).toHaveCount(7);
  await page.clock.runFor(2000);
  await expect(moves).toHaveCount(8);
  await expect(win.locator(".cs")).not.toHaveClass(/\bthinking\b/);
});

test("R6.a after a bot reply Game → Undo and Ctrl/⌘+Z work; at the start both are disabled; the menu agrees with the side controls after Open… and New Game", async ({
  page,
}) => {
  await startCastleSiege(page);
  const win = page.locator(WIN);
  const moves = win.locator(".cs-moves li");
  const off = { menu: true, side: true };
  const on = { menu: false, side: false };
  expect(await undoState(page)).toEqual(off);

  await moveSword(page);
  await expect(moves).toHaveCount(2);
  expect(await undoState(page)).toEqual(on);
  await win.locator(".cs-cell").first().focus();
  await page.keyboard.press("ControlOrMeta+z");
  await expect(moves).toHaveCount(0);
  expect(await undoState(page)).toEqual(off);

  await moveSword(page);
  await expect(moves).toHaveCount(2);
  await chooseMenu(page, "castlesiege", "Game", "Undo");
  await expect(moves).toHaveCount(0);
  expect(await undoState(page)).toEqual(off);
  await win.locator(".cs-cell").first().focus();
  await page.keyboard.press("ControlOrMeta+z");
  await expect(moves).toHaveCount(0);

  await chooseMenu(page, "castlesiege", "Game", "Flip board");
  expect(await checked(page)).toEqual(["Flip board"]);

  // Open… of a hot-seat game at Normal, Defensive with one move
  const chooser = page.waitForEvent("filechooser");
  await chooseMenu(page, "castlesiege", "Game", "Open…");
  await (
    await chooser
  ).setFiles({
    name: "hot.siege",
    mimeType: "application/json",
    buffer: Buffer.from(
      serialize({
        ...newSave({ mode: "hotseat", level: "normal", style: -1 }),
        actions: [{ piece: "white:sword:1", to: { x: 4, y: 3 } }],
      }),
    ),
  });
  await expect(win.locator(".cs-statusbar")).toHaveText("Hot-seat · Move 1");
  expect(await checked(page, "Opponent")).toEqual(["Hot-seat"]);
  expect(await checked(page, "Bot level")).toEqual(["Normal"]);
  expect(await checked(page, "Bot style")).toEqual(["Defensive"]);
  expect(await checked(page)).toEqual([]);
  expect(await undoState(page)).toEqual(on);

  // New Game… against the bot
  await chooseMenu(page, "castlesiege", "Game", "New Game…");
  await page.getByText("Against the bot").click();
  await page.getByRole("button", { name: "OK", exact: true }).click();
  await expect(win.locator(".cs-statusbar")).toHaveText(
    "Vs bot · Normal · Defensive · Move 1",
  );
  expect(await checked(page, "Opponent")).toEqual(["Bot"]);
  expect(await undoState(page)).toEqual(off);
});

// ----- T6: music (R7) and reduced motion (R9) -----

/** A hot-seat game one move from regicide: White's Sword e8 takes the King on d9. */
const ENDGAME = [
  { piece: "white:sword:1", to: { x: 4, y: 4 } },
  { piece: "black:sword:1", to: { x: 4, y: 7 } },
  { piece: "white:sword:1", to: { x: 4, y: 6 } },
  { piece: "black:sword:0", to: { x: 2, y: 7 } },
  { piece: "white:sword:1", to: { x: 4, y: 7 } },
  { piece: "black:hammer:1", to: { x: 3, y: 5 } },
];

/** Opens ENDGAME with Game → Open… (the visitor's own file). */
async function openEndgame(page: Page): Promise<void> {
  const chooser = page.waitForEvent("filechooser");
  await chooseMenu(page, "castlesiege", "Game", "Open…");
  await (
    await chooser
  ).setFiles({
    name: "endgame.siege",
    mimeType: "application/json",
    buffer: Buffer.from(
      serialize({ ...newSave({ mode: "hotseat" }), actions: ENDGAME }),
    ),
  });
  await expect(page.locator(`${WIN} .cs-moves li`)).toHaveCount(6);
}

/** The winning move, by real clicks. */
async function winGame(page: Page): Promise<void> {
  const win = page.locator(WIN);
  await win.locator('.cs-cell[data-cell="4,7"]').click();
  await win.locator('.cs-cell[data-cell="3,8"]').click();
  await expect(win.locator(".cs-victory")).toBeVisible();
}

/**
 * Every track the CastleSiege music player started, oldest first, as
 * [file name, stopped] (test builds' hook on its Music object).
 */
const tracks = (page: Page) =>
  page.evaluate(() =>
    (
      (
        window as unknown as {
          __csMusic?: { path: string; signal: AbortSignal }[];
        }
      ).__csMusic ?? []
    ).map((t) => [t.path.split("/").pop(), t.signal.aborted]),
  );

test("R7.a with Music off a win starts no track; Music on after the win starts none; with Music on the theme then the victory tune play, and Music off stops it", async ({
  page,
}) => {
  await startCastleSiege(page);
  await openEndgame(page);
  await winGame(page);
  expect(await tracks(page)).toEqual([]);

  // Music on after a finished game: no victory tune, no theme
  await chooseMenu(page, "castlesiege", "Options", "Music");
  expect(await musicChecked(page)).toBe(true);
  expect(await tracks(page)).toEqual([]);

  // back into play: the theme; the win: the victory tune
  await chooseMenu(page, "castlesiege", "Game", "Undo");
  await expect(page.locator(`${WIN} .cs-victory`)).toBeHidden();
  expect(await tracks(page)).toEqual([["castlesiege-theme.trk", false]]);
  await winGame(page);
  expect(await tracks(page)).toEqual([
    ["castlesiege-theme.trk", true],
    ["castlesiege-victory.trk", false],
  ]);

  // Music off stops it at once
  await chooseMenu(page, "castlesiege", "Options", "Music");
  expect(await tracks(page)).toEqual([
    ["castlesiege-theme.trk", true],
    ["castlesiege-victory.trk", true],
  ]);
});

/** CSS animations and transitions running in the CastleSiege window. */
const animating = (page: Page, sel: string) =>
  page.evaluate(
    (s) =>
      document
        .getAnimations()
        .filter(
          (a) =>
            a.playState !== "finished" &&
            (a.effect as KeyframeEffect | null)?.target instanceof Element &&
            ((a.effect as KeyframeEffect).target as Element).closest(s),
        ).length,
    sel,
  );

/** The piece on `cell` sits at that cell's place one frame after the move. */
async function landedNextFrame(page: Page, cell: string): Promise<void> {
  const off = await page.evaluate(
    async ([w, c]) => {
      const frame = () => new Promise((r) => requestAnimationFrame(r));
      await frame();
      const target = document
        .querySelector(`${w} .cs-cell[data-cell="${c}"]`)!
        .getBoundingClientRect();
      const pieces = [...document.querySelectorAll(`${w} .cs-piece`)].map((p) =>
        p.getBoundingClientRect(),
      );
      // one more frame: a slide's transitionrun event would have come
      await frame();
      return Math.min(
        ...pieces.map((p) => Math.hypot(p.x - target.x, p.y - target.y)),
      );
    },
    [WIN, cell],
  );
  expect(off).toBeLessThan(1);
}

test("R9.a with reduced motion a move and a win show their end state at the next frame with no animation; the preference turned off mid-game animates the next move; turned on mid-victory stops the victory animation", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await startCastleSiege(page);
  const win = page.locator(WIN);
  // every transition a piece starts (a slide), counted as it is created
  await page.evaluate((w) => {
    const g = window as unknown as { __slides: number };
    g.__slides = 0;
    document.querySelector(w)!.addEventListener("transitionrun", (e) => {
      if ((e.target as Element).classList.contains("cs-piece")) g.__slides++;
    });
  }, WIN);
  const slides = () =>
    page.evaluate(() => (window as unknown as { __slides: number }).__slides);
  await win.locator('.cs-cell[data-cell="4,2"]').click();
  await win.locator('.cs-cell[data-cell="4,3"]').click();
  await landedNextFrame(page, "4,3");
  expect(await animating(page, WIN)).toBe(0);
  expect(await slides()).toBe(0);

  // a win with reduced motion: no King drop, no title flash
  await openEndgame(page);
  await winGame(page);
  expect(await animating(page, `${WIN} .cs-victory`)).toBe(0);

  // the preference turned off mid-game: the next move slides
  await chooseMenu(page, "castlesiege", "Game", "Undo");
  await expect(win.locator(".cs-victory")).toBeHidden();
  await page.emulateMedia({ reducedMotion: "no-preference" });
  // the page holds each slide and the victory animations as they start, so
  // they are still running when the preference changes (no runner timing)
  await page.evaluate((w) => {
    const g = window as unknown as { __held: number };
    g.__held = 0;
    const root = document.querySelector(w)!;
    const hold = (e: Event) => {
      (e.target as Element).getAnimations().forEach((a) => a.pause());
      // the title's flash waits in its delay: hold it too
      root
        .querySelectorAll(".cs-victory *")
        .forEach((v) => v.getAnimations().forEach((a) => a.pause()));
      g.__held++;
    };
    root.addEventListener("transitionrun", hold);
    root.addEventListener("animationstart", hold);
  }, WIN);
  await win.locator('.cs-cell[data-cell="4,7"]').click();
  await win.locator('.cs-cell[data-cell="3,8"]').click();
  await expect(win.locator(".cs-victory")).toBeVisible();
  // (transition events come on a later frame)
  await expect.poll(slides).toBeGreaterThan(0);
  await expect.poll(() => animating(page, `${WIN} .cs-piece`)).toBe(1);
  await expect
    .poll(() => animating(page, `${WIN} .cs-victory`))
    .toBeGreaterThan(0);

  // turned on during the slide and the victory: the slide, the drop and the
  // flash stop, the end state shows
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect.poll(() => animating(page, WIN)).toBe(0);
  await landedNextFrame(page, "3,8");
  await expect(win.locator(".cs-victory-title")).toBeVisible();
});

// ----- T5 review: the bot's search, held by the test (test builds' seam) -----

/**
 * Every bot search through the seam `__csThink`: held until the test
 * releases it. A release runs the real search on its own signal, so a
 * search the app cancelled still completes (a stale result).
 */
async function holdSearches(page: Page): Promise<void> {
  await page.addInitScript(() => {
    type Think = (...a: unknown[]) => Promise<unknown>;
    const w = window as unknown as {
      __csThink: (real: Think, ...a: unknown[]) => Promise<unknown>;
      __csSearches: {
        level: string;
        style: number;
        signal: AbortSignal;
        release(): Promise<unknown>;
      }[];
    };
    w.__csSearches = [];
    w.__csThink = (real, state, ruleset, level, style, opts) =>
      new Promise((resolve, reject) => {
        w.__csSearches.push({
          level: (level as { id: string }).id,
          style: style as number,
          signal: (opts as { signal: AbortSignal }).signal,
          release: () =>
            real(state, ruleset, level, style, {
              ...(opts as object),
              signal: new AbortController().signal,
            }).then(resolve, reject),
        });
      });
  });
}

type Searches = {
  __csSearches: {
    level: string;
    style: number;
    signal: AbortSignal;
    release(): Promise<unknown>;
  }[];
};

/** Each search so far: [level, style, cancelled]. */
const searches = (page: Page) =>
  page.evaluate(() =>
    (window as unknown as Searches).__csSearches.map((s) => [
      s.level,
      s.style,
      s.signal.aborted,
    ]),
  );

/** Lets search `i` finish, then runs the reply's minimum delay. */
async function release(page: Page, i: number): Promise<void> {
  await page.evaluate(
    (n) => (window as unknown as Searches).__csSearches[n].release(),
    i,
  );
  await page.clock.runFor(1000);
}

test("R5 the bot's search: options changed during one search reach the next; Hot-seat cancels it during the search and during the delay; Open and New Game replace it; a stale result is ignored", async ({
  page,
}) => {
  await holdSearches(page);
  await page.clock.install();
  await startCastleSiege(page);
  const win = page.locator(WIN);
  const moves = win.locator(".cs-moves li");
  const thinking = win.locator(".cs");

  // level and style changed during a search: this one keeps Easy, Balanced
  await moveSword(page);
  await expect.poll(() => searches(page)).toEqual([["easy", 0, false]]);
  await chooseMenu(page, "castlesiege", "Options", "Bot level", "Normal");
  await chooseMenu(page, "castlesiege", "Options", "Bot style", "Aggressive");
  expect(await searches(page)).toEqual([["easy", 0, false]]);
  await release(page, 0);
  await expect(moves).toHaveCount(2);
  // ...and the next search has Normal, Aggressive
  await moveAny(page, "White");
  await expect
    .poll(() => searches(page))
    .toEqual([
      ["easy", 0, false],
      ["normal", 1, false],
    ]);

  // Hot-seat during the search cancels it; its late result is ignored
  await chooseMenu(page, "castlesiege", "Options", "Opponent", "Hot-seat");
  expect((await searches(page))[1]).toEqual(["normal", 1, true]);
  await release(page, 1);
  await expect(thinking).not.toHaveClass(/\bthinking\b/);
  await expect(moves).toHaveCount(3);

  // back to Bot: a new search; Open… replaces it, the old result is ignored
  await chooseMenu(page, "castlesiege", "Options", "Opponent", "Bot");
  await expect.poll(async () => (await searches(page)).length).toBe(3);
  const chooser = page.waitForEvent("filechooser");
  await chooseMenu(page, "castlesiege", "Game", "Open…");
  await (
    await chooser
  ).setFiles({
    name: "bot.siege",
    mimeType: "application/json",
    buffer: Buffer.from(
      serialize({
        ...newSave({ level: "hard", style: -1 }),
        actions: [{ piece: "white:sword:1", to: { x: 4, y: 3 } }],
      }),
    ),
  });
  await expect
    .poll(() => searches(page))
    .toEqual([
      ["easy", 0, false],
      ["normal", 1, true],
      ["normal", 1, true],
      ["hard", -1, false],
    ]);
  await release(page, 2);
  await expect(moves).toHaveCount(1);
  await release(page, 3);
  await expect(moves).toHaveCount(2);

  // New Game… during a search replaces it (the bot plays White, first)
  await moveAny(page, "White");
  await expect.poll(async () => (await searches(page)).length).toBe(5);
  await chooseMenu(page, "castlesiege", "Game", "New Game…");
  await page.getByText("Against the bot").click();
  await page.getByText("Black", { exact: true }).click();
  await page.getByRole("button", { name: "OK", exact: true }).click();
  await expect.poll(async () => (await searches(page)).length).toBe(6);
  expect((await searches(page))[4][2]).toBe(true);
  await release(page, 4);
  await expect(moves).toHaveCount(0);
  await release(page, 5);
  await expect(moves).toHaveCount(1);

  // Hot-seat during the reply's minimum delay cancels it too
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
  await moveAny(page, "Black");
  await expect.poll(async () => (await searches(page)).length).toBe(7);
  await page.evaluate(() =>
    (window as unknown as Searches).__csSearches[6].release(),
  );
  await expect(thinking).toHaveClass(/\bthinking\b/);
  await chooseMenu(page, "castlesiege", "Options", "Opponent", "Hot-seat");
  expect((await searches(page))[6][2]).toBe(true);
  await page.clock.runFor(2000);
  await expect(moves).toHaveCount(2);
  await expect(thinking).not.toHaveClass(/\bthinking\b/);
});

// ----- T7: Save/Open (R10) and the move list's scroll (R11) -----

/** What a game shows: status, turn, move list, each piece's place. */
const shown = (page: Page) =>
  page.locator(WIN).evaluate((w) => ({
    status: w.querySelector(".cs-statusbar")!.textContent,
    turn: w.querySelector(".cs-turn")!.textContent,
    moves: [...w.querySelectorAll(".cs-moves li")].map((li) => li.textContent),
    pieces: [...w.querySelectorAll<HTMLElement>(".cs-piece")]
      .map((p) => `${p.dataset.piece} ${p.style.transform}`)
      .sort(),
  }));

/** Game → Open… with `bytes` as the chosen file. */
// 007 T2 (A6): 008 R2.b ported from the old OS. It tests the shared popup
// code (src/ui/menu.ts): a menu rebuild closes the open popup, and the
// focus goes back to where it was before the popup opened.
test("008 R2.b on the sheet: the bot's first reply while the Game menu is open closes the popup; the focus goes back to the Game header; Game shows Undo enabled", async ({
  page,
}) => {
  await holdSearches(page);
  await page.clock.install();
  await startCastleSiege(page);
  const win = page.locator(WIN);
  await chooseMenu(page, "castlesiege", "Game", "New Game…");
  await page.getByText("Against the bot").click();
  await page.getByText("Black", { exact: true }).click();
  await page.getByRole("button", { name: "OK", exact: true }).click();
  await expect.poll(() => searches(page)).toEqual([["easy", 0, false]]);

  // opened by the keyboard, so that the header has the focus in every
  // browser (WebKit does not focus a clicked button)
  const game = win
    .locator('[role="menubar"]')
    .getByRole("button", { name: "Game", exact: true });
  await game.focus();
  await page.keyboard.press("ArrowDown");
  const popup = win.locator(".menu");
  await expect(popup).toHaveCount(1);
  await expect(popup).toBeFocused();
  await expect(popup.locator(".menu-item", { hasText: "Undo" })).toHaveClass(
    /\bdisabled\b/,
  );

  await release(page, 0);
  await expect(win.locator(".cs-moves li")).toHaveCount(1);
  await expect(popup).toHaveCount(0);
  await expect(game).toBeFocused();
  expect(await undoState(page)).toEqual({ menu: false, side: false });
});

async function openBytes(page: Page, name: string, bytes: Buffer) {
  const chooser = page.waitForEvent("filechooser");
  await chooseMenu(page, "castlesiege", "Game", "Open…");
  await (
    await chooser
  ).setFiles({ name, mimeType: "application/json", buffer: bytes });
}

test("R10.a a hot-seat game at Normal, Defensive with 4 moves saves as a .siege download; after a new game, opening those bytes brings it all back; a corrupt file shows an error and the game stays", async ({
  page,
}) => {
  await startCastleSiege(page);
  const win = page.locator(WIN);
  await chooseMenu(page, "castlesiege", "Game", "New Game…");
  await page.getByText("Two players, one device").click();
  await page.getByRole("button", { name: "OK", exact: true }).click();
  await chooseMenu(page, "castlesiege", "Options", "Bot level", "Normal");
  await chooseMenu(page, "castlesiege", "Options", "Bot style", "Defensive");
  for (const side of ["White", "Black", "White", "Black"] as const)
    await moveAny(page, side);
  await expect(win.locator(".cs-moves li")).toHaveCount(4);
  const before = await shown(page);
  expect(before.status).toBe("Hot-seat · Move 3");

  // Game → Save…: the host asks the name; the browser downloads the file
  const download = page.waitForEvent("download");
  await chooseMenu(page, "castlesiege", "Game", "Save…");
  const ask = win.locator('.host-panel[role="dialog"]');
  await expect(ask.locator("input")).toBeFocused();
  await ask.locator("input").fill("four");
  await ask.getByRole("button", { name: "OK" }).click();
  const d = await download;
  expect(d.suggestedFilename()).toBe("four.siege");
  const bytes = await readFile(await d.path());

  // a new default game, then the downloaded bytes opened
  await chooseMenu(page, "castlesiege", "Game", "New Game…");
  await page.getByText("Against the bot").click();
  await page.getByRole("button", { name: "OK", exact: true }).click();
  await expect(win.locator(".cs-moves li")).toHaveCount(0);
  await openBytes(page, "four.siege", bytes);
  await expect(win.locator(".cs-moves li")).toHaveCount(4);
  expect(await shown(page)).toEqual(before);
  expect(await checked(page, "Opponent")).toEqual(["Hot-seat"]);
  expect(await checked(page, "Bot level")).toEqual(["Normal"]);
  expect(await checked(page, "Bot style")).toEqual(["Defensive"]);

  // a corrupt file: an error, and the game stays as it was
  await openBytes(page, "bad.siege", Buffer.from("{ not a game"));
  const error = win.locator('.host-panel[role="dialog"]', {
    hasText: "bad.siege could not be opened",
  });
  await expect(error).toBeVisible();
  await error.getByRole("button", { name: "OK" }).click();
  await expect(error).toHaveCount(0);
  expect(await shown(page)).toEqual(before);
  expect(await checked(page, "Bot level")).toEqual(["Normal"]);
});

/** A vs-bot game of `n` legal moves that nobody has won (first legal move each turn). */
function longGame(n: number): Buffer {
  const save = newSave();
  let state = replay(save)[0];
  const actions: Action[] = [];
  while (actions.length < n) {
    const next = legalActions(state, RULESET).find((a) => {
      const r = applyAction(state, RULESET, a);
      return r.ok && r.state.status.state === "playing";
    })!;
    const r = applyAction(state, RULESET, next);
    if (!r.ok) throw new Error(r.reason);
    actions.push(next);
    state = r.state;
  }
  return Buffer.from(serialize({ ...save, actions }));
}

test("R11.a the view panned to Quick tools while the bot thinks: its reply scrolls the move list to the newest move, and the sheet's view, zoom and focus do not change", async ({
  page,
}) => {
  await holdSearches(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.clock.install();
  await startCastleSiege(page);
  const win = page.locator(WIN);
  const list = win.locator(".cs-moves");
  // 41 moves: Black (the bot) to move, the list taller than its box
  await openBytes(page, "long.siege", longGame(41));
  await expect(win.locator(".cs-moves li")).toHaveCount(41);
  await expect.poll(async () => (await searches(page)).length).toBe(1);
  expect(await list.evaluate((l) => l.scrollHeight > l.clientHeight + 40)).toBe(
    true,
  );

  // the visitor goes to Quick tools: the view moves, Paint has the focus
  await page.locator("#card").getByRole("button", { name: "Paint" }).click();
  await expect(page.locator('[data-win="paint"]')).toBeFocused();
  const sheet = () =>
    page.evaluate(() => {
      const vp = document.querySelector<HTMLElement>("#vp")!;
      return {
        left: vp.scrollLeft,
        top: vp.scrollTop,
        zoom: getComputedStyle(document.querySelector("#world")!).transform,
        focus: document.activeElement?.getAttribute("data-win") ?? null,
      };
    });
  const view = await sheet();

  // the bot's reply, in the background
  await release(page, 0);
  await expect(win.locator(".cs-moves li")).toHaveCount(42);
  await page.evaluate(
    () =>
      new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
  );
  expect(await sheet()).toEqual(view);
  expect(
    await list.evaluate(
      (l) => l.scrollTop + l.clientHeight >= l.scrollHeight - 1,
    ),
  ).toBe(true);
});

// ----- Codex review of 003: strict import (R10), close and restart (R1, 002 R10) -----

test("R10 the sheet's Open… refuses damaged settings, missing fields and over-long games: each time an error shows and the game stays", async ({
  page,
}) => {
  await startCastleSiege(page);
  const win = page.locator(WIN);
  await moveSword(page);
  await expect(win.locator(".cs-moves li")).toHaveCount(2);
  const before = await shown(page);
  const good = { ...newSave(), actions: [] as Action[] };
  const json = (patch: Record<string, unknown>, drop?: string) => {
    const raw: Record<string, unknown> = { ...good, ...patch };
    if (drop) delete raw[drop];
    return Buffer.from(JSON.stringify(raw));
  };
  const long = randomGame(500);
  const files: [string, Buffer, RegExp][] = [
    ["types", json({ mode: {}, human: 7, level: [], style: "bad" }), /damaged/],
    ["values", json({ level: "expert" }), /damaged/],
    ["missing", json({}, "human"), /damaged/],
    [
      "too long",
      Buffer.from(serialize({ ...good, actions: randomGame(501) })),
      /too long/,
    ],
    [
      "bad last move",
      Buffer.from(
        serialize({
          ...good,
          actions: [
            ...long.slice(0, 499),
            { piece: "white:king:0", to: { x: 6, y: 8 } },
          ],
        }),
      ),
      /move 500 is not legal/,
    ],
  ];
  for (const [name, bytes, why] of files) {
    await openBytes(page, `${name}.siege`, bytes);
    const error = win.locator('.host-panel[role="dialog"]', {
      hasText: `${name}.siege could not be opened`,
    });
    await expect(error, name).toBeVisible();
    await expect(error, name).toContainText(why);
    await error.getByRole("button", { name: "OK" }).click();
    await expect(error).toHaveCount(0);
    expect(await shown(page), name).toEqual(before);
  }
});

/** Test builds' host hook: close a window's app, and the process list. */
type HostHook = {
  __host: {
    close(winId: string): void;
    list(): { pid: number; appId: string }[];
  };
};
const hostClose = (page: Page) =>
  page.evaluate(() =>
    (window as unknown as HostHook).__host.close("castlesiege"),
  );
const procs = (page: Page) =>
  page.evaluate(() =>
    (window as unknown as HostHook).__host
      .list()
      .filter((p) => p.appId === "castlesiege")
      .map((p) => p.pid),
  );

test("002 R10 CastleSiege closed by the host during a search, with its music loading, then during the reply delay and active playback: each restart at once is a new default game, the music stops, proc.list has the new instance only, and the old instance's late work changes nothing", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await holdSearches(page);
  // every note the synth plays is a new oscillator or noise source
  await page.addInitScript(() => {
    const w = window as unknown as { __notes: number };
    w.__notes = 0;
    const proto = BaseAudioContext.prototype;
    const osc = proto.createOscillator;
    const buf = proto.createBufferSource;
    proto.createOscillator = function (this: BaseAudioContext) {
      w.__notes++;
      return osc.call(this);
    };
    proto.createBufferSource = function (this: BaseAudioContext) {
      w.__notes++;
      return buf.call(this);
    };
  });
  const notes = () =>
    page.evaluate(() => (window as unknown as { __notes: number }).__notes);
  /** the note count once two reads in a row agree (nothing plays) */
  const quiet = async () => {
    let last = -1;
    await expect
      .poll(async () => {
        const n = await notes();
        const same = n === last;
        last = n;
        return same;
      })
      .toBe(true);
    return last;
  };
  await page.clock.install();
  // the Tracker engine (the music player) waits until the test lets it load
  let freeEngine!: () => void;
  const engineHeld = new Promise<void>((r) => (freeEngine = r));
  await page.route(/\/assets\/engine-[^/]+\.js(\?.*)?$/, async (route) => {
    await engineHeld;
    await route.continue();
  });
  await startCastleSiege(page);
  const win = page.locator(WIN);
  const area = win.locator(".demo-area");
  const moves = win.locator(".cs-moves li");
  const first = await procs(page);
  expect(first).toHaveLength(1);
  const defaults = async () => {
    await expect(moves).toHaveCount(0);
    await expect(win.locator(".cs-statusbar")).toHaveText(
      "Vs bot · Easy · Balanced · Move 1",
    );
    expect(await musicChecked(page)).toBe(false);
  };
  const restart = async () => {
    await area.click();
    await running(page);
  };

  // 1. a live search, the theme still loading: closed
  await chooseMenu(page, "castlesiege", "Options", "Music");
  await moveSword(page);
  await expect.poll(async () => (await searches(page)).length).toBe(1);
  expect(await tracks(page)).toEqual([["castlesiege-theme.trk", false]]);
  await hostClose(page);
  await expect(area).toHaveAttribute("data-host", "closed");
  expect(await procs(page)).toEqual([]);
  expect((await searches(page))[0][2]).toBe(true);
  expect(await tracks(page)).toEqual([["castlesiege-theme.trk", true]]);

  // restart at once; then the old instance's search and music finish
  await restart();
  const second = await procs(page);
  expect(second).toHaveLength(1);
  expect(second[0]).not.toBe(first[0]);
  expect((await mainCounts(page)).castlesiege).toBe(2);
  await defaults();
  freeEngine();
  await release(page, 0);
  await defaults();
  expect(await quiet()).toBe(0);
  expect(await tracks(page)).toHaveLength(1);

  // 2. the theme playing: closed, it stops
  await chooseMenu(page, "castlesiege", "Options", "Music");
  await expect.poll(notes).toBeGreaterThan(0);
  expect((await tracks(page))[1]).toEqual(["castlesiege-theme.trk", false]);
  await hostClose(page);
  await expect(area).toHaveAttribute("data-host", "closed");
  expect((await tracks(page))[1][1]).toBe(true);
  const after = await quiet();
  await restart();
  await defaults();
  expect(await quiet()).toBe(after);

  // 3. the reply's minimum delay: closed, restarted, the old timer fires
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
  await moveSword(page);
  await expect.poll(async () => (await searches(page)).length).toBe(2);
  await page.evaluate(() =>
    (window as unknown as Searches).__csSearches[1].release(),
  );
  await expect(win.locator(".cs")).toHaveClass(/\bthinking\b/);
  await hostClose(page);
  await expect(area).toHaveAttribute("data-host", "closed");
  expect((await searches(page))[1][2]).toBe(true);
  await restart();
  await page.clock.runFor(2000);
  await defaults();
  expect(await procs(page)).toHaveLength(1);
  expect(await tracks(page)).toHaveLength(2);
});
