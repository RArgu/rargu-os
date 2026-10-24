// Spec 003 R8 (T1 measured, T8 made it pass/fail): while the bot thinks, no
// main-thread task over 200 ms, from a Chromium devtools trace with CPU
// throttling ×4, at Easy and Normal, three positions, 3 bot replies each; a
// window drag during the search moves the window. A negative test injects a
// 250 ms task and proves the check reports it. The size test (T1) measures
// what the wide layout needs inside the window at --u = 1 px and 16 px text.
//
// Positions: the bot (Black) replies to a fixed White move from three fixed
// games, opened through Game → Open… (002 file flow) as .siege files built
// here. The games are the first 0, 10 and 20 actions of one Easy self-play
// game (seeds 1000 + ply, Balanced; generated once with bot.ts in Node); the
// bot then faces 1, 11 and 21 actions (38, 51 and 46 legal replies). The
// level is set with Options → Bot level.
import type { CDPSession, Page } from "@playwright/test";
import {
  MAX_IMPORT_ACTIONS,
  newSave,
  replay,
  serialize,
} from "../../src/apps/castlesiege/session";
import type { Action } from "../../src/apps/castlesiege/engine/index";
import { longGame } from "../fixtures/castlesiege-long-game";
import { expect, test } from "./helpers";
import { chooseMenu } from "./host-helpers";
import { sheet } from "./sheet-base";

const a = (piece: string, x: number, y: number): Action => ({
  piece,
  to: { x, y },
});
/** the self-play game; White's move that the bot answers is the last one */
const GAME: Action[] = [
  a("white:sword:1", 4, 4),
  a("black:sword:0", 2, 4),
  a("white:spear:0", 1, 3),
  a("black:sword:1", 3, 5),
  a("white:sword:0", 3, 3),
  a("black:spear:1", 5, 5),
  a("white:king:0", 4, 0),
  a("black:king:0", 2, 8),
  a("white:spear:1", 6, 3),
  a("black:spear:0", 0, 5),
  a("white:spear:1", 6, 4),
  a("black:spear:0", 0, 4),
  a("white:sword:0", 2, 4),
  a("black:sword:1", 2, 4),
  a("white:bow:0", 0, 1),
  a("black:spear:0", 0, 5),
  a("white:bow:0", 0, 0),
  a("black:spear:0", 0, 4),
  a("white:bow:0", 1, 0),
  a("black:bow:1", 5, 8),
  a("white:bow:0", 2, 0),
];
/** position name → actions before White's move (White to move) */
const POSITIONS: [string, number][] = [
  ["start", 0],
  ["mid-10", 10],
  ["mid-20", 20],
];
const LEVELS = ["Easy", "Normal"] as const;
const REPEATS = 3;

