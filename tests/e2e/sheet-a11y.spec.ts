// Spec 001 T7 on desktop: keyboard (R19, R4.b) and reduced motion (R17).
// Positions are read from the DOM only.
import type { Page } from "@playwright/test";
import { expect, test } from "./helpers";
import {
  clock,
  frame,
  idle,
  live,
  open,
  ran,
  setReduced,
  settle,
  throwIt,
} from "./sheet-clock";
import { sheet } from "./sheet-base";

type Pt = [number, number];

function view(page: Page) {
  return page.evaluate(() => {
    const vp = document.querySelector<HTMLElement>("#vp")!;
    const t = getComputedStyle(document.querySelector("#world")!).transform;
    return {
      z: t === "none" ? 1 : new DOMMatrix(t).a,
      // scroll from the sheet's own origin: the start view is (0, 0)
      left: vp.scrollLeft - parseFloat(getComputedStyle(vp).paddingLeft),
      top: vp.scrollTop - parseFloat(getComputedStyle(vp).paddingTop),
    };
  });
}

/** A window transform: position (sheet px), rotation, scale. Each part is
 * read on its own (009 R2.a), so a missing part cannot read as 0 and any
 * other part fails. Firefox and WebKit write translate(x, 0px) as
 * translate(x). */
function parse(tf: string) {
  const t = /translate\(([-\d.e]+)px(?:, ([-\d.e]+)px)?\)/.exec(tf);
  const r = /rotate\(([-\d.e]+)deg\)/.exec(tf);
  const s = /scale\(([-\d.e]+)\)/.exec(tf);
  let rest = tf;
  for (const m of [t, r, s]) if (m) rest = rest.replace(m[0], "");
  if (!t || rest.trim()) throw new Error(`transform not understood: "${tf}"`);
  return {
    x: +t[1],
    y: +(t[2] ?? 0),
    rot: r ? +r[1] : 0,
    scale: s ? +s[1] : 1,
  };
}
const pose = async (page: Page, id: string) =>
  parse(
    await page
      .locator(`[data-win="${id}"]`)
      .evaluate((w) => (w as HTMLElement).style.transform),
  );

/** Scrolls the sheet to (x, y) from its own origin, at once. */
const scrollSheet = (page: Page, x: number, y: number) =>
  page.locator("#vp").evaluate(
    (vp, [x, y]) => {
      const cs = getComputedStyle(vp);
      vp.scrollTo(
        x + parseFloat(cs.paddingLeft),
        y + parseFloat(cs.paddingTop),
      );
    },
    [x, y],
  );

const HOMES: Record<string, Pt> = {
  castlesiege: [360, 100],
  castlewars: [1040, 140],
  pentimento: [1720, 80],
  crawler: [400, 860],
  insider: [1160, 800],
  paint: [1920, 760],
  music: [2400, 700],
  notes: [1920, 1150],
};

/** The view area beside the card, client px (the mock's visibleArea). */
async function area(page: Page) {
  const card = (await page.locator("#card").boundingBox())!;
  const vp = await page
    .locator("#vp")
    .evaluate((vp) => [vp.clientWidth, vp.clientHeight]);
  return {
    l: card.x + card.width + 24,
    t: 24,
    r: vp[0] - 16,
    b: vp[1] - 16,
  };
}

/** The paper's glide landing (spec: the mock's glide, τ = 0.18 s down to
 * 20 px/s) for a release at sheet scroll `at` with screen velocity `v`. */
const glideLanding = (at: Pt, v: Pt): Pt => {
  const k = 0.18 * (1 - 20 / Math.hypot(v[0], v[1]));
  return [at[0] - v[0] * k, at[1] - v[1] * k];
};

/** A flick on the paper below CastleSiege under the test clock: down at
 * (1010, 740), five moves of (−40, −20) 10 ms apart, release with the last
 * one. The view moves (200, 100), then glides on at v = (−4000, −2000)
 * screen px/s: the press and the five moves are all inside the last 80 ms. */
async function flick(page: Page): Promise<Pt> {
  await page.mouse.move(1010, 740);
  await page.mouse.down();
  for (let i = 1; i <= 5; i++) {
    await clock(page, 10);
    await page.mouse.move(1010 - 40 * i, 740 - 20 * i);
  }
  await expect.poll(async () => (await view(page)).left).toBe(200);
  await page.mouse.up();
  return glideLanding([200, 100], [-4000, -2000]);
}

/** In-page: the focused element's ring against the pixels on both sides of
 * it, from a screenshot (R18: 3:1). Samples five places on each side of a
 * box ring (outline at an offset ≥ 0), at whole screen px. */
