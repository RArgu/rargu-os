// Spec 001 T6 on desktop: the card's Email link (015 R3), navigation to a
// window's current position (R12), nearest marking (R12.b) and Reset (R13),
// also with reduced motion (R17). Positions are read from the DOM only.
import type { Page } from "@playwright/test";
import { expect, test } from "./helpers";
import { frame, open as openClock, settle, throwIt } from "./sheet-clock";
import { sheet } from "./sheet-base";

type Pt = [number, number];

/** Test instrumentation: tracks the page's pending animation frames. */
async function open(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const raw = requestAnimationFrame.bind(window);
    const cancel = cancelAnimationFrame.bind(window);
    const live = new Set<number>();
    window.requestAnimationFrame = (cb) => {
      const id = raw((t) => {
        live.delete(id);
        cb(t);
      });
      live.add(id);
      return id;
    };
    window.cancelAnimationFrame = (id) => {
      live.delete(id);
      cancel(id);
    };
    Object.assign(window, { __live: () => live.size });
  });
  await page.goto(sheet());
  await expect(page.locator("#world")).toHaveAttribute("style", /scale\(/);
}

/** Waits until the page schedules no animation frame: every motion is over. */
const idle = (page: Page) =>
  expect
    .poll(() =>
      page.evaluate(() => (window as unknown as { __live(): number }).__live()),
    )
    .toBe(0);

function view(page: Page) {
  return page.evaluate(() => {
    const vp = document.querySelector<HTMLElement>("#vp")!;
    const t = getComputedStyle(document.querySelector("#world")!).transform;
    return {
      z: t === "none" ? 1 : new DOMMatrix(t).a,
      // scroll from the sheet's own origin: the start view is (0, 0)
      left: vp.scrollLeft - parseFloat(getComputedStyle(vp).paddingLeft),
      top: vp.scrollTop - parseFloat(getComputedStyle(vp).paddingTop),
      w: vp.clientWidth,
      h: vp.clientHeight,
    };
  });
}

/** Every window's inline transform, by id. */
const poses = (page: Page) =>
  page.evaluate(() =>
    Object.fromEntries(
      [...document.querySelectorAll<HTMLElement>("[data-win]")].map((w) => [
        w.dataset.win,
        w.style.transform,
      ]),
    ),
  );

/** A window's top-left in sheet px, from its inline transform. */
const pos = (page: Page, id: string) =>
  page.locator(`[data-win="${id}"]`).evaluate((w) => {
    const m = /translate\(([-\d.e]+)px(?:, ([-\d.e]+)px)?\)/.exec(
      (w as HTMLElement).style.transform,
    )!;
    return [+m[1], +(m[2] ?? 0)] as [number, number];
  });

/** The view area beside the card, screen px (the mock's visibleArea). */
async function area(page: Page) {
  const card = (await page.locator("#card").boundingBox())!;
  const v = await view(page);
  const l = card.x + card.width + 24;
  return { l, t: 24, w: v.w - l - 16, h: v.h - 24 - 16 };
}

/** Scrolls the sheet to (left, top) from its own origin, at once. */
async function scrollTo(page: Page, left: number, top: number) {
  await page.locator("#vp").evaluate(
    (vp, [l, t]) => {
      const cs = getComputedStyle(vp);
      vp.scrollTo(
        l + parseFloat(cs.paddingLeft),
        t + parseFloat(cs.paddingTop),
      );
    },
    [left, top],
  );
  await expect
    .poll(async () => {
      const v = await view(page);
      return [v.left, v.top];
    })
    .toEqual([left, top]);
}

/** Drags a window's title bar by mouse from screen point `at` by `by`, slowly. */
async function drag(page: Page, at: Pt, by: Pt) {
  await page.mouse.move(...at);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++)
    await page.mouse.move(at[0] + (by[0] * i) / 10, at[1] + (by[1] * i) / 10);
  await page.mouse.up();
}

const HOMES: Record<string, Pt> = {
  castlesiege: [360, 100],
  castlewars: [1040, 140],
  pentimento: [1720, 80],
  crawler: [400, 860],
  insider: [1160, 800],
  // 004 T2: mock v0.7's Quick tools rectangles
  paint: [1920, 760],
  music: [2400, 700],
  notes: [1920, 1150],
};

