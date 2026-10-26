// @vitest-environment node
// Spec 006 R8.a: composited contrast of the data demos' text (crawler rows ✓
// and ✗, the column heads, the flagged list, the chart's canvas text) in both
// themes, against 001 R18 (4.5:1 normal text, 3:1 large text ≥ 24 px).
//
// Each measured text is a modelled element chain, from <html> to the text
// element, as the page builds it (index.html, scripts/sheet-content.ts, and
// the demo markup T3/T4 must follow). Every rule of src/sheet/sheet.css and
// src/sheet/demos/*.css that matches an element of the chain takes part: the
// cascade (specificity, then source order; the sheets in the order the page
// imports them, see cssOrder) gives one colour, one opacity and one background per
// element; colour and custom properties inherit. The text pixel and the
// background pixel are then painted with group opacity, in sRGB as the
// browser paints, and the WCAG 2 ratio is taken. The test also fails when the
// painted background or the text's total opacity differs from the table, so a
// new background or opacity anywhere on the chain must be added here.
// Media queries are taken as true; state pseudo-classes and :not() as
// matching; tokens come from the :root blocks of sheet.css (light, dark).
// Kept apart from the 001 table (tests/unit/sheet-content.test.ts) for now.
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

/** premultiplied RGBA, 0–255 per channel and alpha 0–1; unknown = a layer
 * this test cannot model (a gradient or an image) shows through */
interface Px {
  r: number;
  g: number;
  b: number;
  a: number;
  unknown: boolean;
}
const CLEAR: Px = { r: 0, g: 0, b: 0, a: 0, unknown: false };

function parseColor(v: string): [number, number, number, number] {
  const hex = /^#([0-9a-f]{6})$/i.exec(v);
  if (hex)
    return [
      parseInt(hex[1].slice(0, 2), 16),
      parseInt(hex[1].slice(2, 4), 16),
      parseInt(hex[1].slice(4, 6), 16),
      1,
    ];
  const rgba = /^rgba?\(([^)]*)\)$/i.exec(v);
  if (rgba) {
    const n = rgba[1].split(",").map((s) => parseFloat(s));
    return [n[0], n[1], n[2], n[3] ?? 1];
  }
  if (v === "transparent") return [0, 0, 0, 0];
  throw new Error(`not a colour: ${v}`);
}
const px = (v: string): Px => {
  const [r, g, b, a] = parseColor(v);
  return { r: r * a, g: g * a, b: b * a, a, unknown: false };
};
/** src over dst, premultiplied */
const over = (s: Px, d: Px): Px => ({
  r: s.r + d.r * (1 - s.a),
  g: s.g + d.g * (1 - s.a),
  b: s.b + d.b * (1 - s.a),
  a: s.a + d.a * (1 - s.a),
  unknown: s.a >= 1 ? s.unknown : s.unknown || d.unknown,
});
const fade = (p: Px, k: number): Px => ({
  r: p.r * k,
  g: p.g * k,
  b: p.b * k,
  a: p.a * k,
  unknown: p.unknown,
});

function luminance(p: Px): number {
  const [r, g, b] = [p.r, p.g, p.b].map((x) => {
    const s = x / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: Px, b: Px): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// ---- the theme tokens ----
const decls = (block: string) =>
  Object.fromEntries(
    [...block.matchAll(/([\w-]+)\s*:\s*([^;]+);?/g)].map((d) => [
      d[1],
      d[2].trim(),
    ]),
  );
function themes(): Record<"light" | "dark", Record<string, string>> {
  const css = read("src/sheet/sheet.css");
  const light = decls(/:root\s*\{([^}]*)\}/.exec(css)![1]);
  const dark = decls(
    /prefers-color-scheme:\s*dark\)\s*\{\s*:root\s*\{([^}]*)\}/.exec(css)![1],
  );
  const strip = (o: Record<string, string>) =>
    Object.fromEntries(Object.entries(o).map(([k, v]) => [k.slice(2), v]));
  return { light: strip(light), dark: strip({ ...light, ...dark }) };
}

// ---- rules and a small selector matcher ----
interface Rule {
  sel: string;
  spec: number;
  order: number;
  decl: Record<string, string>;
}
interface El {
  tag: string;
  id?: string;
  cls?: string[];
  attrs?: Record<string, string>;
  /** canvas drawing: colours of custom properties, bottom first */
  draws?: string[];
}

