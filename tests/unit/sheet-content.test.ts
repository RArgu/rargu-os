// @vitest-environment node
// R11.a, R14.a/b, R18.a: the card HTML, the project data and the contrast table.
import { describe, expect, it } from "vitest";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { build, type Rollup } from "vite";
import { castlewarsFrames } from "../../scripts/castlewars-frames.ts";
import { hostChunks } from "../../scripts/host-chunks.ts";
import { hostResources } from "../../scripts/host-resources.ts";
import { loadProjects, sheetContent } from "../../scripts/sheet-content.ts";

const root = resolve(import.meta.dirname, "../..");
const projects = join(root, "content/projects");

describe("R11.a card HTML from identity.json", () => {
  it("shows the test name and escapes the tagline", async () => {
    const out = (await build({
      configFile: false,
      logLevel: "silent",
      root,
      plugins: [
        sheetContent({
          identity: join(root, "tests/fixtures/sheet-content/identity.json"),
        }),
        // the sheet entry imports the Castle Wars frame data (005) and,
        // lazily, the app host's resource table (002)
        castlewarsFrames(),
        hostResources(),
        hostChunks(),
      ],
      build: {
        write: false,
        rollupOptions: { input: { index: join(root, "index.html") } },
      },
    })) as Rollup.RollupOutput;
    const html = out.output.find((f) => f.fileName === "index.html");
    const src = html?.type === "asset" ? String(html.source) : "";
    expect(src).toContain("Test Person");
    expect(src).toContain("Test Role");
    expect(src).toContain(
      "Builds &lt;b&gt;things&lt;/b&gt; &amp; &quot;stuff&quot;",
    );
    expect(src).not.toContain("<b>things</b>");
    expect(src).toContain('href="https://github.com/test"');
    expect(src).toContain('href="https://linkedin.com/in/test"');
    expect(src).toContain("test@example.com");
  });
});

describe("007 R3 the card transform needs the sheet's page", () => {
  it("fails the build when the input has no index.html, with a message", async () => {
    await expect(
      build({
        configFile: false,
        logLevel: "silent",
        root,
        plugins: [sheetContent()],
        build: {
          write: false,
          rollupOptions: {
            input: {
              resume: join(root, "tests/fixtures/sheet-guard/link.html"),
            },
          },
        },
      }),
    ).rejects.toThrow(/sheet-content: the build input has no index\.html/);
  });
});

/** A copy of content/projects; whole-plant-ice-cream.md is a directory, so reading it throws. */
function withTrap(): string {
  const dir = mkdtempSync(join(tmpdir(), "sheet-projects-"));
  cpSync(projects, dir, {
    recursive: true,
    filter: (p) => !p.endsWith("whole-plant-ice-cream.md"),
  });
  mkdirSync(join(dir, "whole-plant-ice-cream.md"));
  return dir;
}

describe("R14.a project allowlist", () => {
  it("returns the five projects in order and never reads Whole-Plant Ice Cream", () => {
    const list = loadProjects(withTrap());
    expect(list.map((p) => p.id)).toEqual([
      "castlesiege",
      "castlewars",
      "pentimento",
      "crawler",
      "insider",
    ]);
    expect(list[0]).toMatchObject({
      title: "CastleSiege",
      year: "2026",
      status: "playable",
      links: ["https://castlesiege.fly.dev"],
    });
    for (const p of list) {
      expect(p.summary.length).toBeGreaterThan(20);
      expect(p.stack.length).toBeGreaterThan(0);
    }
  });
});