/** CastleSiege running in its window on /next. */
async function startCastleSiege(page: Page): Promise<void> {
  await page.goto(sheet());
  await expect(page.locator("#world")).toHaveAttribute("style", /scale\(/);
  await page.locator('[data-go="castlesiege"]').click();
  const area = page.locator('[data-win="castlesiege"] .demo-area');
  await expect(area).toHaveAttribute("data-host", "running");
  await expect(area.locator(".cs-cell")).toHaveCount(63);
}

type Marks = { __marks: { on: number[]; off: number[] } };

/** Marks the bot's thinking in the trace (console.timeStamp) and in page
 * time, from the root's `thinking` class (main.ts render). `inject`: when the
 * bot starts thinking, one main-thread task of that many ms (negative test). */
async function watchThinking(page: Page, inject = 0): Promise<void> {
  await page.evaluate((inject) => {
    const root = document.querySelector('[data-win="castlesiege"] .cs')!;
    const m = { on: [] as number[], off: [] as number[] };
    (window as unknown as Marks).__marks = m;
    let was = root.classList.contains("thinking");
    new MutationObserver(() => {
      const now = root.classList.contains("thinking");
      if (now === was) return;
      was = now;
      (now ? m.on : m.off).push(performance.now());
      console.timeStamp(now ? "cs-bot-on" : "cs-bot-off");
      if (now && inject > 0)
        setTimeout(() => {
          const t0 = performance.now();
          while (performance.now() - t0 < inject);
        });
    }).observe(root, { attributes: true, attributeFilter: ["class"] });
  }, inject);
}

type TraceEvent = {
  name: string;
  ph: string;
  ts: number;
  dur?: number;
  pid: number;
  tid: number;
  args?: { name?: string; data?: { message?: string } };
};

async function startTrace(
  cdp: CDPSession,
): Promise<() => Promise<TraceEvent[]>> {
  const events: TraceEvent[] = [];
  const onData = ({ value }: { value: object[] }) =>
    events.push(...(value as TraceEvent[]));
  cdp.on("Tracing.dataCollected", onData);
  await cdp.send("Tracing.start", {
    categories:
      "devtools.timeline,toplevel,disabled-by-default-devtools.timeline",
    transferMode: "ReportEvents",
  });
  return async () => {
    const done = new Promise((r) => cdp.once("Tracing.tracingComplete", r));
    await cdp.send("Tracing.end");
    await done;
    cdp.off("Tracing.dataCollected", onData);
    return events;
  };
}

/** The longest RunTask on the page's renderer main thread that starts
 * between the bot's on and off marks (the reply's own task included), and
 * the task that started the search (the visitor's move). */
function longestTasks(events: TraceEvent[]): {
  search: number;
  trigger: number;
} {
  const stamp = (msg: string) =>
    events.find((e) => e.name === "TimeStamp" && e.args?.data?.message === msg);
  const on = stamp("cs-bot-on");
  const off = stamp("cs-bot-off");
  if (!on || !off) throw new Error("no bot marks in the trace");
  const tasks = events.filter(
    (e) =>
      e.name === "RunTask" &&
      e.ph === "X" &&
      e.pid === on.pid &&
      e.tid === on.tid,
  );
  if (tasks.length === 0)
    throw new Error("no RunTask events on the main thread");
  const ms = (e: TraceEvent) => (e.dur ?? 0) / 1000;
  const search = tasks.filter((e) => e.ts > on.ts && e.ts <= off.ts);
  const trigger = tasks.find(
    (e) => e.ts <= on.ts && on.ts <= e.ts + (e.dur ?? 0),
  );
  return {
    search: Math.max(0, ...search.map(ms)),
    trigger: trigger ? ms(trigger) : NaN,
  };
}

/** CastleSiege on /next with game `before` open, at `level`. */
async function openGame(
  page: Page,
  level: (typeof LEVELS)[number],
  before: number,
): Promise<void> {
  await startCastleSiege(page);
  const win = page.locator('[data-win="castlesiege"]');
  const save = { ...newSave(), actions: GAME.slice(0, before) };
  const chooser = page.waitForEvent("filechooser");
  await chooseMenu(page, "castlesiege", "Game", "Open…");
  await (
    await chooser
  ).setFiles({
    name: `t1-${before}.siege`,
    mimeType: "application/json",
    buffer: Buffer.from(serialize(save)),
  });
  await expect(win.locator(".cs-moves li")).toHaveCount(before);
  await chooseMenu(page, "castlesiege", "Options", "Bot level", level);
}

/** ×4 CPU throttling and a trace; the returned function ends both. */
async function throttledTrace(
  page: Page,
): Promise<() => Promise<TraceEvent[]>> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  const stop = await startTrace(cdp);
  return async () => {
    const events = await stop();
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
    await cdp.detach();
    return events;
  };
}

/** White's move of action `before` with real clicks (data-cell is x,y). */
async function playWhite(page: Page, before: number): Promise<void> {
  const win = page.locator('[data-win="castlesiege"]');
  const move = GAME[before];
  await win
    .locator(`.cs-cell[data-cell="${pieceCell(before, move.piece)}"]`)
    .click();
  await win.locator(`.cs-cell[data-cell="${move.to.x},${move.to.y}"]`).click();
}

/** Waits for the bot's reply and its end of thinking. */
async function reply(page: Page, before: number): Promise<void> {
  const win = page.locator('[data-win="castlesiege"]');
  await expect(win.locator(".cs-moves li")).toHaveCount(before + 2, {
    timeout: 60_000,
  });
  await expect(win.locator(".cs")).not.toHaveClass(/thinking/);
}

type Result = { search: number; trigger: number; reply: number };

/** One bot reply: open the game, set the level, make White's move with real
 * clicks, trace until the bot has moved. */
