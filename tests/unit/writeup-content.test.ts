// @vitest-environment node
// Spec 013 T1: the write-up content pipeline (R8 ids, R17 build checks).
import { describe, expect, it } from "vitest";
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { build, type Rollup } from "vite";
import { castlewarsFrames } from "../../scripts/castlewars-frames.ts";
import { hostChunks } from "../../scripts/host-chunks.ts";
import { hostResources } from "../../scripts/host-resources.ts";
import { loadProjects, sheetContent } from "../../scripts/sheet-content.ts";

const root = resolve(import.meta.dirname, "../..");
const projects = join(root, "content/projects");
const fixtures = join(root, "tests/fixtures/writeups");
const CRAWLER = "focused-web-crawler.md";

/** A copy of the fixture overlay with the crawler write-up changed by `edit`. */
function overlayWith(edit: (src: string) => string): string {
  const dir = mkdtempSync(join(tmpdir(), "writeups-"));
  cpSync(fixtures, dir, { recursive: true });
  const file = join(dir, CRAWLER);
  const src = readFileSync(file, "utf8");
  const out = edit(src);
  expect(out, "the edit changes the fixture").not.toBe(src);
  writeFileSync(file, out);
  return dir;
}

describe("013 T1 write-ups load only with writeup: true", () => {
  it("the real content has no write-up yet", () => {
    expect(loadProjects(projects).filter((p) => p.writeup)).toEqual([]);
  });
  it("the fixture overlay adds both write-ups, ids prefixed with the window id", () => {
    const list = loadProjects(projects, fixtures);
    const crawler = list.find((p) => p.id === "crawler")!;
    expect(crawler.title).toBe("Generalized Focused Web Crawler");
    expect(crawler.writeup!.role).toMatch(/Fixture role/);
    expect(crawler.writeup!.anchors.map((a) => a.id)).toEqual([
      "crawler-sec-overview",
      "crawler-sec-uses",
      "crawler-sec-how-it-works",
      "crawler-sec-challenges",
      "crawler-sec-results",
      "crawler-sec-origin",
    ]);
    expect(list.find((p) => p.id === "insider")!.writeup).toBeDefined();
  });
});

describe("R17.a the build checks of a write-up", () => {
  const cases: [string, (s: string) => string, RegExp][] = [
    [
      "a missing section",
      (s) => s.replace(/^## Challenges$/m, "## Problems"),
      /focused-web-crawler\.md: write-up: .*H2 sections/,
    ],
    [
      "sections out of order",
      (s) =>
        s
          .replace(/^## Uses$/m, "## TMP")
          .replace(/^## Overview$/m, "## Uses")
          .replace(/^## TMP$/m, "## Overview"),
      /H2 sections must be Overview, Uses/,
    ],
    [
      "no bold claim sentence",
      (s) =>
        s.replace("**Fixture claim for Uses.**", "Fixture claim for Uses."),
      /section "Uses" must start with a bold claim/,
    ],
    ["no role line", (s) => s.replace(/^role:.*\n/m, ""), /missing "role"/],
    ["no lede", (s) => s.replace(/^lede:.*\n/m, ""), /missing "lede"/],
    [
      "results without a date",
      (s) => s.replace("2026-10-26", "late October"),
      /"Results" needs a run date/,
    ],
    [
      "results without a run count",
      (s) => s.replace("3 runs", "a few tries"),
      /"Results" needs a run date \(YYYY-MM-DD\) and a run count/,
    ],
    [
      "origin without a credit line",
      (s) => s.replace("Credit:", "Thanks:"),
      /"Origin" needs a credit line/,
    ],
    [
      "TODO in the shown text",
      (s) =>
        s.replace(
          "Fixture claim for Uses.**",
          "Fixture claim for Uses.** TODO",
        ),
      /has "TODO"/,
    ],
  ];
  for (const [name, edit, error] of cases)
    it(`fails on ${name} and names the file`, () => {
      expect(() => loadProjects(projects, overlayWith(edit))).toThrow(error);
    });
  it("allows TODO in a comment (the renderer drops it)", () => {
    const dir = overlayWith((s) => `${s}\n<!-- TODO(content): more -->\n`);
    expect(() => loadProjects(projects, dir)).not.toThrow();
  });
});

describe("R8.b ids are unique in the built sheet page", () => {
  it("with both fixture write-ups", async () => {
    const out = (await build({
      configFile: false,
      logLevel: "silent",
      root,
      plugins: [
        sheetContent({ overlay: fixtures }),
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
    expect(src).toContain('id="crawler-sec-results"');
    expect(src).toContain('id="insider-sec-results"');
    const ids = [...src.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
    expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([]);
  });
});