describe("R14.b field validation", () => {
  const cases: [string, RegExp][] = [
    ["", /castlesiege\.md.*summary/],
    ["summary: ", /castlesiege\.md.*summary/],
    ["summary: |", /castlesiege\.md.*summary/],
    ["status: shipped", /castlesiege\.md.*status/],
    // names an object has from its prototype are not statuses
    ["status: constructor", /castlesiege\.md.*status/],
    ["status: toString", /castlesiege\.md.*status/],
    ["status: __proto__", /castlesiege\.md.*status/],
  ];
  for (const [line, error] of cases) {
    it(`fails on ${JSON.stringify(line || "no summary")}`, () => {
      const dir = withTrap();
      const file = join(dir, "castlesiege.md");
      const src = readFileSync(file, "utf8");
      const field = line.startsWith("status") ? "status" : "summary";
      const out = src.replace(
        new RegExp(`^${field}:.*\\n`, "m"),
        line ? `${line}\n` : "",
      );
      expect(out).not.toBe(src);
      writeFileSync(file, out);
      expect(() => loadProjects(dir)).toThrow(error);
    });
  }
});

describe("owner 2026-10-24: the optional short name", () => {
  const withShort = (line: string | null): string => {
    const dir = withTrap();
    const file = join(dir, "castlesiege.md");
    const src = readFileSync(file, "utf8").replace(/^short:.*\n/m, "");
    writeFileSync(
      file,
      line === null ? src : src.replace(/^title:.*\n/m, (m) => `${m}${line}\n`),
    );
    return dir;
  };
  it("is optional: without it the card uses the title", () => {
    expect(loadProjects(withShort(null))[0]).toMatchObject({
      title: "CastleSiege",
      short: "CastleSiege",
    });
  });
  for (const line of ["short: ", "short:   ", "short: |", "short: []"])
    it(`fails on ${JSON.stringify(line)} and names file and field`, () => {
      expect(() => loadProjects(withShort(line))).toThrow(
        /castlesiege\.md.*"short"/,
      );
    });
  it("the five files have the mock's short names; titles stay full", () => {
    expect(loadProjects(withTrap()).map((p) => [p.short, p.title])).toEqual([
      ["CastleSiege", "CastleSiege"],
      ["Castle Wars", "Castle Wars"],
      ["Pentimento", "Pentimento"],
      ["Focused Crawler", "Generalized Focused Web Crawler"],
      ["Insider Trading", "Insider Trading Detection on Polymarket"],
    ]);
  });
  it("the card list uses the short name and the window the title", async () => {
    const src = await buildSheet({});
    expect(src).toContain('data-go="crawler">Focused Crawler <em>');
    expect(src).toContain("<h2>Generalized Focused Web Crawler</h2>");
  });
});

async function buildSheet(
  opts: Parameters<typeof sheetContent>[0],
): Promise<string> {
  const out = (await build({
    configFile: false,
    logLevel: "silent",
    root,
    plugins: [
      sheetContent(opts),
      castlewarsFrames(),
      hostResources(),
      hostChunks(),
    ],
    build: {
      write: false,
      rollupOptions: { input: { index: join(root, "index.html") } },
    },
  })) as Rollup.RollupOutput;
  const html = out.output.find((f) => f.fileName === "index.html");
  return html?.type === "asset" ? String(html.source) : "";
}

/** A copy of the test identity with some fields changed. */
function identityWith(change: Record<string, unknown>): string {
  const src = join(root, "tests/fixtures/sheet-content/identity.json");
  const file = join(
    mkdtempSync(join(tmpdir(), "sheet-identity-")),
    "identity.json",
  );
  writeFileSync(
    file,
    JSON.stringify({ ...JSON.parse(readFileSync(src, "utf8")), ...change }),
  );
  return file;
}

describe("R7 / R14 window HTML", () => {
  it("writes eight windows at home and escapes the text literally", async () => {
    const dir = withTrap();
    const file = join(dir, "castlesiege.md");
    writeFileSync(
      file,
      // callbacks: a replacement string would expand $' and $&
      readFileSync(file, "utf8")
        .replace(/^title:.*$/m, () => 'title: Siege <i>x</i> & "y" $\' $&')
        .replace(/^summary:.*$/m, () => "summary: Costs $240M, $& and $$ too."),
    );
    const src = await buildSheet({
      projects: dir,
      identity: identityWith({ tagline: "Tag $' and $& end" }),
    });
    expect(src.match(/<section class="sheet-win"/g)).toHaveLength(8);
    expect(src).toContain("transform:translate(360px, 100px)");
    const title = "Siege &lt;i&gt;x&lt;/i&gt; &amp; &quot;y&quot; $' $&amp;";
    expect(src).toContain(`<h2>${title}</h2>`);
    expect(src).toContain(`aria-label="${title}"`);
    expect(src).toContain("Costs $240M, $&amp; and $$ too.");
    expect(src).toContain("Tag $' and $&amp; end");
    expect(src).not.toContain("<i>x</i>");
  });
});

