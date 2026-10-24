// Spec 002 T7: processes and close (R9.b, R10.a, R10.b). A spawn fixture
// (`fx-spawn`, test builds only) runs in CastleSiege's window: its buttons
// call proc.spawn, and `__fxSpawn.list()` reads proc.list for the test. An
// app closes itself the visitor's way: File → Close on its menu row (T5).
// Dialogs, buttons and text use real clicks and keys.
import { readFile } from "node:fs/promises";
import type { Download, Page } from "@playwright/test";
import { expect, test } from "./helpers";
import { chooseMenu, eligible, mainCounts } from "./host-helpers";
import { sheet } from "./sheet-base";

const URL = sheet("?host=castlesiege:fx-spawn");
const win = (page: Page, id: string) => page.locator(`[data-win="${id}"]`);
const area = (page: Page, id: string) => win(page, id).locator(".demo-area");
const panel = (page: Page, id: string) =>
  win(page, id).locator('.host-panel[role="dialog"]');

interface Proc {
  pid: number;
  appId: string;
  argv: string[];
}
interface FxSpawn {
  results: [string, number | string][];
  list(): Proc[];
}
const fx = (page: Page) =>
  page.evaluate(() => {
    const f = (window as unknown as { __fxSpawn: FxSpawn }).__fxSpawn;
    return { results: f.results, list: f.list() };
  });
const listed = async (page: Page, appId: string) =>
  (await fx(page)).list.filter((p) => p.appId === appId);

/** File → Close on the menu row (the app's own close path, T5's row). */
const fileClose = (page: Page, id: string) =>
  chooseMenu(page, id, "File", "Close");

/** Window `id` lies wholly inside the view (1 px rounding allowed). */
const inView = (page: Page, id: string) =>
  page.evaluate((id) => {
    const vp = document.querySelector<HTMLElement>("#vp")!;
    const b = vp.getBoundingClientRect();
    const r = document
      .querySelector(`[data-win="${id}"]`)!
      .getBoundingClientRect();
    return (
      r.left >= b.left - 1 &&
      r.top >= b.top - 1 &&
      r.right <= b.left + vp.clientWidth + 1 &&
      r.bottom <= b.top + vp.clientHeight + 1
    );
  }, id);

/** Scrolls the view so window `id` is in its middle (no card navigation,
 * no activation): the start rule runs on the eligibility change. */
const scrollTo = (page: Page, id: string) =>
  page.evaluate((id) => {
    const vp = document.querySelector<HTMLElement>("#vp")!;
    const r = document
      .querySelector(`[data-win="${id}"]`)!
      .getBoundingClientRect();
    const b = vp.getBoundingClientRect();
    vp.scrollLeft += r.left + r.width / 2 - (b.left + vp.clientWidth / 2);
    vp.scrollTop += r.top + r.height / 2 - (b.top + vp.clientHeight / 2);
  }, id);

/** Waits two animation frames (the scroll's handlers have run). */
const frames = (page: Page) =>
  page.evaluate(
    () =>
      new Promise((done) =>
        requestAnimationFrame(() => requestAnimationFrame(done)),
      ),
  );

async function go(page: Page, id: string): Promise<void> {
  // on a phone the card is folded into a bar: open it first
  const fold = page.locator(".railtoggle");
  if (await fold.isVisible()) await fold.click();
  await page.locator(`[data-go="${id}"]`).click();
}

async function open(page: Page, more = ""): Promise<void> {
  // a card move lands at once (no pan ends in the middle of a step)
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(URL + more);
  await expect(area(page, "castlesiege")).toHaveAttribute(
    "data-host",
    "running",
  );
}