async function ringPixels(page: Page) {
  const shot = (await page.screenshot()).toString("base64");
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement("canvas");
    [c.width, c.height] = [img.width, img.height];
    const g = c.getContext("2d")!;
    g.drawImage(img, 0, 0);
    // the shot may be at a device pixel ratio (Firefox: 2): read the middle
    // of each CSS pixel
    const k = img.width / innerWidth;
    const px = (x: number, y: number) => [
      ...g
        .getImageData(
          Math.floor((Math.round(x) + 0.5) * k),
          Math.floor((Math.round(y) + 0.5) * k),
          1,
          1,
        )
        .data.slice(0, 3),
    ];
    const lum = (rgb: number[]) =>
      rgb
        .map((v) => v / 255)
        .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
        .reduce((s, c, i) => s + c * [0.2126, 0.7152, 0.0722][i], 0);
    const ratio = (a: number[], b: number[]) => {
      const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
      return (hi + 0.05) / (lo + 0.05);
    };
    const el = document.activeElement as HTMLElement;
    const cs = getComputedStyle(el);
    const z = el.closest("#world")
      ? new DOMMatrix(
          getComputedStyle(document.querySelector("#world")!).transform,
        ).a
      : 1;
    const o = Math.round(parseFloat(cs.outlineOffset) * z);
    const w = Math.round(parseFloat(cs.outlineWidth) * z);
    const r = el.getBoundingClientRect();
    const [L, T, R, B] = [r.left, r.top, r.right, r.bottom].map(Math.round);
    let min = Infinity;
    let at = "";
    // the card and the minimap float above the sheet: a ring under them is
    // not drawn there (R19 visibility, not this contrast check)
    const covered = (x: number, y: number) =>
      !!document.elementFromPoint(x, y)?.closest("#card, .mapbox");
    const check = (side: string, ring: number[] | null, near: number[][]) => {
      if (!ring) return;
      for (const n of near) {
        const k = ratio(ring, n);
        if (k < min) [min, at] = [k, `${side} ring ${ring} by ${n}`];
      }
    };
    for (const f of [0.1, 0.3, 0.5, 0.7, 0.9]) {
      const y = T + (B - T) * f;
      const x = L + (R - L) * f;
      const gap = (a: number[]) => (o > 0 ? [a] : []);
      const at = (x: number, y: number) => (covered(x, y) ? null : px(x, y));
      check("right", at(R + o, y), [...gap(px(R, y)), px(R + o + w, y)]);
      check("left", at(L - o - 1, y), [
        ...gap(px(L - 1, y)),
        px(L - o - w - 1, y),
      ]);
      check("bottom", at(x, B + o), [...gap(px(x, B)), px(x, B + o + w)]);
      check("top", at(x, T - o - 1), [
        ...gap(px(x, T - 1)),
        px(x, T - o - w - 1),
      ]);
    }
    return { min, at };
  }, shot);
}

// ---- R19 ----

/** The focused element's ring and the colour it is drawn on, in the page.
 * Outside the border box: the first opaque background behind it. Over the
 * border: the border colour. Inside: the element's own background. R18
 * wants 3:1 between the ring and those unfocused pixels. */
const ring = (page: Page) =>
  page.evaluate(() => {
    const el = document.activeElement as HTMLElement;
    const cs = getComputedStyle(el);
    const rgb = (c: string) => {
      const m =
        /rgba?\(([\d.]+),? ([\d.]+),? ([\d.]+)(?:,? \/? ?([\d.]+))?/.exec(c);
      return m && (m[4] === undefined || +m[4] > 0)
        ? [+m[1], +m[2], +m[3]]
        : null;
    };
    const lum = ([r, g, b]: number[]) =>
      [r, g, b]
        .map((v) => v / 255)
        .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
        .reduce((s, c, i) => s + c * [0.2126, 0.7152, 0.0722][i], 0);
    const bg = (n: Element | null): number[] => {
      for (; n; n = n.parentElement) {
        const c = rgb(getComputedStyle(n).backgroundColor);
        if (c) return c;
      }
      return [255, 255, 255];
    };
    const width = parseFloat(cs.outlineWidth);
    const off = parseFloat(cs.outlineOffset);
    const border = parseFloat(cs.borderTopWidth);
    // 002 T6: a ring inside a running app's control sits on a paper band,
    // an inset shadow at least as deep as the ring's inner edge
    const band = /^(rgba?\([^)]*\)) 0px 0px 0px ([\d.]+)px inset$/.exec(
      cs.boxShadow,
    );
    const behind =
      off >= 0
        ? bg(el.parentElement)
        : band && +band[2] >= -off
          ? rgb(band[1])!
          : off + width > -border && border > 0
            ? rgb(cs.borderTopColor)!
            : bg(el);
    const [hi, lo] = [lum(rgb(cs.outlineColor)!), lum(behind)].sort(
      (a, b) => b - a,
    );
    const z = el.closest("#world")
      ? new DOMMatrix(
          getComputedStyle(document.querySelector("#world")!).transform,
        ).a
      : 1;
    const r = el.getBoundingClientRect();
    return {
      desc: `${el.tagName} ${el.dataset.win ?? el.id ?? ""} ${el.getAttribute("aria-label") ?? el.textContent?.slice(0, 20)}`,
      visible: el.matches(":focus-visible") && cs.outlineStyle !== "none",
      screenWidth: width * z,
      contrast: (hi + 0.05) / (lo + 0.05),
      inSheet: !!el.closest("#vp") && el.id !== "vp",
      win: el.dataset.win ?? null,
      rect: [r.left, r.top, r.right, r.bottom],
      // the box with its ring
      box: [
        r.left - off - width,
        r.top - off - width,
        r.right + off + width,
        r.bottom + off + width,
      ],
    };
  });

