// Spec 004 T2 (R1, R2) and T3 (R1, R3, R8): Paint, Music (Tracker) and Notes
// (Writer) in the Quick tools windows. T2: the approved rectangles (mock
// v0.7), client areas at the manifest sizes, every control inside its client
// area, the card's labels. T3: sheet window titles, the removed items, Help
// with one About item (also after a menu rebuild) and the retained menus.
// Real clicks and keys through the page.
import type { Page } from "@playwright/test";
import paint from "../../src/apps/paint/manifest.json" with { type: "json" };
import tracker from "../../src/apps/tracker/manifest.json" with { type: "json" };
import writer from "../../src/apps/writer/manifest.json" with { type: "json" };
import { expect, test } from "./helpers";
import { chooseMenu, mainCounts } from "./host-helpers";
import { sheet } from "./sheet-base";

const win = (page: Page, id: string) => page.locator(`[data-win="${id}"]`);
const panel = (page: Page, id: string) =>
  win(page, id).locator('.host-panel[role="dialog"]');
const title = (page: Page, id: string) => win(page, id).locator(".bar .t");

/** 004 owner decision 2026-10-24 (mock v0.7): x, y, w, h, demo h */
const APPROVED = {
  paint: { x: 1920, y: 760, w: 434, h: 350, demoH: 313, app: paint },
  music: { x: 2400, y: 700, w: 556, h: 348, demoH: 311, app: tracker },
  notes: { x: 1920, y: 1150, w: 424, h: 364, demoH: 327, app: writer },
} as const;
const TOOLS = Object.keys(APPROVED) as (keyof typeof APPROVED)[];
/** Controls each tool shows at its approved size (R2, R3). */
const EXPECTED: Record<(typeof TOOLS)[number], string[]> = {
  paint: [".paint-canvas", ".paint-tool", ".paint-swatch"],
  // the side panel scrolls (tracker/styles.css .trk-side)
  music: [".trk-grid", "button.btn >> text=Play", ".trk-side input"],
  notes: ["textarea"],
};

async function open(page: Page): Promise<void> {
  // the card's move lands at once
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(sheet());
}

/** Starts the app in window `id` by its card icon. */
async function run(page: Page, id: string): Promise<void> {
  await page.locator(`.apps [data-go="${id}"]`).click();
  const area = win(page, id).locator(".demo-area");
  await expect(area).toHaveAttribute("data-host", "running");
  await expect(area.locator(".host-bar [role=menubar]")).toBeVisible();
}

/** The labels of the open menu `level` (0 = the top menu), separators out. */
function labels(page: Page, id: string, level = 0): Promise<string[]> {
  return win(page, id)
    .locator(".menu")
    .nth(level)
    .locator(".menu-item .menu-label")
    .allTextContents();
}

async function closeMenus(page: Page, id: string): Promise<void> {
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await expect(win(page, id).locator(".menu")).toHaveCount(0);
}

/** Every label of every menu and submenu of the window, by menu head. */
async function allMenus(
  page: Page,
  id: string,
): Promise<Record<string, string[]>> {
  const out: Record<string, string[]> = {};
  const heads = win(page, id).locator('[role="menubar"] button');
  const names = await heads.allTextContents();
  for (const [i, head] of names.entries()) {
    await heads.nth(i).click();
    const top = win(page, id).locator(".menu").first();
    await expect(top).toBeVisible();
    out[head] = await labels(page, id);
    const subs = top.locator(".menu-item:has(.glyph.right)");
    for (let j = 0; j < (await subs.count()); j++) {
      const sub = subs.nth(j);
      const name = (await sub.locator(".menu-label").textContent())!;
      await sub.hover();
      await expect(win(page, id).locator(".menu").nth(1)).toBeVisible();
      out[`${head} > ${name}`] = await labels(page, id, 1);
    }
    await closeMenus(page, id);
  }
  return out;
}

