// Spec 001 T5: window drag, throw, Home, edge auto-scroll, one gesture owner
// (R7–R10, R16.a, R21) on desktop. Positions are read from the DOM only.
import type { Page } from "@playwright/test";
import { expect, test } from "./helpers";
import { sheet } from "./sheet-base";

type Pt = [number, number];

interface Logged {
  t: string;
  id: number;
  x: number;
  y: number;
  ts: number;
}

/** Test instrumentation: a pointer event log (capture phase) and, with `hz`,
 * a fixed-rate animation-frame clock that reports pending callbacks, can be
 * paused, and records CastleSiege's transform, computed `will-change` and the
 * frame time after each frame. */
async function instrument(page: Page, hz?: number): Promise<void> {
  await page.addInitScript((hz) => {
    const log: unknown[] = [];
    for (const t of [
      "pointerdown",
      "pointermove",
      "pointerup",
      "pointercancel",
      "click",
    ])
      addEventListener(
        t,
        (e) => {
          const p = e as PointerEvent;
          log.push({
            t,
            id: p.pointerId,
            x: p.clientX,
            y: p.clientY,
            ts: p.timeStamp,
          });
        },
        true,
      );
    const w = window as unknown as Record<string, unknown>;
    w.__log = log;
    if (!hz) {
      // real time: count the page's pending animation frames, so a test can
      // wait until every motion is over (a loaded browser may skip frames
      // for longer than any fixed interval)
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
      w.__live = () => live.size;
      w.__frameDone = () => new Promise<void>((r) => raw(() => r()));
      return;
    }
    const cbs = new Map<number, FrameRequestCallback>();
    let n = 0;
    window.requestAnimationFrame = (cb) => (cbs.set(++n, cb), n);
    window.cancelAnimationFrame = (id) => void cbs.delete(id);
    let on = true;
    // pauses the clock after the first frame where `when` holds
    let when: ((tf: string) => boolean) | null = null;
    const frames: string[] = [];
    const times: number[] = [];
    const hints: string[] = [];
    setInterval(() => {
      if (!on) return;
      const t = performance.now();
      const due = [...cbs.values()];
      cbs.clear();
      for (const cb of due) cb(t);
      const cs = document.querySelector<HTMLElement>(
        '[data-win="castlesiege"]',
      );
      frames.push(cs?.style.transform ?? "");
      times.push(t);
      hints.push(cs ? getComputedStyle(cs).willChange : "");
      if (when?.(frames[frames.length - 1])) {
        on = false;
        when = null;
      }
    }, 1000 / hz);
    w.__pauseWhen = (f: (tf: string) => boolean) => (when = f);
    w.__pending = () => cbs.size;
    w.__clock = (v: boolean) => (on = v);
    w.__frames = frames;
    w.__times = times;
    w.__hints = hints;
  }, hz);
}

const events = (page: Page) =>
  page.evaluate(() => (window as unknown as { __log: Logged[] }).__log);

/** Waits until the page has seen a pointer event of type `t` at (x, y). */
async function seen(page: Page, t: string, at?: Pt): Promise<Logged> {
  let hit: Logged | undefined;
  await expect
    .poll(async () => {
      hit = (await events(page))
        .reverse()
        .find((e) => e.t === t && (!at || (e.x === at[0] && e.y === at[1])));
      return !!hit;
    })
    .toBe(true);
  return hit!;
}

const pending = (page: Page) =>
  page.evaluate(() =>
    (window as unknown as { __pending(): number }).__pending(),
  );
const clock = (page: Page, on: boolean) =>
  page.evaluate(
    (on) => (window as unknown as { __clock(v: boolean): void }).__clock(on),
    on,
  );
/** CastleSiege's recorded poses, one per frame, from index `from`. */
const frames = async (page: Page, from = 0) =>
  (
    await page.evaluate(
      () => (window as unknown as { __frames: string[] }).__frames,
    )
  )
    .slice(from)
    .map(parse);
const frameCount = (page: Page) =>
  page.evaluate(
    () => (window as unknown as { __frames: string[] }).__frames.length,
  );

/** A window transform: position (sheet px), rotation, scale. Each part is
 * read on its own (009 R2.a), so a missing or new part cannot read as 0;
 * anything else in the string fails the test. Firefox and WebKit write
 * translate(x, 0px) as translate(x). */
function parse(tf: string) {
  const t = /translate\(([-\d.e]+)px(?:, ([-\d.e]+)px)?\)/.exec(tf);
  const r = /rotate\(([-\d.e]+)deg\)/.exec(tf);
  const s = /scale\(([-\d.e]+)(?:, ([-\d.e]+))?\)/.exec(tf);
  let rest = tf;
  for (const m of [t, r, s]) if (m) rest = rest.replace(m[0], "");
  if (!t || rest.trim()) throw new Error(`transform not understood: "${tf}"`);
  return {
    x: +t[1],
    y: +(t[2] ?? 0),
    rot: r ? +r[1] : 0,
    scale: s ? +s[1] : 1,
    scaleY: s ? +(s[2] ?? s[1]) : 1,
  };
}

/** No rotation and no scale. */
const flat = (p: { rot: number; scale: number; scaleY: number }) =>
  p.rot === 0 && unscaled(p);
/** No scale (010 R1: a held window leans but does not grow). */
const unscaled = (p: { scale: number; scaleY: number }) =>
  p.scale === 1 && p.scaleY === 1;