for (const scheme of ["light", "dark"] as const) {
  test(`R19.a R18 Tab through the card into the windows (${scheme}): a visible ring at each stop, windows in list order, named by title, each in view beside the card with one scroll`, async ({
    page,
    browserName,
  }) => {
    test.slow();
    await page.emulateMedia({ colorScheme: scheme });
    await open(page);
    await idle(page);
    // the titles, in project-list order: the card's list, then Quick tools.
    // A project window is named by its full title (its heading); the card
    // may show a short name (owner 2026-10-24)
    const names = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>("#card [data-go]")].map(
        (b) =>
          [
            b.dataset.go!,
            document.querySelector(`[data-win="${b.dataset.go}"] .phead h2`)
              ?.textContent ??
              [...b.childNodes]
                .filter((n) => n.nodeType === Node.TEXT_NODE)
                .map((n) => n.textContent)
                .join("")
                .trim(),
          ] as const,
      ),
    );
    expect(names.map((n) => n[0])).toEqual(Object.keys(HOMES));
    await page.evaluate(() => {
      const vp = document.querySelector<HTMLElement>("#vp")!;
      const log: number[][] = [];
      vp.addEventListener("scroll", () =>
        log.push([vp.scrollLeft, vp.scrollTop]),
      );
      Object.assign(window, { __scrolls: log });
    });
    const a = await area(page);
    // WebKit, like Safari, tabs to links and buttons only with Alt
    const tab = browserName === "webkit" ? "Alt+Tab" : "Tab";
    const seen: string[] = [];
    // running apps add their menu rows and controls (002): ~110 stops
    for (let i = 0; i < 200 && seen.length < 8; i++) {
      await page.evaluate(() =>
        (window as unknown as { __scrolls: number[][] }).__scrolls.splice(0),
      );
      await page.keyboard.press(tab);
      await idle(page);
      const r = await ring(page);
      expect(r.visible, `ring at ${r.desc}`).toBe(true);
      expect(r.screenWidth, `ring width at ${r.desc}`).toBeGreaterThanOrEqual(
        2,
      );
      expect(r.contrast, `ring contrast at ${r.desc}`).toBeGreaterThanOrEqual(
        3,
      );
      if (r.inSheet) {
        // in view beside the card, not under it; the ring on screen too
        const [l, t, rt, b] = r.rect;
        expect(l, `left of ${r.desc}`).toBeGreaterThanOrEqual(a.l - 1);
        expect(t, `top of ${r.desc}`).toBeGreaterThanOrEqual(a.t - 1);
        expect(rt, `right of ${r.desc}`).toBeLessThanOrEqual(a.r + 1);
        expect(b, `bottom of ${r.desc}`).toBeLessThanOrEqual(a.b + 1);
        const [rl, rtop, rr, rb] = r.box;
        expect(rl, `ring left of ${r.desc}`).toBeGreaterThan(a.l - 24);
        expect(rtop, `ring top of ${r.desc}`).toBeGreaterThanOrEqual(0);
        expect(rr, `ring right of ${r.desc}`).toBeLessThanOrEqual(a.r + 16);
        expect(rb, `ring bottom of ${r.desc}`).toBeLessThanOrEqual(a.b + 16);
        // the view moved at most once for this stop: no second scroll
        const scrolls = await page.evaluate(
          () => (window as unknown as { __scrolls: number[][] }).__scrolls,
        );
        expect(
          new Set(scrolls.map((s) => s.join())).size,
          `scrolls for ${r.desc}`,
        ).toBeLessThanOrEqual(1);
      }
      if (r.win) {
        // R18 on the pixels: the window ring against its own shadow too
        const px = await ringPixels(page);
        expect(
          px.min,
          `ring pixels of ${r.win}: ${px.at}`,
        ).toBeGreaterThanOrEqual(3);
        seen.push(r.win);
        const name = names.find((n) => n[0] === r.win)![1];
        await expect(
          page.getByRole("region", { name, exact: true }),
        ).toBeFocused();
      }
    }
    expect(seen).toEqual(Object.keys(HOMES));
  });
}

