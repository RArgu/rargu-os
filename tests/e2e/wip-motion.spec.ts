// Spec 005 T6: reduced motion in the Castle Wars and Pentimento windows (R7,
// R7.a), through the page. Time is Playwright's fake clock, paused: page
// timers and animation frames run only when a test runs the clock, so "at
// the next frame" means with no page time passing at all.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "@playwright/test";
import { expect, test } from "./helpers";
import { sheet } from "./sheet-base";

/** The first frame of each animation per unit: the Aseprite tags' `from`,
 * read here from the JSON, apart from the build's generator. */
const ART = join(import.meta.dirname, "../../src/apps/castlewars/art");
const UNITS = [
  "swordsman",
  "spearman",
  "hammerman",
  "archer",
  "knight",
  "wizard",
];
const FIRST: Record<string, Record<string, number>> = {};
for (const u of UNITS) {
  const d = JSON.parse(readFileSync(join(ART, `${u}.json`), "utf8")) as {
    meta: { frameTags: { name: string; from: number }[] };
  };
  for (const t of d.meta.frameTags) (FIRST[t.name] ??= {})[u] = t.from;
}

const SPRITE =
  /\/(swordsman|spearman|hammerman|archer|knight|wizard)[^/]*\.png$/;
const STEP = 550; // Pentimento's ms between lines
const PROMPT = "agent> pull the text in this image onto its own layer";
const LINES = [
  "$ pentimento detect-text in.png  → 1 region (22,36 248×48)",
  '$ pentimento layer extract --region 0 --name "SUMMER SALE"',
  "$ pentimento inpaint --layer 0 --region 0",
  "done: 2 layers",
];

interface Draw {
  u: string;
  f: number;
}

/** /next on the paused fake clock, with each sprite drawImage logged (unit
 * and frame) and the pending timeouts counted, as castlewars.spec.ts does. */
