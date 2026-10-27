// @vitest-environment node
// Spec 014: the stack chips' colour table (R1, R2, R5) and the tint (R3).
import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  chipColours,
  COLOURS,
  colourOf,
  contrast,
  inks,
  loadColours,
  oklab,
  tint,
} from "../../scripts/stack-colours.ts";

const raw = () => JSON.parse(readFileSync(COLOURS, "utf8"));
const withTable = (edit: (d: Record<string, unknown>) => void) => {
  const d = raw();
  edit(d);
  const p = join(mkdtempSync(join(tmpdir(), "colours-")), "c.json");
  writeFileSync(p, JSON.stringify(d));
  return p;
};

describe("R1 the table", () => {
  it("R1.a: names Linguist and Simple Icons with versions, commits and licences", () => {
    const m = raw()._meta;
    expect(m.linguist).toMatchObject({
      release: "v9.7.0",
      commit: "e0c78d62c42abae6122235d8e68a7aa43eef89da",
      licence: "MIT, Copyright (c) 2017 GitHub, Inc.",
    });
    expect(m.simpleIcons).toMatchObject({
      version: "16.36.0",
      commit: "90646e4bf7f3b89df6c37e65baf3e7bc759a517c",
      licence: "CC0-1.0",
    });
    const lic = readFileSync(
      join(COLOURS, "../licences/linguist-LICENSE.txt"),
      "utf8",
    );
    expect(lic).toContain("e0c78d62c42abae6122235d8e68a7aa43eef89da");
    expect(lic).toContain("Copyright (c) 2017 GitHub, Inc.");
    expect(lic).toContain("Permission is hereby granted");
  });
  it("R5(a): the language colours equal Linguist v9.7.0 (constants, not the table)", () => {
    const LINGUIST: Record<string, string> = {
      TypeScript: "#3178c6",
      Python: "#3572a5",
      Swift: "#f05138",
      Metal: "#8f14e9",
      HTML: "#e34c26",
      CSS: "#663399",
      GraphQL: "#e10098",
      JavaScript: "#f1e05a",
    };
    const t = loadColours();
    for (const [n, c] of Object.entries(LINGUIST)) expect(t.get(n), n).toBe(c);
  });
  it("owner round 2: parents, neutral and Anthropic", () => {
    const t = loadColours();
    for (const n of ["asyncio", "Requests", "Pillow"])
      expect(t.get(n), n).toBe("#3572a5");
    for (const n of ["WebSocket", "Canvas", "Web Workers"])
      expect(t.get(n), n).toBe("#f1e05a");
    expect(t.get("AppKit")).toBe("#f05138");
    expect(t.get("Swift 6")).toBe("#f05138");
    expect(t.get("GDELT")).toBeNull();
    expect(t.get("Anthropic API")).toBe("#141413");
  });
});

describe("R2 checks", () => {
  it("R2.a: an unknown chip names the file and the chip", () => {
    expect(() => colourOf(loadColours(), "Pythn", "castlesiege.md")).toThrow(
      /castlesiege\.md: the stack chip "Pythn" has no entry/,
    );
  });
  const bad: [string, (d: Record<string, unknown>) => void, RegExp][] = [
    [
      "a same to nothing",
      (d) => (d.asyncio = { same: "Nothing", reason: "x" }),
      /"asyncio" has "same": "Nothing"/,
    ],
    [
      "a same to itself",
      (d) => (d.asyncio = { same: "asyncio", reason: "x" }),
      /"asyncio" has "same": "asyncio"/,
    ],
    [
      "a same to a same (R2.c)",
      (d) => (d.Requests = { same: "asyncio", reason: "x" }),
      /"Requests" has "same": "asyncio"/,
    ],
    [
      "a same to a neutral",
      (d) => (d.asyncio = { same: "GDELT", reason: "x" }),
      /"asyncio" has "same": "GDELT"/,
    ],
    [
      "a bad hex",
      (d) => ((d.Python as { colour: string }).colour = "#35725"),
      /"Python" has a bad colour/,
    ],
    [
      "no source",
      (d) => delete (d.Python as { source?: string }).source,
      /"Python" needs source/,
    ],
    [
      "no reason",
      (d) => delete (d.asyncio as { reason?: string }).reason,
      /"asyncio" needs a colour/,
    ],
  ];
  for (const [name, edit, error] of bad)
    it(`fails on ${name}`, () => {
      expect(() => loadColours(withTable(edit))).toThrow(error);
    });
});

describe("R3 the tint", () => {
  it("R3.a: exact outputs for fixed inputs", () => {
    expect(tint("#3572A5")).toEqual({ light: "#d5ebff", dark: "#054069" });
    expect(tint("#8f14e9")).toEqual({ light: "#ede2ff", dark: "#473064" });
    expect(tint("#000000")).toEqual({ light: "#e8e8e8", dark: "#3d3d3d" });
    expect(tint("#FFF000")).toEqual({ light: "#eeebb5", dark: "#433f00" });
  });
  it("R3.a: hue within 2° of the brand for every colour with chroma ≥ 0.02", () => {
    const hue = (h: string) => {
      const [, a, b] = oklab(h);
      return { h: (Math.atan2(b, a) * 180) / Math.PI, c: Math.hypot(a, b) };
    };
    for (const [name, c] of loadColours()) {
      if (c === null) continue;
      const brand = hue(c);
      if (brand.c < 0.02) continue;
      for (const t of Object.values(tint(c))) {
        const x = hue(t);
        if (x.c < 0.02) continue;
        const d = Math.abs(((x.h - brand.h + 540) % 360) - 180);
        expect(d, `${name} ${t}`).toBeLessThan(2);
      }
    }
  });
  it("R5(c): every chip × theme meets 4.5:1 with the --ink of sheet.css", () => {
    const ink = inks();
    expect(ink).toEqual({ light: "#1d2b53", dark: "#fff1e8" });
    const all = chipColours(loadColours(), ink);
    for (const [name, t] of all) {
      if (!t) continue;
      expect(contrast(t.light, ink.light), name).toBeGreaterThanOrEqual(4.5);
      expect(contrast(t.dark, ink.dark), name).toBeGreaterThanOrEqual(4.5);
    }
  });
  it("R3.b: a text colour close to the tints fails the build, naming the chip", () => {
    expect(() =>
      chipColours(loadColours(), { light: "#c0c0c0", dark: "#fff1e8" }),
    ).toThrow(
      /stack-colours: "TypeScript" light chip #[0-9a-f]{6} gives its text #c0c0c0/,
    );
  });
});
