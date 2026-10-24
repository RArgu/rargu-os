// Spec 004 T1 (R2): measures Paint, Music (Tracker) and Notes (Writer) run
// through the 002 host at scale 1, and checks the proposed Quick tools
// cluster. Outer rectangle = manifest client size + window borders + title
// bar + menu row. The proposed rectangles are tried by rewriting the three
// windows' sizes in the served page (layout.ts keeps the 001 table until the
// owner approves mock v0.7, T2). Prints the measured rectangles.
import type { Page } from "@playwright/test";
import paint from "../../src/apps/paint/manifest.json" with { type: "json" };
import tracker from "../../src/apps/tracker/manifest.json" with { type: "json" };
import writer from "../../src/apps/writer/manifest.json" with { type: "json" };
import { LAYOUT, SHEET } from "../../src/sheet/layout";
import { expect, test } from "./helpers";
import { isSheetPage, sheet } from "./sheet-base";

const TOOLS = [
  { id: "paint", app: paint },
  { id: "music", app: tracker },
  { id: "notes", app: writer },
] as const;

/** 004 T1 proposal, pending the owner's review of mock v0.7 (x, y only;
 * sizes come from the measurement) */
const PROPOSED: Record<string, { x: number; y: number }> = {
  paint: { x: 1920, y: 760 },
  music: { x: 2400, y: 700 },
  notes: { x: 1920, y: 1150 },
};

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
const overlap = (a: Rect, b: Rect) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

async function start(page: Page, id: string): Promise<void> {
  await page.locator(`[data-go="${id}"]`).click();
  const area = page.locator(`[data-win="${id}"] .demo-area`);
  await expect(area).toHaveAttribute("data-host", "running");
  await expect(area.locator(".host-bar [role=menubar]")).toBeVisible();
}

/** Window chrome around the client area, in sheet px (zoom 1). */
function chrome(page: Page, id: string) {
  return page.evaluate((id) => {
    const w = document.querySelector<HTMLElement>(`[data-win="${id}"]`)!;
    const cs = getComputedStyle(w);
    const px = (v: string) => parseFloat(v);
    return {
      borderX: px(cs.borderLeftWidth) + px(cs.borderRightWidth),
      borderY: px(cs.borderTopWidth) + px(cs.borderBottomWidth),
      bar: w.querySelector<HTMLElement>(".bar")!.offsetHeight,
      menu: w.querySelector<HTMLElement>(".host-bar")!.offsetHeight,
      boxSizing: cs.boxSizing,
      zoom: document.querySelector("#zPct")?.textContent ?? "",
    };
  }, id);
}

test.use({ viewport: { width: 1440, height: 900 } });