describe("links are http(s) only", () => {
  it("fails on a javascript: project link and names file and field", () => {
    const dir = withTrap();
    const file = join(dir, "castlesiege.md");
    writeFileSync(
      file,
      readFileSync(file, "utf8").replace(
        /^links:.*$/m,
        "links: [javascript:alert(1)]",
      ),
    );
    expect(() => loadProjects(dir)).toThrow(/castlesiege\.md.*links/);
  });
  it("fails on a javascript: identity link and names file and field", async () => {
    await expect(
      buildSheet({
        identity: identityWith({
          links: { github: "javascript:alert(1)", linkedin: "https://x.y" },
        }),
      }),
    ).rejects.toThrow(/identity\.json.*links\.github/);
  });
});

// R18: WCAG 2 contrast of every token pair the page uses.
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a: string, b: string): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

function themes(): Record<"light" | "dark", Record<string, string>> {
  const css = readFileSync(join(root, "src/sheet/sheet.css"), "utf8");
  const vars = (block: string) =>
    Object.fromEntries(
      [...block.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})\b/gi)].map((m) => [
        m[1],
        m[2].toLowerCase(),
      ]),
    );
  const light = /:root\s*\{([^}]*)\}/.exec(css)![1];
  const dark = /prefers-color-scheme:\s*dark\)\s*\{\s*:root\s*\{([^}]*)\}/.exec(
    css,
  )![1];
  return { light: vars(light), dark: { ...vars(light), ...vars(dark) } };
}

// [foreground, background, minimum]; 3 = large text (≥ 24 px) or a focus ring
const PAIRS: [string, string, number][] = [
  ["ink", "paper", 4.5],
  ["ink-dim", "paper", 4.5],
  ["ink", "chip", 4.5],
  ["ink-dim", "chip", 4.5],
  ["ink", "win-bg", 4.5],
  ["title-ink", "accent", 4.5],
  ["accent", "paper", 3],
  ["focus", "paper", 3],
  ["focus", "win-bg", 3],
  ["focus", "chip", 3],
  // the title-bar Home button: its glyph and its focus ring
  ["ink", "chrome", 4.5],
  // the Copy message (toast)
  ["paper", "ink", 4.5],
  // 005 Pentimento: the sketch line on the window, the footer
  ["ink-dim", "win-bg", 4.5],
  ["ink", "paper-2", 4.5],
];

describe("R18.a contrast table", () => {
  // 005 Pentimento: the command panel's own colours (pentimento.css), the
  // same in both themes, as in the mock
  it("both themes: Pentimento --term-ink on --term-bg ≥ 4.5:1", () => {
    const css = readFileSync(
      join(root, "src/sheet/demos/pentimento.css"),
      "utf8",
    );
    const v = (name: string) =>
      new RegExp(`--${name}:\\s*(#[0-9a-f]{6})\\b`, "i").exec(css)?.[1];
    expect(v("term-ink"), "--term-ink").toBeDefined();
    expect(v("term-bg"), "--term-bg").toBeDefined();
    expect(contrast(v("term-ink")!, v("term-bg")!)).toBeGreaterThanOrEqual(4.5);
  });
  for (const [theme, t] of Object.entries(themes())) {
    for (const [fg, bg, min] of PAIRS) {
      it(`${theme}: ${fg} on ${bg} ≥ ${min}:1`, () => {
        expect(t[fg], `--${fg}`).toBeDefined();
        expect(t[bg], `--${bg}`).toBeDefined();
        expect(contrast(t[fg], t[bg])).toBeGreaterThanOrEqual(min);
      });
    }
  }
});