/** Every window at its home, at rest. */
const atHome = (page: Page) =>
  expect
    .poll(() => poses(page))
    .toEqual(
      Object.fromEntries(
        Object.entries(HOMES).map(([id, [x, y]]) => [
          id,
          expect.stringMatching(
            new RegExp(`^translate\\(${x}px(, ${y}px)?\\) rotate\\(0deg\\)$`),
          ),
        ]),
      ),
    );

// ---- 015 R3 ----

test("015 R3.b the Email link is built at start-up: href, name, Tab, no page error", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await open(page);
  const mail = page.locator("#card a[data-mail]");
  await expect(mail).toBeVisible();
  await expect(mail).toHaveAccessibleName("Email");
  // the e2e build uses the fixture address (tests/fixtures/sheet-content)
  await expect(mail).toHaveAttribute("href", "mailto:test@example.invalid");
  // the page source (not the DOM) has the parts only
  const src = await (await page.request.get(page.url())).text();
  expect(src).not.toContain("test@example.invalid");
  expect(src).toContain('data-d="example.invalid"');
  await page.getByRole("link", { name: "LinkedIn" }).focus();
  await page.keyboard.press("Tab");
  await expect(mail).toBeFocused();
  expect(errors).toEqual([]);
});

// ---- R12 ----

/** Expects window `id` (w × h sheet px) centred in the area beside the card. */
async function centred(page: Page, id: string) {
  const a = await area(page);
  await expect
    .poll(async () => {
      const b = (await page.locator(`[data-win="${id}"]`).boundingBox())!;
      return Math.max(
        Math.abs(b.x + b.width / 2 - (a.l + a.w / 2)),
        Math.abs(b.y + b.height / 2 - (a.t + a.h / 2)),
      );
    })
    .toBeLessThanOrEqual(1.5);
}

test("R12.a Insider Trading thrown elsewhere: the card centres the view on its new place and focuses it", async ({
  page,
}) => {
  await open(page);
  // look at Insider Trading's bar, clear of the card, then drag it up and
  // left, out of the edge zones
  await scrollTo(page, 700, 500);
  await drag(page, [700, 312], [-200, -200]);
  await idle(page);
  const moved = await pos(page, "insider");
  expect(moved[0]).toBeLessThan(1000);
  expect(moved[1]).toBeLessThan(700);
  await scrollTo(page, 0, 0);
  await page
    .locator("#card")
    .getByRole("button", { name: /Insider Trading/ })
    .click();
  await centred(page, "insider");
  await idle(page);
  await centred(page, "insider");
  // the window has focus, never moved, and draws on top
  await expect(page.locator('[data-win="insider"]')).toBeFocused();
  expect(await pos(page, "insider")).toEqual(moved);
  const b = (await page.locator('[data-win="insider"]').boundingBox())!;
  const hit = await page.evaluate(
    ([x, y]) =>
      document
        .elementFromPoint(x, y)
        ?.closest("[data-win]")
        ?.getAttribute("data-win"),
    [b.x + 40, b.y + 40],
  );
  expect(hit).toBe("insider");
});

test("R12 a Quick tools icon centres the view on that tool and focuses it @live", async ({
  page,
}) => {
  await open(page);
  await page.locator("#card").getByRole("button", { name: "Paint" }).click();
  await centred(page, "paint");
  await expect(page.locator('[data-win="paint"]')).toBeFocused();
  expect(await pos(page, "paint")).toEqual(HOMES.paint);
});

test("R12 the keyboard chooses a project: focus moves to its window with no second scroll @live", async ({
  page,
}) => {
  await open(page);
  await page
    .locator("#card")
    .getByRole("button", { name: /Insider Trading/ })
    .focus();
  await page.keyboard.press("Enter");
  await expect(page.locator('[data-win="insider"]')).toBeFocused();
  await idle(page);
  await centred(page, "insider");
  // the focus did not scroll the view again: it stays where the pan put it
  const v = await view(page);
  await idle(page);
  expect(await view(page)).toEqual(v);
});

test("desktop: the insets are scrolled off at start and after Reset, the sheet starts at the top of the view", async ({
  page,
}) => {
  await open(page);
  expect((await page.locator("#world").boundingBox())!.y).toBe(0);
  await page.getByRole("button", { name: /Reset page/ }).click();
  await idle(page);
  expect((await page.locator("#world").boundingBox())!.y).toBe(0);
});

