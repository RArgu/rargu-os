// Spec 009 R4.a: a scripted window drag at zoom 100 % costs at most 150
// devtools Paint events (HEAD f54ed3c: about 357). Chromium only, in the
// "perf" project: 1280 × 800 at DPR 2, one worker, after the other projects
// (playwright.config.ts). Trace category devtools.timeline; no screenshots in
// the measured phase. Frame times are reported, not gated.
//
// The drag (the Fable advisor's method, fable-009/measure.mjs): 400 px right
// and 240 px down in 10 px steps, one frame apart (about 600 px/s), 300 ms
// still, a flick of 5 × 30 px left, the release, then 1.6 s to settle.
import type { CDPSession, Page } from "@playwright/test";
import { expect, test } from "./helpers";
import { sheet } from "./sheet-base";

/** R4.a: the gate. */
const MAX_PAINTS = 150;

const pos = (page: Page) =>
  page.locator('[data-win="castlesiege"]').evaluate((w) => {
    const m = /translate\(([-\d.e]+)px(?:, ([-\d.e]+)px)?\)/.exec(
      (w as HTMLElement).style.transform,
    )!;
    return [+m[1], +(m[2] ?? 0)];
  });

/** One animation frame of the page (the pacing of the steps). */
const frame = (page: Page) =>
  page.evaluate(
    () => new Promise<void>((r) => requestAnimationFrame(() => r())),
  );

/** Page time passes (part of the drag's schedule, not a wait for a state). */
const pageWait = (page: Page, ms: number) =>
  page.evaluate(async (ms) => {
    const t0 = performance.now();
    while (performance.now() - t0 < ms)
      await new Promise((r) => setTimeout(r, ms - (performance.now() - t0)));
  }, ms);

test("009 R4.a a scripted drag costs at most 150 Paint events", async ({
  page,
}, info) => {
  await page.goto(sheet());
  await expect(page.locator("#world")).toHaveAttribute("style", /scale\(1\)/);
  await page.evaluate(() => document.fonts.ready);
  expect(await pos(page)).toEqual([360, 100]);
  // frame times of the measured phase (reported only)
  await page.evaluate(() => {
    const w = window as unknown as { __ft: number[] };
    w.__ft = [];
    const loop = (t: number) => {
      w.__ft.push(t);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  });

  const cdp: CDPSession = await page.context().newCDPSession(page);
  const events: { name: string; ph: string }[] = [];
  cdp.on("Tracing.dataCollected", ({ value }) =>
    events.push(...(value as { name: string; ph: string }[])),
  );
  await cdp.send("Tracing.start", {
    categories: "devtools.timeline",
    transferMode: "ReportEvents",
  });
  const t0 = await page.evaluate(() => performance.now());

  let [x, y] = [580, 112]; // CastleSiege's title bar
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (const [dx, dy, n] of [
    [10, 0, 40],
    [0, 10, 24],
  ])
    for (let i = 0; i < n; i++) {
      x += dx;
      y += dy;
      await page.mouse.move(x, y);
      await frame(page);
    }
  await pageWait(page, 300);
  // the drag happened: the grab point followed the pointer
  const held = await pos(page);
  for (let i = 0; i < 5; i++) {
    x -= 30;
    await page.mouse.move(x, y);
    await frame(page);
  }
  await page.mouse.up();
  await pageWait(page, 1600);

  const t1 = await page.evaluate(() => performance.now());
  const done = new Promise((r) => cdp.once("Tracing.tracingComplete", r));
  await cdp.send("Tracing.end");
  await done;
  await cdp.detach();
  const end = await pos(page);

  expect(held, "held at the pointer").toEqual([760, 340]);
  // thrown left from the release at x = 610
  expect(end[0], "the flick threw it left").toBeLessThan(610 - 50);
  expect(end[1]).toBe(340);

  const paints = events.filter(
    (e) => e.name === "Paint" && (e.ph === "X" || e.ph === "B"),
  ).length;
  const ft = await page.evaluate(
    ([a, b]) =>
      (window as unknown as { __ft: number[] }).__ft.filter(
        (t) => t >= a && t <= b,
      ),
    [t0, t1],
  );
  const dt = ft
    .slice(1)
    .map((t, i) => t - ft[i])
    .sort((a, b) => a - b);
  const report = {
    paints,
    frames: ft.length,
    frameMsMedian: +dt[Math.floor(dt.length / 2)].toFixed(1),
    frameMsP95: +dt[Math.floor(dt.length * 0.95)].toFixed(1),
    frameMsMax: +dt[dt.length - 1].toFixed(1),
    over34ms: dt.filter((d) => d > 34).length,
  };
  info.annotations.push({ type: "R4", description: JSON.stringify(report) });
  console.log(`009 R4 ${JSON.stringify(report)}`);
  expect(events.length, "the trace recorded the page").toBeGreaterThan(0);
  expect(paints, "Paint events during the drag").toBeLessThanOrEqual(
    MAX_PAINTS,
  );
});