async function open(page: Page, reduce: boolean) {
  await page.emulateMedia({
    reducedMotion: reduce ? "reduce" : "no-preference",
  });
  const T0 = new Date("2026-10-01T00:00:00Z").getTime();
  await page.clock.install({ time: T0 });
  await page.clock.pauseAt(T0 + 1000);
  await page.addInitScript((src) => {
    const re = new RegExp(src);
    const w = window as unknown as Record<string, unknown>;
    const draws: Draw[] = [];
    w.__draws = draws;
    const raw = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function (
      this: CanvasRenderingContext2D,
      ...a: unknown[]
    ) {
      const img = a[0];
      const m =
        img instanceof HTMLImageElement &&
        re.exec(new URL(img.src, location.href).pathname);
      if (m && a.length === 9)
        draws.push({
          u: m[1],
          f: Math.round((a[1] as number) / (a[3] as number)),
        });
      return (raw as (...x: unknown[]) => void).apply(this, a);
    } as typeof raw;
    const st = window.setTimeout;
    const ct = window.clearTimeout;
    const live = new Set<number>();
    window.setTimeout = ((cb: () => void, ms?: number) => {
      const id: number = st(() => {
        live.delete(id);
        cb();
      }, ms);
      live.add(id);
      return id;
    }) as typeof setTimeout;
    window.clearTimeout = ((id: number) => {
      live.delete(id);
      ct(id);
    }) as typeof clearTimeout;
    w.__timers = () => live.size;
    // set by a listener added after the page's own: the page has seen it
    w.__changes = 0;
    matchMedia("(prefers-reduced-motion: reduce)").addEventListener(
      "change",
      () => (w.__changes as number)++,
    );
  }, SPRITE.source);
  await page.goto(sheet(), { waitUntil: "commit" });
  await expect(page.locator("#world")).toHaveAttribute("style", /scale\(/);
}

/** Turns reduced motion on or off and waits until the page's listeners ran;
 * no page time passes. */
async function setReduced(page: Page, on: boolean) {
  const n = await changes(page);
  await page.emulateMedia({ reducedMotion: on ? "reduce" : "no-preference" });
  await expect.poll(() => changes(page)).toBe(n + 1);
}
const changes = (page: Page) =>
  page.evaluate(() => (window as unknown as { __changes: number }).__changes);

const cw = (page: Page) => page.locator('[data-win="castlewars"]');
const button = (page: Page, name: string) =>
  cw(page).getByRole("button", { name, exact: true });
const draws = (page: Page) =>
  page.evaluate(() => (window as unknown as { __draws: Draw[] }).__draws);
const timers = (page: Page) =>
  page.evaluate(() => (window as unknown as { __timers(): number }).__timers());
const loaded = (page: Page) =>
  expect(cw(page).getByText("Loading units…")).toBeHidden();
/** The Castle Wars window region, as PNG bytes. */
const shot = (page: Page) => cw(page).screenshot();
/** Each unit's latest drawn frame. */
const lastFrames = async (page: Page) => {
  const d = await draws(page);
  const units = [...new Set(d.map((x) => x.u))];
  return Object.fromEntries(
    units.map((u) => [u, d.filter((x) => x.u === u).at(-1)!.f]),
  );
};
/** Every unit shows the first frame of `anim`. */
async function firstFrames(page: Page, anim: string) {
  expect(await lastFrames(page), `first frame of ${anim}`).toEqual(FIRST[anim]);
}

test.describe("R7 Castle Wars", () => {
  test("R7.a reduced motion at load: two screenshots 1 s apart are identical; a button press changes the frame", async ({
    page,
  }) => {
    await open(page, true);
    await loaded(page);
    await firstFrames(page, "idle");
    expect(await timers(page), "no timer").toBe(0);
    const a = await shot(page);
    await page.clock.runFor(1000);
    const b = await shot(page);
    expect(b.equals(a), "the same pixels 1 s later").toBe(true);
    // a press shows the first frame of the chosen animation, and stays
    await button(page, "attack").click();
    await firstFrames(page, "attack");
    const c = await shot(page);
    expect(c.equals(a), "the press changed the frame").toBe(false);
    await page.clock.runFor(1000);
    expect((await shot(page)).equals(c)).toBe(true);
    expect(await timers(page)).toBe(0);
  });

  test("R7.a the preference turned off: frames advance", async ({ page }) => {
    await open(page, true);
    await loaded(page);
    await button(page, "walk").click();
    const a = await shot(page);
    await setReduced(page, false);
    expect(await timers(page), "one timer chain").toBe(1);
    await page.clock.runFor(1000);
    expect((await shot(page)).equals(a), "frames advanced").toBe(false);
  });

  test("R7.a the preference turned off while paused: still paused", async ({
    page,
  }) => {
    await open(page, true);
    await loaded(page);
    await button(page, "pause").click();
    await setReduced(page, false);
    expect(await timers(page)).toBe(0);
    const n = (await draws(page)).length;
    await page.clock.runFor(1000);
    expect((await draws(page)).length).toBe(n);
  });

  test("R7 turned on mid-animation: the first frame of the chosen animation at once, no timer left", async ({
    page,
  }) => {
    await open(page, false);
    await loaded(page);
    await button(page, "victory").click();
    await page.clock.runFor(700);
    expect(await timers(page)).toBe(1);
    await setReduced(page, true);
    expect(await timers(page), "no timer left").toBe(0);
    await firstFrames(page, "victory");
    const a = await shot(page);
    await page.clock.runFor(1000);
    expect((await shot(page)).equals(a)).toBe(true);
  });
});

test.describe("R7 Pentimento", () => {
  const pent = (page: Page) => page.locator('[data-win="pentimento"]');
  const cmd = (page: Page) => pent(page).locator(".cmd");
  const layers = (page: Page) =>
    pent(page)
      .locator(".layers > *")
      .evaluateAll((all) =>
        all.map((d) => d.textContent!.replace(/\s+/g, " ")),
      );

  async function goPent(page: Page) {
    await page.locator('[data-go="pentimento"]').click();
    await page.clock.runFor(2000); // the navigation pan
  }

  test("R7.a turned on during a run: the final state at the next frame", async ({
    page,
  }) => {
    await open(page, false);
    await goPent(page);
    await pent(page).getByRole("button", { name: "Run the agent" }).click();
    await page.clock.runFor(STEP); // the first line
    await expect(cmd(page)).toHaveText([PROMPT, LINES[0]].join("\n"));
    await setReduced(page, true);
    // no page time has passed: the change itself ended the run
    await expect(cmd(page)).toHaveText([PROMPT, ...LINES].join("\n"));
    expect(await layers(page)).toEqual(["◉ Text: SUMMER SALE", "◉ Background"]);
    const status = pent(page).getByRole("status");
    await expect(status).toHaveText("Sketch done: 2 layers");
    expect(await timers(page), "no timer left").toBe(0);
    const anim = await pent(page)
      .locator(".layers > :first-child")
      .evaluate((d) => getComputedStyle(d).animationName);
    expect(anim).toBe("none");
    // nothing later: one copy of each line, the message once
    await page.clock.runFor(10 * STEP);
    const text = (await cmd(page).textContent())!;
    expect([PROMPT, ...LINES].map((l) => text.split(l).length - 1)).toEqual([
      1, 1, 1, 1, 1,
    ]);
    await expect(status).toHaveText("Sketch done: 2 layers");
  });

  test("R7 reduced motion at load: a run shows its final state with no animated layer", async ({
    page,
  }) => {
    await open(page, true);
    await goPent(page);
    await pent(page).getByRole("button", { name: "Run the agent" }).click();
    await expect(cmd(page)).toHaveText([PROMPT, ...LINES].join("\n"));
    expect(await layers(page)).toEqual(["◉ Text: SUMMER SALE", "◉ Background"]);
    expect(
      await pent(page)
        .locator(".layers > .new")
        .evaluate((d) => getComputedStyle(d).animationName),
    ).toBe("none");
    expect(await timers(page)).toBe(0);
  });
});
