// Spec 004 T5 (R6, R7): Music (Tracker) on the sheet. The demo is ready
// before Play works; Play plays or stays usable; Save, Save As and Open…
// round-trip a .trk; Export WAV… downloads one checked .wav, once at a time,
// and refuses songs over 90 s (owner decision). Real clicks and keys. The test hooks
// live in this file: `__host.fs` (test builds only) holds the demo read, and
// init scripts wrap the page's audio classes.
import { readFile } from "node:fs/promises";
import type { Download, Page } from "@playwright/test";
import { expect, test } from "./helpers";
import { chooseMenu, mainCounts } from "./host-helpers";
import { sheet } from "./sheet-base";

const DEMO = "system/home/guest/Music/demo.trk";
const win = (page: Page) => page.locator('[data-win="music"]');
const panel = (page: Page) => win(page).locator('.host-panel[role="dialog"]');
const playBtn = (page: Page) =>
  win(page).getByRole("button", { name: "Play", exact: true });

interface TrkFile {
  bpm: number;
  patterns: { rows: string[] }[];
  order: number[];
}
const demo = async (): Promise<TrkFile> =>
  JSON.parse(await readFile(DEMO, "utf8")) as TrkFile;

/** One pass through the order list, in seconds (engine.ts songSeconds). */
function songSeconds(f: TrkFile): number {
  const rows = f.order.reduce((n, p) => n + f.patterns[p].rows.length, 0);
  return (rows * 60) / f.bpm / 4;
}

async function open(page: Page): Promise<void> {
  // the card's move lands at once
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(sheet());
}

/** Waits for the test hook `__host`: the host chunk loads after the page
 * load event (when the first hosted window is eligible), so it can be late. */
const hostHook = (page: Page) => page.waitForFunction(() => "__host" in window);

/** Starts Music by its card icon. */
async function run(page: Page): Promise<void> {
  await page.locator('.apps [data-go="music"]').click();
  await expect(win(page).locator(".demo-area")).toHaveAttribute(
    "data-host",
    "running",
  );
}

/** Starts Music and waits until the demo is ready (Play enabled). */
async function ready(page: Page): Promise<void> {
  await open(page);
  await run(page);
  await expect(playBtn(page)).toBeEnabled();
  await expect(win(page).locator(".bar .t")).toHaveText(/^Music - demo\.trk/);
}

/** The note names of the shown pattern, row by row, channel by channel. */
const shownNotes = (page: Page) =>
  win(page)
    .locator(".trk-row")
    .evaluateAll((rows) =>
      rows.map((r) =>
        [...r.querySelectorAll(".trk-cell .n")].map((n) => n.textContent),
      ),
    );
const fileNotes = (f: TrkFile, p: number) =>
  f.patterns[p].rows.map((line) => line.split(" | ").map((c) => c.slice(0, 3)));

/** The index of the playing row, -1 when none. */
const playRow = (page: Page) =>
  win(page)
    .locator(".trk-row")
    .evaluateAll((rows) => rows.findIndex((r) => r.classList.contains("play")));

function downloads(page: Page): Download[] {
  const list: Download[] = [];
  page.on("download", (d) => list.push(d));
  return list;
}

/** Answers the host's name prompt: `name`, or the default when omitted. */
async function answer(page: Page, name?: string): Promise<void> {
  const input = panel(page).locator("input");
  await expect(input).toBeFocused();
  if (name !== undefined) await input.fill(name);
  await panel(page).getByRole("button", { name: "OK" }).click();
}

/** File → Save (chooseMenu matches "Save As…" too). */
async function save(page: Page): Promise<void> {
  await chooseMenu(page, "music", "File");
  await win(page)
    .locator(".menu .menu-item")
    .filter({ has: page.locator(".menu-label", { hasText: /^Save$/ }) })
    .click();
}

