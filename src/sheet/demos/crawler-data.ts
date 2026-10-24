// Spec 006 R1, R4: the crawler demo's simulated pages, seeded. Ported from
// the mock (docs/mockups/rargu-os-src/reused.js:71-78) with Math.random
// replaced by a seeded generator. Pure: no DOM, no clock.
//
// crawlerStream(seed) yields one step at a time: the pages that arrive in
// that step (each column gets a page with probability 0.55, as in the mock).
// addPage() puts a page into the column counters and keeps at most ROW_CAP
// rows per column, newest first; the counters are cumulative.
// crawl(source) is the window's state: it takes its steps from source, the
// seeded stream by default. The R1.a fixture (r1aFixture) is a source with
// known ✓/✗ and literal totals (R1A_EXPECTED) for the unit test and the T3
// e2e. Only code passes a source; nothing a visitor does selects one.

export const STRATEGIES = [
  "URL keywords",
  "static sim.",
  "adaptive sim.",
  "LLM judge",
] as const;
/** chance that a page is relevant, per strategy (the mock's values) */
const HIT = [0.38, 0.55, 0.64, 0.82];
export const HOSTS = [
  "nature.com",
  "biorxiv.org",
  "pubmed.ncbi.nlm.nih.gov",
  "en.wikipedia.org",
  "deepmind.google",
  "rcsb.org",
  "arxiv.org",
  "github.com",
  "sciencedirect.com",
  "news.ycombinator.com",
  "reddit.com",
  "medium.com",
  "foldit.org",
  "ebi.ac.uk",
  "cell.com",
  "shop.example.com",
];
export const PATHS = [
  "alphafold-3",
  "protein-folding",
  "casp15-results",
  "structure-prediction",
  "rosettafold",
  "cryo-em-vs-ml",
  "pdb-entry-7xyz",
  "folding-at-home",
  "sequence-to-structure",
  "msa-transformer",
  "careers",
  "pricing",
  "login",
  "about-us",
  "blog/top-10-gadgets",
];
export const ROW_CAP = 14;
/** the demo's seed */
export const SEED = 7;

export interface Page {
  /** column index into STRATEGIES */
  col: number;
  /** ✓ relevant or ✗ rejected */
  ok: boolean;
  /** 0.60–1.00 when relevant, 0.00–0.50 when rejected; two decimals */
  score: number;
  host: string;
  path: string;
}
export interface Column {
  name: string;
  /** relevant pages so far */
  ok: number;
  /** processed pages so far */
  n: number;
  /** the last ROW_CAP pages, newest first */
  rows: Page[];
}

/** mulberry32: a small seeded PRNG, uniform in [0, 1) */
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function* crawlerStream(seed: number): Generator<Page[], never> {
  const rnd = prng(seed);
  const pick = <T>(list: readonly T[]) => list[Math.floor(rnd() * list.length)];
  for (;;) {
    const step: Page[] = [];
    for (let col = 0; col < STRATEGIES.length; col++) {
      if (rnd() < 0.45) continue;
      const host = pick(HOSTS);
      const path = pick(PATHS);
      const ok = rnd() < HIT[col];
      const raw = ok ? 0.6 + rnd() * 0.4 : rnd() * 0.5;
      step.push({ col, ok, score: Math.round(raw * 100) / 100, host, path });
    }
    yield step;
  }
}

export function newCrawl(): Column[] {
  return STRATEGIES.map((name) => ({ name, ok: 0, n: 0, rows: [] }));
}

/** Counts the page in its column and keeps the newest ROW_CAP rows. */
export function addPage(cols: Column[], p: Page): void {
  const c = cols[p.col];
  c.n++;
  if (p.ok) c.ok++;
  c.rows.unshift(p);
  if (c.rows.length > ROW_CAP) c.rows.length = ROW_CAP;
}

/** relevant ÷ processed; null before the first page */
export const precision = (c: { ok: number; n: number }): number | null =>
  c.n ? c.ok / c.n : null;

/** the footer: processed pages over all strategies */
export const total = (cols: Column[]): number =>
  cols.reduce((s, c) => s + c.n, 0);

/** The window's state over a source of steps. */
export function crawl(source: Iterator<Page[]> = crawlerStream(SEED)) {
  const cols = newCrawl();
  return {
    cols,
    /** takes the next step; false when a finite source has ended */
    step(): boolean {
      const next = source.next();
      if (next.done) return false;
      for (const p of next.value) addPage(cols, p);
      return true;
    },
    total: () => total(cols),
  };
}

/** R1.a fixture: `steps` steps of one page per column; in each 10 steps,
 * column c has c + 3 relevant pages (precision 0.3, 0.4, 0.5, 0.6). */
export function* r1aFixture(steps: number): Generator<Page[], void> {
  for (let i = 0; i < steps; i++)
    yield STRATEGIES.map((_, col) => {
      const ok = i % 10 < col + 3;
      return {
        col,
        ok,
        score: ok ? 0.9 : 0.1,
        host: HOSTS[(i + col) % HOSTS.length],
        path: PATHS[(i * 4 + col) % PATHS.length],
      };
    });
}

/** r1aFixture's totals after 10 and 200 steps, written out */
export const R1A_EXPECTED = {
  10: {
    ok: [3, 4, 5, 6],
    n: [10, 10, 10, 10],
    precision: [0.3, 0.4, 0.5, 0.6],
    total: 40,
  },
  200: {
    ok: [60, 80, 100, 120],
    n: [200, 200, 200, 200],
    precision: [0.3, 0.4, 0.5, 0.6],
    total: 800,
  },
} as const;