/** A Safari pinch by gesture events: zoom × `scale` about screen point `at`. */
const gestureZoom = (page: Page, scale: number, at: Pt) =>
  page.evaluate(
    ([scale, x, y]) => {
      const vp = document.querySelector("#vp")!;
      for (const [type, k] of [
        ["gesturestart", 1],
        ["gesturechange", scale],
        ["gestureend", scale],
      ] as const) {
        const e = new Event(type, { bubbles: true, cancelable: true });
        for (const [p, v] of Object.entries({
          scale: k,
          clientX: x,
          clientY: y,
        }))
          Object.defineProperty(e, p, { value: v });
        vp.dispatchEvent(e);
      }
    },
    [scale, ...at],
  );

async function open(page: Page, hz?: number): Promise<void> {
  await instrument(page, hz);
  await page.goto(sheet());
  await expect(page.locator("#world")).toHaveAttribute("style", /scale\(/);
}

/** A window's inline transform and whether it is held. */
async function pose(page: Page, id: string) {
  const [tf, lifted] = await page
    .locator(`[data-win="${id}"]`)
    .evaluate(
      (w) =>
        [
          (w as HTMLElement).style.transform,
          w.classList.contains("lifted"),
        ] as const,
    );
  return { ...parse(tf), lifted };
}

/** Waits until a window has stopped: no flight, no wobble, no lift. */
async function rest(page: Page, id: string) {
  let last = "";
  await expect
    .poll(
      async () => {
        // real time: no frame pending after a frame has run, so a scroll or
        // flight still due has had its turn
        const busy = await page.evaluate(async () => {
          const w = window as unknown as {
            __live?(): number;
            __frameDone?(): Promise<void>;
          };
          if (!w.__live) return false;
          await w.__frameDone!();
          return w.__live() > 0;
        });
        if (busy) return false;
        const p = await pose(page, id);
        const key = JSON.stringify(p);
        const still = key === last && flat(p) && !p.lifted;
        last = key;
        return still;
      },
      { intervals: [50] },
    )
    .toBe(true);
  return pose(page, id);
}

function view(page: Page) {
  return page.evaluate(() => {
    const vp = document.querySelector<HTMLElement>("#vp")!;
    const b = vp.getBoundingClientRect();
    const t = getComputedStyle(document.querySelector("#world")!).transform;
    return {
      z: t === "none" ? 1 : new DOMMatrix(t).a,
      // scroll from the sheet's own origin: the start view is (0, 0)
      left: vp.scrollLeft - parseFloat(getComputedStyle(vp).paddingLeft),
      top: vp.scrollTop - parseFloat(getComputedStyle(vp).paddingTop),
      x: b.left,
      y: b.top,
      right: b.left + vp.clientWidth,
    };
  });
}

/** Zooms at once with one ctrl-wheel event at screen point `at`. */
async function zoomTo(page: Page, z: number, at: Pt) {
  const z0 = (await view(page)).z;
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
    [-100 * Math.log(z / z0), ...at],
  );
  await expect.poll(async () => (await view(page)).z).toBeCloseTo(z, 6);
}

const HOME: Record<string, Pt> = { castlesiege: [360, 100] };

// ---- independent of physics.ts: the spec's numbers (Approach: Physics) ----
const TAU = 0.12;
const NORM = 1 - Math.exp(-2);
/** [time, x, y]: the pointer's path in sheet px, each move's screen motion ÷
 * the zoom at that move, from the last press in the log. */
function path(log: Logged[], zoomAt: (e: Logged) => number) {
  const down = log.map((e) => e.t).lastIndexOf("pointerdown");
  const ev = log
    .slice(down)
    .filter((e) => e.t === "pointerdown" || e.t === "pointermove");
  const out: [number, number, number][] = [[ev[0].ts, 0, 0]];
  for (let i = 1; i < ev.length; i++) {
    const [, x, y] = out[i - 1];
    const z = zoomAt(ev[i]);
    out.push([
      ev[i].ts,
      x + (ev[i].x - ev[i - 1].x) / z,
      y + (ev[i].y - ev[i - 1].y) / z,
    ]);
  }
  return out;
}
function landing(
  from: Pt,
  samples: [number, number, number][],
  now: number,
  size: Pt,
): Pt {
  const k = samples.filter((e) => now - e[0] < 80);
  let v: Pt = [0, 0];
  const [a, b] = [k[0], k[k.length - 1]];
  if (k.length >= 2 && now - b[0] <= 50 && b[0] !== a[0]) {
    const dt = (b[0] - a[0]) / 1000;
    v = [(b[1] - a[1]) / dt, (b[2] - a[2]) / dt];
  }
  const d = Math.hypot(...v) * TAU * NORM;
  const cap = d > 360 ? 360 / d : 1;
  const clamp = (x: number, max: number) => Math.min(Math.max(x, 0), max);
  return [
    clamp(from[0] + v[0] * TAU * NORM * cap, 3000 - size[0]),
    clamp(from[1] + v[1] * TAU * NORM * cap, 1640 - size[1]),
  ];
}

