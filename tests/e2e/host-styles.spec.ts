// Spec 002 T6: scoped styles (R13.a), theme (R14.a), scale at zoom (R15.a,
// pixel part; the menu part is in host-input.spec.ts) and motion (R16.a).
import type { Page, Route } from "@playwright/test";
import { expect, test } from "./helpers";
import { HOSTED, appChunk, chooseMenu, holdHost, idle } from "./host-helpers";
import { entryAsset, sheet } from "./sheet-base";

const area = (page: Page, id: string) =>
  page.locator(`[data-win="${id}"] .demo-area`);
const running = (page: Page, id: string) =>
  expect(area(page, id)).toHaveAttribute("data-host", "running");

// ---- R13 ----

const PROPS = [
  "display",
  "position",
  "box-sizing",
  "margin",
  "padding",
  "border",
  "outline",
  "overflow",
  "font-family",
  "font-size",
  "line-height",
  "color",
  "background-color",
  "background-image",
  "box-shadow",
  "user-select",
  "touch-action",
  "cursor",
  "width",
  "height",
];
/** Computed styles and boxes of the sheet's own parts. */
const PARTS = {
  html: "html",
  body: "body",
  card: "#card",
  "card logo": "#card .logo",
  "card button": "#reset",
  grid: "#world",
  frame: '[data-win="castlesiege"]',
  bar: '[data-win="castlesiege"] .bar',
  "bar button": '[data-win="castlesiege"] .bar button',
  "other frame": '[data-win="crawler"]',
  "paint frame": '[data-win="paint"]',
  zoom: "#zPct",
};

function measure(page: Page) {
  return page.evaluate(
    ([parts, props]) => {
      const out: Record<string, Record<string, string>> = {};
      for (const [name, sel] of Object.entries(parts)) {
        const el = document.querySelector(sel);
        if (!el) throw new Error(`no ${sel}`);
        const cs = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        out[name] = Object.fromEntries([
          ...props.map((p) => [p, cs.getPropertyValue(p)]),
          ["box", [r.x, r.y, r.width, r.height].map(Math.round).join(" ")],
        ]);
      }
      return out;
    },
    [PARTS, PROPS] as const,
  );
}

/** Screenshots of the card, CastleSiege's title bar and a piece of grid. */
async function shots(page: Page): Promise<string[]> {
  const boxes = await page.evaluate(() => {
    const r = (sel: string) => {
      const b = document.querySelector(sel)!.getBoundingClientRect();
      return { x: b.x, y: b.y, width: b.width, height: b.height };
    };
    return [
      r("#card"),
      r('[data-win="castlesiege"] .bar'),
      // paper between CastleSiege and Castle Wars at the start view
      { x: 990, y: 20, width: 40, height: 60 },
    ];
  });
  const out: string[] = [];
  for (const clip of boxes)
    out.push(
      (
        await page.screenshot({ clip }).catch((e: Error) => {
          throw new Error(`${e.message}: ${JSON.stringify(clip)}`);
        })
      ).toString("base64"),
    );
  return out;
}

/**
 * Starts the four apps with their loads in the order `wins`: a press in each
 * demo area while the host is held (CastleSiege's window is eligible, so the
 * start rule asks first), then each app's JS and CSS are let through one app
 * at a time, each after the one before runs. The CSS arrives in that order.
 */
