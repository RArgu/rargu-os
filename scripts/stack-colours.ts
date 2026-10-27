// Spec 014: the stack chips' colours. content/stack-colours.json holds one
// entry per chip text: a sourced colour, a one-hop `same` (a parent's
// colour) or a neutral. Nothing here fetches anything: the colours were
// copied by hand with their sources (R7).
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
export const COLOURS = join(root, "content/stack-colours.json");

type Entry =
  | { colour: string; source: string; revision: string; detail: string }
  | { same: string; reason: string }
  | { neutral: true; reason: string };
/** A chip's colour: a hex value, or null for a neutral chip. */
export type Table = Map<string, string | null>;

/** Loads and checks the table (R1, R2); `fail` names the problem. */
export function loadColours(path = COLOURS): Table {
  const fail = (why: string): never => {
    throw new Error(`content/stack-colours.json: ${why}`);
  };
  let raw: Record<string, Entry>;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch (e) {
    return fail(`bad JSON (${(e as Error).message})`);
  }
  const text = (v: unknown) => typeof v === "string" && v.trim() !== "";
  const table: Table = new Map();
  for (const [name, e] of Object.entries(raw)) {
    if (name === "_meta") continue;
    if ("colour" in e) {
      if (!/^#[0-9a-fA-F]{6}$/.test(e.colour))
        fail(`"${name}" has a bad colour "${e.colour}"`);
      if (
        !["source", "revision", "detail"].every((k) =>
          text(e[k as keyof typeof e]),
        )
      )
        fail(`"${name}" needs source, revision and detail`);
      table.set(name, e.colour.toLowerCase());
    } else if ("neutral" in e) {
      if (e.neutral !== true || !text(e.reason))
        fail(`"${name}" neutral needs a reason`);
      table.set(name, null);
    } else if (!("same" in e) || !text(e.reason))
      fail(`"${name}" needs a colour, a "same" with a reason, or neutral`);
  }
  // one hop: a `same` points to an entry that has a colour
  for (const [name, e] of Object.entries(raw)) {
    if (name === "_meta" || !("same" in e)) continue;
    const to = raw[e.same];
    if (e.same === name || !to || !("colour" in to))
      fail(
        `"${name}" has "same": "${e.same}", which is no entry with a colour`,
      );
    table.set(name, table.get(e.same)!);
  }
  return table;
}

/** The colour of chip `name` in project file `file` (R2: an unknown chip
 * fails the build). */
export function colourOf(
  table: Table,
  name: string,
  file: string,
): string | null {
  if (!table.has(name))
    throw new Error(
      `${file}: the stack chip "${name}" has no entry in content/stack-colours.json`,
    );
  return table.get(name)!;
}

// ---- R3: the tint, in OKLCH (Björn Ottosson's OKLab, as in CSS Color 4) ----
type V3 = [number, number, number];
const toLin = (c: number) =>
  c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
const toGamma = (c: number) =>
  c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
const rgb = (hex: string): V3 =>
  [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as V3;

/** sRGB hex → OKLab [L, a, b]. */
export function oklab(hex: string): V3 {
  const [r, g, b] = rgb(hex).map(toLin);
  const [l, m, s] = [
    0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b,
    0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b,
    0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b,
  ].map(Math.cbrt);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}
/** OKLab → linear sRGB (may be out of gamut). */
function linear([L, a, b]: V3): V3 {
  const [l, m, s] = [
    L + 0.3963377774 * a + 0.2158037573 * b,
    L - 0.1055613458 * a - 0.0638541728 * b,
    L - 0.0894841775 * a - 1.291485548 * b,
  ].map((x) => x ** 3);
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}
const inGamut = (v: V3) => v.every((x) => x >= -1e-7 && x <= 1 + 1e-7);

/** The colour at lightness L and the brand's hue, chroma at most `cap`,
 * lowered (binary search, 30 steps) until it is in sRGB; bytes rounded. */
function at(hex: string, L: number, cap: number): string {
  const [, a, b] = oklab(hex);
  const h = Math.atan2(b, a);
  const lab = (c: number): V3 => [L, c * Math.cos(h), c * Math.sin(h)];
  let c = Math.min(Math.hypot(a, b), cap);
  if (!inGamut(linear(lab(c)))) {
    let [lo, hi] = [0, c];
    for (let i = 0; i < 30; i++) {
      const mid = (lo + hi) / 2;
      if (inGamut(linear(lab(mid)))) lo = mid;
      else hi = mid;
    }
    c = lo;
  }
  return (
    "#" +
    linear(lab(c))
      .map((x) => Math.round(Math.min(1, Math.max(0, toGamma(x))) * 255))
      .map((x) => x.toString(16).padStart(2, "0"))
      .join("")
  );
}

/** R3: a chip's light and dark backgrounds. */
export const tint = (hex: string) => ({
  light: at(hex, 0.93, 0.07),
  dark: at(hex, 0.36, 0.09),
});

/** WCAG 2 contrast of two hex colours. */
export function contrast(x: string, y: string): number {
  const lum = (h: string) => {
    const [r, g, b] = rgb(h).map(toLin);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [hi, lo] = [lum(x), lum(y)].sort((p, q) => q - p);
  return (hi + 0.05) / (lo + 0.05);
}

/** The theme `--ink` values from src/sheet/sheet.css. */
export function inks(
  css = readFileSync(join(root, "src/sheet/sheet.css"), "utf8"),
) {
  const light = /:root\s*\{[^}]*--ink:\s*(#[0-9a-f]{6})/i.exec(css)?.[1];
  const dark =
    /prefers-color-scheme:\s*dark\)\s*\{\s*:root\s*\{[^}]*--ink:\s*(#[0-9a-f]{6})/i.exec(
      css,
    )?.[1];
  if (!light || !dark) throw new Error("stack-colours: no --ink in sheet.css");
  return { light, dark };
}

/** Every chip's backgrounds; the build fails if a chip's text (the theme's
 * --ink) is under 4.5:1 on one of them (R3, 001 R18). Neutral: null. */
export function chipColours(table: Table, ink = inks()) {
  const out = new Map<string, { light: string; dark: string } | null>();
  for (const [name, c] of table) {
    if (c === null) {
      out.set(name, null);
      continue;
    }
    const t = tint(c);
    for (const k of ["light", "dark"] as const)
      if (contrast(t[k], ink[k]) < 4.5)
        throw new Error(
          `stack-colours: "${name}" ${k} chip ${t[k]} gives its text ${ink[k]} ${contrast(t[k], ink[k]).toFixed(2)}:1, under 4.5:1`,
        );
    out.set(name, t);
  }
  return out;
}