test("R6.a demo read held: Play is disabled until the demo has parsed; then the demo's tempo and notes show and Play plays", async ({
  page,
  browserName,
}) => {
  // a tap on every connection to the speakers, to read the samples
  await page.addInitScript(() => {
    const connect = AudioNode.prototype.connect;
    const taps: AnalyserNode[] = [];
    const tapped = new WeakSet<BaseAudioContext>();
    AudioNode.prototype.connect = function (
      this: AudioNode,
      ...args: unknown[]
    ) {
      const out = (connect as (...a: unknown[]) => unknown).apply(this, args);
      const ctx = this.context;
      if (
        args[0] instanceof AudioDestinationNode &&
        ctx instanceof AudioContext
      ) {
        const tap = ctx.createAnalyser();
        tap.fftSize = 2048;
        (connect as (...a: unknown[]) => unknown).call(this, tap);
        taps.push(tap);
        tapped.add(ctx);
      }
      return out;
    } as typeof AudioNode.prototype.connect;
    Object.assign(window, {
      __peak: () => {
        const buf = new Float32Array(2048);
        let peak = 0;
        for (const t of taps) {
          t.getFloatTimeDomainData(buf);
          for (const v of buf) peak = Math.max(peak, Math.abs(v));
        }
        return peak;
      },
    });
  });
  await open(page);
  await hostHook(page);
  // Music is not started yet, so the hold below comes before its first read
  expect((await mainCounts(page)).tracker).toBeUndefined();
  await page.evaluate(() => {
    const host = (
      window as unknown as {
        __host: { fs: { readText(p: string): Promise<string> } };
      }
    ).__host;
    const read = host.fs.readText.bind(host.fs);
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    host.fs.readText = async (p: string) => {
      if (p.endsWith("/Music/demo.trk")) await held;
      return read(p);
    };
    Object.assign(window, { __releaseDemo: release });
  });
  await run(page);
  // the window runs; the demo is still being read
  await expect(playBtn(page)).toBeDisabled();
  await expect(win(page).locator(".bar .t")).toHaveText(/^Music - untitled/);
  await page.evaluate(() =>
    (window as unknown as { __releaseDemo(): void }).__releaseDemo(),
  );
  await expect(playBtn(page)).toBeEnabled();

  const f = await demo();
  await expect(
    win(page)
      .locator(".trk-field", { hasText: "BPM" })
      .locator(".stepper-value"),
  ).toHaveText(String(f.bpm));
  expect(await shownNotes(page)).toEqual(fileNotes(f, f.order[0]));

  await playBtn(page).click();
  // the position advances within 1 s
  await expect.poll(() => playRow(page), { timeout: 1000 }).toBeGreaterThan(0);
  if (browserName === "chromium")
    await expect
      .poll(() =>
        page.evaluate(() =>
          (window as unknown as { __peak(): number }).__peak(),
        ),
      )
      .toBeGreaterThan(0);
});

/** Before Music starts: its demo read rejects, or returns text that is not a song. */
async function breakDemo(page: Page, how: "reject" | "invalid"): Promise<void> {
  await hostHook(page);
  expect((await mainCounts(page)).tracker).toBeUndefined();
  await page.evaluate((how) => {
    const host = (
      window as unknown as {
        __host: { fs: { readText(p: string): Promise<string> } };
      }
    ).__host;
    const read = host.fs.readText.bind(host.fs);
    host.fs.readText = async (p: string) => {
      if (!p.endsWith("/Music/demo.trk")) return read(p);
      if (how === "reject") throw new Error("read failed (test)");
      return "not a song";
    };
  }, how);
}

/** The load error alert shows; OK closes it. */
async function dismissLoadError(page: Page): Promise<void> {
  await expect(panel(page)).toContainText("Could not open");
  await panel(page).getByRole("button", { name: "OK" }).click();
  await expect(panel(page)).toHaveCount(0);
}

const patBtn = (page: Page) =>
  win(page).getByRole("button", { name: "Play Pattern", exact: true });

test("R6 a rejected demo read leaves Play disabled; File → New makes Music ready", async ({
  page,
}) => {
  await open(page);
  await breakDemo(page, "reject");
  await run(page);
  await dismissLoadError(page);
  await expect(playBtn(page)).toBeDisabled();
  await expect(patBtn(page)).toBeDisabled();
  await chooseMenu(page, "music", "Song");
  await expect(
    win(page).locator(".menu .menu-item", { hasText: "Play / Stop" }),
  ).toHaveClass(/disabled/);
  await page.keyboard.press("Escape");
  await expect(win(page).locator(".menu")).toHaveCount(0);

  await chooseMenu(page, "music", "File", "New");
  await expect(playBtn(page)).toBeEnabled();
  await expect(patBtn(page)).toBeEnabled();
});