test("R12.b the project nearest the centre of the view is the marked list item", async ({
  page,
}) => {
  await open(page);
  const marked = page.locator('nav [data-go][aria-current="location"]');
  // the start view: CastleSiege
  await expect(marked).toHaveCount(1);
  await expect(marked).toHaveAttribute("data-go", "castlesiege");
  // Pentimento's centre (2020, 351) at the area's centre
  const a = await area(page);
  await scrollTo(page, 2020 - (a.l + a.w / 2), 0);
  await expect(marked).toHaveAttribute("data-go", "pentimento");
  await expect(marked).toHaveCount(1);
  // after a navigation, too
  await scrollTo(page, 0, 0);
  await page
    .locator("#card")
    .getByRole("button", { name: /Castle Wars/ })
    .click();
  await idle(page);
  await expect(marked).toHaveAttribute("data-go", "castlewars");
});

test("R12 R17 with reduced motion the pan is at once", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await open(page);
  // press and read in one browser turn: no frame can run between them
  const v = await page.evaluate(() => {
    document
      .querySelector<HTMLElement>('#card [data-go="pentimento"]')!
      .click();
    const vp = document.querySelector<HTMLElement>("#vp")!;
    return {
      left: vp.scrollLeft - parseFloat(getComputedStyle(vp).paddingLeft),
      top: vp.scrollTop,
    };
  });
  const a = await area(page);
  expect(Math.abs(1720 + 300 - v.left - (a.l + a.w / 2))).toBeLessThanOrEqual(
    1,
  );
  await expect(page.locator('[data-win="pentimento"]')).toBeFocused();
});
// ---- R13 ----

/** CastleSiege carried out of the start view, then zoom about 50 % and the
 * view moved. */
async function mess(page: Page) {
  // hold CastleSiege in the right edge zone: the sheet scrolls and the window
  // goes with it. Wait on its position, not on time; the release may or may
  // not throw, either way it ends further right.
  await page.mouse.move(500, 112);
  await page.mouse.down();
  for (let i = 1; i <= 5; i++) await page.mouse.move(500 + 150 * i, 112);
  await expect
    .poll(async () => (await pos(page, "castlesiege"))[0])
    .toBeGreaterThan(1300);
  await page.mouse.up();
  await idle(page);
  expect((await pos(page, "castlesiege"))[0]).toBeGreaterThan(1300);
  // one step at a time: a click during the animation zooms from its midpoint
  for (const pct of ["80%", "64%", "51%"]) {
    await page.click("#zOut");
    await expect(page.locator("#zPct")).toHaveText(pct);
    await idle(page);
  }
  const v = await view(page);
  await scrollTo(page, v.left + 200, v.top + 30);
}

/** The start view: zoom and scroll at load. */
async function startView(page: Page) {
  await open(page);
  await idle(page);
  return view(page);
}

test("R13.a Reset after a throw and zoom 50 %: windows home, start zoom, CastleSiege's home in view @live", async ({
  page,
}) => {
  const start = await startView(page);
  await mess(page);
  await page.getByRole("button", { name: /Reset page/ }).click();
  await atHome(page);
  await idle(page);
  await expect(page.locator("#zPct")).toHaveText("100%");
  expect(await view(page)).toEqual(start);
  // CastleSiege at home, inside the area beside the card
  const a = await area(page);
  const b = (await page.locator('[data-win="castlesiege"]').boundingBox())!;
  expect(b.x).toBeGreaterThanOrEqual(a.l - 1);
  expect(b.x + b.width).toBeLessThanOrEqual(a.l + a.w + 1);
  expect(b.y + b.height).toBeLessThanOrEqual(a.t + a.h + 1);
});

test("R13.a Reset pressed twice gives the same end state", async ({ page }) => {
  const start = await startView(page);
  await mess(page);
  const reset = page.getByRole("button", { name: /Reset page/ });
  await reset.click();
  await reset.click();
  await atHome(page);
  await idle(page);
  expect(await view(page)).toEqual(start);
});

test("R13.a Reset during a drag ends the drag with no throw and gives the same end state", async ({
  page,
}) => {
  const start = await startView(page);
  // hold CastleSiege and move it fast
  await page.mouse.move(500, 112);
  await page.mouse.down();
  for (let i = 1; i <= 5; i++)
    await page.mouse.move(500 + 60 * i, 112 + 40 * i);
  await expect
    .poll(async () => (await pos(page, "castlesiege"))[0])
    .toBeGreaterThan(600);
  // Reset by keyboard while the mouse still holds the window
  await page.getByRole("button", { name: /Reset page/ }).focus();
  await page.keyboard.press("Enter");
  // the held mouse no longer moves it, and its release throws nothing
  for (let i = 1; i <= 5; i++) await page.mouse.move(800 + 60 * i, 312);
  await page.mouse.up();
  await atHome(page);
  await idle(page);
  expect(await view(page)).toEqual(start);
});

