// Spec 015 on desktop: the panel's size and fit (R2.a–c), the link row (R4.a–b),
// two-line descriptions with the clamp removed (R6.b), the fixture address in
// every Email link (R9.a) and the Notes colours as the browser draws them
// (R7.a, R7.d). Rectangles and colours are read from the DOM.
import type { Page } from "@playwright/test";
import { expect, test } from "./helpers";
import { chooseMenu } from "./host-helpers";
import { sheet } from "./sheet-base";

const SIZES: [number, number][] = [
  [1920, 1080],
  [1440, 900],
  [1024, 700],
  [800, 600],
  [761, 600],
  [1280, 500],
];

async function open(page: Page, w: number, h: number, dark: boolean) {
  await page.setViewportSize({ width: w, height: h });
  await page.emulateMedia({
    colorScheme: dark ? "dark" : "light",
    reducedMotion: "reduce",
  });
  await page.goto(sheet());
  await expect(page.locator("#card a[data-mail]")).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}

/** Facts about the rail, measured in the page. */
const railFacts = (page: Page) =>
  page.evaluate(() => {
    const rail = document.querySelector<HTMLElement>("#card")!;
    const r = rail.getBoundingClientRect();
    // one line: each text node of the element has one line box, and the
    // text nodes sit side by side (vertical overlap), e.g. a name and its label
    const oneLine = (el: Element) => {
      const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      const boxes: DOMRect[] = [];
      for (let n = walk.nextNode(); n; n = walk.nextNode()) {
        if (!n.textContent!.trim()) continue;
        const range = document.createRange();
        range.selectNodeContents(n);
        const rects = [...range.getClientRects()].filter((x) => x.width > 0);
        if (rects.length > 1) return false;
        boxes.push(...rects);
      }
      return boxes.every((b) =>
        boxes.every((c) => b.top < c.bottom && c.top < b.bottom),
      );
    };
    const inside = [
      ...rail.querySelectorAll<HTMLElement>("a, button, h1, h2, img, em"),
    ]
      .filter((e) => e.getClientRects().length)
      .map((e) => ({ e, b: e.getBoundingClientRect() }))
      .filter(
        ({ b }) =>
          b.left < r.left - 0.5 ||
          b.right > r.right + 0.5 ||
          b.top < r.top - 0.5 ||
          b.bottom > r.bottom + 0.5,
      )
      .map(({ e }) => e.outerHTML.slice(0, 60));
    // clipped: an element that hides its overflow and overflows, or text
    // drawn outside the panel
    const hides = (e: Element) => {
      const c = getComputedStyle(e);
      return c.overflowX !== "visible" || c.overflowY !== "visible";
    };
    const clipped = [
      ...rail.querySelectorAll<HTMLElement>("a, button, h1, h2, em, span"),
    ]
      .filter((e) => e.getClientRects().length)
      .filter((e) => {
        if (
          hides(e) &&
          (e.scrollWidth > e.clientWidth + 0.5 ||
            e.scrollHeight > e.clientHeight + 0.5)
        )
          return true;
        const range = document.createRange();
        range.selectNodeContents(e);
        const t = range.getBoundingClientRect();
        return (
          t.width > 0 &&
          (t.left < r.left - 0.5 ||
            t.right > r.right + 0.5 ||
            t.top < r.top - 0.5 ||
            t.bottom > r.bottom + 0.5)
        );
      })
      .map((e) => e.outerHTML.slice(0, 60));
    const multiLine = [
      ...rail.querySelectorAll<HTMLElement>("nav.index button, .cta .btn"),
    ]
      .filter((e) => e.getClientRects().length && !oneLine(e))
      .map((e) => e.textContent);
    const cta = [...rail.querySelectorAll<HTMLElement>(".cta .btn")].map(
      (e) => {
        const b = e.getBoundingClientRect();
        return {
          t: e.textContent!.trim(),
          top: b.top,
          bottom: b.bottom,
          left: b.left,
          right: b.right,
          w: b.width,
          font: parseFloat(getComputedStyle(e).fontSize),
        };
      },
    );
    const ctaBox = rail.querySelector(".cta")!.getBoundingClientRect();
    const gap =
      parseFloat(getComputedStyle(rail.querySelector(".cta")!).columnGap) || 0;
    return {
      w: r.width,
      h: r.height,
      scrollW: rail.scrollWidth,
      clientW: rail.clientWidth,
      scrollH: rail.scrollHeight,
      clientH: rail.clientHeight,
      inside,
      clipped,
      multiLine,
      cta,
      ctaRight: ctaBox.right,
      gap,
    };
  });