test("R6 an invalid demo leaves Play disabled; Open… of a valid .trk makes Music ready", async ({
  page,
}) => {
  await open(page);
  await breakDemo(page, "invalid");
  await run(page);
  await dismissLoadError(page);
  await expect(playBtn(page)).toBeDisabled();

  const chooser = page.waitForEvent("filechooser");
  await chooseMenu(page, "music", "File", "Open…");
  await (await chooser).setFiles(DEMO);
  await expect(win(page).locator(".bar .t")).toHaveText(/^Music - demo\.trk$/);
  await expect(playBtn(page)).toBeEnabled();
  await playBtn(page).click();
  await expect.poll(() => playRow(page)).toBeGreaterThan(0);
});

/** Before Music starts: holds its demo read until __releaseDemo(). */
async function holdDemo(page: Page): Promise<void> {
  await hostHook(page);
  expect((await mainCounts(page)).tracker).toBeUndefined();
  await page.evaluate(() => {
    const host = (
      window as unknown as {
        __host: { fs: { readText(p: string): Promise<string> } };
      }
    ).__host;
    const read = host.fs.readText.bind(host.fs);
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    let demoReads = 0;
    host.fs.readText = async (p: string) => {
      if (!p.endsWith("/Music/demo.trk")) return read(p);
      demoReads++;
      await held;
      const text = await read(p);
      Object.assign(window, { __demoDone: true });
      return text;
    };
    Object.assign(window, {
      __releaseDemo: release,
      __demoReads: () => demoReads,
    });
  });
}

/** Releases the held demo read and waits until its text has been returned. */
async function releaseDemo(page: Page): Promise<void> {
  await page.evaluate(() =>
    (window as unknown as { __releaseDemo(): void }).__releaseDemo(),
  );
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as { __demoDone?: boolean }).__demoDone,
      ),
    )
    .toBe(true);
}

const cell00 = (page: Page) =>
  win(page).locator('.trk-row[data-r="0"] .trk-cell[data-c="0"] .n');

test("R6 a held demo, then New and a note: the late demo does not replace the new song", async ({
  page,
}) => {
  await open(page);
  await holdDemo(page);
  await run(page);
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as unknown as { __demoReads(): number }).__demoReads(),
      ),
    )
    .toBe(1);
  await chooseMenu(page, "music", "File", "New");
  await expect(playBtn(page)).toBeEnabled();
  await cell00(page).click();
  await page.keyboard.press("z");
  await expect(cell00(page)).toHaveText("C-4");
  await expect(win(page).locator(".bar .t")).toHaveText(
    /^Music - untitled \*$/,
  );

  await releaseDemo(page);
  // a later round trip: the app has handled the late result by now
  await chooseMenu(page, "music", "Song");
  await page.keyboard.press("Escape");
  await expect(win(page).locator(".menu")).toHaveCount(0);
  await expect(cell00(page)).toHaveText("C-4");
  await expect(win(page).locator(".bar .t")).toHaveText(
    /^Music - untitled \*$/,
  );
  await expect(panel(page)).toHaveCount(0);
});

test("R6 a held demo, then Open… of a .trk: the late demo does not replace the opened song", async ({
  page,
}) => {
  await open(page);
  await holdDemo(page);
  await run(page);
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as unknown as { __demoReads(): number }).__demoReads(),
      ),
    )
    .toBe(1);
  const f = await demo();
  const mine = { ...f, bpm: 99 };
  const chooser = page.waitForEvent("filechooser");
  await chooseMenu(page, "music", "File", "Open…");
  await (
    await chooser
  ).setFiles({
    name: "mine.trk",
    mimeType: "application/octet-stream",
    buffer: Buffer.from(JSON.stringify(mine)),
  });
  const bpm = win(page)
    .locator(".trk-field", { hasText: "BPM" })
    .locator(".stepper-value");
  await expect(win(page).locator(".bar .t")).toHaveText(/^Music - mine\.trk$/);
  await expect(bpm).toHaveText("99");

  await releaseDemo(page);
  await chooseMenu(page, "music", "Song");
  await page.keyboard.press("Escape");
  await expect(win(page).locator(".menu")).toHaveCount(0);
  await expect(win(page).locator(".bar .t")).toHaveText(/^Music - mine\.trk$/);
  await expect(bpm).toHaveText("99");
  await expect(panel(page)).toHaveCount(0);
});

