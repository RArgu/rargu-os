// @vitest-environment node
// Spec 006 R1.a (counters and the 14-row cap) and R4.a (seeded) for the
// crawler's data module. The window itself is tested in the page (T3).
import { describe, expect, it } from "vitest";
import {
  HOSTS,
  PATHS,
  ROW_CAP,
  SEED,
  R1A_EXPECTED,
  STRATEGIES,
  addPage,
  crawl,
  crawlerStream,
  newCrawl,
  precision,
  r1aFixture,
  type Page,
} from "../../src/sheet/demos/crawler-data.ts";

/** The first n steps of the stream for a seed. */
function steps(seed: number, n: number): Page[][] {
  const it = crawlerStream(seed);
  return Array.from({ length: n }, () => it.next().value as Page[]);
}

// the mock's lists (docs/mockups/rargu-os-src/reused.js:71-73)
describe("mock lists", () => {
  it("has the mock's four strategies, 16 hosts and 15 paths", () => {
    expect(STRATEGIES).toEqual([
      "URL keywords",
      "static sim.",
      "adaptive sim.",
      "LLM judge",
    ]);
    expect(HOSTS).toHaveLength(16);
    expect(HOSTS).toContain("shop.example.com");
    expect(PATHS).toHaveLength(15);
    expect(PATHS).toContain("blog/top-10-gadgets");
  });
});

describe("R1.a fixture stream: precision = relevant ÷ processed", () => {
  // The shared fixture (also for the T3 e2e): every step has one page per
  // column; in each 10 steps column c has c + 3 relevant pages.
  it("10 steps: exact precision per column and a footer of 40", () => {
    const run = crawl(r1aFixture(10));
    for (let i = 0; i < 10; i++) expect(run.step()).toBe(true);
    expect(run.step()).toBe(false); // the fixture has ended
    const { cols } = run;
    expect(cols.map((c) => precision(c))).toEqual([0.3, 0.4, 0.5, 0.6]);
    expect(cols.map((c) => [c.ok, c.n])).toEqual([
      [3, 10],
      [4, 10],
      [5, 10],
      [6, 10],
    ]);
    expect(cols.map((c) => c.rows.length)).toEqual([10, 10, 10, 10]);
    expect(run.total()).toBe(40);
    expect(R1A_EXPECTED[10]).toEqual({
      ok: [3, 4, 5, 6],
      n: [10, 10, 10, 10],
      precision: [0.3, 0.4, 0.5, 0.6],
      total: 40,
    });
  });

  it("200 steps: 14 rows per column, counters at the fixture totals", () => {
    const run = crawl(r1aFixture(200));
    while (run.step());
    const { cols } = run;
    expect(ROW_CAP).toBe(14);
    expect(cols.map((c) => c.rows.length)).toEqual([14, 14, 14, 14]);
    expect(cols.map((c) => [c.ok, c.n])).toEqual([
      [60, 200],
      [80, 200],
      [100, 200],
      [120, 200],
    ]);
    expect(cols.map((c) => precision(c))).toEqual([0.3, 0.4, 0.5, 0.6]);
    expect(run.total()).toBe(800);
    expect(R1A_EXPECTED[200]).toEqual({
      ok: [60, 80, 100, 120],
      n: [200, 200, 200, 200],
      precision: [0.3, 0.4, 0.5, 0.6],
      total: 800,
    });
    // newest first: the fixture's last 14 pages of each column, reversed
    const all = [...r1aFixture(200)].flat();
    for (const [i, c] of cols.entries())
      expect(c.rows).toEqual(
        all
          .filter((p) => p.col === i)
          .slice(-14)
          .reverse(),
      );
  });

  it("uses the mock's lists in the fixture", () => {
    for (const step of r1aFixture(10)) {
      expect(step.map((p) => p.col)).toEqual([0, 1, 2, 3]);
      for (const p of step) {
        expect(HOSTS).toContain(p.host);
        expect(PATHS).toContain(p.path);
      }
    }
  });

  it("has no precision before the first page", () => {
    expect(crawl(r1aFixture(1)).cols.map((c) => precision(c))).toEqual([
      null,
      null,
      null,
      null,
    ]);
  });

  it("defaults to the seeded stream; counters match it after 200 steps", () => {
    const run = crawl();
    const seen = [0, 1, 2, 3].map(() => ({ ok: 0, n: 0, pages: [] as Page[] }));
    for (const step of steps(SEED, 200)) {
      expect(run.step()).toBe(true);
      for (const p of step) {
        seen[p.col].n++;
        seen[p.col].ok += p.ok ? 1 : 0;
        seen[p.col].pages.push(p);
      }
    }
    for (const [i, c] of run.cols.entries()) {
      expect(c.rows).toEqual(seen[i].pages.slice(-14).reverse());
      expect([c.ok, c.n]).toEqual([seen[i].ok, seen[i].n]);
    }
    expect(run.total()).toBe(seen.reduce((s, c) => s + c.n, 0));
  });
});

describe("generated pages", () => {
  it("use the mock's lists, a valid column and a score in [0, 1]", () => {
    for (const step of steps(SEED, 200)) {
      expect(step.length).toBeLessThanOrEqual(4);
      for (const p of step) {
        expect(HOSTS).toContain(p.host);
        expect(PATHS).toContain(p.path);
        expect([0, 1, 2, 3]).toContain(p.col);
        expect(p.score).toBeGreaterThanOrEqual(0);
        expect(p.score).toBeLessThanOrEqual(1);
        // relevant pages score ≥ 0.60, rejected pages ≤ 0.50 (as in the mock)
        if (p.ok) expect(p.score).toBeGreaterThanOrEqual(0.6);
        else expect(p.score).toBeLessThanOrEqual(0.5);
      }
    }
  });

  // pinned so that a change to the generator is seen
  it(`seed ${SEED}: pinned output`, () => {
    const s = steps(SEED, 200);
    expect(s.slice(0, 2)).toEqual(PINNED_FIRST_TWO);
    const cols = newCrawl();
    for (const step of s) for (const p of step) addPage(cols, p);
    expect(cols.map((c) => [c.ok, c.n])).toEqual(PINNED_COUNTS_200);
  });
});

describe("R4.a seeded", () => {
  it("same seed twice gives equal output", () => {
    expect(steps(SEED, 100)).toEqual(steps(SEED, 100));
  });
  it("another seed gives different output", () => {
    expect(steps(SEED + 1, 100)).not.toEqual(steps(SEED, 100));
  });
});

const PINNED_FIRST_TWO: Page[][] = [
  [
    {
      col: 2,
      ok: true,
      score: 0.79,
      host: "medium.com",
      path: "folding-at-home",
    },
  ],
  [
    {
      col: 0,
      ok: true,
      score: 0.91,
      host: "medium.com",
      path: "structure-prediction",
    },
    {
      col: 1,
      ok: true,
      score: 0.81,
      host: "en.wikipedia.org",
      path: "cryo-em-vs-ml",
    },
    {
      col: 3,
      ok: true,
      score: 0.66,
      host: "en.wikipedia.org",
      path: "about-us",
    },
  ],
];
// [relevant, processed] per column after 200 steps
const PINNED_COUNTS_200: [number, number][] = [
  [46, 112],
  [69, 115],
  [74, 113],
  [89, 115],
];