async function measure(
  page: Page,
  level: (typeof LEVELS)[number],
  before: number,
  inject = 0,
): Promise<Result> {
  await openGame(page, level, before);
  await watchThinking(page, inject);
  const stop = await throttledTrace(page);
  await playWhite(page, before);
  await reply(page, before);
  const events = await stop();
  const marks = await page.evaluate(() => (window as unknown as Marks).__marks);
  expect(marks.on.length, "one bot search").toBe(1);
  return { ...longestTasks(events), reply: marks.off[0] - marks.on[0] };
}

const median = (v: number[]) =>
  [...v].sort((x, y) => x - y)[Math.floor(v.length / 2)];
const f = (n: number) => n.toFixed(1);

/** R8 limit on one main-thread task while the bot thinks (ms). */
const LIMIT = 200;

/** The R8 check: every task over LIMIT, as text (empty = pass). Both the
 * search's tasks and the task that started the search count. */
function overLimit(label: string, r: Result): string[] {
  return [
    ...(r.search > LIMIT ? [`${label}: search task ${f(r.search)} ms`] : []),
    ...(r.trigger > LIMIT ? [`${label}: move task ${f(r.trigger)} ms`] : []),
  ];
}

/** The square of a piece before action `before` (replayed with the engine). */
function pieceCell(before: number, piece: string): string {
  const st = replay({ ...newSave(), actions: GAME.slice(0, before) }).at(-1)!;
  const p = st.pieces.find((q) => q.id === piece);
  if (!p) throw new Error(`no ${piece} before action ${before}`);
  return `${p.x},${p.y}`;
}

for (const level of LEVELS) {
  test(`R8.a no main-thread task over 200 ms while the bot thinks, ${level}, ×4 throttling, three positions × 3 replies`, async ({
    page,
    browserName,
  }) => {
    test.skip(
      browserName !== "chromium",
      "CDP tracing and throttling: Chromium only",
    );
    test.setTimeout(300_000);
    const lines: string[] = [];
    const over: string[] = [];
    for (const [name, before] of POSITIONS) {
      const runs: Result[] = [];
      for (let i = 0; i < REPEATS; i++) {
        const r = await measure(page, level, before);
        runs.push(r);
        over.push(...overLimit(`${level} ${name} run ${i + 1}`, r));
      }
      const s = runs.map((r) => r.search);
      const t = runs.map((r) => r.trigger);
      const w = runs.map((r) => r.reply);
      lines.push(
        `${level.padEnd(6)} ${name.padEnd(7)} search task max ${f(Math.max(...s))} median ${f(median(s))} ms | ` +
          `move task max ${f(Math.max(...t))} median ${f(median(t))} ms | ` +
          `reply wall max ${f(Math.max(...w))} median ${f(median(w))} ms | runs ${runs
            .map((r) => `${f(r.search)}/${f(r.trigger)}/${f(r.reply)}`)
            .join(" ")}`,
      );
    }
    console.log(
      `\n003 R8 bot (×4 CPU throttling, Chromium)\n${lines.join("\n")}`,
    );
    expect(over, `tasks over ${LIMIT} ms`).toEqual([]);
  });
}

test("R8.a negative: a 250 ms task injected while the bot thinks makes the check fail", async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName !== "chromium",
    "CDP tracing and throttling: Chromium only",
  );
  test.setTimeout(120_000);
  const r = await measure(page, "Easy", 0, 250);
  console.log(`\n003 R8 negative: search task max ${f(r.search)} ms`);
  // the injected task is measured (wall time, about 250 ms), well over the limit
  expect(r.search).toBeGreaterThan(240);
  expect(overLimit("injected", r)).toEqual([
    `injected: search task ${f(r.search)} ms`,
  ]);
});

/** The window's sheet position and lift from its inline transform. */
async function pose(
  page: Page,
): Promise<{ x: number; y: number; lifted: boolean }> {
  return page.locator('[data-win="castlesiege"]').evaluate((w) => {
    const m = /translate\(([-\d.e]+)px, ([-\d.e]+)px\)/.exec(
      (w as HTMLElement).style.transform,
    )!;
    return { x: +m[1], y: +m[2], lifted: w.classList.contains("lifted") };
  });
}