test("R7.a pressing a window's title bar brings it to the front @live", async ({
  page,
}) => {
  await open(page);
  // throw Castle Wars over CastleSiege, then press CastleSiege's bar
  await page.mouse.move(1100, 152);
  await page.mouse.down();
  await page.mouse.move(800, 400, { steps: 5 });
  await seen(page, "pointermove", [800, 400]);
  await page.mouse.up();
  const cw = await rest(page, "castlewars");
  // the middle of the overlap (zoom 1, scroll 0: screen px = sheet px)
  const over: Pt = [
    (Math.max(cw.x, 360) + Math.min(cw.x + 600, 980)) / 2,
    (Math.max(cw.y, 100) + Math.min(cw.y + 522, 719)) / 2,
  ];
  const top = () =>
    page.evaluate(
      ([x, y]) =>
        document
          .elementFromPoint(x, y)
          ?.closest("[data-win]")
          ?.getAttribute("data-win"),
      over,
    );
  expect(await top()).toBe("castlewars");
  await page.mouse.click(400, 112);
  expect(await top()).toBe("castlesiege");
});

/** A zero-size marker at window point `g` (window px, border box): its screen
 * position is where the browser draws P, rotation and lift included. */
function markP(page: Page, id: string, g: Pt) {
  return page.locator(`[data-win="${id}"]`).evaluate((w, g) => {
    const m = document.createElement("i");
    m.id = "probe";
    // offsets are from the padding box; the border is 2 px
    m.style.cssText = `position:absolute;left:${g[0] - 2}px;top:${g[1] - 2}px;width:0;height:0`;
    w.append(m);
  }, g);
}
const probe = (page: Page) =>
  page.evaluate(() => {
    const r = document.querySelector("#probe")!.getBoundingClientRect();
    return [r.left, r.top] as Pt;
  });

for (const [name, z, press, step] of [
  ["at 100 %", 1, [600, 112], [13, 9]],
  ["at 50 %", 0.5, [420, 57], [10, 8]],
  // the window crosses the sheet's top-left edge; the view cannot scroll there
  ["at a sheet edge", 1, [600, 112], [-30, -5]],
] as [string, number, Pt, Pt][]) {
  test(`R8.a the grab point stays under the pointer ${name} @live`, async ({
    page,
  }) => {
    await open(page);
    if (z !== 1) await zoomTo(page, z, [0, 0]);
    const v = await view(page);
    const g: Pt = [
      (press[0] - v.x + v.left) / z - HOME.castlesiege[0],
      (press[1] - v.y + v.top) / z - HOME.castlesiege[1],
    ];
    await markP(page, "castlesiege", g);
    await page.mouse.move(...press);
    await page.mouse.down();
    for (let i = 1; i <= 20; i++) {
      const at: Pt = [press[0] + step[0] * i, press[1] + step[1] * i];
      await page.mouse.move(...at);
      await seen(page, "pointermove", at);
      const p = await probe(page);
      expect(Math.abs(p[0] - at[0]), `step ${i} x`).toBeLessThanOrEqual(1);
      expect(Math.abs(p[1] - at[1]), `step ${i} y`).toBeLessThanOrEqual(1);
    }
    // the probe includes any rotation or scale; 010 R1: a lean, no scale
    const p = await pose(page, "castlesiege");
    expect(p.lifted).toBe(true);
    expect(unscaled(p), JSON.stringify(p)).toBe(true);
    await page.mouse.up();
  });
}

for (const [name, to] of [
  ["lands where the physics says", [300, 80]],
  ["toward the sheet edge ends inside the sheet", [-40, -40]],
] as [string, Pt][]) {
  test(`R8 a fast throw ${name}`, async ({ page }) => {
    await open(page);
    const press: Pt = [600, 112];
    await page.mouse.move(...press);
    await page.mouse.down();
    for (let i = 1; i <= 4; i++)
      await page.mouse.move(
        press[0] + (to[0] * i) / 4,
        press[1] + (to[1] * i) / 4,
      );
    await page.mouse.up();
    const up = await seen(page, "pointerup");
    // the samples: the press and the moves after it
    const moves = path(await events(page), () => 1);
    const last = moves[moves.length - 1];
    const release: Pt = [
      HOME.castlesiege[0] + last[1],
      HOME.castlesiege[1] + last[2],
    ];
    const want = landing(release, moves, up.ts, [620, 630.75]);
    const p = await rest(page, "castlesiege");
    expect(
      Math.abs(p.x - want[0]),
      `x ${p.x} vs ${want[0]}`,
    ).toBeLessThanOrEqual(2);
    expect(
      Math.abs(p.y - want[1]),
      `y ${p.y} vs ${want[1]}`,
    ).toBeLessThanOrEqual(2);
    expect(p.x).toBeGreaterThanOrEqual(0);
    expect(p.y).toBeGreaterThanOrEqual(0);
    expect(p.x).toBeLessThanOrEqual(3000 - 620);
    expect(p.y).toBeLessThanOrEqual(1640 - 630.75);
  });
}

/** Throws CastleSiege away from home and waits until it is still. */
async function moveAway(page: Page) {
  // the start view: focusing or clicking the Home control may have scrolled it
  await page.locator("#vp").evaluate((vp) => {
    const cs = getComputedStyle(vp);
    vp.scrollTo(parseFloat(cs.paddingLeft), parseFloat(cs.paddingTop));
  });
  await expect.poll(async () => (await view(page)).left).toBe(0);
  const p0 = await pose(page, "castlesiege");
  const v = await view(page);
  const at: Pt = [p0.x + 100 - v.left, p0.y + 12 - v.top];
  await page.mouse.move(...at);
  await page.mouse.down();
  // toward the middle of the view
  await page.mouse.move(at[0] < 640 ? at[0] + 160 : at[0] - 160, at[1] + 150, {
    steps: 4,
  });
  await page.mouse.up();
  const p = await rest(page, "castlesiege");
  expect(Math.hypot(p.x - 360, p.y - 100)).toBeGreaterThan(100);
  return p;
}

