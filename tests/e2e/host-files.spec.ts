// Spec 002 T8: the real apps' files, icons and sound on the sheet (R6.a-c,
// R7.a, R8.a, R17.a), and the member trap while the four apps start and
// open their menus (assumption 1). Real clicks and keys; downloads and the
// file picker through Playwright's `download` and `filechooser` events.
import { readFile } from "node:fs/promises";
import type { Download, Page } from "@playwright/test";
import { expect, test } from "./helpers";
import { chooseMenu } from "./host-helpers";
import { SHEET, sheet } from "./sheet-base";

const FIX = "tests/fixtures/host";
const win = (page: Page, id: string) => page.locator(`[data-win="${id}"]`);
const panel = (page: Page, id: string) =>
  win(page, id).locator('.host-panel[role="dialog"]');

async function open(page: Page, url = sheet()): Promise<void> {
  // the card's move lands at once
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(url);
}

/** Starts the app in window `id` by its card link. */
async function run(page: Page, id: string): Promise<void> {
  await page.locator(`[data-go="${id}"]`).click();
  await expect(win(page, id).locator(".demo-area")).toHaveAttribute(
    "data-host",
    "running",
  );
}

/** Every download of the page, in order. */
function downloads(page: Page): Download[] {
  const list: Download[] = [];
  page.on("download", (d) => list.push(d));
  return list;
}

async function text(d: Download): Promise<string> {
  return readFile(await d.path(), "utf8");
}

/** Answers the host's Save As prompt with `name`. */
async function answer(page: Page, id: string, name: string): Promise<void> {
  const input = panel(page, id).locator("input");
  await expect(input).toBeFocused();
  await input.fill(name);
  await panel(page, id).getByRole("button", { name: "OK" }).click();
}

/** File → Save (chooseMenu matches "Save As…" too). */
async function save(page: Page, id: string): Promise<void> {
  await chooseMenu(page, id, "File");
  await win(page, id)
    .locator(".menu .menu-item")
    .filter({ has: page.locator(".menu-label", { hasText: /^Save$/ }) })
    .click();
}

interface HostHook {
  trapLog(): { app: string; member: string }[];
  fs: {
    exists(p: string): Promise<boolean>;
    readText(p: string): Promise<string>;
  };
}
const hook = (page: Page) => page.evaluate(() => "__host" in window);
/** The tool in ~/.config/paint.json (test builds' fs hook), else null. */
const tool = (page: Page) =>
  page.evaluate(async () => {
    const fs = (window as unknown as { __host: HostHook }).__host.fs;
    const p = "/home/guest/.config/paint.json";
    if (!(await fs.exists(p))) return null;
    return (JSON.parse(await fs.readText(p)) as { tool?: string }).tool;
  });

test("R6.a Writer: Save As downloads n.txt, Save downloads the new bytes, an opened file saves under its own name", async ({
  page,
}) => {
  await open(page);
  await run(page, "notes");
  const got = downloads(page);
  const area = win(page, "notes").locator("textarea");
  await area.fill("hello");

  await chooseMenu(page, "notes", "File", "Save As…");
  const first = page.waitForEvent("download");
  await answer(page, "notes", "n.txt");
  const d1 = await first;
  expect(d1.suggestedFilename()).toBe("n.txt");
  expect(await text(d1)).toBe("hello");

  await area.fill("hello again");
  const second = page.waitForEvent("download");
  await save(page, "notes");
  const d2 = await second;
  expect(d2.suggestedFilename()).toBe("n.txt");
  expect(await text(d2)).toBe("hello again");

  const chooser = page.waitForEvent("filechooser");
  await chooseMenu(page, "notes", "File", "Open…");
  await (await chooser).setFiles(`${FIX}/opened.txt`);
  await expect(area).toHaveValue("opened text");
  const third = page.waitForEvent("download");
  await save(page, "notes");
  const d3 = await third;
  expect(d3.suggestedFilename()).toBe("opened.txt");
  expect(await text(d3)).toBe("opened text");
  expect(got.map((d) => d.suggestedFilename())).toEqual([
    "n.txt",
    "n.txt",
    "opened.txt",
  ]);
});

test("R6.a a fixture's write to ~/.config/x.json downloads nothing; its document write does", async ({
  page,
}) => {
  await open(page, sheet("?host=notes:fx-files"));
  await run(page, "notes");
  const got = downloads(page);
  const note = page.waitForEvent("download");
  await win(page, "notes").locator(".fx-write").click();
  expect((await note).suggestedFilename()).toBe("note.txt");
  // x.json was written first: a download of it would have come first
  expect(got.map((d) => d.suggestedFilename())).toEqual(["note.txt"]);
  await expect(
    win(page, "notes").getByRole("link", { name: "Download x.json" }),
  ).toHaveCount(0);
});

