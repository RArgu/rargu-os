// Spec 006 R1.a, R6 (unmount): the crawler window's mount on a DOM (jsdom)
// with fake timers, fed the R1.a fixture stream. The fixture goes in through
// mount's third argument, which only code passes: the page (main.ts) mounts
// with the seeded stream, and nothing a visitor does selects a source. The
// markup is the build's own (scripts/sheet-content.ts). The seeded stream in
// the real page is tested in tests/e2e/crawler.spec.ts.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount, show, unmount } from "../../src/sheet/demos/crawler.ts";
import { r1aFixture } from "../../src/sheet/demos/crawler-data.ts";
import { CRAWLER_PAUSE, crawlerArea } from "../../scripts/sheet-content.ts";

let reduce = false;
let win: HTMLElement;
const area = () => win.querySelector<HTMLElement>(".demo-area")!;
const pause = () => win.querySelector<HTMLButtonElement>(".cr-pause")!;
const heads = () =>
  [...win.querySelectorAll(".col h4 span:last-child")].map(
    (s) => s.textContent,
  );
const rows = () =>
  [...win.querySelectorAll(".col ul")].map((u) =>
    [...u.querySelectorAll("li")].map((li) => ({
      text: li.textContent,
      no: li.classList.contains("no"),
    })),
  );
const footer = () => win.querySelector(".cr-stat")!.textContent!;

beforeEach(() => {
  vi.useFakeTimers();
  reduce = false;
  vi.stubGlobal("matchMedia", () => ({
    get matches() {
      return reduce;
    },
    addEventListener() {},
    removeEventListener() {},
  }));
  win = document.createElement("section");
  win.className = "sheet-win";
  win.dataset.win = "crawler";
  win.innerHTML = `<div class="bar">${CRAWLER_PAUSE}<button type="button" class="home">⌂</button></div>${crawlerArea(264)}`;
  document.body.append(win);
});
afterEach(() => {
  unmount();
  show(false);
  win.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("R1.a the crawler window over the fixture stream", () => {
  it("before mount: no rows, the R3 sentence, Pause hidden", () => {
    expect(rows().flat()).toEqual([]);
    expect(area().textContent).toContain(
      "Simulated demo. The interactive tool is planned and is not available here.",
    );
    expect(pause().hidden).toBe(true);
  });

  it("10 steps: each column's precision and rows, the footer 40", () => {
    mount(area(), undefined, r1aFixture(10));
    // literal: the fixture has 3, 4, 5, 6 relevant pages of 10 per column
    expect(heads()).toEqual(["30%", "40%", "50%", "60%"]);
    expect(footer()).toMatch(/^40 pages\b/);
    const fixture = [...r1aFixture(10)];
    rows().forEach((col, c) => {
      expect(col).toHaveLength(10);
      // newest first, ✓/✗ and the score and host/path of each page
      expect(col).toEqual(
        fixture
          .map((step) => step[c])
          .reverse()
          .map((p) => ({
            text: `${p.ok ? "✓" : "✗"} ${p.score.toFixed(2)} ${p.host}/${p.path}`,
            no: !p.ok,
          })),
      );
      expect(col.filter((r) => !r.no)).toHaveLength(c + 3);
    });
    // a finite source: the next step finds its end and the chain stops
    show(true);
    vi.advanceTimersByTime(700);
    expect(vi.getTimerCount()).toBe(0);
    expect(footer()).toMatch(/^40 pages\b/);
  });

  it("200 steps: 14 rows per column and the counters still match", () => {
    mount(area(), undefined, r1aFixture(200));
    show(true);
    vi.advanceTimersByTime(700 * 190);
    expect(heads()).toEqual(["30%", "40%", "50%", "60%"]);
    expect(footer()).toMatch(/^800 pages\b/);
    for (const col of rows()) expect(col).toHaveLength(14);
    vi.advanceTimersByTime(700);
    expect(vi.getTimerCount(), "the source has ended").toBe(0);
    expect(footer()).toMatch(/^800 pages\b/);
  });

  it("one step per 700 ms while visible, none while not", () => {
    mount(area(), undefined, r1aFixture(200));
    expect(vi.getTimerCount(), "not visible yet").toBe(0);
    show(true);
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(700 * 3);
    expect(footer()).toMatch(/^52 pages\b/);
    show(false);
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(5000);
    expect(footer()).toMatch(/^52 pages\b/);
    show(true);
    vi.advanceTimersByTime(700);
    expect(footer()).toMatch(/^56 pages\b/);
  });

  it("Pause and Resume: the name matches the action; Pause stays", () => {
    mount(area(), undefined, r1aFixture(200));
    show(true);
    expect(pause().hidden).toBe(false);
    expect(pause().getAttribute("aria-label")).toBe("Pause");
    pause().click();
    expect(pause().getAttribute("aria-label")).toBe("Resume");
    expect(vi.getTimerCount()).toBe(0);
    show(false);
    show(true);
    expect(vi.getTimerCount(), "still paused").toBe(0);
    pause().click();
    expect(pause().getAttribute("aria-label")).toBe("Pause");
    expect(vi.getTimerCount()).toBe(1);
  });

  it("reduced motion: complete rows at once, no streaming", () => {
    reduce = true;
    mount(area(), undefined, r1aFixture(200));
    show(true);
    for (const col of rows()) expect(col).toHaveLength(14);
    expect(vi.getTimerCount()).toBe(0);
    const before = footer();
    vi.advanceTimersByTime(700 * 5);
    expect(footer()).toBe(before);
  });
});

describe("R6 unmount", () => {
  it("cancels every pending callback; Pause no longer acts", () => {
    mount(area(), undefined, r1aFixture(200));
    show(true);
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
    const before = footer();
    vi.advanceTimersByTime(5000);
    pause().click();
    expect(vi.getTimerCount()).toBe(0);
    expect(footer()).toBe(before);
  });
});