/** In one browser turn: waits for a frame in which `moving()` holds (the
 * motion is under way), then presses Reset at once. */
const resetWhile = (page: Page, moving: string) =>
  page.evaluate(
    (moving) =>
      new Promise<void>((done) => {
        const test = new Function(`return ${moving}`) as () => boolean;
        const f = () => {
          if (!test()) return void requestAnimationFrame(f);
          document.querySelector<HTMLElement>("#reset")!.click();
          done();
        };
        requestAnimationFrame(f);
      }),
    moving,
  );

test("R13 Reset cancels a paper glide", async ({ page }) => {
  const start = await startView(page);
  await page.mouse.move(1010, 740);
  await page.mouse.down();
  for (let i = 1; i <= 5; i++)
    await page.mouse.move(1010 - 40 * i, 740 - 20 * i);
  await expect.poll(async () => (await view(page)).left).toBe(200);
  await page.mouse.up();
  // the glide has moved the view past the drag
  await resetWhile(
    page,
    'document.querySelector("#vp").scrollLeft - parseFloat(document.querySelector("#vp").style.paddingLeft) > 200',
  );
  await idle(page);
  expect(await view(page)).toEqual(start);
});

test("R13 Reset cancels a zoom animation", async ({ page }) => {
  // controlled time: frames run only when the test asks
  await openClock(page, true);
  const start = await view(page);
  await page.click("#zOut");
  await frame(page, 16);
  expect(await frame(page, 60)).toBeGreaterThan(0);
  // mid-animation: between 100 % and 80 %
  const z = (await view(page)).z;
  expect(z).toBeLessThan(1);
  expect(z).toBeGreaterThan(0.8);
  await page.locator("#reset").click();
  await settle(page);
  await expect(page.locator("#zPct")).toHaveText("100%");
  expect(await view(page)).toEqual(start);
});

test("R13 Reset with a window focused ends on the start view, not on that window", async ({
  page,
}) => {
  const start = await startView(page);
  // Notes, far from the start view, has the focus
  await page.locator('[data-win="notes"]').focus();
  await idle(page);
  expect((await view(page)).left).toBeGreaterThan(start.left + 500);
  // a pointer activation that leaves the focus where it was (Safari)
  await page.evaluate(() =>
    document.querySelector<HTMLElement>("#reset")!.click(),
  );
  await expect(page.locator('[data-win="notes"]')).toBeFocused();
  await atHome(page);
  await idle(page);
  expect(await view(page)).toEqual(start);
  // by keyboard, from Notes
  await page.locator('[data-win="notes"]').focus();
  await idle(page);
  await page.getByRole("button", { name: /Reset page/ }).focus();
  await page.keyboard.press("Enter");
  await atHome(page);
  await idle(page);
  expect(await view(page)).toEqual(start);
});

test("R12 navigation to a window still in flight ends centred on its landing, and the window lands there", async ({
  page,
}) => {
  await openClock(page, true);
  const want = await throwIt(page);
  expect(want, "a throw with velocity").not.toBeNull();
  // two frames into the flight: it has left the release point (x 510) but
  // not landed
  await frame(page, 16);
  expect(await frame(page, 16)).toBeGreaterThan(0);
  const mid = await pos(page, "castlesiege");
  expect(mid[0]).toBeGreaterThan(511);
  expect(mid[0]).toBeLessThan(want![0] - 20);
  await page.locator('#card [data-go="castlesiege"]').click();
  await settle(page);
  // the throw's landing is kept: navigation never moves the window
  const p = await pos(page, "castlesiege");
  expect(Math.abs(p[0] - want![0]), `x ${p[0]} vs ${want![0]}`).toBeLessThan(
    0.01,
  );
  expect(Math.abs(p[1] - want![1]), `y ${p[1]} vs ${want![1]}`).toBeLessThan(
    0.01,
  );
  await centred(page, "castlesiege");
  await expect(page.locator('[data-win="castlesiege"]')).toBeFocused();
});
test("R13 R17 with reduced motion Reset commits at once", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const start = await startView(page);
  await mess(page);
  // press and read in one browser turn: no frame can run between them
  const [p, v] = await page.evaluate(() => {
    document.querySelector<HTMLElement>("#reset")!.click();
    const vp = document.querySelector<HTMLElement>("#vp")!;
    const t = getComputedStyle(document.querySelector("#world")!).transform;
    return [
      Object.fromEntries(
        [...document.querySelectorAll<HTMLElement>("[data-win]")].map((w) => [
          w.dataset.win,
          w.style.transform,
        ]),
      ),
      {
        z: t === "none" ? 1 : new DOMMatrix(t).a,
        left: vp.scrollLeft - parseFloat(getComputedStyle(vp).paddingLeft),
        top: vp.scrollTop - parseFloat(getComputedStyle(vp).paddingTop),
        w: vp.clientWidth,
        h: vp.clientHeight,
      },
    ] as const;
  });
  for (const [id, [x, y]] of Object.entries(HOMES))
    expect(p[id]).toMatch(
      new RegExp(`^translate\\(${x}px(, ${y}px)?\\) rotate\\(0deg\\)$`),
    );
  expect(v).toEqual(start);
});

