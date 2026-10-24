// Spec 002 T3: the main window (R2.a) and lazy load (R11.a, R11.b, R12.a).
// Fixture apps exist only in test builds (`vite build --mode e2e`); `?host=`
// puts one in a sheet window (`notes:fx-size` runs fx-size in Notes).
import type { Page } from "@playwright/test";
import { expect, test } from "./helpers";
import {
  HOSTED,
  appAssets,
  appChunk,
  eligible,
  holdHost,
  idle,
  mainCounts,
  strayAssets,
} from "./host-helpers";
import { sheet } from "./sheet-base";

const area = (page: Page, id: string) =>
  page.locator(`[data-win="${id}"] .demo-area`);

/** The window's z-index is the highest of all windows. */
const onTop = (page: Page, id: string) =>
  page.evaluate((id) => {
    const z = (el: Element) => Number(getComputedStyle(el).zIndex) || 0;
    const all = [...document.querySelectorAll("[data-win]")];
    const me = z(document.querySelector(`[data-win="${id}"]`)!);
    return all.every((w) => w.getAttribute("data-win") === id || z(w) < me);
  }, id);

/** Scrolls the view so window `id` is in its middle (no card navigation). */
const scrollTo = (page: Page, id: string) =>
  page.evaluate((id) => {
    const vp = document.querySelector<HTMLElement>("#vp")!;
    const r = document
      .querySelector(`[data-win="${id}"]`)!
      .getBoundingClientRect();
    const b = vp.getBoundingClientRect();
    vp.scrollLeft += r.left + r.width / 2 - (b.left + vp.clientWidth / 2);
    vp.scrollTop += r.top + r.height / 2 - (b.top + vp.clientHeight / 2);
    return [vp.scrollLeft, vp.scrollTop];
  }, id);

const scrollPos = (page: Page) =>
  page.evaluate(() => {
    const vp = document.querySelector<HTMLElement>("#vp")!;
    return [vp.scrollLeft, vp.scrollTop];
  });

test("R2.a a fixture's setTitle, setSize(300, 200) and focus(): title, demo area size, one onResize, on top", async ({
  page,
}) => {
  await page.goto(sheet("?host=notes:fx-size"));
  await page.locator('[data-go="notes"]').click();
  await expect(area(page, "notes")).toHaveAttribute("data-host", "running");
  await expect(page.locator('[data-win="notes"] .bar .t')).toHaveText("x");
  // zoom 100 % at the start: screen px = sheet px = app px
  await expect(page.locator("#zPct")).toHaveText("100%");
  const box = await area(page, "notes").boundingBox();
  expect([Math.round(box!.width), Math.round(box!.height)]).toEqual([300, 200]);
  const resizes = await page.evaluate(
    () =>
      (window as unknown as { __fxSize: { resizes: [number, number][] } })
        .__fxSize.resizes,
  );
  expect(resizes.filter(([w, h]) => w === 300 && h === 200)).toHaveLength(1);
  expect(await onTop(page, "notes")).toBe(true);
  // another window comes to the front; the app's focus() brings it back
  await page.locator('[data-win="paint"] .bar .t').click();
  expect(await onTop(page, "paint")).toBe(true);
  await page.evaluate(() =>
    (
      window as unknown as { __fxSize: { win: { focus(): void } } }
    ).__fxSize.win.focus(),
  );
  expect(await onTop(page, "notes")).toBe(true);
});