test.describe("R9.a Home", () => {
  test("double-click on the title bar flies the window home @live", async ({
    page,
  }) => {
    await open(page);
    const p = await moveAway(page);
    const v = await view(page);
    await page.mouse.dblclick(p.x + 100 - v.left, p.y + 12 - v.top);
    const q = await rest(page, "castlesiege");
    expect([q.x, q.y]).toEqual(HOME.castlesiege);
  });

  test("the Home control works by pointer and by keyboard @live", async ({
    page,
    browserName,
  }) => {
    await open(page);
    const home = page.getByRole("button", { name: "Send CastleSiege home" });
    await moveAway(page);
    await home.click();
    const p = await rest(page, "castlesiege");
    expect([p.x, p.y]).toEqual(HOME.castlesiege);
    await moveAway(page);
    // reached by keyboard, so :focus-visible holds in every browser
    await home.focus();
    // WebKit, like Safari, tabs to buttons only with Alt
    const alt = browserName === "webkit" ? "Alt+" : "";
    await page.keyboard.press(`${alt}Shift+Tab`);
    await page.keyboard.press(`${alt}Tab`);
    await expect(home).toBeFocused();
    await page.keyboard.press("Enter");
    // R18: the ring sits on the button's own chrome, inside its border, not
    // on the title bar (T7: -2px drew it over the border, light 1:1)
    expect(
      await home.evaluate((b) => {
        const s = getComputedStyle(b);
        return [s.outlineStyle, s.outlineOffset, s.outlineColor === s.color];
      }),
    ).toEqual(["solid", "-4px", true]);
    const q = await rest(page, "castlesiege");
    expect([q.x, q.y]).toEqual(HOME.castlesiege);
    // every window has one, named by its title
    await expect(page.locator("[data-win] .bar button.home")).toHaveCount(8);
    await expect(
      page.getByRole("button", { name: "Send Notes home" }),
    ).toBeAttached();
  });
});

test("R10.a edge auto-scroll: same px/s at 60 Hz and 120 Hz, no flight on release", async ({
  page,
  context,
  errors,
}) => {
  const rates: number[] = [];
  let want = 0;
  for (const hz of [60, 120]) {
    const p = hz === 60 ? page : await context.newPage();
    // the errors fixture watches `page` only
    if (p !== page) {
      p.on("console", (m) => m.type() === "error" && errors.push(m.text()));
      p.on("pageerror", (e) => errors.push(e.message));
    }
    await open(p, hz);
    const v = await view(p);
    const at: Pt = [v.right - 20, 300];
    // grabbed far right on the bar, so the window stays on the sheet while it scrolls
    await p.mouse.move(900, 112);
    await p.mouse.down();
    await p.mouse.move(...at, { steps: 10 });
    await seen(p, "pointermove", at);
    // the pointer is still from here on: measure one second of page time
    const s0 = await p.evaluate(() => [
      performance.now(),
      document.querySelector("#vp")!.scrollLeft,
    ]);
    let s1 = s0;
    await expect
      .poll(
        async () => {
          s1 = await p.evaluate(() => [
            performance.now(),
            document.querySelector("#vp")!.scrollLeft,
          ]);
          return s1[0] - s0[0];
        },
        { intervals: [50] },
      )
      .toBeGreaterThanOrEqual(1000);
    rates.push(((s1[1] - s0[1]) / (s1[0] - s0[0])) * 1000);
    // 36 px into the 56 px zone × 21 /s
    want = (at[0] - (v.right - 56)) * 21;
    await p.mouse.up();
    await seen(p, "pointerup");
    const a = await pose(p, "castlesiege");
    await expect
      .poll(() =>
        p.evaluate(() =>
          (window as unknown as { __pending(): number }).__pending(),
        ),
      )
      .toBe(0);
    const b = await pose(p, "castlesiege");
    expect([b.x, b.y], `${hz} Hz: no flight`).toEqual([a.x, a.y]);
    // the grab point is still under the pointer
    const w = await view(p);
    expect(Math.abs(b.x + 540 - w.left - at[0])).toBeLessThanOrEqual(1);
    if (p !== page) await p.close();
  }
  for (const r of rates)
    expect(
      Math.abs(r - want) / want,
      `${rates} vs ${want}`,
    ).toBeLessThanOrEqual(0.1);
  expect(Math.abs(rates[0] - rates[1]) / rates[0]).toBeLessThanOrEqual(0.1);
});