async function startInOrder(page: Page, wins: string[]): Promise<void> {
  const held = new Map<string, Route[]>();
  const free = new Set<string>();
  await page.route(/\/assets\/app-[^/]+\.(js|css)(\?.*)?$/, (route) => {
    const id = appChunk(route.request().url());
    if (!id || free.has(id)) return route.continue();
    held.set(id, [...(held.get(id) ?? []), route]);
  });
  const arrived: string[] = [];
  page.on("requestfinished", (r) => {
    const id = appChunk(r.url());
    if (id && /\.css(\?.*)?$/.test(r.url())) arrived.push(id);
  });
  const release = await holdHost(page);
  await page.goto(sheet());
  await page.evaluate(() => document.fonts.ready);
  // the windows' load transitions are over
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document.getAnimations().filter((a) => a instanceof CSSTransition)
            .length,
      ),
    )
    .toBe(0);
  // and the start view is in place (its scroll is set after the first
  // layout): CastleSiege's title bar keeps its box
  let last = "";
  await expect
    .poll(async () => {
      const b = JSON.stringify(
        await page.locator('[data-win="castlesiege"] .bar').boundingBox(),
      );
      const same = b === last;
      last = b;
      return same && JSON.parse(b).y > 0;
    })
    .toBe(true);
  const before = { css: await measure(page), shots: await shots(page) };
  for (const id of wins)
    await page.evaluate((id) => {
      const a = document.querySelector(`[data-win="${id}"] .demo-area`)!;
      const o = { bubbles: true, button: 0, pointerType: "mouse" };
      a.dispatchEvent(new PointerEvent("pointerdown", o));
      a.dispatchEvent(new PointerEvent("pointerup", o));
    }, id);
  const at = await page.evaluate(() => {
    const vp = document.querySelector("#vp")!;
    return [vp.scrollLeft, vp.scrollTop];
  });
  await release();
  for (const id of wins) {
    const app = HOSTED[id];
    free.add(app);
    for (const r of held.get(app) ?? []) await r.continue();
    held.delete(app);
    await running(page, id);
  }
  expect(arrived, "app stylesheets in load order").toEqual(
    wins.map((id) => HOSTED[id]),
  );
  // an app started by a press may take the focus, and the focus scrolls the
  // view: the view goes back (the view is not what R13 compares), until it
  // stays put (a move to the focus may still run)
  await expect
    .poll(() =>
      page.evaluate(([x, y]) => {
        (document.activeElement as HTMLElement | null)?.blur();
        const vp = document.querySelector("#vp")!;
        const back = vp.scrollLeft === x && vp.scrollTop === y;
        vp.scrollLeft = x;
        vp.scrollTop = y;
        return back;
      }, at),
    )
    .toBe(true);
  await idle(page);
  // the apps' own styles are in force (the check below is not empty)
  await expect(page.locator('[data-win="paint"] .app.paint')).toHaveCSS(
    "display",
    "flex",
  );
  const after = { css: await measure(page), shots: await shots(page) };
  // a press brings a window to the front: z-index is not compared
  expect(after.css).toEqual(before.css);
  expect(after.shots, "screenshots").toEqual(before.shots);
}

test.describe("R13.a the sheet's styles and geometry do not change", () => {
  test("all four apps load in the order CastleSiege, Paint, Music, Notes", async ({
    page,
  }) => {
    await startInOrder(page, ["castlesiege", "paint", "music", "notes"]);
  });
  test("all four apps load in the order Notes, Music, Paint, CastleSiege", async ({
    page,
  }) => {
    await startInOrder(page, ["notes", "music", "paint", "castlesiege"]);
  });
});