test("D2 on the sheet the instrument panel has no sideways scroll and every Music button label fits", async ({
  page,
}) => {
  await ready(page);
  const side = win(page).locator(".trk-side");
  await expect(side).toBeVisible();
  // the app area keeps its size (552 × 284 client, 004 R2)
  const size = await win(page)
    .locator(".trk")
    .evaluate((el) => [el.clientWidth, el.clientHeight]);
  expect(size[0]).toBe(552);
  const over = await win(page)
    .locator(".trk")
    .evaluate((root) => {
      const out: string[] = [];
      const side = root.querySelector<HTMLElement>(".trk-side")!;
      if (side.scrollWidth > side.clientWidth)
        out.push(`.trk-side ${side.scrollWidth} > ${side.clientWidth}`);
      for (const b of root.querySelectorAll<HTMLElement>("button")) {
        if (!b.offsetParent || !b.textContent?.trim()) continue;
        if (b.scrollWidth > b.clientWidth)
          out.push(
            `${b.textContent.trim()} ${b.scrollWidth} > ${b.clientWidth}`,
          );
      }
      return out;
    });
  expect(over).toEqual([]);
});

test("R6.a audio resume rejected: Play stays enabled and a second press retries", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const Base = window.AudioContext;
    let resumes = 0;
    let hold = true;
    window.AudioContext = class extends Base {
      constructor(o?: AudioContextOptions) {
        super(o);
        void super.suspend();
      }
      get state(): AudioContextState {
        return hold ? "suspended" : super.state;
      }
      resume(): Promise<void> {
        // the first resume is refused, as a browser may refuse it
        if (++resumes === 1)
          return Promise.reject(new DOMException("refused", "NotAllowedError"));
        hold = false;
        return super.resume();
      }
    };
    Object.assign(window, { __resumes: () => resumes });
  });
  const resumes = () =>
    page.evaluate(() =>
      (window as unknown as { __resumes(): number }).__resumes(),
    );
  await ready(page);
  await playBtn(page).click();
  await expect.poll(resumes).toBe(1);
  await expect(playBtn(page)).toBeEnabled();
  await playBtn(page).click();
  await expect.poll(resumes).toBe(2);
  await expect.poll(() => playRow(page)).toBeGreaterThan(0);
});

test("R7.a Save of the edited demo downloads demo.trk with the change; Open… loads it back; Save As offers demo.trk", async ({
  page,
}) => {
  await ready(page);
  const got = downloads(page);
  const f = await demo();
  // row 0, channel 0 of the demo is empty: "z" writes C-4 there
  expect(fileNotes(f, f.order[0])[0][0]).toBe("---");
  await win(page)
    .locator('.trk-row[data-r="0"] .trk-cell[data-c="0"] .n')
    .click();
  await page.keyboard.press("z");
  await expect(
    win(page).locator('.trk-row[data-r="0"] .trk-cell[data-c="0"] .n'),
  ).toHaveText("C-4");
  await expect(win(page).locator(".bar .t")).toHaveText(/\*$/);

  const d1 = page.waitForEvent("download");
  await save(page);
  const saved = await d1;
  expect(saved.suggestedFilename()).toBe("demo.trk");
  const bytes = await readFile(await saved.path());
  const back = JSON.parse(bytes.toString("utf8")) as TrkFile;
  expect(back.patterns[f.order[0]].rows[0].slice(0, 3)).toBe("C-4");
  await expect(win(page).locator(".bar .t")).not.toHaveText(/\*$/);

  // a new song, then Open… brings the change back
  await chooseMenu(page, "music", "File", "New");
  await expect(
    win(page).locator('.trk-row[data-r="0"] .trk-cell[data-c="0"] .n'),
  ).toHaveText("---");
  const chooser = page.waitForEvent("filechooser");
  await chooseMenu(page, "music", "File", "Open…");
  await (
    await chooser
  ).setFiles({
    name: "demo.trk",
    mimeType: "application/octet-stream",
    buffer: bytes,
  });
  await expect(
    win(page).locator('.trk-row[data-r="0"] .trk-cell[data-c="0"] .n'),
  ).toHaveText("C-4");
  await expect(win(page).locator(".bar .t")).toHaveText(/^Music - demo\.trk$/);

  await chooseMenu(page, "music", "File", "Save As…");
  await expect(panel(page).locator("input")).toHaveValue("demo.trk");
  const d2 = page.waitForEvent("download");
  await answer(page);
  expect((await d2).suggestedFilename()).toBe("demo.trk");
  expect(got.map((d) => d.suggestedFilename())).toEqual([
    "demo.trk",
    "demo.trk",
  ]);
});