// ---- review fixes ----

test("navigation while a window is held: the drag ends, the window stays, the view pans", async ({
  page,
}) => {
  await open(page);
  await page.mouse.move(500, 112);
  await page.mouse.down();
  await page.mouse.move(520, 130);
  await expect.poll(() => pos(page, "castlesiege")).toEqual([380, 118]);
  await page.locator('#card [data-go="insider"]').focus();
  await page.keyboard.press("Enter");
  await idle(page);
  await centred(page, "insider");
  expect(await pos(page, "castlesiege")).toEqual([380, 118]);
  // the mouse no longer holds it, and its release throws nothing
  await page.mouse.move(700, 300);
  await page.mouse.up();
  await idle(page);
  expect(await pos(page, "castlesiege")).toEqual([380, 118]);
});

/** Dispatches a Safari gesture event on the sheet at the view centre. */
const gesture = (page: Page, type: string, scale: number) =>
  page.evaluate(
    ([type, scale]) => {
      const e = new Event(type as string, { bubbles: true, cancelable: true });
      for (const [p, v] of Object.entries({
        scale,
        clientX: 640,
        clientY: 400,
      }))
        Object.defineProperty(e, p, { value: v });
      document.querySelector("#vp")!.dispatchEvent(e);
    },
    [type, scale] as const,
  );

test("Reset ends a Safari pinch: a later gesturechange does not zoom", async ({
  page,
}) => {
  await open(page);
  await gesture(page, "gesturestart", 1);
  await page.getByRole("button", { name: /Reset page/ }).click();
  await gesture(page, "gesturechange", 1.5);
  await expect(page.locator("#zPct")).toHaveText("100%");
  // a new pinch zooms again
  await gesture(page, "gesturestart", 1);
  await gesture(page, "gesturechange", 1.5);
  await expect(page.locator("#zPct")).toHaveText("150%");
});

test("a resize during a navigation pan ends at the target for the new size", async ({
  page,
}) => {
  // controlled time: frames run only when the test calls __frame(t)
  await page.addInitScript(() => {
    const q = new Map<number, FrameRequestCallback>();
    let n = 0;
    window.requestAnimationFrame = (cb) => (q.set(++n, cb), n);
    window.cancelAnimationFrame = (id) => void q.delete(id);
    const w = window as unknown as Record<string, unknown>;
    w.__frame = (dt: number) => {
      const due = [...q.values()];
      q.clear();
      const t = performance.now() + dt;
      for (const cb of due) cb(t);
      return q.size;
    };
    let resizes = 0;
    w.__resizes = 0;
    addEventListener("resize", () => (w.__resizes = ++resizes));
  });
  await page.goto(sheet());
  await expect(page.locator("#world")).toHaveAttribute("style", /scale\(/);
  const frame = (dt: number) =>
    page.evaluate(
      (dt) =>
        (window as unknown as { __frame(dt: number): number }).__frame(dt),
      dt,
    );
  await page.locator('#card [data-go="paint"]').click();
  // one frame 100 ms in: the pan is under way
  expect(await frame(100)).toBeGreaterThan(0);
  const mid = await view(page);
  expect(mid.left).toBeGreaterThan(0);
  await page.setViewportSize({ width: 1000, height: 800 });
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as { __resizes: number }).__resizes,
      ),
    )
    .toBeGreaterThan(0);
  // run frames 2 s apart until nothing is pending
  for (let i = 0; i < 20 && (await frame(2000)) > 0; i++);
  expect(await frame(2000)).toBe(0);
  await centred(page, "paint");
});
