// Spec 013 T6: Expand and Restore (R2, R5, R6, R7) at 1280 × 800.
import type { Page } from "@playwright/test";
import { expect, test } from "./helpers";
import { sheet } from "./sheet-base";

const win = (page: Page, id: string) => page.locator(`[data-win="${id}"]`);
const btn = (page: Page, id: string) => win(page, id).locator(".bar .expand");
/** No animation runs on the page. */
const settled = (page: Page) =>
  expect
    .poll(() => page.evaluate(() => document.getAnimations().length))
    .toBe(0);
const state = (page: Page, id: string) =>
  page.evaluate((id) => {
    const vp = document.querySelector("#vp")!;
    return {
      scroll: [vp.scrollLeft, vp.scrollTop],
      zoom: document.querySelector("#zPct")!.textContent,
      place: document.querySelector<HTMLElement>(`[data-win="${id}"]`)!.style
        .transform,
    };
  }, id);
/** The crawler window at zoom 0.64 (two zoom-out steps), in view. */
async function atZoom(page: Page) {
  await page.goto(sheet());
  // each zoom step animates for 220 ms
  for (let i = 0; i < 2; i++) {
    await page.click("#zOut");
    await page.waitForTimeout(400);
  }
  await expect(page.locator("#zPct")).toHaveText("64%");
  await page.locator('#card [data-go="crawler"]').click();
  await page.waitForTimeout(600);
}
const rect = (page: Page, id: string) =>
  win(page, id).evaluate((w) => {
    const r = w.getBoundingClientRect();
    return [r.left, r.top, r.width, r.height].map(Math.round);
  });

test.describe("013 R2 Expand and Restore", () => {
  test("R2.a, R2.b: covers the viewport at scale 1; Restore puts back place, zoom and scroll", async ({
    page,
  }) => {
    await atZoom(page);
    const before = await state(page, "crawler");
    await btn(page, "crawler").click();
    await settled(page);
    expect(await rect(page, "crawler")).toEqual([0, 0, 1280, 800]);
    // its content at scale 1: the title bar is its CSS height
    const bar = await win(page, "crawler")
      .locator(".bar")
      .evaluate(
        (b) =>
          b.getBoundingClientRect().height / (b as HTMLElement).offsetHeight,
      );
    expect(bar).toBeCloseTo(1, 1);
    await expect(btn(page, "crawler")).toHaveAccessibleName(
      "Restore Generalized Focused Web Crawler",
    );
    await expect(btn(page, "crawler")).toHaveText("⤡");
    await btn(page, "crawler").click();
    await settled(page);
    expect(await state(page, "crawler")).toEqual(before);
    await expect(page.locator(".sheet-win-ph")).toHaveCount(0);
    await expect(page.locator("#lift")).toBeHidden();
    await expect(btn(page, "crawler")).toHaveAccessibleName(
      "Expand Generalized Focused Web Crawler",
    );
  });

  test("R1.c: every project window has Expand; Quick tools do not", async ({
    page,
  }) => {
    await page.goto(sheet());
    for (const id of [
      "castlesiege",
      "castlewars",
      "pentimento",
      "crawler",
      "insider",
    ])
      await expect(btn(page, id)).toHaveCount(1);
    for (const id of ["paint", "music", "notes"])
      await expect(btn(page, id)).toHaveCount(0);
  });

  test("R7.a: no drag or wheel while expanded; a drag works after Restore", async ({
    page,
  }) => {
    await atZoom(page);
    const at = await state(page, "crawler");
    await btn(page, "crawler").click();
    await settled(page);
    const bar = (await win(page, "crawler").locator(".bar .t").boundingBox())!;
    await page.mouse.move(bar.x + 20, bar.y + 5);
    await page.mouse.down();
    await page.mouse.move(bar.x + 220, bar.y + 205, { steps: 5 });
    await page.mouse.up();
    await page.mouse.wheel(0, 400);
    await page.waitForTimeout(200);
    expect(await rect(page, "crawler")).toEqual([0, 0, 1280, 800]);
    // the expanded layer owns the transform; the sheet did not move
    expect(await state(page, "crawler")).toEqual({ ...at, place: "" });
    await btn(page, "crawler").click();
    await settled(page);
    expect(await state(page, "crawler")).toEqual(at);
    const b = (await win(page, "crawler").locator(".bar .t").boundingBox())!;
    await page.mouse.move(b.x + 20, b.y + 5);
    await page.mouse.down();
    await page.mouse.move(b.x + 120, b.y + 85, { steps: 5 });
    await page.mouse.up();
    await settled(page);
    expect((await state(page, "crawler")).place).not.toBe(at.place);
  });

  test("R6.a: the crawler demo goes on through Expand and Restore", async ({
    page,
  }) => {
    await atZoom(page);
    const pages = async () =>
      Number(
        /\d+/.exec(
          (await win(page, "crawler").locator(".cr-stat").textContent()) ?? "",
        )?.[0] ?? -1,
      );
    await expect.poll(pages, { timeout: 5000 }).toBeGreaterThan(0);
    const n = await pages();
    await btn(page, "crawler").click();
    await settled(page);
    // it keeps streaming while expanded
    await expect.poll(pages, { timeout: 5000 }).toBeGreaterThan(n);
    const m = await pages();
    await btn(page, "crawler").click();
    await settled(page);
    expect(await pages()).toBeGreaterThanOrEqual(m);
    await expect.poll(pages, { timeout: 5000 }).toBeGreaterThan(m);
  });
});