test("004 T1: measure the Quick tools at scale 1 and check the proposed cluster", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });

  // 1. the window chrome, at the current (001) sizes
  await page.goto(sheet());
  const rects: Record<string, Rect & { demoH: number; client: string }> = {};
  for (const { id, app } of TOOLS) {
    await start(page, id);
    const c = await chrome(page, id);
    expect(c.boxSizing).toBe("border-box");
    const w = app.window.width + c.borderX;
    const demoH = c.menu + app.window.height;
    const h = c.borderY + c.bar + demoH;
    rects[id] = {
      ...PROPOSED[id],
      w,
      h,
      demoH,
      client: `${app.window.width}x${app.window.height}`,
    };
    console.log(`chrome ${id}: ${JSON.stringify(c)}`);
  }

  // 2. the proposed cluster: inside the sheet, clear of each other, of every
  // project window at home and of the title block
  const block = await page.evaluate(() => {
    const t = document.querySelector<HTMLElement>(".titleblock")!;
    return {
      x: t.offsetLeft,
      y: t.offsetTop,
      w: t.offsetWidth,
      h: t.offsetHeight,
    };
  });
  console.log(`titleblock: ${JSON.stringify(block)}`);
  const others: [string, Rect][] = [
    ...LAYOUT.filter((s) => !s.tool).map((s): [string, Rect] => [s.id, s]),
    ["titleblock", block],
  ];
  for (const { id } of TOOLS) {
    const r = rects[id];
    expect(r.x).toBeGreaterThanOrEqual(0);
    expect(r.y).toBeGreaterThanOrEqual(0);
    expect(r.x + r.w).toBeLessThanOrEqual(SHEET.w);
    expect(r.y + r.h).toBeLessThanOrEqual(SHEET.h);
    for (const [o, b] of others)
      expect(overlap(r, b), `${id} vs ${o}`).toBe(false);
    for (const { id: o } of TOOLS)
      if (o !== id) expect(overlap(r, rects[o]), `${id} vs ${o}`).toBe(false);
  }

  // 3. the apps at the proposed sizes: client = manifest size, every control
  // inside the client area
  await page.route(isSheetPage, async (route) => {
    let html = await (await route.fetch()).text();
    for (const { id } of TOOLS) {
      const r = rects[id];
      html = html.replace(
        new RegExp(
          `(data-win="${id}"[^>]*style="width:)\\d+px;height:\\d+px([^]*?class="demo-area" style="height:)\\d+px`,
        ),
        `$1${r.w}px;height:${r.h}px$2${r.demoH}px`,
      );
    }
    await route.fulfill({ body: html, contentType: "text/html" });
  });
  await page.goto(sheet());
  for (const { id, app } of TOOLS) {
    await start(page, id);
    const m = await page.evaluate((id) => {
      const w = document.querySelector<HTMLElement>(`[data-win="${id}"]`)!;
      const root = w.querySelector<HTMLElement>(
        ".demo-area > .host-root:not(.host-bar)",
      )!;
      const rb = root.getBoundingClientRect();
      const out: string[] = [];
      for (const el of root.querySelectorAll<HTMLElement>(
        "button, input, select, textarea, canvas, [tabindex]",
      )) {
        const b = el.getBoundingClientRect();
        if (!b.width || !b.height || el.closest("[hidden]")) continue;
        // controls in a scroller are reachable by scrolling it
        let scroller = false;
        for (let p = el.parentElement; p && p !== root; p = p.parentElement) {
          const s = getComputedStyle(p);
          if (/(auto|scroll)/.test(s.overflowX + s.overflowY)) scroller = true;
        }
        if (scroller) continue;
        if (
          b.left < rb.left - 1 ||
          b.top < rb.top - 1 ||
          b.right > rb.right + 1 ||
          b.bottom > rb.bottom + 1
        )
          out.push(
            `${el.tagName}.${el.className} "${el.textContent?.trim().slice(0, 20) ?? ""}"`,
          );
      }
      return {
        outer: [w.offsetWidth, w.offsetHeight],
        client: [root.clientWidth, root.clientHeight],
        menu: w.querySelector<HTMLElement>(".host-bar")!.offsetHeight,
        overflow: [
          root.scrollWidth - root.clientWidth,
          root.scrollHeight - root.clientHeight,
        ],
        clipped: out,
        title: w.querySelector(".bar .t")!.textContent,
        menus: [...w.querySelectorAll(".host-bar [role=menubar] button")].map(
          (b) => b.textContent,
        ),
      };
    }, id);
    const r = rects[id];
    console.log(
      `measured ${id}: outer ${r.x},${r.y} ${m.outer.join("x")} · client ${m.client.join("x")} (manifest ${r.client}) · demo h ${r.demoH} · menu row ${m.menu} · title "${m.title}" · menus ${m.menus.join(", ")} · overflow ${m.overflow.join(",")} · clipped ${m.clipped.length ? m.clipped.join("; ") : "none"}`,
    );
    expect(m.outer).toEqual([r.w, r.h]);
    expect(Math.abs(m.client[0] - app.window.width)).toBeLessThanOrEqual(1);
    expect(Math.abs(m.client[1] - app.window.height)).toBeLessThanOrEqual(1);
    expect(m.clipped).toEqual([]);
  }
  console.log(`proposed: ${JSON.stringify(rects)}`);
});