function rulesOf(files: string[]): Rule[] {
  const out: Rule[] = [];
  for (const css of files) {
    const flat = css.replace(/\/\*[\s\S]*?\*\//g, "");
    for (const m of flat.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const d = decls(m[2]);
      for (const raw of m[1].split(",")) {
        const sel = raw.trim().replace(/\s+/g, " ");
        // tokens come from themes(); at-rule bodies are not elements
        if (!sel || sel.startsWith("@") || sel === ":root") continue;
        if (/^(from|to|\d+%)$/.test(sel)) continue; // @keyframes steps
        if (/[>+~]/.test(sel))
          throw new Error(`combinator not modelled, extend the test: ${sel}`);
        const parts = sel.split(" ");
        let spec = 0;
        for (const p of parts) {
          spec += 10000 * (p.match(/#[\w-]+/g)?.length ?? 0);
          spec +=
            100 *
            ((p.match(/\.[\w-]+|\[[^\]]*\]/g)?.length ?? 0) +
              (p.replace(/::[\w-]+/g, "").match(/:[\w-]+/g)?.length ?? 0));
          spec += /^[a-z]/i.test(p) ? 1 : 0;
        }
        out.push({ sel, spec, order: out.length, decl: d });
      }
    }
  }
  return out;
}

function compound(part: string, el: El): boolean {
  // pseudo-elements and state pseudo-classes: taken as matching
  const p = part
    .replace(/:not\([^)]*\)/g, "")
    .replace(/::?[\w-]+(\([^)]*\))?/g, (s) => (s === ":root" ? s : ""));
  if (p.includes(":root") && el.tag !== "html") return false;
  const tag = /^([a-z][\w-]*|\*)/i.exec(p)?.[1];
  if (tag && tag !== "*" && tag !== el.tag) return false;
  for (const [, id] of p.matchAll(/#([\w-]+)/g)) if (el.id !== id) return false;
  for (const [, c] of p.matchAll(/\.([\w-]+)/g))
    if (!el.cls?.includes(c)) return false;
  for (const [, k, v] of p.matchAll(/\[([\w-]+)(?:="?([^"\]]*)"?)?\]/g)) {
    const have = el.attrs?.[k];
    if (have === undefined || (v !== undefined && have !== v)) return false;
  }
  return true;
}
/** descendant combinators only (rulesOf rejects the others) */
function matches(sel: string, chain: El[], i: number): boolean {
  const parts = sel.split(" ");
  if (!compound(parts[parts.length - 1], chain[i])) return false;
  let j = i - 1;
  for (let k = parts.length - 2; k >= 0; k--) {
    while (j >= 0 && !compound(parts[k], chain[j])) j--;
    if (j < 0) return false;
    j--;
  }
  return true;
}

/** computed values per element: the cascade, then inheritance */
function computed(rules: Rule[], theme: Record<string, string>, chain: El[]) {
  const out: {
    vars: Record<string, string>;
    color: string;
    opacity: number;
    bg: string[];
  }[] = [];
  const parentVars: Record<string, string> = Object.fromEntries(
    Object.entries(theme).map(([k, v]) => [`--${k}`, v]),
  );
  let parentColor = "#000000";
  let vars = parentVars;
  for (let i = 0; i < chain.length; i++) {
    const win = rules
      .filter((r) => matches(r.sel, chain, i))
      .sort((a, b) => a.spec - b.spec || a.order - b.order);
    const get = (prop: string) => {
      let v: string | undefined;
      for (const r of win) if (r.decl[prop] !== undefined) v = r.decl[prop];
      return v;
    };
    const own: Record<string, string> = {};
    for (const r of win)
      for (const [k, v] of Object.entries(r.decl))
        if (k.startsWith("--")) own[k] = v;
    vars = { ...vars, ...own };
    const resolve = (v: string): string => {
      for (let n = 0; n < 10 && v.includes("var("); n++)
        v = v.replace(/var\((--[\w-]+)\)/g, (_, k: string) => {
          if (vars[k] === undefined) throw new Error(`${k} is not defined`);
          return vars[k];
        });
      return v.trim();
    };
    for (const k of Object.keys(vars)) vars[k] = resolve(vars[k]);
    const color = resolve(get("color") ?? parentColor);
    // one background colour and the image layer per element, by cascade
    let bgColor: string | undefined;
    let image: string | undefined;
    for (const r of win) {
      const short = r.decl.background;
      if (short !== undefined) {
        const v = resolve(short);
        image = /gradient|url\(/.test(v) ? v : undefined;
        bgColor = image ? undefined : v;
      }
      if (r.decl["background-color"] !== undefined)
        bgColor = resolve(r.decl["background-color"]);
      if (r.decl["background-image"] !== undefined)
        image = resolve(r.decl["background-image"]);
    }
    const bg: string[] = [];
    if (bgColor && bgColor !== "none") bg.push(bgColor);
    if (image && image !== "none") bg.push("image");
    for (const prop of ["filter", "mix-blend-mode", "backdrop-filter"])
      if (get(prop) !== undefined && get(prop) !== "none")
        throw new Error(`${prop} on ${chain[i].tag} is not modelled`);
    out.push({
      vars,
      color,
      opacity: parseFloat(get("opacity") ?? "1"),
      bg,
    });
    parentColor = color;
  }
  return out;
}

/** paints the chain; with text, the last element's text on top */
function paint(c: ReturnType<typeof computed>, chain: El[], text: boolean): Px {
  const layer = (v: string): Px =>
    v === "image" ? { ...CLEAR, a: 0, unknown: true } : px(v);
  const group = (i: number): Px => {
    let buf = CLEAR;
    for (const b of c[i].bg) buf = over(layer(b), buf);
    for (const d of chain[i].draws ?? []) buf = over(layer(c[i].vars[d]), buf);
    if (i + 1 < chain.length) buf = over(group(i + 1), buf);
    else if (text) {
      const fg = chain[i].draws
        ? c[i].vars[TEXT_VAR.get(chain[i])!]
        : c[i].color;
      buf = over(px(fg), buf);
    }
    return fade(buf, c[i].opacity);
  };
  return group(0);
}
const TEXT_VAR = new Map<El, string>();

// ---- the page's element chains ----
const PAGE: El[] = [
  { tag: "html" },
  { tag: "body" },
  { tag: "main", id: "vp" },
  { tag: "div", id: "sizer" },
  { tag: "div", id: "world" },
];
const win = (id: string): El => ({
  tag: "section",
  cls: ["sheet-win"],
  attrs: { "data-win": id, role: "region" },
});
const CRAWL: El[] = [
  ...PAGE,
  win("crawler"),
  { tag: "div", cls: ["demo-area", "crawl-demo"] },
  { tag: "div", cls: ["crawl"] },
  { tag: "div", cls: ["col"] },
];
const LI: El = { tag: "li" };
const NO: El = { tag: "li", cls: ["no"] };
const I: El = { tag: "i" };
const INS: El[] = [
  ...PAGE,
  win("insider"),
  { tag: "div", cls: ["demo-area", "ins-demo"] },
  { tag: "div", cls: ["ins"] },
];
const canvas = (text: string): El => {
  const el: El = { tag: "canvas", draws: ["--chart-bg"] };
  if (text === "--chart-spike") el.draws!.push("--chart-band");
  TEXT_VAR.set(el, text);
  return el;
};

interface Style {
  name: string;
  chain: El[];
  /** the painted background the table expects: a token */
  bg: string;
  /** canvas text: the background is drawn, not a token */
  drawn?: boolean;
  /** the text's total opacity (colour alpha × every element's opacity) */
  alpha?: number;
  min: number;
}

// every text style of the two demos; all are below 24 px, so 4.5:1
const STYLES: Style[] = [
  {
    name: "✓ row",
    chain: [...CRAWL, { tag: "ul" }, LI],
    bg: "win-bg",
    min: 4.5,
  },
  {
    name: "✓ row score",
    chain: [...CRAWL, { tag: "ul" }, LI, I],
    bg: "win-bg",
    min: 4.5,
  },
  {
    name: "✗ row",
    chain: [...CRAWL, { tag: "ul" }, NO],
    bg: "win-bg",
    min: 4.5,
  },
  {
    name: "✗ row score",
    chain: [...CRAWL, { tag: "ul" }, NO, I],
    bg: "win-bg",
    min: 4.5,
  },
  {
    name: "column head",
    chain: [...CRAWL, { tag: "h4" }, { tag: "span" }],
    bg: "paper-2",
    min: 4.5,
  },
  {
    name: "crawler R3 note",
    // in the demo area, under the columns
    chain: [...CRAWL.slice(0, -2), { tag: "p", cls: ["note"] }],
    bg: "win-bg",
    min: 4.5,
  },
  {
    name: "crawler footer",
    // below the demo area, as in the mock (part1.html .wfoot)
    chain: [
      ...PAGE,
      win("crawler"),
      { tag: "div", cls: ["wfoot"] },
      { tag: "span", cls: ["cr-stat"] },
    ],
    bg: "paper-2",
    min: 4.5,
  },
  {
    name: "flagged trade",
    chain: [...INS, { tag: "div", cls: ["flags"] }, { tag: "div" }],
    bg: "win-bg",
    min: 4.5,
  },
  {
    name: "flagged wallet",
    chain: [
      ...INS,
      { tag: "div", cls: ["flags"] },
      { tag: "div" },
      { tag: "b" },
    ],
    bg: "win-bg",
    min: 4.5,
  },
  {
    name: "chart axis labels (canvas)",
    chain: [...INS, canvas("--chart-axis")],
    bg: "win-bg",
    drawn: true,
    min: 4.5,
  },
  {
    name: "chart spike label (canvas, on the spike band)",
    chain: [...INS, canvas("--chart-spike")],
    bg: "win-bg",
    drawn: true,
    min: 4.5,
  },
  {
    name: "insider R3 note",
    // in the demo area, under the chart and the list
    chain: [...INS.slice(0, -1), { tag: "p", cls: ["note"] }],
    bg: "win-bg",
    min: 4.5,
  },
  {
    name: "insider list placeholder (during a run)",
    chain: [
      ...INS,
      { tag: "div", cls: ["flags"] },
      { tag: "span", cls: ["note"] },
    ],
    bg: "win-bg",
    min: 4.5,
  },
  {
    name: "insider footer",
    chain: [
      ...INS.slice(0, -2),
      { tag: "div", cls: ["wfoot"] },
      { tag: "span" },
    ],
    bg: "paper-2",
    min: 4.5,
  },
];

/** The page's stylesheets in the order the browser applies them: the CSS
 * imports met walking the module graph from src/sheet/main.ts depth first,
 * each import in source order, each module and sheet once (the order Vite
 * puts them in the built CSS). Type-only and virtual imports are skipped. */
function cssOrder(entry = "src/sheet/main.ts"): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const walk = (file: string) => {
    if (seen.has(file)) return;
    seen.add(file);
    const src = read(file).replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "");
    for (const [, spec] of src.matchAll(
      /^\s*import\s+(?!type\b)(?:[^"';]*?\bfrom\s+)?["']([^"']+)["']/gm,
    )) {
      if (!spec.startsWith(".")) continue;
      const to = join(file, "..", spec);
      if (to.endsWith(".css")) {
        if (!seen.has(to)) out.push(to);
        seen.add(to);
      } else walk(to.endsWith(".ts") ? to : `${to}.ts`);
    }
  };
  walk(entry);
  return out;
}
const DEMOS = "src/sheet/demos/demos.css";
/** the page's sheets, `over` replacing a sheet's text */
const sheets = (over: Record<string, string> = {}) =>
  cssOrder().map((p) => over[p] ?? read(p));

function measure(
  demosCss: string,
  theme: Record<string, string>,
  s: Style,
  over: Record<string, string> = {},
) {
  const rules = rulesOf(sheets({ ...over, [DEMOS]: demosCss }));
  const c = computed(rules, theme, s.chain);
  const bg = paint(c, s.chain, false);
  const fg = paint(c, s.chain, true);
  expect(bg.unknown, `${s.name}: an unmodelled background image shows`).toBe(
    false,
  );
  expect(bg.a, `${s.name}: opaque page`).toBeCloseTo(1, 6);
  const last = c[c.length - 1];
  const textColor = s.drawn
    ? last.vars[TEXT_VAR.get(s.chain[s.chain.length - 1])!]
    : last.color;
  const alpha = parseColor(textColor)[3] * c.reduce((a, e) => a * e.opacity, 1);
  return { ratio: contrast(fg, bg), bg, alpha };
}
const same = (a: Px, b: Px) =>
  Math.abs(a.r - b.r) + Math.abs(a.g - b.g) + Math.abs(a.b - b.b) < 0.01;

const demos = () => read(DEMOS);

/** the failures of one demos.css in one theme */
function failures(
  css: string,
  theme: Record<string, string>,
  over: Record<string, string> = {},
): string[] {
  const out: string[] = [];
  for (const s of STYLES) {
    const m = measure(css, theme, s, over);
    if (m.ratio < s.min) out.push(`${s.name} ${m.ratio.toFixed(2)}:1`);
    if (!s.drawn && !same(m.bg, px(theme[s.bg])))
      out.push(`${s.name}: background is not --${s.bg}`);
    if (Math.abs(m.alpha - (s.alpha ?? 1)) > 1e-9)
      out.push(`${s.name}: opacity ${m.alpha}`);
  }
  return out;
}

describe("R8.a demo text contrast (composited)", () => {
  for (const [theme, t] of Object.entries(themes()))
    for (const s of STYLES)
      it(`${theme}: ${s.name} ≥ ${s.min}:1, on --${s.bg}, opacity ${s.alpha ?? 1}`, () => {
        const m = measure(demos(), t, s);
        expect(
          m.ratio,
          `${theme} ${s.name} = ${m.ratio.toFixed(2)}:1`,
        ).toBeGreaterThanOrEqual(s.min);
        if (!s.drawn)
          expect(same(m.bg, px(t[s.bg])), `background is --${s.bg}`).toBe(true);
        expect(m.alpha).toBeCloseTo(s.alpha ?? 1, 9);
      });

  it("rejected rows keep the strike-through", () => {
    const r = rulesOf([demos()]).find(
      (r) => r.sel === ".crawl-demo .col li.no",
    );
    expect(r?.decl["text-decoration"]).toMatch(/line-through/);
  });

  it("every stylesheet of the sheet takes part, sheet.css first", () => {
    const order = cssOrder();
    expect(order[0]).toBe("src/sheet/sheet.css");
    const demoSheets = readdirSync(join(root, "src/sheet/demos"))
      .filter((f) => f.endsWith(".css"))
      .map((f) => `src/sheet/demos/${f}`);
    expect([...order].sort()).toEqual(
      // 013: readme.css, the Read panel and diagram
      ["src/sheet/sheet.css", "src/sheet/readme.css", ...demoSheets].sort(),
    );
  });

  it("no keyframes in demos.css fade text", () => {
    expect(demos()).not.toMatch(/@keyframes[^{]*\{[^}]*\{[^}]*opacity/);
  });
});

// the test itself: each of these must fail
describe("R8.a the check catches", () => {
  const { light, dark } = themes();
  const NO_SEL = ".crawl-demo .col li.no";

  it("the mock's rejected-row opacity: 2.62:1 light, 3.75:1 dark", () => {
    // the mock: rows inherit --ink, rejected rows at opacity .45
    const mock = demos()
      .replace(
        /\.crawl-demo \.col li\.no \{[^}]*\}/,
        `${NO_SEL} { opacity: 0.45; }`,
      )
      .replace(/\.crawl-demo \.col li\.no i \{[^}]*\}/, "");
    expect(mock).not.toMatch(/--ink-dim\);\s*text-decoration/);
    const ex = STYLES[2];
    expect(measure(mock, light, ex).ratio).toBeCloseTo(2.62, 2);
    expect(measure(mock, dark, ex).ratio).toBeCloseTo(3.75, 2);
    expect(failures(mock, light)).toEqual(
      expect.arrayContaining(["✗ row 2.62:1", "✗ row score 2.38:1"]),
    );
    expect(failures(mock, dark)).toEqual(
      expect.arrayContaining(["✗ row 3.75:1", "✗ row score 2.17:1"]),
    );
  });

  it("a background on the rejected row", () => {
    const css = demos().replace(
      `${NO_SEL} {`,
      `${NO_SEL} {\n  background: var(--ink-dim);`,
    );
    expect(css).not.toBe(demos());
    for (const t of [light, dark])
      expect(failures(css, t)).toContain("✗ row: background is not --win-bg");
  });

  it("a background on a shared ancestor (sheet.css .demo-area)", () => {
    const css = `${demos()}\n.demo-area { background: var(--paper-2); }`;
    expect(failures(css, light)).toContain("✓ row: background is not --win-bg");
  });

  it("a later sheet's rule wins over demos.css (insider.css after it)", () => {
    // main.ts imports crawler.ts (crawler.css, demos.css) before insider.ts
    const ins = "src/sheet/demos/insider.css";
    const order = cssOrder();
    expect(order.indexOf(ins)).toBeGreaterThan(order.indexOf(DEMOS));
    const over = {
      [ins]: `${read(ins)}\n.ins-demo .flags b { color: var(--win-bg); }`,
    };
    for (const t of [light, dark])
      expect(failures(demos(), t, over)).toContain("flagged wallet 1.00:1");
  });

  it("one opacity per element: the cascade winner, not a product", () => {
    // two rules match the rejected row; the later one wins: 0.9, not 0.81
    const css = `${demos()}\n.col li.no { opacity: 0.5; }\n${NO_SEL} { opacity: 0.9; }`;
    expect(measure(css, light, STYLES[2]).alpha).toBeCloseTo(0.9, 9);
    // and across elements it multiplies: the row's score inherits the fade
    expect(measure(css, light, STYLES[3]).alpha).toBeCloseTo(0.9, 9);
    expect(failures(css, light)).toContain("✗ row: opacity 0.9");
  });
});