test.describe("R11.a at 1440 × 900", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("exactly the apps of eligible windows start, nothing else loads; Music starts on a view move without taking focus", async ({
    page,
  }) => {
    const chunks: string[] = [];
    page.on("request", (r) => {
      const id = appChunk(r.url());
      if (id && r.url().endsWith(".js")) chunks.push(id);
    });
    const urls: string[] = [];
    page.on("request", (r) => urls.push(r.url()));
    await page.goto(sheet());
    const owned = await appAssets(page);
    // ownership comes from the build: Paint's (scoped, 002 T6) CSS
    expect(
      Object.entries(owned).some(
        ([f, a]) => /\/app-paint-[^/]*\.css$/.test(f) && a.includes("paint"),
      ),
    ).toBe(true);
    const near = await eligible(page);
    expect(near).not.toContain("music");
    for (const id of near)
      await expect(area(page, id)).toHaveAttribute(
        "data-host",
        /running|failed/,
      );
    await idle(page);
    const apps = near.map((id) => HOSTED[id]).sort();
    expect(await mainCounts(page)).toEqual(
      Object.fromEntries(apps.map((a) => [a, 1])),
    );
    expect([...new Set(chunks)].sort()).toEqual(apps);
    expect(strayAssets(urls, owned, apps)).toEqual([]);

    // the view moves to Music by a scroll, with the focus on the card
    await page.locator("#copy").focus();
    const at = await scrollTo(page, "music");
    await expect
      .poll(async () => (await mainCounts(page)).tracker ?? 0)
      .toBe(1);
    await expect(area(page, "music")).toHaveAttribute(
      "data-host",
      /running|failed/,
    );
    await idle(page);
    expect((await mainCounts(page)).tracker).toBe(1);
    expect(chunks.filter((c) => c === "tracker")).toHaveLength(1);
    // Music's neighbour Notes may now meet the rule too
    const now = (await eligible(page)).map((id) => HOSTED[id]);
    expect(now).toContain("tracker");
    expect(strayAssets(urls, owned, now)).toEqual([]);
    expect(await page.evaluate(() => document.activeElement?.id)).toBe("copy");
    expect(await scrollPos(page)).toEqual(at);
  });
});

test("R11.b at fit zoom every app starts once and the page stays responsive", async ({
  page,
}) => {
  await page.goto(sheet());
  await page.locator("#zFit").click();
  expect((await eligible(page)).sort()).toEqual(Object.keys(HOSTED).sort());
  for (const id of Object.keys(HOSTED))
    await expect(area(page, id)).toHaveAttribute("data-host", /running|failed/);
  await idle(page);
  expect(await mainCounts(page)).toEqual(
    Object.fromEntries(Object.values(HOSTED).map((a) => [a, 1])),
  );
  // responsive: a zoom button still answers
  const pct = await page.locator("#zPct").textContent();
  await page.locator("#zIn").click();
  await expect(page.locator("#zPct")).not.toHaveText(pct!);
});

test.describe("R12.a start failure", () => {
  test("a fixture that throws in main shows the error and Try again; another window can still be thrown", async ({
    page,
  }) => {
    await page.goto(sheet("?host=castlesiege:fx-throw"));
    const a = area(page, "castlesiege");
    await expect(a).toHaveAttribute("data-host", "failed");
    await expect(a).toContainText("fixture start failed");
    await expect(a.getByRole("button", { name: "Try again" })).toBeVisible();
    // the partial start is cleaned up
    await expect(a).not.toContainText("half started");
    // throw Castle Wars by its title bar
    const bar = page.locator('[data-win="castlewars"] .bar .t');
    const before = await page
      .locator('[data-win="castlewars"]')
      .getAttribute("style");
    const b = (await bar.boundingBox())!;
    await page.mouse.move(b.x + 20, b.y + b.height / 2);
    await page.mouse.down();
    for (let i = 1; i <= 5; i++)
      await page.mouse.move(b.x + 20 + i * 30, b.y + b.height / 2 + i * 10);
    await page.mouse.up();
    await expect
      .poll(() => page.locator('[data-win="castlewars"]').getAttribute("style"))
      .not.toBe(before);
  });

  test("a fixture that fails once then works: Try again starts it once", async ({
    page,
  }) => {
    await page.goto(sheet("?host=castlesiege:fx-flaky"));
    const a = area(page, "castlesiege");
    await expect(a).toHaveAttribute("data-host", "failed");
    await expect(a).toContainText("first start failed");
    expect((await mainCounts(page))["fx-flaky"]).toBe(1);
    await a.getByRole("button", { name: "Try again" }).click();
    await expect(a).toHaveAttribute("data-host", "running");
    await expect(page.locator('[data-win="castlesiege"] .bar .t')).toHaveText(
      "flaky ok",
    );
    expect((await mainCounts(page))["fx-flaky"]).toBe(2);
    // one run's content: the failed run was cleaned up
    await expect(a.locator(".fx-flaky")).toHaveText(["run 2"]);
    await expect(a).not.toContainText("first start failed");
  });
});