test("R19 a window under the card comes into view beside it when tabbed to", async ({
  page,
  browserName,
}) => {
  await open(page);
  // from CastleSiege's last Tab stop (in view) on to Castle Wars; since 002
  // the running app's controls follow the project link
  await expect(
    page.locator('[data-win="castlesiege"] .demo-area'),
  ).toHaveAttribute("data-host", "running");
  await page.evaluate(() =>
    [
      ...document.querySelectorAll<HTMLElement>(
        '[data-win="castlesiege"] :is(a[href], button, input, textarea, select, [tabindex])',
      ),
    ]
      .filter(
        (e) =>
          e.tabIndex >= 0 &&
          !e.closest("[inert]") &&
          e.getClientRects().length > 0,
      )
      .at(-1)!
      .focus(),
  );
  await idle(page);
  expect((await view(page)).left).toBe(0);
  // look further right: Castle Wars sits under the card
  await scrollSheet(page, 900, 0);
  await expect.poll(async () => (await view(page)).left).toBe(900);
  await page.keyboard.press(browserName === "webkit" ? "Alt+Tab" : "Tab");
  await expect(page.locator('[data-win="castlewars"]')).toBeFocused();
  await idle(page);
  const a = await area(page);
  const b = (await page.locator('[data-win="castlewars"]').boundingBox())!;
  expect(b.x).toBeGreaterThanOrEqual(a.l - 1);
  expect(b.x + b.width).toBeLessThanOrEqual(a.r + 1);
});

test("R19.b Alt + ArrowRight moves the focused window 24 sheet px right, at any zoom, with no scroll", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await open(page);
  const cs = page.locator('[data-win="castlesiege"]');
  await cs.focus();
  const v0 = await view(page);
  await page.keyboard.press("Alt+ArrowRight");
  await expect
    .poll(() => pose(page, "castlesiege"))
    .toEqual({
      x: 384,
      y: 100,
      rot: 0,
      scale: 1,
    });
  expect(await view(page)).toEqual(v0);
  // at 80 % it is still 24 sheet px
  await page.click("#zOut");
  await expect(page.locator("#zPct")).toHaveText("80%");
  await cs.focus();
  await page.keyboard.press("Alt+ArrowDown");
  await expect
    .poll(() => pose(page, "castlesiege"))
    .toEqual({
      x: 384,
      y: 124,
      rot: 0,
      scale: 1,
    });
  await page.keyboard.press("Alt+ArrowLeft");
  await page.keyboard.press("Alt+ArrowUp");
  await expect
    .poll(() => pose(page, "castlesiege"))
    .toEqual({
      x: 360,
      y: 100,
      rot: 0,
      scale: 1,
    });
});

test("R19 Alt + arrows stop at the sheet edge, like a landing", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await open(page);
  const p = page.locator('[data-win="pentimento"]');
  await p.focus();
  // y 80: 80, 56, 32, 8, then 0
  for (let i = 0; i < 5; i++) await page.keyboard.press("Alt+ArrowUp");
  await expect.poll(async () => (await pose(page, "pentimento")).y).toBe(0);
  const n = page.locator('[data-win="notes"]');
  await n.focus();
  // x 1920 + 424 wide: the last place is 2576 (28 steps of 24 reach it)
  for (let i = 0; i < 30; i++) await page.keyboard.press("Alt+ArrowRight");
  await expect.poll(async () => (await pose(page, "notes")).x).toBe(2576);
});

test("R19 Home on a focused window sends it home", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await open(page);
  // a view away from the top-left, so a native Home scroll would show
  await scrollSheet(page, 30, 50);
  await expect.poll(async () => (await view(page)).top).toBe(50);
  const cs = page.locator('[data-win="castlesiege"]');
  await cs.evaluate((w) => (w as HTMLElement).focus({ preventScroll: true }));
  for (let i = 0; i < 3; i++) await page.keyboard.press("Alt+ArrowDown");
  await expect.poll(async () => (await pose(page, "castlesiege")).y).toBe(172);
  const v0 = await view(page);
  await page.keyboard.press("Home");
  await expect
    .poll(() => pose(page, "castlesiege"))
    .toEqual({
      x: 360,
      y: 100,
      rot: 0,
      scale: 1,
    });
  // the key did not also scroll the sheet to its top-left
  expect(await view(page)).toEqual(v0);
});

