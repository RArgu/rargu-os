// Spec 006 R6 (unmount): the insider window's mount and unmount on a DOM
// (jsdom) with fake timers. Nothing in the page unmounts a window yet, so the
// module's own unmount is tested here; the run itself is tested in the page
// (tests/e2e/insider.spec.ts). The markup is the build's own
// (scripts/sheet-content.ts).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount, show, unmount } from "../../src/sheet/demos/insider.ts";
import { INSIDER_REPLAY, insiderArea } from "../../scripts/sheet-content.ts";
import {
  flagged,
  insiderMarket,
  SEED,
} from "../../src/sheet/demos/insider-data.ts";

// jsdom has no canvas: a 2D context that takes every call and does nothing
const noop: object = new Proxy(() => noop, {
  get: (_, k) => (k === "then" ? undefined : noop),
  set: () => true,
  apply: () => noop,
});

let win: HTMLElement;
/** every listener added to a media query: query, signal */
let heard: { q: string; signal?: AbortSignal }[] = [];
const replay = () => win.querySelector<HTMLButtonElement>(".ins-replay")!;
const foot = () => win.querySelector(".ins-t")!.textContent;
const shown = () =>
  [...win.querySelectorAll<HTMLElement>(".flags > div")].filter(
    (d) => !d.hidden,
  ).length;
const N = flagged(insiderMarket(SEED)).length;

beforeEach(() => {
  vi.useFakeTimers();
  heard = [];
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: false,
    media: q,
    addEventListener(_: string, __: unknown, o?: { signal?: AbortSignal }) {
      heard.push({ q, signal: o?.signal });
    },
    removeEventListener() {},
  }));
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
    noop as CanvasRenderingContext2D,
  );
  win = document.createElement("section");
  win.className = "sheet-win";
  win.dataset.win = "insider";
  win.innerHTML = `<div class="bar">${INSIDER_REPLAY}<button type="button" class="home">⌂</button></div>${insiderArea(280)}`;
  document.body.append(win);
});
afterEach(() => {
  unmount();
  show(false);
  win.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("R6 insider mount and unmount", () => {
  it("before mount the full list shows and Replay is hidden", () => {
    expect(shown()).toBe(N);
    expect(foot()).toBe("t = 159h of 160h");
    expect(replay().hidden).toBe(true);
  });

  it("mount shows Replay; the first visible plays from hour 0", () => {
    mount(win.querySelector(".demo-area")!);
    expect(replay().hidden).toBe(false);
    expect(shown()).toBe(N);
    show(true);
    expect(foot()).toBe("t = 0h of 160h");
    expect(shown()).toBe(0);
    expect(vi.getTimerCount()).toBe(1);
  });

  it("unmount mid-run cancels every pending callback and leaves the full list", () => {
    mount(win.querySelector(".demo-area")!);
    show(true);
    vi.advanceTimersByTime(1000);
    expect(foot()).not.toBe("t = 0h of 160h");
    unmount();
    expect(vi.getTimerCount()).toBe(0);
    // the resolution and reduced-motion listeners go with it
    expect(heard.some((h) => h.q.includes("resolution"))).toBe(true);
    expect(heard.every((h) => h.signal?.aborted)).toBe(true);
    expect(replay().hidden).toBe(true);
    expect(shown()).toBe(N);
    const t = foot();
    vi.advanceTimersByTime(10000);
    expect(foot()).toBe(t);
    // Replay does nothing after unmount
    replay().dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(vi.getTimerCount()).toBe(0);
    expect(foot()).toBe(t);
  });
});
