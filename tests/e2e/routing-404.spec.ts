// Spec 009 R6.d–f: the 404 page on a local `wrangler dev` of dist/ (the routing
// config: chromium, webkit and a mobile touch project). The physics and the
// interruptions are checked in tests/unit/page-404.test.ts.
import { expect, test, type Page } from "@playwright/test";

const digits = (page: Page) => page.locator(".win");
const links = [
  { name: "Open RArgu OS", path: "/" },
  { name: "Read the resume", path: "/resume" },
];

/** WCAG contrast of two `rgb(…)` colours. */
function contrast(a: string, b: string): number {
  const lum = (c: string) => {
    const [r, g, bl] = c
      .match(/[\d.]+/g)!
      .slice(0, 3)
      .map(Number);
    const f = (v: number) =>
      (v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(bl);
  };
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/** The digit's transform as a matrix: [a, b, c, d, tx, ty]. */
const matrix = (page: Page, i: number) =>
  digits(page)
    .nth(i)
    .evaluate((el) => {
      const t = getComputedStyle(el).transform;
      if (t === "none") return [1, 0, 0, 1, 0, 0];
      return t.match(/-?[\d.e-]+/g)!.map(Number);
    });

/** Each link is on screen when scrolled to, on top, and goes where it says. */
async function linksReachable(page: Page) {
  for (const l of links) {
    const a = page.getByRole("link", { name: l.name });
    await expect(a).toHaveAttribute("href", l.path);
    await a.scrollIntoViewIfNeeded();
    const box = (await a.boundingBox())!;
    const view = page.viewportSize()!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(view.width);
    const hit = await page.evaluate(
      ([x, y]) => document.elementFromPoint(x, y)?.closest("a")?.textContent,
      [box.x + box.width / 2, box.y + box.height / 2],
    );
    expect(hit, `${l.name} is the top element at its centre`).toBe(l.name);
  }
  // no sideways scroll; the page scrolls down when it is taller than the view
  const m = await page.evaluate(() => {
    const d = document.documentElement;
    scrollTo(0, d.scrollHeight);
    return {
      wide: d.scrollWidth - d.clientWidth,
      tall: d.scrollHeight - innerHeight,
      y: scrollY,
      body: getComputedStyle(document.body).overflowY,
    };
  });
  expect(m.wide).toBeLessThanOrEqual(0);
  expect(m.body).not.toBe("hidden");
  if (m.tall > 0) expect(m.y).toBeGreaterThan(0);
  await page.evaluate(() => scrollTo(0, 0));
}

/** 200 % text: the root font size the page's rem sizes follow (addStyleTag needs JS). */
const bigText = (page: Page) =>
  page.evaluate(() => {
    const s = document.createElement("style");
    s.textContent = "html { font-size: 200% }";
    document.head.append(s);
  });

const sizes = [
  { width: 390, height: 844 },
  { width: 844, height: 390 },
  { width: 1440, height: 900 },
];

test("/nope answers 404 with the title, and only same-origin requests", async ({
  page,
  baseURL,
}) => {
  const urls: string[] = [];
  page.on("request", (r) => urls.push(r.url()));
  const res = await page.goto("/nope");
  expect(res!.status()).toBe(404);
  await expect(page).toHaveTitle("404 · RArgu OS");
  await page.evaluate(() => document.fonts.ready);
  expect(urls.length).toBeGreaterThan(1); // the page and its fonts
  for (const u of urls)
    expect(new URL(u).origin).toBe(new URL(baseURL!).origin);
});

test.describe("without JS", () => {
  test.use({ javaScriptEnabled: false });

  test("the digits are plain text and the links work (R6.d, R6.f)", async ({
    page,
  }) => {
    await page.goto("/nope");
    await expect(page.locator(".digit")).toHaveText(["4", "0", "4"]);
    for (const el of await digits(page).all()) {
      await expect(el).not.toHaveAttribute("role", /./);
      await expect(el).not.toHaveAttribute("tabindex", /./);
    }
    // 010 R2: the key hint is hidden and not announced
    await expect(page.locator("#tip")).toBeHidden();
    await expect(page.locator("body")).not.toContainText(
      /Drag one|Arrows move it/,
      {
        useInnerText: true,
      },
    );
    for (const l of links) {
      await page.goto("/nope");
      await page.getByRole("link", { name: l.name }).click();
      await expect(page).toHaveURL(l.path);
    }
    await expect(page).toHaveTitle(/Resume/);
  });

  for (const size of sizes)
    for (const text of [1, 2])
      test(`links reachable at ${size.width}×${size.height}, text ${text * 100}% (R6.e)`, async ({
        page,
      }) => {
        await page.setViewportSize(size);
        await page.goto("/nope");
        if (text === 2) await bigText(page);
        await linksReachable(page);
      });
});

test.describe("with JS", () => {
  test("distinct names, roles and Tab stops after the script; Tab focuses each digit in front (R6.d)", async ({
    page,
    browserName,
  }) => {
    await page.goto("/nope");
    await expect(digits(page)).toHaveCount(3);
    const names = ["Digit 4, first", "Digit 0", "Digit 4, last"];
    for (const [i, name] of names.entries()) {
      const d = digits(page).nth(i);
      await expect(d).toHaveAttribute("role", "button");
      await expect(d).toHaveAttribute("tabindex", "0");
      await expect(page.getByRole("button", { name })).toHaveCount(1);
      await expect(d).toHaveAccessibleDescription(
        "Arrows move it. Enter or Space throws it. Home brings it back.",
      );
    }
    // WebKit: Tab moves only to fields unless "all controls" is on; focus() instead
    for (const [i, name] of names.entries()) {
      if (browserName === "webkit") await digits(page).nth(i).focus();
      else await page.keyboard.press("Tab");
      await expect(page.locator(":focus")).toHaveAttribute("aria-label", name);
      const z = await digits(page).evaluateAll((els) =>
        els.map((el) => Number(getComputedStyle(el).zIndex) || 0),
      );
      expect(z[i]).toBe(Math.max(...z));
    }
  });

  test("a pointer press focuses the digit and brings it to the front (R6.d)", async ({
    page,
  }) => {
    await page.goto("/nope");
    const d = digits(page).nth(0);
    const box = (await d.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + 10);
    await page.mouse.down();
    await expect(d).toBeFocused();
    await expect(d).toHaveClass(/lifted/);
    const z = await digits(page).evaluateAll((els) =>
      els.map((el) => Number(getComputedStyle(el).zIndex) || 0),
    );
    expect(z[0]).toBe(Math.max(...z));
    await page.mouse.up();
  });

  for (const scheme of ["light", "dark"] as const)
    test(`the focus ring is ≥ 3:1 on its paper band (${scheme}, R6.d)`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto("/nope");
      const d = digits(page).nth(1);
      await d.focus();
      await expect(d).toBeFocused();
      const s = await d.evaluate((el) => {
        const c = getComputedStyle(el);
        return {
          visible: el.matches(":focus-visible"),
          ring: c.outlineColor,
          width: parseFloat(c.outlineWidth),
          offset: parseFloat(c.outlineOffset),
          style: c.outlineStyle,
          shadow: c.boxShadow,
          paper: getComputedStyle(document.body).backgroundColor,
        };
      });
      expect(s.visible).toBe(true);
      expect(s.style).toBe("solid");
      // the band: one shadow, no offset, its spread past the ring's outer edge
      const band = s.shadow.match(/^(rgba?\([^)]*\)) 0px 0px 0px ([\d.]+)px$/);
      expect(band, s.shadow).not.toBeNull();
      expect(band![1]).toBe(s.paper);
      expect(Number(band![2])).toBeGreaterThanOrEqual(s.offset + s.width);
      expect(s.offset).toBeGreaterThan(0); // band on both sides of the ring
      expect(contrast(s.ring, band![1])).toBeGreaterThanOrEqual(3);
    });

  test("Enter and Space throw the focused digit, as the hint says (R6.d)", async ({
    page,
  }) => {
    await page.goto("/nope");
    const d = digits(page).nth(1);
    await d.focus();
    let at = await matrix(page, 1);
    for (const key of ["Enter", " "]) {
      await page.keyboard.press(key === " " ? "Space" : key);
      await expect
        .poll(async () => {
          const m = await matrix(page, 1);
          return Math.hypot(m[4] - at[4], m[5] - at[5]);
        })
        .toBeGreaterThan(20);
      at = await matrix(page, 1);
    }
  });

  for (const size of sizes)
    for (const text of [1, 2])
      test(`links reachable and on top of a digit at ${size.width}×${size.height}, text ${text * 100}% (R6.e)`, async ({
        page,
      }) => {
        await page.setViewportSize(size);
        await page.goto("/nope");
        if (text === 2) await bigText(page);
        // move the first digit over the first link with the arrow keys
        const d = digits(page).nth(0);
        const a = page.getByRole("link", { name: links[0].name });
        await d.focus();
        const [db, ab] = [(await d.boundingBox())!, (await a.boundingBox())!];
        const dx = Math.round(
          (ab.x + ab.width / 2 - (db.x + db.width / 2)) / 24,
        );
        const dy = Math.round(
          (ab.y + ab.height / 2 - (db.y + db.height / 2)) / 24,
        );
        for (let i = 0; i < Math.abs(dx); i++)
          await page.keyboard.press(dx > 0 ? "ArrowRight" : "ArrowLeft");
        for (let i = 0; i < Math.abs(dy); i++)
          await page.keyboard.press(dy > 0 ? "ArrowDown" : "ArrowUp");
        const over = (await d.boundingBox())!;
        const centre = [ab.x + ab.width / 2, ab.y + ab.height / 2];
        expect(centre[0]).toBeGreaterThan(over.x);
        expect(centre[0]).toBeLessThan(over.x + over.width);
        expect(centre[1]).toBeGreaterThan(over.y);
        expect(centre[1]).toBeLessThan(over.y + over.height);
        await linksReachable(page);
        await a.click();
        await expect(page).toHaveURL("/");
      });

  for (const size of sizes)
    test(`010 R2.b no tip line shows at ${size.width}×${size.height}`, async ({
      page,
    }) => {
      await page.setViewportSize(size);
      await page.goto("/nope");
      await expect(digits(page).first()).toHaveAttribute("role", "button");
      await expect(page.locator("#tip")).toBeHidden();
      await expect(page.locator("body")).not.toContainText(
        /Drag one|come off the sheet|Arrows move it/,
        { useInnerText: true },
      );
    });

  test("010 R1.d a touch drag off centre: the grab point follows, the digit leans, no scale (R6.f)", async ({
    page,
    browserName,
    hasTouch,
  }) => {
    test.skip(
      !hasTouch || browserName !== "chromium",
      "touch: the mobile project",
    );
    // every inline transform the page writes, so no frame is missed
    await page.addInitScript(() => {
      const w = window as unknown as { __tf: string[] };
      w.__tf = [];
      addEventListener("DOMContentLoaded", () =>
        new MutationObserver((ms) => {
          for (const m of ms)
            if (m.target === document.querySelectorAll(".win")[2])
              w.__tf.push((m.target as HTMLElement).style.transform);
        }).observe(document.body, {
          subtree: true,
          attributes: true,
          attributeFilter: ["style"],
        }),
      );
    });
    await page.goto("/nope");
    const d = digits(page).nth(2);
    const box = (await d.boundingBox())!;
    const cdp = await page.context().newCDPSession(page);
    const touch = (
      type: "touchStart" | "touchMove" | "touchEnd",
      x: number,
      y: number,
    ) =>
      cdp.send("Input.dispatchTouchEvent", {
        type,
        touchPoints: type === "touchEnd" ? [] : [{ x, y }],
      });
    // near the top-left corner: the centre is right of and below the finger
    const [x0, y0] = [box.x + 12, box.y + 12];
    await touch("touchStart", x0, y0);
    await expect(d).toHaveClass(/lifted/);
    for (let i = 1; i <= 10; i++) {
      await touch("touchMove", x0 - i * 6, y0 + i * 12);
      // Chromium hands touch moves to the page on its next frame
      await expect
        .poll(async () => (await matrix(page, 2)).slice(4).map(Math.round))
        .toEqual([-i * 6, i * 12]);
      const [a, b] = await matrix(page, 2);
      expect(Math.hypot(a, b), "no scale").toBeCloseTo(1, 6);
    }
    const tf = await page.evaluate(
      () => (window as unknown as { __tf: string[] }).__tf,
    );
    expect(tf.filter((t) => /scale/.test(t))).toEqual([]);
    const rot = tf.map((t) =>
      Math.abs(+(/rotate\(([-\d.e]+)deg/.exec(t)?.[1] ?? 0)),
    );
    expect(Math.max(...rot), "it leaned").toBeGreaterThan(0.5);
    await touch("touchEnd", 0, 0);
    await expect(d).not.toHaveClass(/lifted/);
  });
});