test("R8.a a window drag during the bot's search moves the window, and the reply still comes (Normal, ×4 throttling)", async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName !== "chromium",
    "CDP tracing and throttling: Chromium only",
  );
  test.setTimeout(120_000);
  const before = 10; // the longest Normal search (about 2 s at ×4, T1)
  await openGame(page, "Normal", before);
  await watchThinking(page);
  const z = await page.evaluate(
    () =>
      new DOMMatrix(
        getComputedStyle(document.querySelector("#world")!).transform,
      ).a,
  );
  const from = await pose(page);
  const bar = (await page
    .locator('[data-win="castlesiege"] .bar')
    .boundingBox())!;
  const at = { x: bar.x + 60, y: bar.y + bar.height / 2 };
  const d = { x: -120, y: 80 }; // screen px
  const stop = await throttledTrace(page);
  await playWhite(page, before);
  const cs = page.locator('[data-win="castlesiege"] .cs');
  await expect(cs).toHaveClass(/thinking/);
  // a real mouse drag by the title bar while the bot thinks
  await page.mouse.move(at.x, at.y);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++)
    await page.mouse.move(at.x + (d.x * i) / 8, at.y + (d.y * i) / 8);
  const held = await pose(page);
  // still searching, so the drag ran during the search
  expect(await cs.evaluate((e) => e.classList.contains("thinking"))).toBe(true);
  await page.mouse.up();
  expect(held.lifted).toBe(true);
  // sheet px = screen px / zoom
  expect(Math.abs(held.x - from.x - d.x / z)).toBeLessThanOrEqual(1);
  expect(Math.abs(held.y - from.y - d.y / z)).toBeLessThanOrEqual(1);
  await reply(page, before);
  const events = await stop();
  const marks = await page.evaluate(() => (window as unknown as Marks).__marks);
  expect(marks.on.length, "one bot search").toBe(1);
  const r = { ...longestTasks(events), reply: marks.off[0] - marks.on[0] };
  console.log(
    `\n003 R8 drag: zoom ${z.toFixed(3)}, moved ${f(held.x - from.x)}, ${f(held.y - from.y)} sheet px (expected ${f(d.x / z)}, ${f(d.y / z)}); search task max ${f(r.search)} ms, move task ${f(r.trigger)} ms, reply ${f(r.reply)} ms`,
  );
  expect(overLimit("drag", r)).toEqual([]);
});

test("R2 measurement: the wide layout's demo area and menu row at --u 1 px, 16 px text (003 T1)", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await startCastleSiege(page);
  const m = await page.evaluate(async () => {
    const frame = () =>
      new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const w = document.querySelector<HTMLElement>('[data-win="castlesiege"]')!;
    const area = w.querySelector<HTMLElement>(".demo-area")!;
    const cs = w.querySelector<HTMLElement>(".cs")!;
    const h = (sel: string) =>
      cs.querySelector(sel)!.getBoundingClientRect().height;
    const style = getComputedStyle(cs);
    const main = getComputedStyle(cs.querySelector(".cs-main")!);
    const side = cs.querySelector<HTMLElement>(".cs-side")!;
    const movesMin = parseFloat(
      getComputedStyle(cs.querySelector(".cs-moves")!).minHeight,
    );
    const menu = w
      .querySelector<HTMLElement>(".host-bar")!
      .getBoundingClientRect().height;
    const status = h(".cs-statusbar");
    const pad = parseFloat(main.paddingTop) + parseFloat(main.paddingBottom);
    // the board at its largest cell (40) in its 3 px frame; the side panel
    // with the moves list at its minimum
    const board = 9 * 40 + 2 * 3;
    const sideNeed =
      side.getBoundingClientRect().height - h(".cs-moves") + movesMin;
    const need = Math.ceil(menu + status + pad + Math.max(board, sideNeed));
    const cell = () => cs.style.getPropertyValue("--cs-cell");
    /** 40 px cells, the framed board inside its box, the side panel's
     * content inside the main area (nothing clipped) */
    const fits = () => {
      const box = (sel: string) =>
        cs.querySelector(sel)!.getBoundingClientRect();
      const mainBottom =
        box(".cs-main").bottom - parseFloat(main.paddingBottom);
      const sideBottom = Math.max(
        ...[...side.querySelectorAll("*")].map(
          (e) => e.getBoundingClientRect().bottom,
        ),
      );
      return (
        cell().includes("40") &&
        box(".cs-frame").height <= box(".cs-boardwrap").height + 0.01 &&
        sideBottom <= mainBottom + 0.01
      );
    };
    const out = {
      u: style.getPropertyValue("--u").trim(),
      font: style.fontSize,
      classes: cs.className,
      winW: w.offsetWidth,
      winH: w.offsetHeight,
      demoH: area.getBoundingClientRect().height,
      areaW: area.getBoundingClientRect().width,
      chrome: w.offsetHeight - area.getBoundingClientRect().height,
      menu,
      status,
      pad,
      board,
      sideNeed,
      need,
      cellNow: cell(),
      fitsNow: fits(),
      fitsAtNeed: false,
      fitsBelowNeed: false,
      refItems: cs.querySelectorAll(".cs-side .cs-ref-item").length,
    };
    const was = area.style.height;
    area.style.height = `${need}px`;
    await frame();
    out.fitsAtNeed = fits();
    area.style.height = `${need - 1}px`;
    await frame();
    out.fitsBelowNeed = fits();
    area.style.height = was;
    await frame();
    return out;
  });
  console.log(`\n003 T1 window\n${JSON.stringify(m, null, 1)}`);
  expect(m.u).toBe("1px");
  expect(m.font).toBe("16px");
  expect(m.classes).toMatch(/\bwide\b/);
  expect(m.refItems).toBe(6);
  expect(m.fitsAtNeed, "the wide layout fits at the measured height").toBe(
    true,
  );
  expect(m.fitsBelowNeed, "and not 1 px lower").toBe(false);
});