/** Help shows one item, About, and it opens; the dialog is closed after. */
async function checkHelp(page: Page, id: string): Promise<void> {
  await chooseMenu(page, id, "Help");
  expect(await labels(page, id)).toEqual([
    expect.stringMatching(/^About\b/) as unknown as string,
  ]);
  await win(page, id).locator(".menu .menu-item").first().click();
  await expect(panel(page, id)).toBeVisible();
  await expect(panel(page, id)).toContainText("About");
  // 007 R6: the About text names the site, not the old OS
  await expect(panel(page, id)).toContainText("A RArgu OS program");
  await expect(panel(page, id)).not.toContainText(/devpageos/i);
  await panel(page, id).getByRole("button", { name: "OK" }).click();
  await expect(panel(page, id)).toHaveCount(0);
}

test.describe("004 T2 layout", () => {
  test("R2.a the Quick tools at the approved rectangles: client = manifest size, inside the sheet, no overlap, every control reachable", async ({
    page,
  }) => {
    await open(page);
    // the card's Quick tools labels (R1)
    await expect(page.locator(".apps [data-go]")).toHaveText([
      "Paint",
      "Music",
      "Notes",
    ]);

    // every window's home rectangle, in sheet px (reduced motion: at rest)
    const homes = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>("[data-win]")].map((w) => {
        const m = new DOMMatrix(getComputedStyle(w).transform);
        return {
          id: w.dataset.win!,
          x: m.e,
          y: m.f,
          w: w.offsetWidth,
          h: w.offsetHeight,
          demoH: w.querySelector<HTMLElement>(".demo-area")!.offsetHeight,
        };
      }),
    );
    expect(homes).toHaveLength(8);
    for (const id of TOOLS) {
      const { x, y, w, h, demoH } = APPROVED[id];
      expect(homes.find((r) => r.id === id)).toEqual({ id, x, y, w, h, demoH });
    }
    for (const a of homes) {
      expect(a.x).toBeGreaterThanOrEqual(0);
      expect(a.y).toBeGreaterThanOrEqual(0);
      expect(a.x + a.w).toBeLessThanOrEqual(3000);
      expect(a.y + a.h).toBeLessThanOrEqual(1640);
      for (const b of homes) {
        if (a === b) continue;
        const apart =
          a.x + a.w <= b.x ||
          b.x + b.w <= a.x ||
          a.y + a.h <= b.y ||
          b.y + b.h <= a.y;
        expect(apart, `${a.id} vs ${b.id}`).toBe(true);
      }
    }

    for (const id of TOOLS) {
      const { app } = APPROVED[id];
      await run(page, id);
      // the controls each app must show (Codex T2–T3 #1): present and
      // visible, not just unclipped
      for (const sel of EXPECTED[id])
        await expect(win(page, id).locator(sel).first(), sel).toBeVisible();
      const m = await win(page, id).evaluate((w) => {
        const root = w.querySelector<HTMLElement>(
          ".demo-area > .host-root:not(.host-bar)",
        )!;
        const rb = root.getBoundingClientRect();
        const clipped: string[] = [];
        const name = (el: Element) => `${el.tagName}.${el.className}`;
        /** the element's padding box: what it shows of its content */
        const inner = (p: HTMLElement) => {
          const r = p.getBoundingClientRect();
          const l = r.left + p.clientLeft;
          const t = r.top + p.clientTop;
          return { l, t, r: l + p.clientWidth, b: t + p.clientHeight };
        };
        const clips = (p: HTMLElement) => {
          const s = getComputedStyle(p);
          return s.overflowX !== "visible" || s.overflowY !== "visible";
        };
        let n = 0;
        for (const el of root.querySelectorAll<HTMLElement>(
          "button, input, select, textarea, canvas, [tabindex]",
        )) {
          // not drawn at this size (display: none, or a narrow-only part)
          if (!el.getClientRects().length || el.closest("[hidden]")) continue;
          n++;
          const ups: HTMLElement[] = [];
          for (let p = el.parentElement; p && p !== root; p = p.parentElement)
            ups.push(p);
          // a control in a scroller: scroll it into that scroller's view
          // (only along an axis the visitor can scroll)
          const can = (o: string) => o === "auto" || o === "scroll";
          for (const p of ups) {
            const s = getComputedStyle(p);
            const b = el.getBoundingClientRect();
            const v = inner(p);
            if (can(s.overflowY)) {
              if (b.top < v.t) p.scrollTop -= v.t - b.top;
              else if (b.bottom > v.b) p.scrollTop += b.bottom - v.b;
            }
            if (can(s.overflowX)) {
              if (b.left < v.l) p.scrollLeft -= v.l - b.left;
              else if (b.right > v.r) p.scrollLeft += b.right - v.r;
            }
          }
          // then it is wholly inside every box that clips it, and the root
          const b = el.getBoundingClientRect();
          const boxes = [
            ...ups.filter(clips).map(inner),
            { l: rb.left, t: rb.top, r: rb.right, b: rb.bottom },
          ];
          if (
            !b.width ||
            !b.height ||
            boxes.some(
              (v) =>
                b.left < v.l - 1 ||
                b.top < v.t - 1 ||
                b.right > v.r + 1 ||
                b.bottom > v.b + 1,
            )
          )
            clipped.push(name(el));
        }
        return {
          client: [root.clientWidth, root.clientHeight],
          overflow: [
            root.scrollWidth - root.clientWidth,
            root.scrollHeight - root.clientHeight,
          ],
          clipped,
          n,
        };
      });
      expect(m.n, `${id} controls checked`).toBeGreaterThan(0);
      expect(
        Math.abs(m.client[0] - app.window.width),
        `${id} client w`,
      ).toBeLessThanOrEqual(1);
      expect(
        Math.abs(m.client[1] - app.window.height),
        `${id} client h`,
      ).toBeLessThanOrEqual(1);
      expect(m.overflow, `${id} overflow`).toEqual([0, 0]);
      expect(m.clipped, `${id} controls outside the client area`).toEqual([]);
    }
  });
});

