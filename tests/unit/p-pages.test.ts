// @vitest-environment node
// Spec 013 T9: the /p/<id>/ page from the sheet page (R12).
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { missing, pPage } from "../../scripts/p-pages.ts";
import { loadProjects } from "../../scripts/sheet-content.ts";

const root = resolve(import.meta.dirname, "../..");
const crawler = loadProjects(
  join(root, "content/projects"),
  join(root, "tests/fixtures/writeups"),
).find((p) => p.id === "crawler")!;
const SHEET = `<html><head><title>Rodrigo Arguello · RArgu OS</title>
<link rel="canonical" href="https://rargu.dev/" />
<meta property="og:type" content="website" />
<meta property="og:url" content="https://rargu.dev/" />
<meta property="og:title" content="x" />
<meta property="og:description" content="x" />
<meta name="description" content="x" />
<script type="module" src="./assets/index-1.js"></script>
<link rel="stylesheet" href="./assets/index-2.css">
</head><body><section data-win="castlesiege"></section><section data-win="crawler"></section>
<a href="/resume">Resume</a><img src="/sheet/paint.png"></body></html>`;

describe("R12 the write-up page", () => {
  const html = pPage(SHEET, crawler);
  it("has its own title, description, canonical and preview tags", () => {
    expect(html).toContain(
      "<title>Generalized Focused Web Crawler · RArgu OS</title>",
    );
    expect(html).toContain(
      '<link rel="canonical" href="https://rargu.dev/p/crawler/" />',
    );
    expect(html).toContain(
      '<meta property="og:url" content="https://rargu.dev/p/crawler/" />',
    );
    expect(html).toContain('<meta property="og:type" content="article" />');
    expect(html).toContain(
      '<meta name="description" content="Fixture lede for the crawler write-up." />',
    );
    expect(html).not.toContain("Rodrigo Arguello · RArgu OS");
  });
  it("opens the window: data-open on body and on that window only", () => {
    expect(html).toContain('<body data-open="crawler:read">');
    expect(html).toContain('<section data-win="crawler" data-open>');
    expect(html).toContain('<section data-win="castlesiege">');
  });
  it("makes asset URLs absolute", () => {
    expect(html).toContain('src="/assets/index-1.js"');
    expect(html).toContain('href="/assets/index-2.css"');
    expect(html).not.toMatch(/="\.\//);
  });
  it("fails when the sheet page has no head tag to replace", () => {
    expect(() =>
      pPage(SHEET.replace(/<link rel="canonical"[^>]*>/, ""), crawler),
    ).toThrow(/no .*canonical/);
  });
  it("finds local resources that are no file; page links are fine", () => {
    const files = new Set(["assets/index-1.js", "assets/index-2.css"]);
    // /sheet/paint.png is in public/
    expect(missing(html, files)).toEqual([]);
    expect(missing(html, new Set(["assets/index-1.js"]))).toEqual([
      "/assets/index-2.css",
    ]);
  });
});

describe("R18.b the case-study file's headers (public/_headers)", () => {
  it("noindex and a 5-minute cache for /p/insider/case-studies.json", () => {
    const h = readFileSync(join(root, "public/_headers"), "utf8");
    const block = /^\/p\/insider\/case-studies\.json\n((?:[ \t]+.*\n?)+)/m.exec(
      h,
    )?.[1];
    expect(block).toMatch(/^\s+X-Robots-Tag: noindex$/m);
    expect(block).toMatch(/^\s+Cache-Control: public, max-age=300$/m);
  });
});