/** The longest main-thread RunTask between two console.timeStamp marks. */
function longestBetween(events: TraceEvent[], from: string, to: string) {
  const stamp = (msg: string) =>
    events.find((e) => e.name === "TimeStamp" && e.args?.data?.message === msg);
  const on = stamp(from);
  const off = stamp(to);
  if (!on || !off) throw new Error("no marks in the trace");
  const tasks = events.filter(
    (e) =>
      e.name === "RunTask" &&
      e.ph === "X" &&
      e.pid === on.pid &&
      e.tid === on.tid &&
      e.ts + (e.dur ?? 0) >= on.ts &&
      e.ts <= off.ts,
  );
  return Math.max(0, ...tasks.map((e) => (e.dur ?? 0) / 1000));
}

test(`R10 Open… of the longest game the sheet takes (${MAX_IMPORT_ACTIONS} moves), and of one whose last move is illegal: no main-thread task over 200 ms (×4 throttling); the bad one shows an error and the game stays`, async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName !== "chromium",
    "CDP tracing and throttling: Chromium only",
  );
  test.setTimeout(120_000);
  const long = longGame(MAX_IMPORT_ACTIONS);
  const bad = [
    ...long.slice(0, MAX_IMPORT_ACTIONS - 1),
    a("white:king:0", 6, 8),
  ];
  const win = page.locator('[data-win="castlesiege"]');
  await startCastleSiege(page);
  const lines: string[] = [];
  for (const [name, actions] of [
    ["longest", long],
    ["illegal last", bad],
  ] as const) {
    const before = await win.locator(".cs-moves li").count();
    const chooser = page.waitForEvent("filechooser");
    await chooseMenu(page, "castlesiege", "Game", "Open…");
    const file = await chooser;
    const stop = await throttledTrace(page);
    await page.evaluate(() => console.timeStamp("cs-open-on"));
    await file.setFiles({
      name: "long.siege",
      mimeType: "application/json",
      buffer: Buffer.from(serialize({ ...newSave(), actions })),
    });
    const error = win.locator('.host-panel[role="dialog"]', {
      hasText: "could not be opened",
    });
    if (name === "longest")
      await expect(win.locator(".cs-moves li")).toHaveCount(actions.length, {
        timeout: 30_000,
      });
    else await expect(error).toBeVisible({ timeout: 30_000 });
    await page.evaluate(() => console.timeStamp("cs-open-off"));
    const ms = longestBetween(await stop(), "cs-open-on", "cs-open-off");
    lines.push(`${name}: longest task ${f(ms)} ms`);
    expect(ms, `${name}: longest task`).toBeLessThan(LIMIT);
    if (name !== "longest") {
      await expect(error).toContainText(
        `move ${MAX_IMPORT_ACTIONS} is not legal`,
      );
      await error.getByRole("button", { name: "OK" }).click();
      await expect(win.locator(".cs-moves li")).toHaveCount(before);
    }
  }
  console.log(
    `\n003 R10 import (×4 CPU throttling, Chromium)\n${lines.join("\n")}`,
  );
});