test.describe("R21.b a held window ends with no throw", () => {
  // lost capture: releasePointerCapture makes the browser fire a real
  // lostpointercapture (test input cannot take the capture away otherwise)
  for (const how of ["pointercancel", "blur", "lostpointercapture"]) {
    test(`on ${how}`, async ({ page }) => {
      await open(page);
      await page.mouse.move(600, 112);
      await page.mouse.down();
      const down = await seen(page, "pointerdown");
      // a fast move, so a release here would throw
      await page.mouse.move(700, 160, { steps: 3 });
      await seen(page, "pointermove", [700, 160]);
      const at = await page.evaluate(
        ([how, id]) => {
          const w = document.querySelector<HTMLElement>(
            '[data-win="castlesiege"]',
          )!;
          const t = /translate\(([-\d.e]+)px(?:, ([-\d.e]+)px)?\)/.exec(
            w.style.transform,
          )!;
          const bar = w.querySelector<HTMLElement>(".bar")!;
          if (how === "blur") dispatchEvent(new Event("blur"));
          else if (how === "lostpointercapture") {
            if (!bar.hasPointerCapture(id as number))
              throw new Error("no capture");
            bar.releasePointerCapture(id as number);
          } else
            bar.dispatchEvent(
              new PointerEvent("pointercancel", {
                pointerId: id as number,
                bubbles: true,
              }),
            );
          return [+t[1], +(t[2] ?? 0)];
        },
        [how, down.id] as const,
      );
      // it was dragged: 100 px right, 48 px down
      expect(at).toEqual([460, 148]);
      // the pointer moves on: the gesture is over, the window does not follow
      await page.mouse.move(800, 300);
      await seen(page, "pointermove", [800, 300]);
      const p = await rest(page, "castlesiege");
      expect([p.x, p.y]).toEqual(at);
      await page.mouse.up();
    });
    test(`010 R1.e on ${how} after the lean has settled`, async ({ page }) => {
      await open(page, 60);
      await page.mouse.move(600, 112);
      await page.mouse.down();
      const down = await seen(page, "pointerdown");
      for (let i = 1; i <= 5; i++) {
        await page.mouse.move(600 + 20 * i, 112);
        await nextFrame(page);
      }
      // still: the lean settles at exactly 0 and the loop stops
      await expect.poll(() => pending(page)).toBe(0);
      const held = await pose(page, "castlesiege");
      expect(held.rot).toBe(0);
      expect((await hints(page)).at(-1)).toBe("transform");
      await page.evaluate(
        ([how, id]) => {
          const bar = document.querySelector<HTMLElement>(
            '[data-win="castlesiege"] .bar',
          )!;
          if (how === "blur") dispatchEvent(new Event("blur"));
          else if (how === "lostpointercapture") {
            if (!bar.hasPointerCapture(id as number))
              throw new Error(`no capture for ${id}`);
            bar.releasePointerCapture(id as number);
          } else
            bar.dispatchEvent(
              new PointerEvent("pointercancel", {
                pointerId: id as number,
                bubbles: true,
              }),
            );
        },
        [how, down.id] as const,
      );
      // the gesture ends (lostpointercapture fires at the next pointer
      // event; the window must not follow that move)
      await page.mouse.move(701, 113);
      await expect
        .poll(async () => (await pose(page, "castlesiege")).lifted)
        .toBe(false);
      const n = await frameCount(page);
      await expect.poll(() => frameCount(page)).toBeGreaterThan(n);
      const p = await pose(page, "castlesiege");
      expect([p.x, p.y, p.rot, p.lifted]).toEqual([held.x, held.y, 0, false]);
      expect((await hints(page)).at(-1)).toBe("auto");
      expect(await pending(page)).toBe(0);
      await page.mouse.up();
    });
  }
});