test.describe("004 T3 titles and menus", () => {
  test("R1 the window titles start with Paint, Music and Notes and keep the file name @live", async ({
    page,
  }) => {
    await open(page);
    await run(page, "paint");
    await expect(title(page, "paint")).toHaveText("Paint - untitled");
    await run(page, "music");
    await expect(title(page, "music")).toHaveText("Music - demo.trk");
    await run(page, "notes");
    await expect(title(page, "notes")).toHaveText("Notes - untitled");
  });

  test("R1.a Notes after typing shows the modified marker; after Save it is gone", async ({
    page,
  }) => {
    await open(page);
    await run(page, "notes");
    await win(page, "notes").locator("textarea").click();
    await page.keyboard.type("hello");
    await expect(title(page, "notes")).toHaveText("Notes - untitled *");
    await chooseMenu(page, "notes", "File", "Save As…");
    const input = panel(page, "notes").locator("input");
    await expect(input).toBeFocused();
    await input.fill("n.txt");
    const download = page.waitForEvent("download");
    await panel(page, "notes").getByRole("button", { name: "OK" }).click();
    await download;
    await expect(title(page, "notes")).toHaveText("Notes - n.txt");
  });

  test("R8.a R3 each Help menu has one item, About, which opens (also after a menu rebuild); no Wallpaper or Run; the retained menus are there @live", async ({
    page,
  }) => {
    await open(page);
    // R3: the retained menus of T1 (ledger 2026-10-23, spec 004)
    const RETAINED: Record<string, Record<string, string[]>> = {
      paint: {
        File: [
          "New…",
          "Open…",
          "Save",
          "Save As…",
          "Export to Downloads",
          "Close",
        ],
        Edit: ["Undo", "Redo", "Select All", "Clear Selection"],
        View: [
          "Zoom 1x",
          "Zoom 2x",
          "Zoom 4x",
          "Zoom In",
          "Zoom Out",
          "Pixel Grid",
        ],
      },
      music: {
        File: ["New", "Open…", "Save", "Save As…", "Export WAV…", "Close"],
        Edit: ["Undo", "Cut", "Copy", "Paste", "Clear"],
        Song: [
          "Play / Stop",
          "Play Pattern",
          "Loop",
          "Pattern length",
          "Add pattern",
          "Duplicate pattern",
          "Remove pattern",
          "Set loop point here",
          "Instruments…",
        ],
        "Song > Pattern length": ["16 rows", "32 rows"],
      },
      notes: {
        File: ["New", "Open…", "Save", "Save As…", "Close"],
        Edit: [
          "Undo",
          "Redo",
          "Cut",
          "Copy",
          "Paste",
          "Find…",
          "Replace…",
          "Select All",
        ],
        View: ["Word wrap", "Font size"],
        "View > Font size": ["1x", "2x"],
      },
    };
    for (const id of TOOLS) {
      await run(page, id);
      const menus = await allMenus(page, id);
      for (const [head, items] of Object.entries(menus))
        for (const label of items) {
          expect(label, `${id} ${head}`).not.toMatch(/Wallpaper/i);
          expect(label, `${id} ${head}`).not.toMatch(/\bRun\b/);
        }
      for (const [head, items] of Object.entries(RETAINED[id]))
        expect(menus[head], `${id} ${head}`).toEqual(items);
      await checkHelp(page, id);
    }

    // a menu rebuild: Paint's zoom, Music's Loop, Notes' Word wrap
    await chooseMenu(page, "paint", "View", "Zoom 2x");
    await checkHelp(page, "paint");
    await chooseMenu(page, "music", "Song");
    await win(page, "music")
      .locator(".menu .menu-item")
      .filter({ has: page.locator(".menu-label", { hasText: /^Loop$/ }) })
      .click();
    await checkHelp(page, "music");
    await chooseMenu(page, "notes", "View", "Word wrap");
    await checkHelp(page, "notes");
  });
});

