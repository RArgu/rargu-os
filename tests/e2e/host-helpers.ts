// Spec 002 helpers for the app host e2e tests (not a spec file).
import type { Page, Route } from "@playwright/test";

/** sheet window id → hosted app id (002 R11) */
export const HOSTED: Record<string, string> = {
  castlesiege: "castlesiege",
  paint: "paint",
  music: "tracker",
  notes: "writer",
};

/**
 * The hosted windows (by window id) whose rectangle overlaps the view expanded
 * by half a view width and height on each side (002 R11), from the page's
 * screen boxes, independent of the host's own code. Rotation is ignored: a
 * window at rest has none.
 */
export function eligible(page: Page): Promise<string[]> {
  return page.evaluate((ids) => {
    const vp = document.querySelector<HTMLElement>("#vp")!;
    const b = vp.getBoundingClientRect();
    const v = {
      x: b.left + vp.clientLeft,
      y: b.top + vp.clientTop,
      w: vp.clientWidth,
      h: vp.clientHeight,
    };
    const near = { x: v.x - v.w / 2, y: v.y - v.h / 2, w: v.w * 2, h: v.h * 2 };
    return ids.filter((id) => {
      const r = document
        .querySelector(`[data-win="${id}"]`)!
        .getBoundingClientRect();
      return (
        r.left < near.x + near.w &&
        near.x < r.right &&
        r.top < near.y + near.h &&
        near.y < r.bottom
      );
    });
  }, Object.keys(HOSTED));
}

/** main() calls per app id so far (test builds count them, 002 R11). */
export function mainCounts(page: Page): Promise<Record<string, number>> {
  return page.evaluate(() => ({
    ...((window as unknown as { __hostMain?: Record<string, number> })
      .__hostMain ?? {}),
  }));
}

/** The app id of an `app-<id>-<hash>.js|css` request, else null. */
export function appChunk(url: string): string | null {
  return (
    /\/app-(.+)-[\w-]{8}\.(?:js|css)$/.exec(new URL(url).pathname)?.[1] ?? null
  );
}

/** Waits until the page's idle work is done (no fixed sleep). */
export async function idle(page: Page): Promise<void> {
  await page.waitForLoadState("networkidle");
  await page.evaluate(
    // WebKit has no requestIdleCallback
    () =>
      new Promise((done) =>
        (window.requestIdleCallback ?? setTimeout)(() => done(null)),
      ),
  );
  await page.waitForLoadState("networkidle");
}

/**
 * The build's app-owned assets (test builds write `host-assets.json`): asset
 * URL path → the registered apps that load it (their own chunks, the shared
 * chunks and CSS only apps reach). Assets the sheet or the host load are not
 * in it.
 */
export async function appAssets(page: Page): Promise<Record<string, string[]>> {
  const res = await page.request.get("/host-assets.json");
  if (!res.ok()) throw new Error(`host-assets.json: ${res.status()}`);
  return (await res.json()) as Record<string, string[]>;
}

/** The requested app-owned assets whose apps are all outside `apps`. */
export function strayAssets(
  urls: string[],
  owned: Record<string, string[]>,
  apps: string[],
): string[] {
  return urls.filter((u) => {
    const owners = owned[new URL(u).pathname];
    return owners && !owners.some((a) => apps.includes(a));
  });
}

/**
 * Chooses a menu item on window `winId`'s menu row (002 R5) with real
 * clicks: the header, then each item of `path` (a submenu opens on hover).
 */
export async function chooseMenu(
  page: Page,
  winId: string,
  head: string,
  ...path: string[]
): Promise<void> {
  const win = page.locator(`[data-win="${winId}"]`);
  await win
    .locator('[role="menubar"]')
    .getByRole("button", { name: head, exact: true })
    .click();
  for (const [i, label] of path.entries()) {
    const row = win
      .locator(".menu")
      .nth(i)
      .locator(".menu-item", { hasText: label });
    if (i < path.length - 1) await row.hover();
    else await row.click();
  }
}

/** Holds the host chunk until the returned function is called. */
export async function holdHost(page: Page): Promise<() => Promise<void>> {
  const held: Route[] = [];
  let free = false;
  await page.route(/\/assets\/load-[^/]+\.js(\?.*)?$/, (route) =>
    free ? route.continue() : void held.push(route),
  );
  return async () => {
    free = true;
    for (const r of held.splice(0)) await r.continue();
  };
}