test("R19 a window moved toward the right edge by keyboard keeps its focus in view", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await open(page);
  const w = page.locator('[data-win="pentimento"]');
  await w.focus();
  // the focus may have scrolled the view: move until the window passes the
  // right edge of the start view, then it must still be in view
  for (let i = 0; i < 12; i++) await page.keyboard.press("Alt+ArrowRight");
  await expect.poll(async () => (await pose(page, "pentimento")).x).toBe(2008);
  const a = await area(page);
  const b = (await w.boundingBox())!;
  expect(b.x).toBeGreaterThanOrEqual(a.l - 1);
  expect(b.x + b.width).toBeLessThanOrEqual(a.r + 1);
});

// ---- R4.b, decided in T7: arrows on a control in a window pan the sheet ----

test("R4.b arrow keys on a link in a window pan the sheet like the sheet itself", async ({
  page,
}) => {
  await open(page);
  const link = page.locator('[data-win="castlesiege"] .meta a').first();
  await link.evaluate((a) => (a as HTMLElement).focus({ preventScroll: true }));
  await page.keyboard.press("ArrowRight");
  await expect.poll(async () => (await view(page)).left).toBe(64);
  await page.keyboard.press("ArrowDown");
  await expect.poll(async () => (await view(page)).top).toBe(64);
});

// ---- R17 ----

test("R17.a reduced motion: a throw lands at the next frame with rotation 0", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await open(page, true);
  // the test clock: moves 10 ms apart, the release with the last one
  const want = await throwIt(page);
  expect(want, "a throw with velocity").not.toBeNull();
  // no frame has run since the release: it is at the landing already
  const p = await pose(page, "castlesiege");
  expect(p.rot).toBe(0);
  expect(p.scale).toBe(1);
  expect(Math.abs(p.x - want![0]), `x ${p.x} vs ${want![0]}`).toBeLessThan(
    0.01,
  );
  expect(Math.abs(p.y - want![1]), `y ${p.y} vs ${want![1]}`).toBeLessThan(
    0.01,
  );
  expect(p.x).toBeGreaterThan(360 + 150 + 1);
  for (let i = 0; i < 10 && (await frame(page, 16)) > 0; i++);
  expect(await frame(page, 16)).toBe(0);
  expect(await pose(page, "castlesiege")).toEqual(p);
});

test("R17.a reduced motion: Home, Reset and a zoom button commit in the same turn", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await open(page, true);
  await throwIt(page);
  const read = (sel: string) =>
    page.evaluate((sel) => {
      document.querySelector<HTMLElement>(sel)!.click();
      const t = getComputedStyle(document.querySelector("#world")!).transform;
      return {
        z: new DOMMatrix(t).a,
        cs: document.querySelector<HTMLElement>('[data-win="castlesiege"]')!
          .style.transform,
      };
    }, sel);
  const h = await read('[data-win="castlesiege"] .bar button.home');
  expect(parse(h.cs)).toEqual({ x: 360, y: 100, rot: 0, scale: 1 });
  await throwIt(page);
  const z = await read("#zIn");
  expect(z.z).toBeCloseTo(1.25, 6);
  const r = await read("#reset");
  expect(parse(r.cs)).toEqual({ x: 360, y: 100, rot: 0, scale: 1 });
  expect(r.z).toBe(1);
});

test("R17 reduced motion turned on during a Home flight ends it at home", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await open(page, true);
  await throwIt(page);
  const away = await pose(page, "castlesiege");
  await setReduced(page, false);
  await page
    .locator('[data-win="castlesiege"] .bar button.home')
    .evaluate((b) => (b as HTMLElement).click());
  // two frames: the flight is under way
  await frame(page, 16);
  expect(await frame(page, 40)).toBeGreaterThan(0);
  const mid = await pose(page, "castlesiege");
  expect(mid.x).not.toBe(away.x);
  expect(mid.x).not.toBe(360);
  await setReduced(page, true);
  // no frame runs: the change alone ends the flight at its target
  await expect
    .poll(() => pose(page, "castlesiege"))
    .toEqual({
      x: 360,
      y: 100,
      rot: 0,
      scale: 1,
    });
  // and the windows' frame loop is cancelled: only the minimap's draw is
  // left, one callback, then nothing
  expect(await live(page)).toBe(1);
  const n = await ran(page);
  expect(await frame(page, 16)).toBe(0);
  expect((await ran(page)) - n).toBe(1);
});