test("R8 Paint's phone toolbar (the compact policy, a test-build host option) has New, Open and Save and no Wallpaper", async ({
  page,
}) => {
  // the sheet's host reports the desktop policy; `?policy=compact` (test
  // builds only) gives Paint its phone layout, with the bottom toolbar
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(sheet("?policy=compact"));
  await run(page, "paint");
  const paintWin = win(page, "paint");
  for (const name of ["New", "Open", "Save"])
    await expect(
      paintWin.getByRole("button", { name, exact: true }),
    ).toBeVisible();
  await expect(paintWin.getByText(/Wallpaper/i)).toHaveCount(0);
  await expect(
    paintWin.getByRole("button", { name: /Wallpaper/i }),
  ).toHaveCount(0);
});

// ---- 004 T7 (R11, R12) ----

/** The host's active app window (test builds), else null. */
const active = (page: Page) =>
  page.evaluate(
    () =>
      (
        window as unknown as { __host?: { active(): string | null } }
      ).__host?.active() ?? null,
  );

/** The view's scroll position, from the sheet's own origin. */
const scrollPos = (page: Page) =>
  page.evaluate(() => {
    const vp = document.querySelector<HTMLElement>("#vp")!;
    const cs = getComputedStyle(vp);
    return [
      vp.scrollLeft - parseFloat(cs.paddingLeft),
      vp.scrollTop - parseFloat(cs.paddingTop),
    ];
  });