const g = <T>(page: Page, name: string) =>
  page.evaluate((n) => (window as unknown as Record<string, T>)[n], name);

test.describe("R12 cleanup of a partial start", () => {
  test("a failed start runs its termination handlers once; Try again's start does too", async ({
    page,
  }) => {
    type Leak = { live: number; released: number };
    await page.goto(sheet("?host=castlesiege:fx-leak"));
    const a = area(page, "castlesiege");
    await expect(a).toHaveAttribute("data-host", "failed");
    expect(await g<Leak>(page, "__fxLeak")).toMatchObject({
      live: 0,
      released: 1,
    });
    await a.getByRole("button", { name: "Try again" }).click();
    await expect(a).toContainText("leak fixture failed");
    await expect
      .poll(async () => (await g<Leak>(page, "__fxLeak")).released)
      .toBe(2);
    expect((await g<Leak>(page, "__fxLeak")).live).toBe(0);
  });
});

test("R2 an app that focuses its control in main() is the active app", async ({
  page,
}) => {
  await page.goto(sheet("?host=notes:fx-focus"));
  await page.locator('[data-go="notes"]').click();
  await expect(area(page, "notes")).toHaveAttribute("data-host", "running");
  await expect(page.locator(".fx-focus")).toBeFocused();
  expect(await g<{ log: boolean[] }>(page, "__fxFocus")).toEqual({
    log: [true],
  });
});

test.describe("R11 activation while a background start is pending", () => {
  /** Holds the fixture's app chunk until the returned function runs. */
  async function hold(page: Page): Promise<() => void> {
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    await page.route(/\/app-fx-focus-[^/]*\.js$/, async (route) => {
      await held;
      await route.continue();
    });
    return release;
  }

  test("a click on the pending window activates it: the app may take the focus", async ({
    page,
  }) => {
    const release = await hold(page);
    // the held chunk keeps the page's load event pending in Firefox
    await page.goto(sheet("?host=castlesiege:fx-focus"), {
      waitUntil: "domcontentloaded",
    });
    const a = area(page, "castlesiege");
    await expect(a).toHaveAttribute("data-host", "starting");
    await a.click();
    release();
    await expect(a).toHaveAttribute("data-host", "running");
    await expect(page.locator(".fx-focus")).toBeFocused();
  });

  test("Enter on the pending window's start control activates it", async ({
    page,
  }) => {
    const release = await hold(page);
    // the held chunk keeps the page's load event pending in Firefox
    await page.goto(sheet("?host=castlesiege:fx-focus"), {
      waitUntil: "domcontentloaded",
    });
    const a = area(page, "castlesiege");
    await expect(a).toHaveAttribute("data-host", "starting");
    const start = page.getByRole("button", { name: "Start CastleSiege" });
    await start.focus();
    await page.keyboard.press("Enter");
    release();
    await expect(a).toHaveAttribute("data-host", "running");
    await expect(page.locator(".fx-focus")).toBeFocused();
  });

  test("without activation the background start does not take the focus", async ({
    page,
  }) => {
    const release = await hold(page);
    // the held chunk keeps the page's load event pending in Firefox
    await page.goto(sheet("?host=castlesiege:fx-focus"), {
      waitUntil: "domcontentloaded",
    });
    const a = area(page, "castlesiege");
    await expect(a).toHaveAttribute("data-host", "starting");
    await page.locator("#copy").focus();
    release();
    await expect(a).toHaveAttribute("data-host", "running");
    await expect(page.locator("#copy")).toBeFocused();
    expect(await g<{ log: boolean[] }>(page, "__fxFocus")).toEqual({
      log: [],
    });
  });
});

