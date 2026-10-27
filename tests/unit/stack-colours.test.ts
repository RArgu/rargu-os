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

describe("R4, R5(d), R8, R10 chips in the built page", () => {
  const root = join(COLOURS, "../..");
  const projects = join(root, "content/projects");
  async function page(overlay?: string): Promise<string> {
    const { build } = await import("vite");
    const { sheetContent } = await import("../../scripts/sheet-content.ts");
    const { castlewarsFrames } =
      await import("../../scripts/castlewars-frames.ts");
    const { hostResources } = await import("../../scripts/host-resources.ts");
    const { hostChunks } = await import("../../scripts/host-chunks.ts");
    const out = (await build({
      configFile: false,
      logLevel: "silent",
      root,
      plugins: [
        sheetContent(overlay ? { overlay } : {}),
        castlewarsFrames(),
        hostResources(),
        hostChunks(),
      ],
      build: {
        write: false,
        rollupOptions: { input: { index: join(root, "index.html") } },
      },
    })) as { output: { fileName: string; type: string; source?: unknown }[] };
    return String(out.output.find((f) => f.fileName === "index.html")!.source);
  }
  /** chips per window: [label, style] */
  const chips = (html: string, id: string) => {
    const sec = html.split(`data-win="${id}"`)[1].split("</section>")[0];
    const about = sec
      .split('class="about"')[1]
      .split('class="meta"')[1]
      .split("</div>")[0];
    return [
      ...about.matchAll(/<span class="chip"( style="[^"]*")?>([^<]*)<\/span>/g),
    ].map((m) => [m[2], m[1] ?? ""] as const);
  };
  it("castlesiege has its nine chips; the split ones each have a colour (R5.b, R10)", async () => {
    const html = await page();
    const c = chips(html, "castlesiege");
    expect(c.map(([l]) => l)).toEqual([
      "TypeScript",
      "React Native",
      "Expo",
      "Node.js",
      "WebSocket",
      "PostgreSQL",
      "Web Workers",
      "Fly.io",
      "Docker",
    ]);
    const style = Object.fromEntries(c);
    expect(style["TypeScript"]).not.toBe(style["Node.js"]);
    // R10.a: no combined chip anywhere
    expect(html).not.toMatch(/<span class="chip"[^>]*>[^<]* \/ [^<]*<\/span>/);
    // a parent colour: WebSocket and Web Workers both JavaScript's
    expect(style["WebSocket"]).toBe(style["Web Workers"]);
    const t = tint("#f1e05a");
    expect(style["WebSocket"]).toBe(
      ` style="--chip-l:${t.light};--chip-d:${t.dark}"`,
    );
  });
  it("R8.a: the same text has the same values in every window", async () => {
    const html = await page();
    const ts = ["castlesiege", "castlewars", "pentimento"].map(
      (id) => Object.fromEntries(chips(html, id))["TypeScript"],
    );
    expect(new Set(ts).size).toBe(1);
    expect(ts[0]).toMatch(/--chip-l:#[0-9a-f]{6};--chip-d:#[0-9a-f]{6}/);
  });
  it("a neutral chip has no tint; an alias has its target's (Read panel too)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "writeups-"));
    const fixtures = join(root, "tests/fixtures/writeups");
    for (const f of ["focused-web-crawler.md", "polymarket-insider-trading.md"])
      writeFileSync(join(dir, f), readFileSync(join(fixtures, f), "utf8"));
    const { cpSync } = await import("node:fs");
    cpSync(join(fixtures, "diagrams"), join(dir, "diagrams"), {
      recursive: true,
    });
    const ins = join(dir, "polymarket-insider-trading.md");
    writeFileSync(
      ins,
      readFileSync(ins, "utf8").replace(
        "---\n",
        "---\nstack: [Python, asyncio, GDELT]\n",
      ),
    );
    const html = await page(dir);
    const style = Object.fromEntries(chips(html, "insider"));
    expect(style["GDELT"]).toBe("");
    expect(style["asyncio"]).toBe(style["Python"]);
    // the Read panel's title block uses the same chips
    const read = html.split('id="insider-read"')[1];
    expect(read).toContain(
      `<span class="chip"${style["Python"]}>Python</span>`,
    );
    expect(read).toContain('<span class="chip">GDELT</span>');
  });
  it("R2.a: an unknown chip fails the build, naming the file", async () => {
    const dir = mkdtempSync(join(tmpdir(), "writeups-"));
    writeFileSync(join(dir, "castlewars.md"), "---\nstack: [Pythn]\n---\n");
    const { loadProjects } = await import("../../scripts/sheet-content.ts");
    expect(() => loadProjects(projects, dir)).toThrow(
      /castlewars\.md: the stack chip "Pythn" has no entry/,
    );
  });
});