test.describe("013 R5 motion", () => {
  /** Widths of the window on each frame for `ms` after `act`. */
  const sample = (page: Page, ms: number) =>
    page.evaluate(
      (ms) =>
        new Promise<number[]>((done) => {
          const w = document.querySelector<HTMLElement>(
            '[data-win="crawler"]',
          )!;
          const out: number[] = [];
          const t0 = performance.now();
          const f = () => {
            out.push(Math.round(w.getBoundingClientRect().width));
            if (performance.now() - t0 < ms) requestAnimationFrame(f);
            else done(out);
          };
          w.querySelector<HTMLElement>(".bar .expand")!.click();
          requestAnimationFrame(f);
        }),
      ms,
    );

  test("R5.a: the window grows over frames and ends at the viewport by 300 ms", async ({
    page,
  }) => {
    await atZoom(page);
    const start = (await rect(page, "crawler"))[2];
    const w = await sample(page, 300);
    expect(w.some((x) => x > start + 20 && x < 1260)).toBe(true);
    expect(w.at(-1)).toBe(1280);
  });

  test("R5.b: reduced motion: no frame between the sheet size and the viewport", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await atZoom(page);
    const w = await sample(page, 200);
    expect(new Set(w)).toEqual(new Set([1280]));
  });

  test("R5.c: reduced motion turned on mid-animation ends it at once", async ({
    page,
  }) => {
    await atZoom(page);
    await btn(page, "crawler").click();
    // deterministic: hold the expand animation mid-way, then wait for the
    // page's own media change event (not a timer), then one frame
    const held = await page.evaluate(() => {
      const w = document.querySelector('[data-win="crawler"]')!;
      const a = w.getAnimations();
      a.forEach((x) => x.pause());
      const q = matchMedia("(prefers-reduced-motion: reduce)");
      (window as unknown as { changed: Promise<void> }).changed = new Promise(
        (done) => q.addEventListener("change", () => done(), { once: true }),
      );
      return a.length;
    });
    expect(held, "the expand animation is under way").toBe(1);
    await page.emulateMedia({ reducedMotion: "reduce" });
    const left = await page.evaluate(async () => {
      await (window as unknown as { changed: Promise<void> }).changed;
      await new Promise(requestAnimationFrame);
      return document.querySelector('[data-win="crawler"]')!.getAnimations()
        .length;
    });
    expect(left).toBe(0);
    expect(await rect(page, "crawler")).toEqual([0, 0, 1280, 800]);
  });

  test("R5.d: no animation frame runs 2 s after 5 Expand and Restore cycles", async ({
    page,
  }) => {
    await atZoom(page);
    for (let i = 0; i < 5; i++) {
      await btn(page, "crawler").click();
      await settled(page);
      await btn(page, "crawler").click();
      await settled(page);
    }
    // the crawler demo's own timer is no animation frame; count frames only
    await page.waitForTimeout(500);
    const frames = await page.evaluate(
      () =>
        new Promise<number>((done) => {
          let n = 0;
          const raf = window.requestAnimationFrame.bind(window);
          window.requestAnimationFrame = (cb) => (n++, raf(cb));
          setTimeout(() => done(n), 2000);
        }),
    );
    expect(frames).toBe(0);
  });
});