test("R17 reduced motion turned on during a zoom button animation ends it at its zoom", async ({
  page,
}) => {
  await open(page, true);
  await page.click("#zOut");
  await frame(page, 16);
  expect(await frame(page, 60)).toBeGreaterThan(0);
  const z = (await view(page)).z;
  expect(z).toBeLessThan(1);
  expect(z).toBeGreaterThan(0.8);
  await setReduced(page, true);
  await expect(page.locator("#zPct")).toHaveText("80%");
  expect((await view(page)).z).toBeCloseTo(0.8, 6);
  // nothing goes on (one frame may draw the minimap)
  await frame(page, 16);
  expect(await frame(page, 16)).toBe(0);
  expect((await view(page)).z).toBeCloseTo(0.8, 6);
});

test("R17 reduced motion turned on during a navigation pan ends it at its target", async ({
  page,
}) => {
  // the target: the same navigation with reduced motion, on a second page
  const ref = await page.context().newPage();
  await ref.emulateMedia({ reducedMotion: "reduce" });
  await ref.goto(sheet());
  await expect(ref.locator("#world")).toHaveAttribute("style", /scale\(/);
  await ref.locator('#card [data-go="paint"]').click();
  const want = await view(ref);
  await ref.close();
  await open(page, true);
  await page.locator('#card [data-go="paint"]').click();
  await frame(page, 16);
  expect(await frame(page, 60)).toBeGreaterThan(0);
  const mid = await view(page);
  expect(mid.left).toBeGreaterThan(0);
  expect(mid.left).toBeLessThan(want.left);
  await setReduced(page, true);
  await expect.poll(() => view(page)).toEqual(want);
  await frame(page, 16);
  expect(await frame(page, 16)).toBe(0);
  expect(await view(page)).toEqual(want);
});

/** Expects the view (sheet origin) at `want` within 1 px. */
async function viewAt(page: Page, want: Pt) {
  const v = await view(page);
  expect(
    Math.abs(v.left - want[0]),
    `left ${v.left} vs ${want[0]}`,
  ).toBeLessThanOrEqual(1);
  expect(
    Math.abs(v.top - want[1]),
    `top ${v.top} vs ${want[1]}`,
  ).toBeLessThanOrEqual(1);
}

test("R4 the paper's glide ends exactly at its landing", async ({ page }) => {
  await open(page, true);
  const want = await flick(page);
  await settle(page);
  await viewAt(page, want);
});

test("R22 a glide that reaches the scroll limit stops scheduling frames there", async ({
  page,
}) => {
  await open(page, true);
  // 210 px left of and 110 px above the scroll limits: the drag of
  // (200, 100) below takes the view to 10 px from both, and the glide at
  // (−4000, −2000) px/s reaches them in its first frame
  const max = await page
    .locator("#vp")
    .evaluate((vp) => [
      vp.scrollWidth - vp.clientWidth,
      vp.scrollHeight - vp.clientHeight,
    ]);
  await page
    .locator("#vp")
    .evaluate((vp, [x, y]) => vp.scrollTo(x - 210, y - 110), max);
  // paper below Notes and right of Insider Trading, clear of the minimap
  await page.mouse.move(1010, 740);
  await page.mouse.down();
  for (let i = 1; i <= 5; i++) {
    await clock(page, 10);
    await page.mouse.move(1010 - 40 * i, 740 - 20 * i);
  }
  const at = () =>
    page
      .locator("#vp")
      .evaluate((vp) => [vp.scrollLeft, vp.scrollTop] as const);
  await expect.poll(at).toEqual([max[0] - 10, max[1] - 10]);
  await page.mouse.up();
  const n = await ran(page);
  await settle(page);
  expect(await at()).toEqual(max);
  // the glide's first frame reaches both limits; with its minimap redraw
  // that is at most three callbacks, not the glide's full ~1 s of frames
  expect((await ran(page)) - n).toBeLessThanOrEqual(3);
});

test("R17 reduced motion: a flick commits the glide's landing at release", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await open(page, true);
  const want = await flick(page);
  // no frame has run since the release
  await viewAt(page, want);
  await settle(page);
  await viewAt(page, want);
});

test("R17 reduced motion turned on during the paper's glide ends it at its landing", async ({
  page,
}) => {
  await open(page, true);
  const want = await flick(page);
  await frame(page, 16);
  expect(await frame(page, 16)).toBeGreaterThan(0);
  const mid = await view(page);
  expect(mid.left).toBeGreaterThan(200);
  expect(mid.left).toBeLessThan(want[0] - 1);
  await setReduced(page, true);
  // no frame runs: the change alone ends it at its landing
  await expect
    .poll(async () => (await view(page)).left)
    .toBeGreaterThan(mid.left);
  await viewAt(page, want);
  await settle(page);
  await viewAt(page, want);
});

