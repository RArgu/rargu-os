// Spec 001 T8, R22.a: no animation-frame callback runs while nothing moves.
// Two checks: a wrapper around requestAnimationFrame that counts the page's
// callbacks as they run (every desktop browser), and in Chromium a
// performance trace that must hold no FireAnimationFrame event.
import type { CDPSession, Page } from "@playwright/test";
import { expect, test } from "./helpers";
import { chooseMenu } from "./host-helpers";
import { sheet } from "./sheet-base";

/** R22.a: the length of the idle window, in ms of page time. */
const IDLE_MS = 2000;

type Probe = { __runs: number; __live(): number; __frame(): Promise<void> };

async function open(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const raw = requestAnimationFrame.bind(window);
    const cancel = cancelAnimationFrame.bind(window);
    const live = new Set<number>();
    const w = window as unknown as Probe;
    w.__runs = 0;
    window.requestAnimationFrame = (cb) => {
      const id = raw((t) => {
        live.delete(id);
        w.__runs++;
        cb(t);
      });
      live.add(id);
      return id;
    };
    window.cancelAnimationFrame = (id) => {
      live.delete(id);
      cancel(id);
    };
    w.__live = () => live.size;
    // the test's own frame wait, not counted
    w.__frame = () => new Promise<void>((r) => raw(() => r()));
  });
  await page.goto(sheet());
  await expect(page.locator("#world")).toHaveAttribute("style", /scale\(/);
  await settled(page);
}

/** Waits until a frame has run and the page has no frame pending. */
const settled = (page: Page) =>
  expect
    .poll(() =>
      page.evaluate(async () => {
        const w = window as unknown as Probe;
        await w.__frame();
        return w.__live();
      }),
    )
    .toBe(0);

/** Chromium only: a devtools timeline trace, read back as events. */
async function startTrace(page: Page): Promise<() => Promise<string[]>> {
  const cdp: CDPSession = await page.context().newCDPSession(page);
  const names: string[] = [];
  cdp.on("Tracing.dataCollected", ({ value }) => {
    for (const e of value as { name: string }[]) names.push(e.name);
  });
  await cdp.send("Tracing.start", {
    categories: "devtools.timeline",
    transferMode: "ReportEvents",
  });
  return async () => {
    const done = new Promise((r) => cdp.once("Tracing.tracingComplete", r));
    await cdp.send("Tracing.end");
    await done;
    await cdp.detach();
    return names;
  };
}

/** R22.a: the page is left alone for IDLE_MS (a clock wait inside the page:
 * the idle time is the requirement itself), and no callback may run. */
async function expectIdle(page: Page, browserName: string): Promise<void> {
  const stop = browserName === "chromium" ? await startTrace(page) : null;
  const { runs, live } = await page.evaluate(async (ms) => {
    const w = window as unknown as Probe;
    const before = w.__runs;
    const t0 = performance.now();
    while (performance.now() - t0 < ms)
      await new Promise((r) => setTimeout(r, ms - (performance.now() - t0)));
    return { runs: w.__runs - before, live: w.__live() };
  }, IDLE_MS);
  expect.soft(runs, "animation-frame callbacks run while idle").toBe(0);
  expect.soft(live, "animation frames pending after the idle window").toBe(0);
  if (stop) {
    const names = await stop();
    // the trace did record the page (proof the trace is not empty)
    expect(names.length).toBeGreaterThan(0);
    expect(
      names.filter((n) => n === "FireAnimationFrame"),
      "FireAnimationFrame events in the idle trace",
    ).toEqual([]);
  }
}

test("R22.a idle after start-up: no animation-frame callbacks for 2 s", async ({
  page,
  browserName,
}) => {
  await open(page);
  await expectIdle(page, browserName);
});

test("R22.a idle after a throw has settled: no animation-frame callbacks for 2 s", async ({
  page,
  browserName,
}) => {
  await open(page);
  const bar = page.locator('[data-win="castlesiege"] .bar .t').first();
  const b = (await bar.boundingBox())!;
  const press: [number, number] = [b.x + b.width / 2, b.y + b.height / 2];
  const before = await page.evaluate(() => (window as unknown as Probe).__runs);
  await page.mouse.move(...press);
  await page.mouse.down();
  for (let i = 1; i <= 4; i++)
    await page.mouse.move(press[0] + 60 * i, press[1] + 20 * i);
  await page.mouse.up();
  await settled(page);
  const runs = await page.evaluate(() => (window as unknown as Probe).__runs);
  expect(runs, "the throw ran animation frames").toBeGreaterThan(before);
  await expectIdle(page, browserName);
});

test("R22.a idle after Reset has settled: no animation-frame callbacks for 2 s", async ({
  page,
  browserName,
}) => {
  await open(page);
  // carry CastleSiege away from home first, so Reset has a flight to run
  const at = () =>
    page
      .locator('[data-win="castlesiege"]')
      .evaluate((w) => (w as HTMLElement).style.transform);
  const home = await at();
  await page.mouse.move(500, 112);
  await page.mouse.down();
  for (let i = 1; i <= 5; i++)
    await page.mouse.move(500 + 40 * i, 112 + 30 * i);
  await page.mouse.up();
  await settled(page);
  expect(await at(), "CastleSiege moved away from home").not.toBe(home);
  const before = await page.evaluate(() => (window as unknown as Probe).__runs);
  await page.getByRole("button", { name: /Reset page/ }).click();
  await settled(page);
  expect(await at(), "Reset flew it home").toBe(home);
  const runs = await page.evaluate(() => (window as unknown as Probe).__runs);
  // a flight runs many frames; the minimap's redraw alone is one or two
  expect(runs - before, "Reset ran a window flight").toBeGreaterThan(3);
  await expectIdle(page, browserName);
});

test("R22.a idle after the four apps started, one restarted and one closed: no animation-frame callbacks for 2 s (002)", async ({
  page,
  browserName,
}) => {
  // a card move lands at once
  await page.emulateMedia({ reducedMotion: "reduce" });
  await open(page);
  const area = (id: string) => page.locator(`[data-win="${id}"] .demo-area`);
  for (const id of ["castlesiege", "paint", "music", "notes"]) {
    await page.locator(`[data-go="${id}"]`).click();
    await expect(area(id)).toHaveAttribute("data-host", "running");
  }
  // Notes closes and starts again; Paint closes
  await chooseMenu(page, "notes", "File", "Close");
  await expect(area("notes")).toHaveAttribute("data-host", "closed");
  await area("notes").click();
  await expect(area("notes")).toHaveAttribute("data-host", "running");
  await page.locator('[data-go="paint"]').click();
  await chooseMenu(page, "paint", "File", "Close");
  await expect(area("paint")).toHaveAttribute("data-host", "closed");
  await settled(page);
  await expectIdle(page, browserName);
});