for (const dark of [false, true]) {
  const theme = dark ? "dark" : "light";
  test(`015 R2.a, R4.a (${theme}) at 1440 × 900 the panel is 150 px wide, at most 396 px high, links on one row`, async ({
    page,
  }) => {
    await open(page, 1440, 900, dark);
    const f = await railFacts(page);
    expect(f.w).toBeCloseTo(150, 0);
    expect(f.h).toBeLessThanOrEqual(396);
    const [resume, github, linkedin] = f.cta;
    expect([resume.t, github.t, linkedin.t]).toEqual([
      "Resume ↗",
      "GitHub",
      "LinkedIn",
    ]);
    expect(Math.abs(github.top - resume.top)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(linkedin.top - resume.top)).toBeLessThanOrEqual(0.5);
    for (const b of f.cta) expect(b.font, b.t).toBeGreaterThanOrEqual(10);
  });

  for (const [w, h] of SIZES)
    test(`015 R2.b, R2.c, R4.b (${theme}) at ${w} × ${h} everything fits in the panel`, async ({
      page,
    }) => {
      await open(page, w, h, dark);
      const f = await railFacts(page);
      expect(f.scrollW).toBeLessThanOrEqual(f.clientW);
      // no vertical scroll at heights of 500 px or more
      expect(f.scrollH).toBeLessThanOrEqual(f.clientH);
      expect(f.inside, "outside the panel").toEqual([]);
      expect(f.clipped, "clipped text").toEqual([]);
      expect(f.multiLine, "wrapped items or buttons").toEqual([]);
      // R4.b: Email on the row when it fits, else on its own line
      const linkedin = f.cta.find((b) => b.t === "LinkedIn")!;
      const email = f.cta.find((b) => b.t === "Email")!;
      const fits = linkedin.right + f.gap + email.w <= f.ctaRight + 0.5;
      if (fits)
        expect(Math.abs(email.top - linkedin.top)).toBeLessThanOrEqual(0.5);
      else expect(email.top).toBeGreaterThanOrEqual(linkedin.bottom - 0.5);
    });
}

// ---- R6.b ----

/** `.blurb` heights at zoom 1 with the clamp removed (offsetHeight is unscaled). */
async function blurbs(page: Page) {
  // a plain style element, added and checked by sync calls: addStyleTag and
  // async evaluate wait on page tasks that a page without JavaScript (Firefox)
  // never runs
  await page.evaluate(() => {
    const s = document.createElement("style");
    s.textContent =
      ".blurb{display:block!important;-webkit-line-clamp:none!important;line-clamp:none!important;overflow:visible!important}";
    document.head.append(s);
  });
  await expect
    .poll(() => page.evaluate(() => document.fonts.status))
    .toBe("loaded");
  return page.$$eval(".sheet-win .blurb", (els) =>
    els.map((e) => ({
      win: e.closest(".sheet-win")!.getAttribute("data-win"),
      h: (e as HTMLElement).offsetHeight,
    })),
  );
}

test("015 R6.b each window description fits in two lines without the clamp", async ({
  page,
}) => {
  await open(page, 1440, 900, false);
  const list = await blurbs(page);
  expect(list.map((b) => b.win).sort()).toEqual(
    ["castlesiege", "castlewars", "crawler", "insider", "pentimento"].sort(),
  );
  for (const b of list) expect(b.h, b.win!).toBeLessThanOrEqual(47);
});

test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false });
  test("015 R6.b each window description fits in two lines without the clamp", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(sheet());
    const list = await blurbs(page);
    expect(list).toHaveLength(5);
    for (const b of list) expect(b.h, b.win!).toBeLessThanOrEqual(47);
  });
});

// ---- R9.a ----

test("015 R9.a the test build's Email links use the fixture address only", async ({
  page,
}) => {
  for (const path of [sheet(), "/resume.html"]) {
    const html = await (await page.request.get(path)).text();
    const parts = [...html.matchAll(/data-u="([^"]*)" data-d="([^"]*)"/g)];
    expect(parts.length, path).toBeGreaterThan(0);
    for (const [, u, d] of parts)
      expect(`${u}@${d}`, path).toBe("test@example.invalid");
  }
});

// ---- R7.a, R7.d ----