test('R9.b proc.spawn("writer", argv) starts Writer once with that argv, moves the view to it and resolves its pid', async ({
  page,
}) => {
  await open(page);
  // Writer is not running and its window is far from the start view
  expect(await eligible(page)).not.toContain("notes");
  expect((await mainCounts(page)).writer).toBeUndefined();
  expect(await inView(page, "notes")).toBe(false);

  await area(page, "castlesiege").locator(".fx-writer").click();
  // Writer got the argv: it tries to open /x.md (absent) and says so
  const dlg = panel(page, "notes");
  await expect(dlg).toContainText("Could not open /x.md");
  await expect.poll(() => inView(page, "notes")).toBe(true);
  await dlg.getByRole("button", { name: "OK" }).click();
  await expect(area(page, "notes")).toHaveAttribute("data-host", "running");
  await expect
    .poll(async () => (await fx(page)).results.map(([n]) => n))
    .toEqual(["writer"]);
  const pid = (await fx(page)).results[0][1];
  expect(typeof pid).toBe("number");
  const writer = await listed(page, "writer");
  expect(writer).toHaveLength(1);
  expect(writer[0].pid).toBe(pid);
  expect(writer[0].argv).toEqual(["--readonly", "/x.md"]);
  expect((await mainCounts(page)).writer).toBe(1);
  // read-only: the argv's flag reached Writer
  await expect(area(page, "notes").locator("textarea")).toHaveJSProperty(
    "readOnly",
    true,
  );

  // a spawn of the running Writer moves the view again and resolves the same
  // pid; Writer does not start again
  await go(page, "castlesiege");
  await expect.poll(() => inView(page, "notes")).toBe(false);
  await area(page, "castlesiege").locator(".fx-writer").click();
  await expect.poll(() => inView(page, "notes")).toBe(true);
  await expect.poll(async () => (await fx(page)).results).toHaveLength(2);
  expect((await fx(page)).results[1]).toEqual(["writer", pid]);
  expect((await mainCounts(page)).writer).toBe(1);
  expect((await listed(page, "writer"))[0].argv).toEqual([
    "--readonly",
    "/x.md",
  ]);

  // any other target rejects with an error that names it
  await go(page, "castlesiege");
  await area(page, "castlesiege").locator(".fx-reader").click();
  await expect.poll(async () => (await fx(page)).results).toHaveLength(3);
  const [name, msg] = (await fx(page)).results[2];
  expect(name).toBe("reader");
  expect(String(msg)).toContain("reader");
});

test("R10.a Writer with unsaved text asks to save on close; Cancel keeps it with its text; Don't save ends it until activated", async ({
  page,
}) => {
  await open(page);
  await go(page, "notes");
  const notes = area(page, "notes");
  await expect(notes).toHaveAttribute("data-host", "running");
  const text = notes.locator("textarea");
  await text.click();
  await page.keyboard.type("hello");
  await expect(text).toHaveValue("hello");
  const [first] = await listed(page, "writer");

  await fileClose(page, "notes");
  const dlg = panel(page, "notes");
  await expect(dlg).toContainText("Save your changes before closing?");
  await dlg.getByRole("button", { name: "Cancel" }).click();
  await expect(dlg).toHaveCount(0);
  await expect(notes).toHaveAttribute("data-host", "running");
  await expect(text).toHaveValue("hello");
  expect(await listed(page, "writer")).toEqual([first]);

  // Don't save: Writer ends once and its window shows the placeholder
  await fileClose(page, "notes");
  await dlg.getByRole("button", { name: "Don't save" }).click();
  await expect(notes).toHaveAttribute("data-host", "closed");
  await expect(notes).toHaveAttribute("role", "button");
  await expect(notes).toHaveAttribute("aria-label", /^Start /);
  await expect(notes.locator("textarea")).toHaveCount(0);
  await expect(win(page, "notes").locator('[role="menubar"]')).toHaveCount(0);
  await expect(win(page, "notes").locator(".bar .t")).toHaveText("notes.txt");
  expect(await listed(page, "writer")).toEqual([]);
  // the start rule does not start a closed app: the view moves away (Notes
  // no longer meets the rule) and back (it meets it again). 004 T2: Notes
  // at (1920, 1150) is still near a view centred on CastleSiege, so the view
  // goes to the sheet's top-left corner
  await page.evaluate(() =>
    document.querySelector<HTMLElement>("#vp")!.scrollTo(0, 0),
  );
  await expect.poll(() => eligible(page)).not.toContain("notes");
  await scrollTo(page, "notes");
  await expect.poll(() => eligible(page)).toContain("notes");
  await frames(page);
  await expect(notes).toHaveAttribute("data-host", "closed");
  expect((await mainCounts(page)).writer).toBe(1);

  // activation starts it again, with a new pid and empty text
  await notes.click();
  await expect(notes).toHaveAttribute("data-host", "running");
  expect((await mainCounts(page)).writer).toBe(2);
  const again = await listed(page, "writer");
  expect(again).toHaveLength(1);
  expect(again[0].pid).not.toBe(first.pid);
  await expect(notes.locator("textarea")).toHaveValue("");
});