/** Expects window `id` centred in the view's area beside the card (001 R12). */
async function centred(page: Page, id: string): Promise<void> {
  const card = (await page.locator("#card").boundingBox())!;
  const vp = await page
    .locator("#vp")
    .evaluate((v) => [v.clientWidth, v.clientHeight]);
  const l = card.x + card.width + 24;
  const a = { l, t: 24, w: vp[0] - l - 16, h: vp[1] - 24 - 16 };
  await expect
    .poll(async () => {
      const b = (await win(page, id).boundingBox())!;
      const [dx, dy] = [
        b.x + b.width / 2 - (a.l + a.w / 2),
        b.y + b.height / 2 - (a.t + a.h / 2),
      ];
      // at the sheet's scroll limit the view stops short of centring
      const [atX, atY] = await page
        .locator("#vp")
        .evaluate(
          (v, [dx, dy]) => [
            dx > 0 && v.scrollLeft >= v.scrollWidth - v.clientWidth - 1,
            dy > 0 && v.scrollTop >= v.scrollHeight - v.clientHeight - 1,
          ],
          [dx, dy],
        );
      return Math.max(atX ? 0 : Math.abs(dx), atY ? 0 : Math.abs(dy));
    })
    .toBeLessThanOrEqual(1.5);
  // and the whole window is in the area
  const b = (await win(page, id).boundingBox())!;
  expect(b.x).toBeGreaterThanOrEqual(a.l - 1);
  expect(b.y).toBeGreaterThanOrEqual(a.t - 1);
  expect(b.x + b.width).toBeLessThanOrEqual(a.l + a.w + 1);
  expect(b.y + b.height).toBeLessThanOrEqual(a.t + a.h + 1);
}

/** Starts every hosted app in the background (fit zoom, 002 R11), then
 * goes back to the start view; no app is active. */
async function allInBackground(page: Page): Promise<void> {
  await page.locator("#zFit").click();
  for (const id of TOOLS)
    await expect(win(page, id).locator(".demo-area")).toHaveAttribute(
      "data-host",
      "running",
    );
  await page.getByRole("button", { name: /Reset page/ }).click();
  await expect(page.locator("#zPct")).toHaveText("100%");
  expect(await active(page)).toBeNull();
}

test.describe("004 T7 R11 card icons", () => {
  test("R11.a Music not started, the view elsewhere: the card's Music icon centres the view on Music, starts it once, and it is the active app", async ({
    page,
  }) => {
    await open(page);
    const area = win(page, "music").locator(".demo-area");
    await expect(area).not.toHaveAttribute("data-host", /running|starting/);
    expect((await mainCounts(page)).tracker).toBeUndefined();
    await page.locator('.apps [data-go="music"]').click();
    await centred(page, "music");
    await expect(area).toHaveAttribute("data-host", "running");
    await expect.poll(() => active(page)).toBe("music");
    await expect(win(page, "music").locator(".trk-grid")).toBeFocused();
    // a second press starts nothing more
    await page.locator('.apps [data-go="notes"]').click();
    await expect.poll(() => active(page)).toBe("notes");
    await page.locator('.apps [data-go="music"]').click();
    await centred(page, "music");
    await expect.poll(() => active(page)).toBe("music");
    await expect(win(page, "music").locator(".trk-grid")).toBeFocused();
    expect((await mainCounts(page)).tracker).toBe(1);
  });

  test("R11 each tool running in the background: its card icon makes it the active app; Notes takes the caret, Music the grid", async ({
    page,
  }) => {
    await open(page);
    await allInBackground(page);
    await expect(win(page, "notes").locator("textarea")).not.toBeFocused();
    for (const id of TOOLS) {
      await page.locator(`.apps [data-go="${id}"]`).click();
      await centred(page, id);
      await expect.poll(() => active(page)).toBe(id);
    }
    await page.locator('.apps [data-go="notes"]').click();
    await expect(win(page, "notes").locator("textarea")).toBeFocused();
    await page.keyboard.type("hi");
    await expect(win(page, "notes").locator("textarea")).toHaveValue("hi");
    await page.locator('.apps [data-go="music"]').click();
    await expect(win(page, "music").locator(".trk-grid")).toBeFocused();
    expect(await mainCounts(page)).toMatchObject({
      paint: 1,
      tracker: 1,
      writer: 1,
    });
  });

  for (const bg of [true, false])
    test(`R11 Enter on the card's Notes icon, Notes ${bg ? "running in the background" : "not started"}: the view pans from where it was (no jump), centres on Notes, and the caret goes in`, async ({
      page,
    }) => {
      await open(page);
      if (bg) await allInBackground(page);
      else
        await expect(
          win(page, "notes").locator(".demo-area"),
        ).not.toHaveAttribute("data-host", /running|starting/);
      // the card's move is a pan from here
      await page.emulateMedia({ reducedMotion: "no-preference" });
      await expect
        .poll(() =>
          page.evaluate(
            () => matchMedia("(prefers-reduced-motion: reduce)").matches,
          ),
        )
        .toBe(false);
      const before = await scrollPos(page);
      // controlled time from here: no page frame runs until the test asks
      await page.evaluate(() => {
        const q = new Map<number, FrameRequestCallback>();
        let n = 0;
        let t = performance.now();
        performance.now = () => t;
        window.requestAnimationFrame = (cb) => (q.set(++n, cb), n);
        window.cancelAnimationFrame = (id) => void q.delete(id);
        Object.assign(window, {
          __frame: (dt: number) => {
            const due = [...q.values()];
            q.clear();
            t += dt;
            for (const cb of due) cb(t);
            return q.size;
          },
        });
      });
      const frame = (dt: number) =>
        page.evaluate(
          (dt) =>
            (window as unknown as { __frame(dt: number): number }).__frame(dt),
          dt,
        );
      await page.locator('.apps [data-go="notes"]').focus();
      await page.keyboard.press("Enter");
      await expect(win(page, "notes").locator("textarea")).toBeFocused();
      // no frame has run: the view has not moved yet
      expect(await scrollPos(page)).toEqual(before);
      // one frame 100 ms in: the pan is under way, not done
      await frame(0);
      expect(await frame(100)).toBeGreaterThan(0);
      const mid = await scrollPos(page);
      expect(mid).not.toEqual(before);
      for (let i = 0; i < 50 && (await frame(100)) > 0; i++);
      await centred(page, "notes");
      await expect(win(page, "notes").locator("textarea")).toBeFocused();
      expect(await active(page)).toBe("notes");
    });
});