test.describe("R12 load failures recover with Try again", () => {
  /** Drops the expected console line of the failed request. */
  const expected = (errors: string[]) =>
    errors.splice(
      0,
      errors.length,
      ...errors.filter((e) => !/status of 503/.test(e)),
    );
  /** Fails the first request matching `re` (503); later ones go through. */
  async function failOnce(page: Page, re: RegExp): Promise<() => number> {
    let n = 0;
    await page.route(re, (route) =>
      n++ === 0 ? route.fulfill({ status: 503, body: "" }) : route.continue(),
    );
    return () => n;
  }

  test("the host chunk fails once: the window shows the error; Try again loads the host and starts the app", async ({
    page,
    errors,
  }) => {
    // every request of the first load fails: since the host chunk has CSS
    // (002 T4, T6), Firefox imports it after its modulepreload failed, as a
    // second request
    let fail = true;
    let tries = 0;
    await page.route(/\/assets\/load-[^/]*\.js(\?.*)?$/, (route) => {
      tries++;
      return fail ? route.fulfill({ status: 503, body: "" }) : route.continue();
    });
    await page.goto(sheet());
    const a = area(page, "castlesiege");
    await expect(a).toHaveAttribute("data-host", "failed");
    const first = tries;
    fail = false;
    await a.getByRole("button", { name: "Try again" }).click();
    await expect(a).toHaveAttribute("data-host", "running");
    expect(first).toBeGreaterThan(0);
    expect(tries).toBe(first + 1);
    expected(errors);
  });

  test("an app's JS fails once: Try again imports it again and starts it once", async ({
    page,
    errors,
  }) => {
    const tries = await failOnce(page, /\/app-fx-size-[^/]*\.js(\?.*)?$/);
    await page.goto(sheet("?host=notes:fx-size"));
    await page.locator('[data-go="notes"]').click();
    const a = area(page, "notes");
    await expect(a).toHaveAttribute("data-host", "failed");
    await a.getByRole("button", { name: "Try again" }).click();
    await expect(a).toHaveAttribute("data-host", "running");
    await expect(page.locator('[data-win="notes"] .bar .t')).toHaveText("x");
    expect(tries()).toBe(2);
    expected(errors);
    expect((await mainCounts(page))["fx-size"]).toBe(1);
  });

  test("an app's CSS fails once: Try again loads the stylesheet and starts the app", async ({
    page,
    errors,
  }) => {
    const tries = await failOnce(page, /\/app-writer-[^/]*\.css(\?.*)?$/);
    await page.goto(sheet());
    await page.locator('[data-go="notes"]').click();
    const a = area(page, "notes");
    await expect(a).toHaveAttribute("data-host", "failed");
    await a.getByRole("button", { name: "Try again" }).click();
    await expect(a).toHaveAttribute("data-host", "running");
    expect(tries()).toBe(2);
    expected(errors);
    // the stylesheet applies: one loaded link, no failed one left
    expect(
      await page.evaluate(() =>
        [
          ...document.querySelectorAll<HTMLLinkElement>(
            'link[rel="stylesheet"][href*="app-writer-"]',
          ),
        ].map((l) => !!l.sheet),
      ),
    ).toEqual([true]);
  });
});

// ---- Codex 002 review (T9) #1, #5 ----

/** Drops the expected console lines of failed requests (503). */
const no503 = (errors: string[]) =>
  errors.splice(
    0,
    errors.length,
    ...errors.filter((e) => !/status of 503/.test(e)),
  );