test("R10.b Tracker playing: on close playback stops, Tracker leaves proc.list and its window shows the placeholder", async ({
  page,
}) => {
  // the tracker's scheduler ticks every 25 ms only while it plays
  // (src/apps/tracker/engine.ts Scheduler): count those live intervals
  await page.addInitScript(() => {
    const live = new Set<number>();
    const set = window.setInterval.bind(window);
    const clear = window.clearInterval.bind(window);
    window.setInterval = ((fn: TimerHandler, ms?: number, ...a: unknown[]) => {
      const id = set(fn, ms, ...a);
      if (ms === 25) live.add(id);
      return id;
    }) as typeof window.setInterval;
    window.clearInterval = ((id?: number) => {
      if (id !== undefined) live.delete(id);
      clear(id);
    }) as typeof window.clearInterval;
    Object.assign(window, { __ticks: () => live.size });
  });
  const ticks = () =>
    page.evaluate(() => (window as unknown as { __ticks(): number }).__ticks());
  await open(page);
  await go(page, "music");
  const music = area(page, "music");
  await expect(music).toHaveAttribute("data-host", "running");
  expect(await ticks()).toBe(0);
  await music.locator("button.btn", { hasText: /^Play$/ }).click();
  await expect.poll(ticks).toBe(1);
  expect(await listed(page, "tracker")).toHaveLength(1);

  await fileClose(page, "music");
  await expect(music).toHaveAttribute("data-host", "closed");
  await expect.poll(ticks).toBe(0);
  expect(await listed(page, "tracker")).toEqual([]);
  await expect(music).toHaveAttribute("role", "button");
  await expect(music).toHaveAttribute("aria-label", /^Start /);
  await expect(music.locator(".host-root")).toHaveCount(0);
  await expect(win(page, "music").locator('[role="menubar"]')).toHaveCount(0);
  await expect(win(page, "music").locator(".bar .t")).toHaveText("music maker");
});

interface Held {
  starts: number;
  stale: Record<string, string>;
  heard: Record<number, number>;
  signals: Record<number, number>;
}
const held = (page: Page) =>
  page.evaluate(() => {
    const h = (window as unknown as { __fxHeld: Held }).__fxHeld;
    return {
      starts: h.starts,
      stale: h.stale,
      heard: h.heard,
      signals: h.signals,
    };
  });

test("R10 an ended start that goes on later does not touch the app's next start", async ({
  page,
}) => {
  await open(page, ",notes:fx-held");
  await go(page, "notes");
  const notes = area(page, "notes");
  // start 1 waits in main(); the visitor closes it
  await expect(win(page, "notes").locator(".bar .t")).toHaveText("held 1");
  await expect(notes).toHaveAttribute("data-host", "starting");
  await notes.locator(".fx-close").click();
  await expect(notes).toHaveAttribute("data-host", "closed");
  // start 2
  await notes.click();
  await expect(notes).toHaveAttribute("data-host", "running");
  await expect(win(page, "notes").locator(".bar .t")).toHaveText("held 2");
  const [proc] = await listed(page, "fx-held");
  // start 1 goes on
  await page.evaluate(() =>
    (window as unknown as { __fxHeld: { release(): void } }).__fxHeld.release(),
  );
  await expect
    .poll(async () => Object.keys((await held(page)).stale))
    .toContain("close");
  const h = await held(page);
  // the calls that make or change things fail; none reaches start 2
  expect(h.stale.createWindow).not.toBe("ok");
  await expect(win(page, "notes").locator(".bar .t")).toHaveText("held 2");
  await expect(win(page, "notes").locator(".host-panel")).toHaveCount(0);
  await expect(notes).toHaveAttribute("data-host", "running");
  expect(await listed(page, "fx-held")).toEqual([proc]);
  // only start 2 hears the bus
  await notes.locator(".fx-publish").click();
  expect((await held(page)).heard).toEqual({ 1: 0, 2: 1 });
  // closing start 2 runs only its termination handler
  await notes.locator(".fx-close").click();
  await expect(notes).toHaveAttribute("data-host", "closed");
  expect((await held(page)).signals).toEqual({ 1: 1, 2: 1 });
  expect((await mainCounts(page))["fx-held"]).toBe(2);
});

