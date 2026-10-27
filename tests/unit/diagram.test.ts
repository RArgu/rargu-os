// @vitest-environment node
// Spec 013 T2: the diagram schema (R9.b) and its HTML (R9).
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { checkDiagram, diagramHtml } from "../../scripts/diagram.ts";

const root = resolve(import.meta.dirname, "../..");
const fixture = (f: string) =>
  JSON.parse(
    readFileSync(join(root, "tests/fixtures/writeups/diagrams", f), "utf8"),
  );
const fail = (why: string): never => {
  throw new Error(why);
};
const crawler = () => fixture("focused-web-crawler.json");

describe("R9.b diagram schema", () => {
  it("accepts both fixtures", () => {
    expect(() => checkDiagram("crawler", crawler(), fail)).not.toThrow();
    expect(() =>
      checkDiagram("insider", fixture("polymarket-insider-trading.json"), fail),
    ).not.toThrow();
  });
  const cases: [string, (d: ReturnType<typeof crawler>) => void, RegExp][] = [
    [
      "a stage that is not the tool's",
      (d) => (d.tiers[1].boxes[0].stage = "crawl"),
      /stage "crawl", not a stage of crawler/,
    ],
    [
      "a tool stage on no box",
      (d) => delete d.tiers[5].boxes[0].stage,
      /stages on no box: evaluate/,
    ],
    [
      "one stage on two boxes",
      (d) => (d.tiers[0].boxes[0].stage = "seeds"),
      /stage "seeds" is on two boxes/,
    ],
    [
      "two boxes with one id",
      (d) => (d.tiers[0].boxes[0].id = "seeds"),
      /box id "seeds" is used twice/,
    ],
    [
      "a loop to no box above",
      (d) => (d.tiers[3].loop.to = "evaluate"),
      /loops to "evaluate", no box above/,
    ],
    ["an empty tier", (d) => (d.tiers[0].boxes = []), /tier 1 has no boxes/],
    [
      "a box with no name",
      (d) => (d.tiers[0].boxes[0].name = ""),
      /box "topic" has no name/,
    ],
    ["no caption", (d) => delete d.caption, /missing caption/],
  ];
  for (const [name, edit, error] of cases)
    it(`fails on ${name}`, () => {
      const d = crawler();
      edit(d);
      expect(() => checkDiagram("crawler", d, fail)).toThrow(error);
    });
  it("a window with no tool takes no stage", () => {
    expect(() => checkDiagram("pentimento", crawler(), fail)).toThrow(
      /not a stage of pentimento/,
    );
  });
});

describe("R9 diagram HTML", () => {
  const html = diagramHtml(checkDiagram("crawler", crawler(), fail));
  it("has one box per id, stage ids as data, a loop line and the caption", () => {
    expect(html.match(/class="dg-box"/g)).toHaveLength(9);
    expect(html).toContain('data-box="gate-d" data-stage="gate-d"');
    expect(html).toContain('<span class="dg-note">may be offline</span>');
    expect(html).toContain("next page (back to Fixture frontier)");
    expect(html).toContain(
      "<figcaption>Fixture diagram for the 013 tests.</figcaption>",
    );
    expect(html).toContain('aria-live="polite"');
  });
  it("escapes text", () => {
    const d = crawler();
    d.tiers[0].boxes[0].name = "<b>x</b> & y";
    expect(diagramHtml(d)).toContain("&lt;b&gt;x&lt;/b&gt; &amp; y");
  });
});