/** Holds the app's module (`app-<id>-<hash>.js`) until the returned
 * function runs: the host is there, the app's start is pending. */
async function holdApp(page: Page, appId: string): Promise<() => void> {
  let release!: () => void;
  const held = new Promise<void>((r) => (release = r));
  await page.route(
    new RegExp(`/app-${appId}-[^/]*\\.js(\\?.*)?$`),
    async (r) => {
      await held;
      await r.continue();
    },
  );
  return release;
}

/** true when the focus is in window `id` (its frame or inside it). */
const focusIn = (page: Page, id: string) =>
  page.evaluate(
    (id) => !!document.activeElement?.closest(`[data-win="${id}"]`),
    id,
  );

/** Scrolls the view so window `id`'s left edge is 10 px right of the card's
 * left edge: under the card. */
const underCard = (page: Page, id: string) =>
  page.evaluate((id) => {
    const vp = document.querySelector<HTMLElement>("#vp")!;
    const card = document.querySelector("#card")!.getBoundingClientRect();
    const r = document
      .querySelector(`[data-win="${id}"]`)!
      .getBoundingClientRect();
    vp.scrollLeft += r.left - (card.left + 10);
  }, id);

/** The focused element's left edge is clear of the card (001 R19). */
async function revealed(page: Page): Promise<void> {
  await expect
    .poll(() =>
      page.evaluate(() => {
        const card = document.querySelector("#card")!.getBoundingClientRect();
        const r = document.activeElement!.getBoundingClientRect();
        return r.left >= card.right - 1;
      }),
    )
    .toBe(true);
}