test("R13 app, widget and dialog styles apply only under a host root; no html, body, .dpos or window-chrome rules load", async ({
  page,
}) => {
  await page.goto(sheet());
  for (const id of Object.keys(HOSTED))
    await page.locator(`[data-go="${id}"]`).click();
  for (const id of Object.keys(HOSTED)) await running(page, id);
  await idle(page);
  const found = await page.evaluate((own) => {
    const bad: string[] = [];
    const sheets = [
      ...[...document.styleSheets].filter(
        // the sheet's own stylesheet (the entry's)
        (s) => !new RegExp(own).test(s.href ?? ""),
      ),
      // the host's theme (R14)
      ...document.adoptedStyleSheets,
    ];
    const walk = (rules: CSSRuleList, href: string) => {
      for (const r of rules) {
        if (r instanceof CSSStyleRule) {
          // the one global rule: the page root's --text, which icons.ts
          // tints glyph icons with
          if (
            r.selectorText === ":root" &&
            r.style.length === 1 &&
            r.style[0] === "--text" &&
            href === "<adopted>"
          )
            continue;
          for (const s of r.selectorText.split(/,(?![^(]*\))/)) {
            const sel = s.trim();
            if (
              // under a host root, or the host's own chrome (.host-*
              // panels in the demo area)
              !/^((\[data-motion[^\]]*\]\s+)?\.host-root\b|\.host-[\w-]+|\.demo-area\[data-host\])/.test(
                sel,
              ) ||
              /(^|[\s>+~(,])(html|body)\b|\.dpos\b|\.win\b|:root\b/.test(sel)
            )
              bad.push(`${href}: ${sel}`);
          }
        } else if (
          r instanceof CSSMediaRule ||
          r instanceof CSSSupportsRule ||
          r instanceof CSSLayerBlockRule
        )
          walk(r.cssRules, href);
      }
    };
    for (const s of sheets)
      walk(
        s.cssRules,
        s.href ??
          (document.adoptedStyleSheets.includes(s) ? "<adopted>" : "<style>"),
      );
    return { bad, adopted: document.adoptedStyleSheets.length };
  }, entryAsset("css").source);
  expect(found.adopted).toBeGreaterThan(0);
  expect(found.bad).toEqual([]);
  // and the sheet's own rules do not reach into the apps (its .btn is a
  // card button; the host's rules are under .host-root)
  const reach = await page.evaluate((entry) => {
    const own = [...document.styleSheets].find((s) =>
      new RegExp(entry).test(s.href ?? ""),
    )!;
    const inApps = [...document.querySelectorAll(".host-root *")];
    const out: string[] = [];
    const walk = (rules: CSSRuleList) => {
      for (const r of rules)
        if (r instanceof CSSStyleRule) {
          for (const s of r.selectorText.split(/,(?![^(]*\))/)) {
            const sel = s.trim();
            // the host's rules; reduced motion's everything; the page's
            // button font reset (as the old OS's) and focus ring, which the
            // host's ring overrides
            if (
              /^(\.host-root\b|\.demo-area\b|\*$|button$|:focus-visible$)/.test(
                sel,
              )
            )
              continue;
            const hit = inApps.find((e) => e.matches(sel));
            if (hit) out.push(`${sel} → .${hit.className}`);
          }
        } else if (r instanceof CSSGroupingRule) walk(r.cssRules);
    };
    walk(own.cssRules);
    return out;
  }, entryAsset("css").source);
  expect(reach).toEqual([]);
  // app and widget classes outside a host root get no style
  const leaks = await page.evaluate(() => {
    const plain = document.createElement("div");
    document.body.append(plain);
    const base = getComputedStyle(plain);
    const props = [
      "display",
      "border-top-width",
      "padding-top",
      "background-color",
      "background-image",
      "font-family",
      "font-size",
      "box-shadow",
      "flex-direction",
    ];
    const want = props.map((p) => base.getPropertyValue(p));
    const out: string[] = [];
    for (const cls of [
      "app",
      "row",
      "hidden",
      // .btn is also the sheet's own class
      "menu-item",
      "menu",
      "dialog",
      "listbox",
      "paint-view",
      "cs",
      "trk",
      "writer-banner",
    ]) {
      const el = document.createElement("div");
      el.className = cls;
      document.body.append(el);
      const cs = getComputedStyle(el);
      props.forEach((p, i) => {
        if (cs.getPropertyValue(p) !== want[i])
          out.push(`.${cls} ${p}: ${cs.getPropertyValue(p)}`);
      });
      el.remove();
    }
    plain.remove();
    return out;
  });
  expect(leaks).toEqual([]);
});

// ---- R14 ----

// /etc/themes/{default,night}.json roles (system/etc/themes)
const ROLES = {
  default: {
    chrome: "rgb(194, 195, 199)",
    "chrome-dark": "rgb(95, 87, 79)",
    text: "rgb(0, 0, 0)",
  },
  night: {
    chrome: "rgb(29, 43, 83)",
    "chrome-dark": "rgb(0, 0, 0)",
    text: "rgb(255, 241, 232)",
  },
};

/** Paint's toolbar, canvas frame and text colours. */
const paintColours = (page: Page) =>
  page.evaluate(() => {
    const w = document.querySelector('[data-win="paint"]')!;
    const cs = (sel: string) => getComputedStyle(w.querySelector(sel)!);
    return {
      app: cs(".app.paint").backgroundColor,
      tool: cs(".paint-tool:not(.active)").backgroundColor,
      frame: cs(".paint-view").backgroundImage,
      text: cs(".statusbar").color,
    };
  });