test.describe("013 R4 modal dialog", () => {
  const inWin = (page: Page, id: string) =>
    page.evaluate(
      (id) =>
        !!document
          .querySelector(`[data-win="${id}"]`)!
          .contains(document.activeElement),
      id,
    );

  test("R4.a: a labelled modal dialog; Tab and Shift+Tab stay in it; Esc restores to the Expand control", async ({
    page,
  }) => {
    await atZoom(page);
    await btn(page, "crawler").focus();
    await page.keyboard.press("Enter");
    await settled(page);
    const lift = page.locator("#lift");
    await expect(lift).toHaveAttribute("role", "dialog");
    await expect(lift).toHaveAttribute("aria-modal", "true");
    await expect(lift).toHaveAccessibleName("Generalized Focused Web Crawler");
    for (const s of ["#vp", "#card", ".mapbox"])
      expect(
        await page.locator(s).evaluate((e) => (e as HTMLElement).inert),
        s,
      ).toBe(true);
    await expect(btn(page, "crawler")).toBeFocused();
    for (let i = 0; i < 50; i++) {
      await page.keyboard.press("Tab");
      expect(await inWin(page, "crawler"), `Tab ${i + 1}`).toBe(true);
    }
    for (let i = 0; i < 50; i++) {
      await page.keyboard.press("Shift+Tab");
      expect(await inWin(page, "crawler"), `Shift+Tab ${i + 1}`).toBe(true);
    }
    await page.keyboard.press("Escape");
    await settled(page);
    await expect(lift).toBeHidden();
    await expect(btn(page, "crawler")).toBeFocused();
    expect(
      await page.locator("#vp").evaluate((e) => (e as HTMLElement).inert),
    ).toBe(false);
  });

  test("R4.b: expanded CastleSiege keeps Esc in the game; Tab then Esc restores", async ({
    page,
  }) => {
    await page.goto(sheet());
    const area = win(page, "castlesiege").locator(".demo-area");
    await expect(area).toHaveAttribute("data-host", "running", {
      timeout: 15000,
    });
    await btn(page, "castlesiege").click();
    await settled(page);
    await area.locator(".cs-cell").first().focus();
    expect(await inWin(page, "castlesiege")).toBe(true);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(100);
    await expect(page.locator("#lift")).toBeVisible();
    await page.keyboard.press("Tab"); // 002: Esc then Tab leaves the game
    await expect(win(page, "castlesiege")).toBeFocused();
    await page.keyboard.press("Escape");
    await settled(page);
    await expect(page.locator("#lift")).toBeHidden();
    await expect(btn(page, "castlesiege")).toBeFocused();
  });

  test("R4.b: a control that takes Esc keeps the window expanded", async ({
    page,
  }) => {
    await atZoom(page);
    await btn(page, "crawler").click();
    await settled(page);
    await page.evaluate(() => {
      const b = document.createElement("button");
      b.id = "takes-esc";
      b.textContent = "x";
      b.addEventListener("keydown", (e) => {
        if (e.key === "Escape") e.preventDefault();
      });
      document.querySelector('[data-win="crawler"] .about')!.append(b);
    });
    await page.locator("#takes-esc").focus();
    await page.keyboard.press("Escape");
    await page.waitForTimeout(100);
    await expect(page.locator("#lift")).toBeVisible();
  });
});