test.describe("004 T7 R11 a pending icon start (Codex 004 #2, #3)", () => {
  for (const away of ["Reset", "Shift+Tab"] as const)
    test(`the Notes icon, then ${away} before Notes has started: Notes does not become active, the focus stays where the visitor put it, the view stays`, async ({
      page,
    }) => {
      await open(page);
      const release = await holdApp(page, "writer");
      const area = win(page, "notes").locator(".demo-area");
      await page.locator('.apps [data-go="notes"]').click();
      await centred(page, "notes");
      await expect(area).toHaveAttribute("data-host", "starting");
      if (away === "Reset") {
        await page.locator("#reset").click();
        await expect.poll(() => scrollPos(page)).toEqual([0, 0]);
      } else {
        await page.keyboard.press("Shift+Tab");
        expect(await focusIn(page, "notes")).toBe(false);
      }
      await page.evaluate(() =>
        document.activeElement?.setAttribute("data-was", ""),
      );
      const at = await scrollPos(page);
      release();
      await expect(area).toHaveAttribute("data-host", "running");
      await expect(win(page, "notes").locator("textarea")).toBeVisible();
      await expect(win(page, "notes").locator("textarea")).not.toBeFocused();
      await expect(page.locator("[data-was]")).toBeFocused();
      // (Shift+Tab may land in another running app: that one is active)
      expect(await active(page)).not.toBe("notes");
      expect(await scrollPos(page)).toEqual(at);
    });

  test("the Notes icon, Notes still starting, the view moved so Notes is under the card: Tab and Shift+Tab in Notes reveal the focused control beside the card", async ({
    page,
  }) => {
    await open(page);
    const release = await holdApp(page, "writer");
    const area = win(page, "notes").locator(".demo-area");
    await page.locator('.apps [data-go="notes"]').click();
    await centred(page, "notes");
    await expect(area).toHaveAttribute("data-host", "starting");
    await underCard(page, "notes");
    await page.keyboard.press("Tab");
    expect(await focusIn(page, "notes")).toBe(true);
    await revealed(page);
    await underCard(page, "notes");
    await page.keyboard.press("Shift+Tab");
    expect(await focusIn(page, "notes")).toBe(true);
    await revealed(page);
    release();
    await expect(area).toHaveAttribute("data-host", "running");
  });
});

test("R12.a a drawing, an edited song, a note and Notes' word wrap changed are back to their defaults after a reload", async ({
  page,
}) => {
  await open(page);
  const textarea = win(page, "notes").locator("textarea");
  const cell = win(page, "music").locator(
    '.trk-row[data-r="0"] .trk-cell[data-c="0"] .n',
  );
  const canvas = win(page, "paint").locator(".paint-canvas");
  const pixel = () =>
    canvas.evaluate((c: HTMLCanvasElement) => [
      ...c.getContext("2d")!.getImageData(60, 20, 1, 1).data,
    ]);
  const runAll = async () => {
    for (const id of TOOLS) await run(page, id);
    await expect(
      win(page, "music").getByRole("button", { name: "Play", exact: true }),
    ).toBeEnabled();
  };
  // Paint: a stroke across picture row 20 (the view on Paint)
  await run(page, "paint");
  const r = (await canvas.boundingBox())!;
  const y = Math.ceil(r.y + (20 * r.height) / 200);
  await page.mouse.move(Math.ceil(r.x + (20 * r.width) / 320), y);
  await page.mouse.down();
  await page.mouse.move(Math.ceil(r.x + (100 * r.width) / 320), y, {
    steps: 8,
  });
  await page.mouse.up();
  await expect.poll(pixel).not.toEqual([255, 255, 255, 255]);
  // Music: a note in the demo's empty first cell
  await run(page, "music");
  await expect(cell).toHaveText("---");
  await cell.click();
  await page.keyboard.press("z");
  await expect(cell).toHaveText("C-4");
  // Notes: a note, and word wrap off
  await run(page, "notes");
  await textarea.click();
  await page.keyboard.type("hello");
  await expect(textarea).toHaveAttribute("wrap", "soft");
  await chooseMenu(page, "notes", "View", "Word wrap");
  await expect(textarea).toHaveAttribute("wrap", "off");

  await page.reload();
  await runAll();
  expect(await pixel()).toEqual([255, 255, 255, 255]);
  await expect(title(page, "paint")).toHaveText("Paint - untitled");
  await expect(cell).toHaveText("---");
  await expect(title(page, "music")).toHaveText("Music - demo.trk");
  await expect(textarea).toHaveValue("");
  await expect(textarea).toHaveAttribute("wrap", "soft");
  await expect(title(page, "notes")).toHaveText("Notes - untitled");
});