/** The picture pixel under the canvas's middle (screen point and RGBA). */
const middle = (page: Page) =>
  page.evaluate(() => {
    const c = document.querySelector<HTMLCanvasElement>(
      '[data-win="paint"] .paint-canvas',
    )!;
    const r = c.getBoundingClientRect();
    // whole screen px: browsers round the mouse's position
    const [x, y] = [
      Math.round(r.x + r.width / 2),
      Math.round(r.y + r.height / 2),
    ];
    const px = Math.floor(((x - r.x) * c.width) / r.width);
    const py = Math.floor(((y - r.y) * c.height) / r.height);
    const d = c.getContext("2d")!.getImageData(px, py, 1, 1).data;
    return { x, y, rgba: [...d].join(",") };
  });

test("R14.a dark scheme: Paint uses the night roles; a change to light recolours it and keeps the drawing", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto(sheet());
  await page.locator('[data-go="paint"]').click();
  await running(page, "paint");
  await idle(page);
  const night = await paintColours(page);
  expect(night.app).toBe(ROLES.night.chrome);
  expect(night.tool).toBe(ROLES.night.chrome);
  expect(night.text).toBe(ROLES.night.text);
  expect(night.frame).toContain(ROLES.night["chrome-dark"]);

  // draw one pixel
  const blank = await middle(page);
  await page.mouse.click(blank.x, blank.y);
  await expect.poll(async () => (await middle(page)).rgba).not.toBe(blank.rgba);
  const drawn = (await middle(page)).rgba;

  await page.emulateMedia({ colorScheme: "light" });
  await expect.poll(() => paintColours(page)).not.toEqual(night);
  const day = await paintColours(page);
  expect(day.app).toBe(ROLES.default.chrome);
  expect(day.tool).toBe(ROLES.default.chrome);
  expect(day.text).toBe(ROLES.default.text);
  expect(day.frame).toContain(ROLES.default["chrome-dark"]);
  expect((await middle(page)).rgba).toBe(drawn);
});

// 015: Notes has its own yellow roles, so this runs in Paint
test("R14 sys.theme.get follows the scheme, sys:theme is published on a change, icons refresh, set does nothing", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto(sheet("?host=paint:fx-theme"));
  await page.locator('[data-go="paint"]').click();
  await running(page, "paint");
  const log = () =>
    page.evaluate(
      () =>
        (window as unknown as { __fxTheme: Record<string, unknown> }).__fxTheme,
    );
  await expect.poll(async () => (await log())?.set).toBe("night");
  expect((await log()).start).toBe("night");
  const loads = ((await log()).loads as string[]).length;
  expect(loads).toBeGreaterThan(0);

  await page.emulateMedia({ colorScheme: "light" });
  await expect
    .poll(async () => (await log()).events)
    .toEqual([{ name: "default" }]);
  expect((await log()).gets).toEqual(["default"]);
  // the icon was drawn again (refreshIcons)
  await expect
    .poll(async () => ((await log()).loads as string[]).length)
    .toBeGreaterThan(loads);
  // the role variables are on the host root
  const roles = await page.evaluate(() => {
    const r = document.querySelector(
      '[data-win="paint"] .host-root:not(.host-bar)',
    )!;
    const cs = getComputedStyle(r);
    return [cs.getPropertyValue("--t-chrome"), cs.color];
  });
  expect(roles).toEqual(["#c2c3c7", "rgb(0, 0, 0)"]);
});

// ---- R15 ----

/** Zooms at once to `z` with one ctrl-wheel event at screen point `at`. */
async function zoomTo(page: Page, pct: string, z: number, at: number[]) {
  await page.evaluate(
    ([dy, x, y]) =>
      document.querySelector("#vp")!.dispatchEvent(
        new WheelEvent("wheel", {
          bubbles: true,
          cancelable: true,
          ctrlKey: true,
          deltaY: dy,
          clientX: x,
          clientY: y,
        }),
      ),
    [-100 * Math.log(z), at[0], at[1]],
  );
  await expect(page.locator("#zPct")).toHaveText(pct);
}