/**
 * Holds OfflineAudioContext rendering until __releaseRender(); counts renders
 * and the host's automatic downloads (its hidden link's click).
 */
async function holdRender(page: Page, untilInactive = false): Promise<void> {
  await page.addInitScript((untilInactive) => {
    const start = OfflineAudioContext.prototype.startRendering;
    let renders = 0;
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    // the page itself watches the activation: Playwright's calls into the
    // page (evaluate, locator checks) count as user gestures, so the test
    // must not touch the page until the link shows (it says so on the console)
    const inactive = (): Promise<void> =>
      new Promise((done) => {
        const id = setInterval(() => {
          if (navigator.userActivation.isActive) return;
          clearInterval(id);
          done();
        }, 50);
      });
    OfflineAudioContext.prototype.startRendering = async function (
      this: OfflineAudioContext,
    ) {
      renders++;
      await (untilInactive ? inactive() : held);
      return start.call(this);
    };
    if (untilInactive)
      new MutationObserver((_, obs) => {
        if (!document.querySelector("a.host-download")) return;
        obs.disconnect();
        console.log("t5: download link shown");
      }).observe(document, { childList: true, subtree: true });
    const click = HTMLAnchorElement.prototype.click;
    let autos = 0;
    HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
      if (this.download) autos++;
      click.call(this);
    };
    Object.assign(window, {
      __autos: () => autos,
      __renders: () => renders,
      __releaseRender: release,
    });
  }, untilInactive);
}
/** Calls of the host's hidden download link (fs.ts downloadBytes). */
const autos = (page: Page) =>
  page.evaluate(() => (window as unknown as { __autos(): number }).__autos());
const renders = (page: Page) =>
  page.evaluate(() =>
    (window as unknown as { __renders(): number }).__renders(),
  );

test("R7.b Export WAV…: a cancelled name downloads nothing; a second Export during rendering does not start; one valid .wav of the song's length downloads", async ({
  page,
}) => {
  await holdRender(page);
  await ready(page);
  const got = downloads(page);

  await chooseMenu(page, "music", "File", "Export WAV…");
  await expect(panel(page).locator("input")).toHaveValue("demo.wav");
  await panel(page).getByRole("button", { name: "Cancel" }).click();
  await expect(panel(page)).toHaveCount(0);

  await chooseMenu(page, "music", "File", "Export WAV…");
  await answer(page);
  await expect.poll(() => renders(page)).toBe(1);
  // rendering: Export WAV… does not start a second export
  await chooseMenu(page, "music", "File");
  const item = win(page).locator(".menu .menu-item", { hasText: "Export WAV" });
  await expect(item).toHaveClass(/disabled/);
  await item.click();
  await page.keyboard.press("Escape");
  await expect(win(page).locator(".menu")).toHaveCount(0);

  // R13 / 002 R6.c: the automatic download is blocked (host test hook), so
  // the WAV comes only through the window's Download link
  await page.evaluate(() =>
    Object.assign(globalThis, { __hostBlockDownloads: true }),
  );
  await page.evaluate(() =>
    (window as unknown as { __releaseRender(): void }).__releaseRender(),
  );
  const link = win(page).getByRole("link", { name: "Download demo.wav" });
  await expect(link).toBeVisible();
  expect(await autos(page)).toBe(0);
  expect(got).toHaveLength(0);
  const d = page.waitForEvent("download");
  await link.click();
  const wav = await d;
  expect(wav.suggestedFilename()).toBe("demo.wav");
  // after the export, Export WAV… works again
  await chooseMenu(page, "music", "File");
  await expect(item).not.toHaveClass(/disabled/);
  await page.keyboard.press("Escape");
  await expect(win(page).locator(".menu")).toHaveCount(0);
  // no second download question, and no second export's name prompt
  await expect(panel(page)).toHaveCount(0);
  expect(await renders(page)).toBe(1);

  await checkWav(wav, await demo());
  expect(got.map((x) => x.suggestedFilename())).toEqual(["demo.wav"]);
});