test("R17 a wheel ends a navigation pan; reduced motion turned on later leaves the view where the wheel put it", async ({
  page,
}) => {
  await open(page, true);
  await page.locator('#card [data-go="paint"]').click();
  await frame(page, 16);
  expect(await frame(page, 60)).toBeGreaterThan(0);
  const mid = await view(page);
  await page.mouse.move(800, 400);
  await page.mouse.wheel(0, 100);
  // the wheel's own (native) scroll, until it stops
  await expect.poll(async () => (await view(page)).top).not.toBe(mid.top);
  let last = "";
  await expect
    .poll(
      async () => {
        const k = JSON.stringify(await view(page));
        const still = k === last;
        last = k;
        return still;
      },
      { intervals: [100] },
    )
    .toBe(true);
  const v = await view(page);
  await setReduced(page, true);
  expect(await view(page)).toEqual(v);
});

// ---- option A on desktop (advisor, T7): a left and top inset beside the card ----

/** Expects window `id` beside the card: its left edge ≥ the card's right
 * edge + 24 and its title bar below y 24. */
async function besideCard(page: Page, id: string) {
  const card = (await page.locator("#card").boundingBox())!;
  const w = (await page.locator(`[data-win="${id}"]`).boundingBox())!;
  const bar = (await page.locator(`[data-win="${id}"] .bar`).boundingBox())!;
  expect(w.x, `${id} left`).toBeGreaterThanOrEqual(
    card.x + card.width + 24 - 0.5,
  );
  expect(bar.y, `${id} title bar top`).toBeGreaterThanOrEqual(24 - 0.5);
}

test("option A: the start view and Reset are today's: CastleSiege at screen (360, 100) at 100 %", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await open(page);
  const at = async () => {
    const b = (await page.locator('[data-win="castlesiege"]').boundingBox())!;
    return [b.x, b.y, (await view(page)).z];
  };
  expect(await at()).toEqual([360, 100, 1]);
  await page.locator("#vp").evaluate((vp) => vp.scrollBy(300, 200));
  await page.click("#zOut");
  await page.getByRole("button", { name: /Reset page/ }).click();
  expect(await at()).toEqual([360, 100, 1]);
});

test("option A: CastleSiege moved past the card by Alt+Left comes into view beside it", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await open(page);
  await page.locator('[data-win="castlesiege"]').focus();
  await page.keyboard.press("Alt+ArrowLeft");
  await page.keyboard.press("Alt+ArrowLeft");
  await expect.poll(async () => (await pose(page, "castlesiege")).x).toBe(312);
  await besideCard(page, "castlesiege");
});