test("R16.a a moved window is at home after a reload @live", async ({
  page,
}) => {
  await open(page);
  await moveAway(page);
  await page.reload();
  await expect(page.locator("#world")).toHaveAttribute("style", /scale\(/);
  const p = await pose(page, "castlesiege");
  expect([p.x, p.y]).toEqual(HOME.castlesiege);
  const b = (await page.locator('[data-win="castlesiege"]').boundingBox())!;
  expect([Math.round(b.x), Math.round(b.y)]).toEqual(HOME.castlesiege);
});

// ---- Codex review of T5: zoom during a drag, sway, pin, catch, owners ----

test("R8 a zoom during a drag does not change the release velocity", async ({
  page,
}) => {
  await open(page, 60);
  await clock(page, false); // the flight waits until the release pose is read
  await page.mouse.move(600, 112);
  await page.mouse.down();
  for (let i = 1; i <= 3; i++) await page.mouse.move(600 + 20 * i, 112);
  await seen(page, "pointermove", [660, 112]);
  // a Safari pinch about the view's corner: the scroll stays 0
  await gestureZoom(page, 1.25, [0, 0]);
  await expect.poll(async () => (await view(page)).z).toBeCloseTo(1.25, 6);
  for (let i = 4; i <= 6; i++) await page.mouse.move(600 + 20 * i, 112);
  await page.mouse.up();
  const up = await seen(page, "pointerup");
  const release = await pose(page, "castlesiege");
  const samples = path(await events(page), (e) => (e.x <= 660 ? 1 : 1.25));
  const want = landing([release.x, release.y], samples, up.ts, [620, 630.75]);
  await clock(page, true);
  const p = await rest(page, "castlesiege");
  expect(Math.abs(p.x - want[0]), `x ${p.x} vs ${want[0]}`).toBeLessThanOrEqual(
    2,
  );
  expect(Math.abs(p.y - want[1])).toBeLessThanOrEqual(2);
});

for (const how of ["Safari pinch", "+ key"]) {
  test(`R8.a a held window at rest follows a zoom (${how})`, async ({
    page,
  }) => {
    if (how === "+ key") await page.emulateMedia({ reducedMotion: "reduce" });
    await open(page, 60);
    await markP(page, "castlesiege", [240, 12]);
    const at: Pt = [620, 130];
    await page.mouse.move(600, 112);
    await page.mouse.down();
    await page.mouse.move(...at);
    await seen(page, "pointermove", at);
    // held still: the window has settled and the page schedules no frame
    await expect.poll(() => pending(page)).toBe(0);
    if (how === "+ key") {
      await page.locator("#zIn").evaluate((b) => (b as HTMLElement).focus());
      await page.keyboard.press("Enter");
      await expect(page.locator("#zPct")).toHaveText("125%");
    } else {
      await gestureZoom(page, 1.25, [0, 0]);
      await expect.poll(async () => (await view(page)).z).toBeCloseTo(1.25, 6);
    }
    const p = await probe(page);
    expect(Math.abs(p[0] - at[0]), `x ${p[0]}`).toBeLessThanOrEqual(1);
    expect(Math.abs(p[1] - at[1]), `y ${p[1]}`).toBeLessThanOrEqual(1);
    await page.mouse.up();
  });
}

/** Waits until the 60 Hz test clock has run at least one more frame. */
async function nextFrame(page: Page): Promise<void> {
  const n = await frameCount(page);
  await expect
    .poll(() => frameCount(page), { intervals: [5] })
    .toBeGreaterThan(n);
}

/** 20 moves of 10 px right from `press`, one 60 Hz frame apart (about
 * 600 px/s): after each, P is under the pointer and the window is not scaled.
 * Returns the frame index at the press. */
async function heldMove(page: Page, press: Pt): Promise<number> {
  await page.mouse.move(...press);
  await page.mouse.down();
  await seen(page, "pointerdown", press);
  const from = await frameCount(page);
  for (let i = 1; i <= 20; i++) {
    const at: Pt = [press[0] + 10 * i, press[1]];
    await page.mouse.move(...at);
    await seen(page, "pointermove", at);
    await nextFrame(page);
    const p = await probe(page);
    expect(Math.abs(p[0] - at[0]), `step ${i} x`).toBeLessThanOrEqual(1);
    expect(Math.abs(p[1] - at[1]), `step ${i} y`).toBeLessThanOrEqual(1);
    const q = await pose(page, "castlesiege");
    expect(unscaled(q), `step ${i}: ${JSON.stringify(q)}`).toBe(true);
    expect(q.lifted).toBe(true);
  }
  return from;
}

test("010 R1.b a held window leans about P with no scale; still, it ends at θ = 0 and the loop stops", async ({
  page,
}) => {
  await open(page, 60);
  // P = (240, 12) in window px: the bar, right of the centre (r = (70, 315),
  // torque ≈ −584 at 600 px/s sideways, so the lean target is about 7°)
  await markP(page, "castlesiege", [240, 12]);
  const from = await heldMove(page, [600, 112]);
  const f = await frames(page, from);
  expect(f.length).toBeGreaterThanOrEqual(20);
  expect(f.filter((p) => !unscaled(p))).toEqual([]);
  expect(
    Math.max(...f.map((p) => Math.abs(p.rot))),
    "it leaned",
  ).toBeGreaterThan(0.5);
  // the pointer stays still: the lean goes back to exactly 0, then no frame
  // is pending (001 R22)
  await expect.poll(() => pending(page)).toBe(0);
  const p = await pose(page, "castlesiege");
  expect(p.rot).toBe(0);
  expect(p.lifted).toBe(true);
  await page.mouse.up();
});

test("010 R1.c reduced motion: no lean while held; turned on mid-lean, the lean ends at once", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await open(page, 60);
  await markP(page, "castlesiege", [240, 12]);
  let from = await heldMove(page, [600, 112]);
  expect((await frames(page, from)).map((p) => p.rot)).toEqual(
    (await frames(page, from)).map(() => 0),
  );
  await page.mouse.up();
  await rest(page, "castlesiege");
  // motion on: lean, then reduced motion turns on during the hold
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const c = await pose(page, "castlesiege");
  const press: Pt = [Math.round(c.x + 240), Math.round(c.y + 12)];
  await page.mouse.move(...press);
  await page.mouse.down();
  await seen(page, "pointerdown", press);
  let i = 0;
  await expect
    .poll(async () => {
      i++;
      await page.mouse.move(press[0] + 10 * i, press[1]);
      await nextFrame(page);
      return Math.abs((await pose(page, "castlesiege")).rot);
    })
    .toBeGreaterThan(0.5);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect.poll(async () => (await pose(page, "castlesiege")).rot).toBe(0);
  from = await frameCount(page);
  for (let k = 1; k <= 5; k++) {
    const at: Pt = [press[0] + 10 * (i + k), press[1]];
    await page.mouse.move(...at);
    await seen(page, "pointermove", at);
    await nextFrame(page);
    const p = await probe(page);
    expect(Math.abs(p[0] - at[0]), `x after the switch`).toBeLessThanOrEqual(1);
  }
  expect((await frames(page, from)).filter((p) => p.rot !== 0)).toEqual([]);
  await page.mouse.up();
  await expect.poll(() => pending(page)).toBe(0);
});

/** Frame times (page ms) and computed will-change, one per recorded frame. */
const times = (page: Page, from = 0) =>
  page.evaluate(
    (from) => (window as unknown as { __times: number[] }).__times.slice(from),
    from,
  );
const hints = (page: Page, from = 0) =>
  page.evaluate(
    (from) => (window as unknown as { __hints: string[] }).__hints.slice(from),
    from,
  );

/** A flick to the right from `at`: 5 moves of `px`, one 60 Hz frame apart
 * (`paced`) or as fast as the input goes, then the release at once. Returns
 * the frame index at the press. */
async function flick(
  page: Page,
  at: Pt,
  px: number,
  paced = true,
): Promise<number> {
  await page.mouse.move(...at);
  await page.mouse.down();
  await seen(page, "pointerdown", at);
  const from = await frameCount(page);
  for (let i = 1; i <= 5; i++) {
    if (paced && i > 1) await nextFrame(page);
    await page.mouse.move(at[0] + px * i, at[1]);
  }
  await page.mouse.up();
  await seen(page, "pointerup");
  return from;
}