const units = (page: Page) =>
  page.evaluate(() => {
    const r = document.querySelector(
      '[data-win="paint"] .host-root:not(.host-bar)',
    )!;
    const cs = getComputedStyle(r);
    return {
      u: cs.getPropertyValue("--u").trim(),
      text: cs.getPropertyValue("--text-size").trim(),
      font: getComputedStyle(r.querySelector(".statusbar")!).fontSize,
    };
  });

test("R15.a zoom 50 %: --u is 1px and --text-size 16px in the demo area; a click on Paint's canvas paints that pixel", async ({
  page,
}) => {
  await page.goto(sheet());
  await page.locator('[data-go="paint"]').click();
  await running(page, "paint");
  await idle(page);
  const one = { u: "1px", text: "16px", font: "16px" };
  expect(await units(page)).toEqual(one);
  const box = (await page.locator('[data-win="paint"]').boundingBox())!;
  await zoomTo(page, "50%", 0.5, [
    box.x + box.width / 2,
    box.y + box.height / 2,
  ]);
  await idle(page);
  expect(await units(page)).toEqual(one);
  const before = await middle(page);
  await page.mouse.click(before.x, before.y);
  await expect
    .poll(async () => (await middle(page)).rgba)
    .not.toBe(before.rgba);
  // the menu part of R15.a: host-input.spec.ts
});

// ---- R16 ----

/** Records dataset.motion when the first app's main() runs (test builds
 * count main() calls in window.__hostMain). */
async function motionAtFirstMain(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown>;
    let v: unknown;
    Object.defineProperty(w, "__hostMain", {
      configurable: true,
      get: () => v,
      set(x) {
        w.__motionAtMain ??= document.documentElement.dataset.motion ?? "";
        v = x;
      },
    });
  });
}
const motion = (page: Page) =>
  page.evaluate(() => document.documentElement.dataset.motion ?? "");

test("R16.a reduced motion before load: dataset.motion is set before the first app starts and follows changes", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await motionAtFirstMain(page);
  await page.goto(sheet());
  await running(page, "castlesiege");
  expect(
    await page.evaluate(
      () => (window as unknown as { __motionAtMain: string }).__motionAtMain,
    ),
  ).toBe("reduced");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect.poll(() => motion(page)).toBe("full");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect.poll(() => motion(page)).toBe("reduced");
});

test("R16 no motion preference before load: dataset.motion is full before the first app starts", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await motionAtFirstMain(page);
  await page.goto(sheet());
  await running(page, "castlesiege");
  expect(
    await page.evaluate(
      () => (window as unknown as { __motionAtMain: string }).__motionAtMain,
    ),
  ).toBe("full");
});

// ---- R12 with R13: a failed host stylesheet ----

test("R12 a failed host stylesheet loads again on Try again: widget, token and panel styles apply", async ({
  page,
  errors,
}) => {
  let n = 0;
  await page.route(/\/assets\/load-[^/]*\.css(\?.*)?$/, (route) =>
    n++ === 0 ? route.fulfill({ status: 503, body: "" }) : route.continue(),
  );
  await page.goto(sheet());
  const a = area(page, "castlesiege");
  await expect(a).toHaveAttribute("data-host", "failed");
  await a.getByRole("button", { name: "Try again" }).click();
  await running(page, "castlesiege");
  expect(n).toBe(2);
  const styles = await page.evaluate(() => {
    const root = document.querySelector(
      '[data-win="castlesiege"] .host-root:not(.host-bar)',
    )!;
    const hidden = document.createElement("div");
    hidden.className = "hidden";
    root.append(hidden);
    const scrim = document.createElement("div");
    scrim.className = "host-scrim";
    document
      .querySelector('[data-win="castlesiege"] .demo-area')!
      .append(scrim);
    const out = {
      token: getComputedStyle(root).getPropertyValue("--chrome").trim(),
      widget: getComputedStyle(hidden).display,
      panel: getComputedStyle(scrim).position,
    };
    hidden.remove();
    scrim.remove();
    return out;
  });
  expect(styles).toEqual({
    token: "#c2c3c7",
    widget: "none",
    panel: "absolute",
  });
  // the failed request's console line is expected
  errors.splice(0, errors.length, ...errors.filter((e) => !/503/.test(e)));
});