test("option A: a window at sheet (0, 0) is shown beside the card by keyboard moves, card navigation and Tab", async ({
  page,
  browserName,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await open(page);
  // throw CastleSiege left and up, then nudge it into the corner
  await page.mouse.move(500, 112);
  await page.mouse.down();
  await page.mouse.move(100, 80, { steps: 5 });
  await page.mouse.up();
  await page.locator('[data-win="castlesiege"]').focus();
  for (let i = 0; i < 5; i++) await page.keyboard.press("Alt+ArrowUp");
  for (let i = 0; i < 3; i++) await page.keyboard.press("Alt+ArrowLeft");
  await expect
    .poll(async () => {
      const p = await pose(page, "castlesiege");
      return [p.x, p.y];
    })
    .toEqual([0, 0]);
  await besideCard(page, "castlesiege");
  // card navigation from far away
  await page.locator("#vp").evaluate((vp) => vp.scrollTo(2000, 900));
  await page.locator('#card [data-go="castlesiege"]').click();
  await besideCard(page, "castlesiege");
  // Tab from the sheet itself, from far away
  await page.locator("#vp").evaluate((vp) => {
    vp.scrollTo(2000, 900);
    vp.focus({ preventScroll: true });
  });
  await page.keyboard.press(browserName === "webkit" ? "Alt+Tab" : "Tab");
  await expect(page.locator('[data-win="castlesiege"]')).toBeFocused();
  await besideCard(page, "castlesiege");
});

// ---- T7 review fixes (Codex) ----

/** Expects the focused element wholly in the view beside the card. */
async function focusInView(page: Page) {
  const a = await area(page);
  const r = await page.evaluate(() => {
    const el = document.activeElement as HTMLElement;
    const b = el.getBoundingClientRect();
    return {
      d: `${el.tagName} ${el.dataset.win ?? el.textContent?.slice(0, 20)}`,
      b: [b.left, b.top, b.right, b.bottom],
    };
  });
  const [l, t, rt, b] = r.b;
  expect(l, `left of ${r.d}`).toBeGreaterThanOrEqual(a.l - 1);
  expect(t, `top of ${r.d}`).toBeGreaterThanOrEqual(a.t - 1);
  expect(rt, `right of ${r.d}`).toBeLessThanOrEqual(a.r + 1);
  expect(b, `bottom of ${r.d}`).toBeLessThanOrEqual(a.b + 1);
}

test("R19 Shift+Tab during a card navigation pan: the new focus comes into view", async ({
  page,
  browserName,
}) => {
  await open(page, true);
  await page.locator('#card [data-go="paint"]').click();
  await expect(page.locator('[data-win="paint"]')).toBeFocused();
  // back to Insider Trading, while the pan to Paint has not moved yet: its
  // link, Home, Expand (013) and Replay (006 T4), then the window; with a
  // write-up (013, the e2e build's fixtures) its tab strip is one more stop
  const back = browserName === "webkit" ? "Alt+Shift+Tab" : "Shift+Tab";
  const strip = await page.locator('[data-win="insider"] .tabs').isVisible();
  for (let i = 0; i < 5 + Number(strip); i++) await page.keyboard.press(back);
  await expect(page.locator('[data-win="insider"]')).toBeFocused();
  await settle(page);
  await focusInView(page);
});

test("R19 the Home control with home out of view: the window and the focused control come into view", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await open(page);
  const w = page.locator('[data-win="castlesiege"]');
  const home = page.locator('[data-win="castlesiege"] .bar button.home');
  for (const how of ["Enter on the control", "Home key"]) {
    await w.focus();
    for (let i = 0; i < 40; i++) await page.keyboard.press("Alt+ArrowRight");
    await expect
      .poll(async () => (await pose(page, "castlesiege")).x)
      .toBe(1320);
    // home (360) is now out of view
    const b = (await w.boundingBox())!;
    expect(b.x - (1320 - 360)).toBeLessThan((await area(page)).l);
    if (how === "Home key") await page.keyboard.press("Home");
    else {
      await home.focus();
      await page.keyboard.press("Enter");
    }
    await expect
      .poll(async () => (await pose(page, "castlesiege")).x)
      .toBe(360);
    await focusInView(page);
    await besideCard(page, "castlesiege");
  }
});

test("R19 a resize keeps the focused window in view: Pentimento at 1280 × 800, then 390 × 844, below the bar", async ({
  page,
}) => {
  await open(page);
  await page.locator('[data-win="pentimento"]').focus();
  await idle(page);
  await focusInView(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(async () => {
      const card = (await page.locator("#card").boundingBox())!;
      const w = (await page.locator('[data-win="pentimento"]').boundingBox())!;
      const bar = (await page
        .locator('[data-win="pentimento"] .bar')
        .boundingBox())!;
      return [
        w.x >= -0.5,
        bar.y >= card.y + card.height - 0.5,
        bar.y + bar.height <= 844,
      ];
    })
    .toEqual([true, true, true]);
});

for (const scheme of ["light", "dark"] as const)
  test(`R18 a focused window's ring contrasts with its own shadow and with a window under it (${scheme})`, async ({
    page,
    browserName,
  }) => {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
    await open(page);
    // Castle Wars over CastleSiege's right edge
    await page.locator('[data-win="castlewars"]').focus();
    for (let i = 0; i < 6; i++) await page.keyboard.press("Alt+ArrowLeft");
    await expect.poll(async () => (await pose(page, "castlewars")).x).toBe(896);
    await page
      .locator("#vp")
      .evaluate((vp) => vp.focus({ preventScroll: true }));
    await page.keyboard.press(browserName === "webkit" ? "Alt+Tab" : "Tab");
    await expect(page.locator('[data-win="castlesiege"]')).toBeFocused();
    await idle(page);
    const px = await ringPixels(page);
    expect(px.min, px.at).toBeGreaterThanOrEqual(3);
  });

test.describe("option A in a tall view", () => {
  test.use({ viewport: { width: 1440, height: 1800 } });
  test("1440 × 1800: the start view and Reset put CastleSiege at screen (360, 100)", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await open(page);
    const at = async () => {
      const b = (await page.locator('[data-win="castlesiege"]').boundingBox())!;
      return [b.x, b.y];
    };
    expect(await at()).toEqual([360, 100]);
    await page.locator("#vp").evaluate((vp) => vp.scrollBy(-200, -200));
    await page.getByRole("button", { name: /Reset page/ }).click();
    expect(await at()).toEqual([360, 100]);
  });
});