/** The recorded motion of CastleSiege from frame `from` until it rests at
 * `end`: the index of the pin (the first frame at the landing), and of the
 * first frame at rest (at the landing with no rotation, after the pin). */
function motion(f: ReturnType<typeof parse>[], end: { x: number; y: number }) {
  const at = (p: { x: number; y: number }) => p.x === end.x && p.y === end.y;
  const pin = f.findIndex(at);
  let still = f.length - 1;
  while (still > pin && at(f[still - 1]) && flat(f[still - 1])) still--;
  return { pin, still };
}

for (const [name, px] of [
  ["a 2000 px/s flick", 33],
  // as fast as the input goes: the throw is capped at 360 px
  ["a capped throw", 100],
] as [string, number][])
  test(`009 R3.b ${name}: max |θ| ≤ 2.5°, |θ| < 0.05° from 0.8 s after the pin`, async ({
    page,
  }) => {
    await open(page, 60);
    const from = await flick(page, [600, 112], px, px < 100);
    const end = await rest(page, "castlesiege");
    // from the release at x = 360 + 5 · px: about 207 px, or the cap (a
    // loaded browser may deliver the moves slower)
    expect(end.x - 360 - 5 * px, "it flew").toBeGreaterThan(
      px < 100 ? 20 : 150,
    );
    const { pin } = motion(await frames(page, from), end);
    expect(pin).toBeGreaterThan(0);
    // the clock runs on at rest: wait until it has recorded 0.8 s past the pin
    const tPin = (await times(page, from))[pin];
    await expect
      .poll(async () => (await times(page)).at(-1)! - tPin)
      .toBeGreaterThan(850);
    const f = await frames(page, from);
    const t = await times(page, from);
    const rot = f.map((p) => Math.abs(p.rot));
    // 010 R1.f: from the pin on (before it, the held lean and its swing)
    const wob = rot.slice(pin);
    // the wobble ran (the check below is not empty)
    expect(Math.max(...wob)).toBeGreaterThan(0.5);
    expect(Math.max(...wob), "max |θ| from the pin").toBeLessThanOrEqual(2.5);
    const late = rot.filter((_, i) => i >= pin && t[i] - t[pin] >= 800);
    expect(late.length).toBeGreaterThan(0);
    expect(Math.max(...late), "|θ| from 0.8 s after the pin").toBeLessThan(
      0.05,
    );
  });

test("009 R1.a will-change: transform while held, flying, wobbling and flying Home; gone at rest", async ({
  page,
}) => {
  await open(page, 60);
  const all = () =>
    page.evaluate(() =>
      [...document.querySelectorAll("[data-win]")].map(
        (w) => getComputedStyle(w).willChange,
      ),
    );
  // the start view: no window has the hint
  expect(await all()).toEqual(Array(8).fill("auto"));
  // held, still, before any move
  await page.mouse.move(600, 112);
  await page.mouse.down();
  await seen(page, "pointerdown");
  await nextFrame(page);
  expect((await hints(page)).at(-1)).toBe("transform");
  await page.mouse.up();
  await rest(page, "castlesiege");
  // a throw: the hint through the flight and the wobble, gone at the frame
  // where it rests
  for (const go of ["throw", "Home"]) {
    const from =
      go === "throw"
        ? await flick(page, [600, 112], 33)
        : await (async () => {
            const n = await frameCount(page);
            await page
              .getByRole("button", { name: "Send CastleSiege home" })
              .click();
            return n;
          })();
    const end = await rest(page, "castlesiege");
    const f = await frames(page, from);
    const h = await hints(page, from);
    const { pin, still } = motion(f, end);
    expect(pin, go).toBeGreaterThan(0);
    // moving: from the first frame that moved it until the one before rest
    const first = f.findIndex((p) => p.x !== f[0].x || p.y !== f[0].y);
    expect(first, go).toBeGreaterThanOrEqual(0);
    expect(still, go).toBeGreaterThan(pin);
    expect(h.slice(first, still), go).toEqual(
      Array(still - first).fill("transform"),
    );
    expect(h.slice(still), go).toEqual(Array(h.length - still).fill("auto"));
  }
  expect(await all()).toEqual(Array(8).fill("auto"));
  // after a zoom to 50 % and 160 %
  for (const z of [0.5, 1.6]) {
    await zoomTo(page, z, [0, 0]);
    await expect.poll(() => pending(page)).toBe(0);
    expect(await all(), `zoom ${z}`).toEqual(Array(8).fill("auto"));
  }
});

/** A fast throw to the right (4 × 60 px) while the clock is paused, so no
 * frame runs before the release. Returns the frame index at the release. */
async function throwStill(page: Page, at: Pt): Promise<number> {
  await clock(page, false);
  await page.mouse.move(...at);
  await page.mouse.down();
  for (let i = 1; i <= 4; i++) await page.mouse.move(at[0] + 60 * i, at[1]);
  await page.mouse.up();
  await seen(page, "pointerup");
  const from = await frameCount(page);
  await clock(page, true);
  return from;
}