// ---- 001 R18, R19 inside the apps: the focus ring ----

/**
 * In-page: the focused control's ring against the pixels on both sides of
 * it, from a screenshot (001 R18: 3:1). The ring is inside the control (a
 * radio's: inside its label) between paper bands. Samples five places on
 * each side, away from the corners, at whole screen px.
 */
async function insetRing(page: Page) {
  const shot = (await page.screenshot()).toString("base64");
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement("canvas");
    [c.width, c.height] = [img.width, img.height];
    const g = c.getContext("2d")!;
    g.drawImage(img, 0, 0);
    const k = img.width / innerWidth;
    const px = (x: number, y: number) => [
      ...g
        .getImageData(
          Math.floor((Math.floor(x) + 0.5) * k),
          Math.floor((Math.floor(y) + 0.5) * k),
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
    const focused = document.activeElement as HTMLElement;
    // a radio's ring is drawn by its label's ::after, over the radio
    const radio = focused.matches('input[type="radio"]');
    const el = radio ? focused.closest("label")! : focused;
    const cs = getComputedStyle(el, radio ? "::after" : null);
    const z = new DOMMatrix(
      getComputedStyle(document.querySelector("#world")!).transform,
    ).a;
    const w = parseFloat(cs.outlineWidth) * z;
    const off = parseFloat(cs.outlineOffset) * z;
    // the paper band: an inset shadow of this spread (screen px)
    const spread =
      parseFloat(/(-?[\d.]+)px inset/.exec(cs.boxShadow)?.[1] ?? "0") * z;
    // the narrower band on either side of the ring (inside the box)
    const band = Math.min(-(off + w), spread + off);
    const hex = (v: string) =>
      [1, 3, 5].map((i) => parseInt(v.trim().slice(i, i + 2), 16));
    const focus = hex(getComputedStyle(el).getPropertyValue("--focus"));
    const paper = hex(getComputedStyle(el).getPropertyValue("--paper"));
    const dist = (a: number[], b: number[]) =>
      Math.max(...a.map((v, i) => Math.abs(v - b[i])));
    const r = el.getBoundingClientRect();
    // along each side, clear of the corners' ring and inner band
    const m = Math.max(0, -off) + band;
    let min = Infinity;
    let worst = 0;
    let at = "";
    // s(d): the point at d screen px outwards from the side (d < 0: inside).
    // The ring is at [off, off + w], a paper band on each side. Edges fall
    // between screen px at a zoom, so each zone's purest pixel counts: the
    // one nearest the colour it should have.
    const check = (side: string, s: (d: number) => [number, number]) => {
      const zone = (a: number, b: number, want: number[]) => {
        let best: number[] = [];
        for (let d = a + 0.25; d < b; d += 0.5) {
          const c = px(...s(d));
          if (!best.length || dist(c, want) < dist(best, want)) best = c;
        }
        return best;
      };
      const ring = zone(off, off + w, focus);
      if (dist(ring, focus) > worst)
        [worst, at] = [dist(ring, focus), `${side} ring ${ring}`];
      for (const n of [
        zone(off - band, off, paper),
        zone(off + w, off + w + band, paper),
      ]) {
        const q = ratio(ring, n);
        if (q < min) [min, at] = [q, `${side} ring ${ring} by ${n}`];
      }
    };
    for (const f of [0.2, 0.35, 0.5, 0.65, 0.8]) {
      const x = r.left + m + (r.width - 2 * m) * f;
      const y = r.top + m + (r.height - 2 * m) * f;
      check("left", (d) => [r.left - d, y]);
      check("right", (d) => [r.right + d, y]);
      check("top", (d) => [x, r.top - d]);
      check("bottom", (d) => [x, r.bottom + d]);
    }
    const [L, T] = [r.left, r.top].map(Math.round);
    return {
      min,
      at,
      w,
      band,
      style: cs.outlineStyle,
      visible: focused.matches(":focus-visible"),
      worst,
      what: `${el.tagName}.${el.className} at ${[L, T, r.width, r.height]}`,
    };
  }, shot);
}