test("R12 the host fails in every window: one recovers by Try again, one by its card link; the old Try again goes and no app loses its content", async ({
  page,
  errors,
}) => {
  let fail = true;
  await page.route(/\/assets\/load-[^/]*\.js(\?.*)?$/, (route) =>
    fail ? route.fulfill({ status: 503, body: "" }) : route.continue(),
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(sheet());
  // every hosted window meets the start rule; each fails to load the host
  await page.locator("#zFit").click();
  for (const id of Object.keys(HOSTED))
    await expect(
      area(page, id).getByRole("button", { name: "Try again" }),
    ).toBeVisible();
  fail = false;
  const old = await area(page, "paint")
    .getByRole("button", { name: "Try again" })
    .elementHandle();
  await area(page, "castlesiege")
    .getByRole("button", { name: "Try again" })
    .click();
  await expect(area(page, "castlesiege")).toHaveAttribute(
    "data-host",
    "running",
  );
  // Paint starts by the card's link: its error and Try again go
  await page.locator('[data-go="paint"]').click();
  const paint = area(page, "paint");
  await expect(paint).toHaveAttribute("data-host", "running");
  await expect(paint.locator(".host-error")).toHaveCount(0);
  await expect(paint.getByRole("button", { name: "Try again" })).toHaveCount(0);
  // the old button left the page; its handler does nothing any more
  expect(await old!.evaluate((b) => b.isConnected)).toBe(false);
  await old!.evaluate((b) => (b as HTMLElement).click());
  // Music by its own Try again
  await area(page, "music").getByRole("button", { name: "Try again" }).click();
  await expect(area(page, "music")).toHaveAttribute("data-host", "running");
  await expect(paint.locator(".paint-canvas")).toHaveCount(1);
  await expect(
    area(page, "castlesiege").locator(".cs-cell").first(),
  ).toBeVisible();
  await expect(area(page, "music").locator(".host-error")).toHaveCount(0);
  no503(errors);
});

test("R12 two CSS retries at once: while the first one's replacement stylesheet is held and then fails, neither app runs without its CSS", async ({
  page,
  errors,
}) => {
  const n = { writer: 0, tracker: 0 };
  let release!: () => void;
  const held = new Promise<void>((r) => (release = r));
  await page.route(
    /\/app-(writer|tracker)-[^/]*\.css(\?.*)?$/,
    async (route) => {
      const app = /app-(writer|tracker)-/.exec(route.request().url())![1] as
        "writer" | "tracker";
      const i = n[app]++;
      // the first load of each fails; Tracker's first replacement waits, then fails
      if (i === 0) return route.fulfill({ status: 503, body: "" });
      if (app === "tracker" && i === 1) {
        await held;
        return route.fulfill({ status: 503, body: "" });
      }
      return route.continue();
    },
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(sheet());
  const notes = area(page, "notes");
  const music = area(page, "music");
  await page.locator('[data-go="notes"]').click();
  await expect(notes).toHaveAttribute("data-host", "failed");
  await page.locator('[data-go="music"]').click();
  await expect(music).toHaveAttribute("data-host", "failed");
  await notes.getByRole("button", { name: "Try again" }).click();
  await expect.poll(() => n.tracker).toBe(2);
  await music.getByRole("button", { name: "Try again" }).click();
  // Music's start waits for the reload under way (it holds Music's CSS)
  await expect(music).toHaveAttribute("data-host", "starting");
  release();
  await expect(notes).toHaveAttribute("data-host", "failed");
  await expect(music).toHaveAttribute("data-host", "failed");
  // both recover; each runs with its stylesheet applied
  await notes.getByRole("button", { name: "Try again" }).click();
  await expect(notes).toHaveAttribute("data-host", "running");
  await music.getByRole("button", { name: "Try again" }).click();
  await expect(music).toHaveAttribute("data-host", "running");
  for (const app of ["writer", "tracker"])
    expect(
      await page.evaluate(
        (app) =>
          [
            ...document.querySelectorAll<HTMLLinkElement>(
              `link[rel="stylesheet"][href*="app-${app}-"]`,
            ),
          ].map((l) => !!l.sheet),
        app,
      ),
    ).toEqual([true]);
  no503(errors);
});

test("R11 at 80 % zoom: a window moved before its app starts starts once; the apps that start are those of eligible windows", async ({
  page,
}) => {
  const release = await holdHost(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(sheet());
  await page.locator("#zOut").click();
  await expect(page.locator("#zPct")).toHaveText("80%");
  // CastleSiege, whose app has not started (the host is held), moves by
  // its title bar
  const w = page.locator('[data-win="castlesiege"]');
  const home = await w.getAttribute("style");
  const b = (await w.locator(".bar .t").boundingBox())!;
  await page.mouse.move(b.x + 20, b.y + b.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 5; i++)
    await page.mouse.move(b.x + 20 + i * 30, b.y + b.height / 2 + i * 20);
  await page.mouse.up();
  await expect.poll(() => w.getAttribute("style")).not.toBe(home);
  expect(await mainCounts(page)).toEqual({});
  await release();
  // Paint and Notes are near the view but not in it; Music is farther
  // (004 T2 layout)
  const near = (await eligible(page)).sort();
  expect(near).toEqual(["castlesiege", "notes", "paint"]);
  for (const id of near)
    await expect(area(page, id)).toHaveAttribute("data-host", "running");
  await idle(page);
  expect(await mainCounts(page)).toEqual({
    castlesiege: 1,
    paint: 1,
    writer: 1,
  });
});