test("R6.a Paint: Save As downloads a PNG under the name given", async ({
  page,
}) => {
  await open(page);
  await run(page, "paint");
  await chooseMenu(page, "paint", "File", "Save As…");
  const d = page.waitForEvent("download");
  await answer(page, "paint", "pic");
  const got = await d;
  expect(got.suggestedFilename()).toBe("pic.png");
  const bytes = await readFile(await got.path());
  expect([...bytes.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
});

test("R6.b Paint: Open with a fixture PNG shows it; a cancelled picker shows no error", async ({
  page,
}) => {
  await open(page);
  await run(page, "paint");
  const canvas = win(page, "paint").locator(".paint-canvas");

  let chooser = page.waitForEvent("filechooser");
  await chooseMenu(page, "paint", "File", "Open…");
  await (await chooser).setFiles(`${FIX}/red.png`);
  await expect
    .poll(() =>
      canvas.evaluate((c: HTMLCanvasElement) => [
        c.width,
        c.height,
        ...c.getContext("2d")!.getImageData(5, 3, 1, 1).data,
      ]),
    )
    .toEqual([6, 4, 255, 0, 77, 255]);

  chooser = page.waitForEvent("filechooser");
  await chooseMenu(page, "paint", "File", "Open…");
  await (await chooser).setFiles([]);
  // the picker settled: its input is gone
  await expect(page.locator('input[type="file"]')).toHaveCount(0);
  await expect(panel(page, "paint")).toHaveCount(0);
  expect(await canvas.evaluate((c: HTMLCanvasElement) => c.width)).toBe(6);
});

test("R6.c downloads blocked: a save shows a Download link that downloads the bytes (Writer and Paint)", async ({
  page,
}) => {
  await open(page);
  await page.evaluate(() =>
    Object.assign(globalThis, { __hostBlockDownloads: true }),
  );
  await run(page, "notes");
  const got = downloads(page);
  await win(page, "notes").locator("textarea").fill("hello");
  await chooseMenu(page, "notes", "File", "Save As…");
  await answer(page, "notes", "n.txt");
  const link = win(page, "notes").getByRole("link", { name: "Download n.txt" });
  await expect(link).toBeVisible();
  // the link is inside the window and keyboard reachable
  const d = page.waitForEvent("download");
  await link.focus();
  await page.keyboard.press("Enter");
  expect(await text(await d)).toBe("hello");
  expect(got).toHaveLength(1);
  // it can be dismissed
  await win(page, "notes")
    .getByRole("button", { name: "Dismiss download" })
    .click();
  await expect(link).toHaveCount(0);

  await run(page, "paint");
  await chooseMenu(page, "paint", "File", "Save As…");
  await answer(page, "paint", "pic");
  const plink = win(page, "paint").getByRole("link", {
    name: "Download pic.png",
  });
  const pd = page.waitForEvent("download");
  await plink.click();
  expect((await pd).suggestedFilename()).toBe("pic.png");
});

test(`R7.a ~/.config/paint.json is gone after a reload; no browser storage holds data from ${SHEET}`, async ({
  page,
}) => {
  await open(page);
  await run(page, "paint");
  // a tool choice saves Paint's settings
  await win(page, "paint").locator('[data-tool="fill"]').click();
  await expect.poll(() => tool(page)).toBe("fill");

  await page.reload();
  await run(page, "paint");
  // Paint may write its settings again as it starts, but not the old ones
  expect(await tool(page)).not.toBe("fill");
  await expect(
    win(page, "paint").locator('[data-tool="fill"]'),
  ).toHaveAttribute("aria-pressed", "false");
  const stored = await page.evaluate(async () => ({
    local: localStorage.length,
    session: sessionStorage.length,
    idb: (await indexedDB.databases()).map((d) => d.name),
  }));
  expect(stored).toEqual({ local: 0, session: 0, idb: [] });
});

test("R8.a Paint's tool buttons draw their icons", async ({ page }) => {
  await open(page);
  await run(page, "paint");
  const icons = win(page, "paint").locator(".paint-tool .icon");
  await expect(icons).toHaveCount(8);
  await expect
    .poll(() =>
      icons.evaluateAll((els) =>
        els.map((e) => /url\(/.test((e as HTMLElement).style.backgroundImage)),
      ),
    )
    .toEqual(Array(8).fill(true));
});

/** Counts AudioContexts the page makes and their resume() calls. */
async function watchAudio(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const Base = window.AudioContext;
    const made: AudioContext[] = [];
    let resumes = 0;
    let settled = 0;
    window.AudioContext = class extends Base {
      constructor(o?: AudioContextOptions) {
        super(o);
        made.push(this);
      }
      resume(): Promise<void> {
        resumes++;
        return super.resume().finally(() => void settled++);
      }
    };
    Object.assign(window, {
      __audio: () => ({
        n: made.length,
        state: made[0]?.state,
        resumes,
        settled,
      }),
    });
  });
}
const audio = (page: Page) =>
  page.evaluate(() =>
    (
      window as unknown as {
        __audio(): {
          n: number;
          state?: string;
          resumes: number;
          settled: number;
        };
      }
    ).__audio(),
  );

test("R17.a CastleSiege plays no UI sound when a piece moves; Tracker's Play plays or stays usable", async ({
  page,
}) => {
  await watchAudio(page);
  await open(page);
  await run(page, "castlesiege");
  const cs = win(page, "castlesiege");
  await cs.locator('.cs-cell[data-cell="2,2"]').click();
  await cs.locator(".cs-cell.t-move").first().click();
  await expect(cs.locator(".cs-moves li")).toHaveCount(2, { timeout: 5000 });
  // sys.sound.enabled() is false (unit, host-os.test.ts): no sound effect
  expect((await audio(page)).n).toBe(0);

  await run(page, "music");
  const play = win(page, "music").getByRole("button", {
    name: "Play",
    exact: true,
  });
  await play.click();
  await expect.poll(async () => (await audio(page)).n).toBe(1);
  // the context's resume() calls have settled
  await expect
    .poll(async () => {
      const a = await audio(page);
      return a.settled === a.resumes;
    })
    .toBe(true);
  const a = await audio(page);
  if (a.state !== "running") {
    // suspended: the control stays usable for a second try
    await expect(play).toBeEnabled();
    await play.click();
    await expect
      .poll(async () => (await audio(page)).resumes)
      .toBeGreaterThan(a.resumes);
  }
});

test("R17 Tracker: the first resume() leaves the audio context suspended; a second real click on Play tries again (Codex 002 #6)", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const Base = window.AudioContext;
    const made: AudioContext[] = [];
    let resumes = 0;
    let hold = true;
    window.AudioContext = class extends Base {
      constructor(o?: AudioContextOptions) {
        super(o);
        made.push(this);
        void super.suspend();
      }
      get state(): AudioContextState {
        return hold ? "suspended" : super.state;
      }
      resume(): Promise<void> {
        // the first resume leaves the context suspended, as a browser may
        if (++resumes === 1) return Promise.resolve();
        hold = false;
        return super.resume();
      }
    };
    Object.assign(window, {
      __audio: () => ({ n: made.length, state: made[0]?.state, resumes }),
    });
  });
  const ctx = () =>
    page.evaluate(() =>
      (
        window as unknown as {
          __audio(): { n: number; state?: string; resumes: number };
        }
      ).__audio(),
    );
  await open(page);
  await run(page, "music");
  const play = win(page, "music").getByRole("button", {
    name: "Play",
    exact: true,
  });
  await play.click();
  await expect.poll(ctx).toEqual({ n: 1, state: "suspended", resumes: 1 });
  await expect(play).toBeEnabled();
  await play.click();
  await expect.poll(async () => (await ctx()).resumes).toBe(2);
  expect((await ctx()).n).toBe(1);
});

test("assumption 1: the trap logs no unlisted member while the four apps start and open every menu", async ({
  page,
}) => {
  await open(page);
  for (const id of ["castlesiege", "paint", "music", "notes"]) {
    await run(page, id);
    const heads = win(page, id).locator('[role="menubar"] button');
    const n = await heads.count();
    expect(n).toBeGreaterThan(0);
    for (let i = 0; i < n; i++) {
      await heads.nth(i).click();
      const top = win(page, id).locator(".menu").first();
      await expect(top).toBeVisible();
      const subs = top.locator(".menu-item:has(.glyph.right)");
      for (let j = 0; j < (await subs.count()); j++) {
        await subs.nth(j).hover();
        await expect(win(page, id).locator(".menu").nth(1)).toBeVisible();
      }
      await page.keyboard.press("Escape");
      await page.keyboard.press("Escape");
      await expect(win(page, id).locator(".menu")).toHaveCount(0);
    }
  }
  expect(await hook(page)).toBe(true);
  const log = await page.evaluate(() =>
    (window as unknown as { __host: HostHook }).__host.trapLog(),
  );
  expect(log).toEqual([]);
});