test("R9 an app that spawns itself while it starts gets its own pid", async ({
  page,
}) => {
  await open(page, ",notes:fx-selfspawn");
  await go(page, "notes");
  await expect(area(page, "notes")).toHaveAttribute("data-host", "running");
  await expect(win(page, "notes").locator(".bar .t")).toHaveText("self same");
  expect((await mainCounts(page))["fx-selfspawn"]).toBe(1);
});

test("R10 the app ends even when a child's onClose and its onFocus throw; open dialogs settle", async ({
  page,
}) => {
  await open(page, ",notes:fx-throwclose");
  await go(page, "notes");
  const notes = area(page, "notes");
  await expect(notes).toHaveAttribute("data-host", "running");
  await notes.locator(".fx-child").click();
  await notes.locator(".fx-quit").click();
  await expect(notes).toHaveAttribute("data-host", "closed");
  await expect(win(page, "notes").locator(".host-panel")).toHaveCount(0);
  expect(await listed(page, "fx-throwclose")).toEqual([]);
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as { __fxConfirm?: boolean }).__fxConfirm,
      ),
    )
    .toBe(false);
  // it starts again on activation
  await notes.click();
  await expect(notes).toHaveAttribute("data-host", "running");
});

test("R10 file calls of an ended start do nothing: a late save writes and downloads nothing; a pending import ends with the app (Codex 002 #4)", async ({
  page,
}) => {
  // the page's window focus listeners (the file picker adds one)
  await page.addInitScript(() => {
    const on = new Set<unknown>();
    const add = window.addEventListener;
    const rm = window.removeEventListener;
    const w = window as unknown as Record<string, unknown>;
    w.addEventListener = function (this: Window, t: string, ...a: unknown[]) {
      if (t === "focus" && this === window) on.add(a[0]);
      return (add as (...x: unknown[]) => void).call(this, t, ...a);
    };
    w.removeEventListener = function (
      this: Window,
      t: string,
      ...a: unknown[]
    ) {
      if (t === "focus" && this === window) on.delete(a[0]);
      return (rm as (...x: unknown[]) => void).call(this, t, ...a);
    };
    w.__focusOn = () => on.size;
  });
  const focusOn = () =>
    page.evaluate(() =>
      (window as unknown as { __focusOn(): number }).__focusOn(),
    );
  const log = () =>
    page.evaluate(
      () => (window as unknown as { __fxLate: { log: string[] } }).__fxLate.log,
    );
  const got: Download[] = [];
  page.on("download", (d) => got.push(d));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(sheet("?host=notes:fx-late"));
  await page.locator('[data-go="notes"]').click();
  const a = area(page, "notes");
  await expect(a).toHaveAttribute("data-host", "running");
  const n0 = await focusOn();

  // start 1: a save that waits (as Paint's `await encode()`), and an import
  // whose picker stays open
  await a.locator(".fx-save").click();
  const chooser = page.waitForEvent("filechooser");
  await a.locator(".fx-open").click();
  await chooser;
  await expect(page.locator('input[type="file"]')).toHaveCount(1);
  expect(await focusOn()).toBe(n0 + 1);
  await a.locator(".fx-close").click();
  await expect(a).toHaveAttribute("data-host", "closed");
  // the import ended with its start: no input, no listener left
  await expect(page.locator('input[type="file"]')).toHaveCount(0);
  expect(await focusOn()).toBe(n0);
  await expect.poll(log).toEqual(["opened 1 null"]);

  // start 2 writes; then start 1's save goes on, on the visitor's press
  await a.click();
  await expect(a).toHaveAttribute("data-host", "running");
  const first = page.waitForEvent("download");
  await a.locator(".fx-write").click();
  await first;
  await a.locator(".fx-release").click();
  await expect.poll(log).toEqual(["opened 1 null", "saved 1"]);
  expect(
    await page.evaluate(() =>
      (
        window as unknown as {
          __host: { fs: { readText(p: string): Promise<string> } };
        }
      ).__host.fs.readText("/home/guest/late.txt"),
    ),
  ).toBe("start 2");
  // a download of start 1 would come before this one
  const last = page.waitForEvent("download");
  await a.locator(".fx-write").click();
  await last;
  expect(
    await Promise.all(got.map(async (d) => readFile(await d.path(), "utf8"))),
  ).toEqual(["start 2", "start 2"]);
});