/** Focuses `sel` in window `win` by script, after a key press (so the
 * browser shows focus as for the keyboard), and checks its ring. */
async function ringAt(page: Page, win: string, sel: string) {
  await page.keyboard.press("Shift");
  await page.evaluate(
    ([win, sel]) =>
      document
        .querySelector<HTMLElement>(`[data-win="${win}"] ${sel}`)!
        // focusVisible: Firefox shows a script focus only when asked
        .focus({ preventScroll: true, focusVisible: true } as FocusOptions),
    [win, sel],
  );
  await idle(page);
  const r = await insetRing(page);
  expect(r.visible, r.what).toBe(true);
  expect(r.style, r.what).toBe("solid");
  expect(r.w, r.what).toBeGreaterThanOrEqual(2 - 0.01);
  // the ring sits between paper bands of at least 1 screen px
  expect(r.band, r.what).toBeGreaterThanOrEqual(1 - 0.01);
  // a ring pixel of the focus colour on every side: drawn, not clipped
  expect(r.worst, `${r.what}: ${r.at}`).toBeLessThanOrEqual(24);
  expect(r.min, `${r.what}: ${r.at}`).toBeGreaterThanOrEqual(3);
}

/** Puts window `win` in the middle of the view at zoom `z` (pct as shown). */
async function frame(page: Page, win: string, pct: string, z: number) {
  await page.locator(`[data-go="${win}"]`).click();
  // the view's move to it has ended
  let last = "";
  await expect
    .poll(async () => {
      const b = JSON.stringify(
        await page.locator(`[data-win="${win}"]`).boundingBox(),
      );
      const same = b === last;
      last = b;
      return same;
    })
    .toBe(true);
  await idle(page);
  // the view keeps its zoom on a move
  if ((await page.locator("#zPct").textContent()) === pct) return;
  const b = (await page.locator(`[data-win="${win}"]`).boundingBox())!;
  await zoomTo(page, pct, z, [b.x + b.width / 2, b.y + b.height / 2]);
  await idle(page);
}

for (const scheme of ["light", "dark"] as const)
  for (const [pct, z] of [
    ["100%", 1],
    ["50%", 0.5],
  ] as const)
    test(`001 R18, R19 focus inside apps (${scheme}, ${pct}): a solid ring of ≥ 2 screen px, 3:1 on both sides, on the board, at the window's edge and on a radio`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto(sheet());
      await frame(page, "castlesiege", pct, z);
      await running(page, "castlesiege");
      // board squares of both colours with no piece on them
      const cells = await page.evaluate(() => {
        const win = document.querySelector('[data-win="castlesiege"]')!;
        const pieces = [...win.querySelectorAll(".cs-piece")].map((p) =>
          p.getBoundingClientRect(),
        );
        const free = [...win.querySelectorAll<HTMLElement>(".cs-cell")]
          .map((c) => ({ c, r: c.getBoundingClientRect() }))
          .filter(
            ({ r }) =>
              !pieces.some(
                (p) =>
                  p.left < r.right &&
                  r.left < p.right &&
                  p.top < r.bottom &&
                  r.top < p.bottom,
              ),
          );
        const dark = free.find(({ c }) => c.classList.contains("dark"))!;
        const light = free.find(({ c }) => !c.classList.contains("dark"))!;
        dark.c.dataset.ringTest = "dark";
        light.c.dataset.ringTest = "light";
        return ["dark", "light"];
      });
      for (const i of cells)
        await ringAt(page, "castlesiege", `[data-ring-test="${i}"]`);
      // a control as wide as its window: Notes' text
      await frame(page, "notes", pct, z);
      await running(page, "notes");
      await ringAt(page, "notes", "textarea");
      // a radio (clipped to a stepped circle): Paint's New Picture
      await frame(page, "paint", pct, z);
      await running(page, "paint");
      await chooseMenu(page, "paint", "File", "New…");
      await ringAt(page, "paint", 'input[type="radio"]');
    });