/** A valid PCM RIFF/WAVE file, not silent, of the song plus the 0.5 s ring-out. */
async function checkWav(wav: Download, f: TrkFile): Promise<void> {
  const b = await readFile(await wav.path());
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const tag = (o: number) => b.subarray(o, o + 4).toString("latin1");
  expect([tag(0), tag(8), tag(12), tag(36)]).toEqual([
    "RIFF",
    "WAVE",
    "fmt ",
    "data",
  ]);
  expect(v.getUint32(4, true)).toBe(b.length - 8);
  expect(v.getUint16(20, true)).toBe(1); // PCM
  const channels = v.getUint16(22, true);
  const rate = v.getUint32(24, true);
  const bits = v.getUint16(34, true);
  const dataBytes = v.getUint32(40, true);
  expect(dataBytes).toBe(b.length - 44);
  let nonZero = 0;
  for (let o = 44; o < b.length; o += 2) if (v.getInt16(o, true)) nonZero++;
  expect(nonZero).toBeGreaterThan(0);
  // the song plus the export's 0.5 s ring-out (engine.ts renderSong)
  const seconds = dataBytes / (channels * (bits / 8) * rate);
  expect(Math.abs(seconds - (songSeconds(f) + 0.5))).toBeLessThan(0.1);
}

test("R13 Export WAV… after user activation has expired: no automatic download; the Download link gives one valid WAV", async ({
  page,
}) => {
  await holdRender(page, true);
  await ready(page);
  const hasActivation = await page.evaluate(
    () => "userActivation" in navigator,
  );
  // without the API the host always tries the automatic download (fs.ts
  // canAutoDownload), so there is no expiry to test
  test.skip(!hasActivation, "no navigator.userActivation in this browser");
  const got = downloads(page);
  await chooseMenu(page, "music", "File", "Export WAV…");
  // the page holds rendering until the OK press's activation is over (about
  // 5 s); the test waits for the page's console line, without touching it
  const shown = page.waitForEvent("console", {
    predicate: (m) => m.text() === "t5: download link shown",
    timeout: 30_000,
  });
  await answer(page);
  await shown;
  const link = win(page).getByRole("link", { name: "Download demo.wav" });
  await expect(link).toBeVisible();
  expect(await renders(page)).toBe(1);
  // the host did not try an automatic download, and none came
  expect(await autos(page)).toBe(0);
  expect(got).toHaveLength(0);
  const d = page.waitForEvent("download");
  await link.click();
  await checkWav(await d, await demo());
  expect(got.map((x) => x.suggestedFilename())).toEqual(["demo.wav"]);
  expect(await autos(page)).toBe(1);
});

test("R7 a song over 90 s is refused before rendering, with a message", async ({
  page,
}) => {
  await holdRender(page);
  await ready(page);
  const got = downloads(page);
  // the demo at 40 BPM with 8 order entries: 8 × 32 rows = 96 s
  const f = await demo();
  const long = {
    ...f,
    bpm: 40,
    order: Array.from({ length: 8 }, (_, i) => f.order[i % f.order.length]),
    loop: 0,
  };
  expect(songSeconds(long)).toBeGreaterThan(90);
  const chooser = page.waitForEvent("filechooser");
  await chooseMenu(page, "music", "File", "Open…");
  await (
    await chooser
  ).setFiles({
    name: "long.trk",
    mimeType: "application/octet-stream",
    buffer: Buffer.from(JSON.stringify(long)),
  });
  await expect(win(page).locator(".bar .t")).toHaveText(/^Music - long\.trk$/);

  await chooseMenu(page, "music", "File", "Export WAV…");
  await expect(panel(page)).toContainText("up to 90 seconds");
  // a message, not the name prompt
  await expect(panel(page).locator("input")).toHaveCount(0);
  await panel(page).getByRole("button", { name: "OK" }).click();
  await expect(panel(page)).toHaveCount(0);
  expect(await renders(page)).toBe(0);
  expect(got).toHaveLength(0);
});

test("R13 Save with downloads blocked shows the Download link, which downloads demo.trk", async ({
  page,
}) => {
  await ready(page);
  await page.evaluate(() =>
    Object.assign(globalThis, { __hostBlockDownloads: true }),
  );
  await save(page);
  const link = win(page).getByRole("link", { name: "Download demo.trk" });
  await expect(link).toBeVisible();
  const d = page.waitForEvent("download");
  await link.click();
  const got = await d;
  expect(got.suggestedFilename()).toBe("demo.trk");
  const back = JSON.parse(
    (await readFile(await got.path())).toString("utf8"),
  ) as TrkFile;
  expect(back.bpm).toBe((await demo()).bpm);
});