type Rgb = [number, number, number];
function rgb(css: string): Rgb {
  const h = css.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (h) return [1, 2, 3].map((i) => parseInt(h[i], 16)) as Rgb;
  const m = css.match(/[\d.]+/g);
  if (!m || m.length < 3) throw new Error(`not a colour: ${css}`);
  return [+m[0], +m[1], +m[2]];
}
function contrast(a: string, b: string): number {
  const lum = (c: Rgb) => {
    const [r, g, bl] = c.map((x) => {
      const v = x / 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [lum(rgb(a)), lum(rgb(b))].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
const hex = (css: string) =>
  "#" +
  rgb(css)
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");

/** Text colour and the first opaque background behind it, for each part. */
const notesPairs = (page: Page) =>
  page.evaluate(() => {
    const win = document.querySelector<HTMLElement>('[data-win="notes"]')!;
    const bg = (e: Element | null): string => {
      for (; e; e = e.parentElement) {
        const c = getComputedStyle(e).backgroundColor;
        if (!/rgba\(.*,\s*0\)$|transparent/.test(c)) return c;
      }
      return "rgb(255, 255, 255)";
    };
    const pair = (name: string, e: Element | null) =>
      e && e.getClientRects().length
        ? { name, fg: getComputedStyle(e).color, bg: bg(e) }
        : { name, fg: "missing", bg: "missing" };
    const area = win.querySelector("textarea")!;
    const cs = getComputedStyle(area);
    return {
      pairs: [
        pair("body text", area),
        pair("title bar", win.querySelector(".bar .t")),
        pair("bar button", win.querySelector(".bar .home")),
        pair("menu row", win.querySelector('[role="menubar"] button')),
        pair("status bar", win.querySelector(".statusbar")),
        ...[...win.querySelectorAll(".menu .menu-item")]
          .slice(0, 1)
          .map((e) => pair("open menu item", e)),
        ...[
          ...win.querySelectorAll(
            ".writer-find:not(.hidden) input, .writer-find:not(.hidden) button",
          ),
        ]
          .slice(0, 2)
          .map((e, i) => pair(`find control ${i}`, e)),
      ],
      selection: {
        fg: cs.getPropertyValue("--selection-fg").trim(),
        bg: cs.getPropertyValue("--selection-bg").trim(),
      },
      focus: getComputedStyle(win).getPropertyValue("--focus").trim(),
      body: bg(area),
      status: bg(win.querySelector(".statusbar")),
      titleBar: getComputedStyle(win.querySelector(".bar")!).backgroundColor,
    };
  });

async function checkNotes(page: Page, label: string) {
  const f = await notesPairs(page);
  for (const p of f.pairs) {
    expect(p.fg, `${label}: ${p.name}`).not.toBe("missing");
    expect(contrast(p.fg, p.bg), `${label}: ${p.name}`).toBeGreaterThanOrEqual(
      4.5,
    );
  }
  expect(hex(f.body), `${label}: body`).toBe("#fff3a8");
  expect(hex(f.status), `${label}: status bar`).toBe("#fff3a8");
  expect(hex(f.titleBar), `${label}: title bar`).toBe("#f4dc6b");
  const statusText = f.pairs.find((p) => p.name === "status bar")!.fg;
  expect(hex(statusText), `${label}: status text`).toBe("#5c4423");
  expect(
    contrast(f.selection.fg, f.selection.bg),
    `${label}: selection`,
  ).toBeGreaterThanOrEqual(4.5);
  expect(
    contrast(f.focus, f.body),
    `${label}: focus ring`,
  ).toBeGreaterThanOrEqual(3);
}

async function startNotes(page: Page) {
  await page.locator('.apps [data-go="notes"]').click();
  await expect(page.locator('[data-win="notes"] .demo-area')).toHaveAttribute(
    "data-host",
    "running",
  );
}

for (const dark of [false, true]) {
  const theme = dark ? "dark" : "light";
  test(`015 R7.a, R7.d (${theme}) Notes colours after start, in an open menu, in Find and after a scheme change`, async ({
    page,
  }) => {
    await open(page, 1440, 900, dark);
    await startNotes(page);
    await checkNotes(page, `${theme} start`);
    // an open menu
    await page
      .locator('[data-win="notes"] [role="menubar"]')
      .getByRole("button", { name: "File", exact: true })
      .click();
    await expect(
      page.locator('[data-win="notes"] .menu .menu-item').first(),
    ).toBeVisible();
    await checkNotes(page, `${theme} menu`);
    await page.keyboard.press("Escape");
    // the Find bar
    await chooseMenu(page, "notes", "Edit", "Find…");
    await expect(
      page.locator('[data-win="notes"]').getByRole("textbox", { name: "Find" }),
    ).toBeVisible();
    await checkNotes(page, `${theme} find`);
    // the other scheme, no reload
    await page.emulateMedia({ colorScheme: dark ? "light" : "dark" });
    // the host rewrites its roles on the change event
    await expect(() => checkNotes(page, `${theme} then switched`)).toPass();
  });
}