test("R8 a throw: no rotation in flight, a swing from the pin, rest at 0", async ({
  page,
}) => {
  await open(page, 60);
  const from = await throwStill(page, [600, 112]);
  const end = await rest(page, "castlesiege");
  expect(end.x - 360).toBeGreaterThan(20);
  const f = await frames(page, from);
  // the pin: the first frame at the landing point
  const pin = f.findIndex((p) => p.x === end.x && p.y === end.y);
  expect(pin).toBeGreaterThan(0);
  expect(f.slice(0, pin).map((p) => p.rot)).toEqual(Array(pin).fill(0));
  expect(f[pin].rot).not.toBe(0);
  expect(Math.max(...f.slice(pin).map((p) => Math.abs(p.rot)))).toBeGreaterThan(
    0.5,
  );
  expect(end.rot).toBe(0);
});

test("R8 a catch mid-wobble stops the rotation; a re-throw flies", async ({
  page,
}) => {
  await open(page, 60);
  // the clock stops in the wobble after the pin: rotation over 0.2°
  // (009: the wobble is smaller; a slow throw on a loaded runner peaks
  // near 0.5°)
  await page.evaluate(() =>
    (
      window as unknown as { __pauseWhen(f: (tf: string) => boolean): void }
    ).__pauseWhen(
      (tf) => Math.abs(+(/rotate\(([-\d.e]+)deg/.exec(tf)?.[1] ?? 0)) > 0.2,
    ),
  );
  await throwStill(page, [600, 112]);
  await expect.poll(() => pending(page)).toBeGreaterThan(0);
  let c = await pose(page, "castlesiege");
  await expect
    .poll(async () => Math.abs((c = await pose(page, "castlesiege")).rot))
    .toBeGreaterThan(0.2);
  expect(Math.abs(c.rot)).toBeGreaterThan(0.2);
  // press the pivot P (it does not move while the window swings about it)
  const at: Pt = [Math.round(c.x + 240), Math.round(c.y + 12)];
  await page.mouse.move(...at);
  await page.mouse.down();
  await seen(page, "pointerdown", at);
  const caught = await pose(page, "castlesiege");
  expect(caught.rot).toBe(0);
  expect([caught.x, caught.y]).toEqual([c.x, c.y]);
  // the re-throw from the same hold, back to the left (P may be near the
  // view's right edge)
  for (let i = 1; i <= 4; i++) await page.mouse.move(at[0] - 30 * i, at[1]);
  await page.mouse.up();
  await seen(page, "pointerup");
  // the clock is still paused: this is where the hand let go
  const release = await pose(page, "castlesiege");
  expect([release.x, release.y], "the held move").toEqual([c.x - 120, c.y]);
  await clock(page, true);
  const end = await rest(page, "castlesiege");
  // it flies on past the release, in the throw's direction (left)
  expect(release.x - end.x, "flight after the release").toBeGreaterThan(20);
  expect(end.y).toBe(release.y);
});

test("R21 a pointer click on Home during another pointer's drag is ignored", async ({
  page,
}) => {
  await open(page);
  await page.mouse.move(600, 112);
  await page.mouse.down();
  await page.mouse.move(700, 200);
  await seen(page, "pointermove", [700, 200]);
  // another pointer's click (detail 1); a keyboard click has detail 0
  await page
    .getByRole("button", { name: "Send CastleSiege home" })
    .evaluate((b) =>
      b.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 })),
    );
  await page.mouse.move(720, 220);
  await seen(page, "pointermove", [720, 220]);
  const p = await pose(page, "castlesiege");
  expect([p.x, p.y, p.lifted]).toEqual([360 + 120, 100 + 108, true]);
  await page.mouse.up();
});

test("R22 Home on a window already at home schedules no frame", async ({
  page,
}) => {
  await open(page, 60);
  await expect.poll(() => pending(page)).toBe(0);
  await page.getByRole("button", { name: "Send CastleSiege home" }).click();
  await seen(page, "click");
  expect(await pending(page)).toBe(0);
});

test("R21 grabbing a window stops the paper's glide", async ({ page }) => {
  await open(page, 60);
  // a flick on the paper to the left, then the clock stops: the glide waits
  await page.mouse.move(1010, 740);
  await page.mouse.down();
  for (let i = 1; i <= 5; i++) await page.mouse.move(1010 - 40 * i, 740);
  await seen(page, "pointermove", [810, 740]);
  await clock(page, false);
  await page.mouse.up();
  await seen(page, "pointerup");
  expect(await pending(page)).toBeGreaterThan(0);
  const s0 = await view(page);
  // CastleSiege's bar, where it is now
  await page.mouse.move(600 - s0.left, 112);
  await page.mouse.down();
  await seen(page, "pointerdown");
  expect((await pose(page, "castlesiege")).lifted).toBe(true);
  await clock(page, true);
  await expect.poll(() => pending(page)).toBe(0);
  expect((await view(page)).left).toBe(s0.left);
  await page.mouse.up();
});

test("R5.d a blur during a Safari pinch does not block ctrl-wheel zoom", async ({
  page,
}) => {
  await open(page);
  await page.evaluate(() => {
    const e = new Event("gesturestart", { bubbles: true, cancelable: true });
    for (const [p, v] of Object.entries({
      scale: 1,
      clientX: 700,
      clientY: 400,
    }))
      Object.defineProperty(e, p, { value: v });
    document.querySelector("#vp")!.dispatchEvent(e);
    // the page loses focus: no gestureend will come
    dispatchEvent(new Event("blur"));
    document.querySelector("#vp")!.dispatchEvent(
      new WheelEvent("wheel", {
        bubbles: true,
        cancelable: true,
        ctrlKey: true,
        deltaY: -10,
        clientX: 700,
        clientY: 400,
      }),
    );
  });
  expect((await view(page)).z).toBeCloseTo(Math.exp(0.1), 4);
});
