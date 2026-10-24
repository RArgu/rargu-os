import { describe, expect, it } from "vitest";
import {
  parseFrontmatter,
  renderMarkdown,
  resolveLink,
  sanitize,
  wrapCards,
} from "../../src/apps/resume/doc";

describe("frontmatter", () => {
  it("parses scalars, inline lists and block lists as strings", () => {
    const { meta, body } = parseFrontmatter(
      [
        "---",
        "title: CastleSiege",
        "year: 2026",
        "date: 2026-10-01",
        'quoted: "a: b"',
        "stack: [TypeScript, React Native / Expo, Node.js]",
        "links: []",
        "tags:",
        "  - one",
        "  - two",
        "future_app: true",
        "---",
        "",
        "# Body",
      ].join("\n"),
    );
    expect(meta.title).toBe("CastleSiege");
    expect(meta.year).toBe("2026");
    expect(meta.date).toBe("2026-10-01");
    expect(meta.quoted).toBe("a: b");
    expect(meta.stack).toEqual([
      "TypeScript",
      "React Native / Expo",
      "Node.js",
    ]);
    expect(meta.links).toEqual([]);
    expect(meta.tags).toEqual(["one", "two"]);
    expect(meta.future_app).toBe("true");
    expect(body.trim()).toBe("# Body");
  });

  it("leaves documents without frontmatter alone", () => {
    expect(parseFrontmatter("# Hi\n---\nx")).toEqual({
      meta: {},
      body: "# Hi\n---\nx",
    });
  });
});

describe("markdown", () => {
  it("strips comments and raw HTML, and collects ## anchors", () => {
    const doc = renderMarkdown(
      [
        "# Title",
        "<!-- TODO(content): hidden -->",
        "Text <b>bold</b> <script>alert(1)</script> and <!-- inline --> more.",
        "",
        "## First Section",
        "### Card",
        "- item",
        "",
        "## Second: Part",
        "[ok](https://example.com) [mail](mailto:a@b.c) [bad](javascript:alert(1)) [rel](../x.md)",
        "![alt](../images/a.png)",
      ].join("\n"),
    );
    expect(doc.title).toBe("Title");
    expect(doc.html).not.toContain("TODO");
    expect(doc.html).not.toContain("<script");
    expect(doc.html).not.toContain("<b>");
    expect(doc.html).not.toContain("javascript:");
    expect(doc.anchors).toEqual([
      { id: "sec-first-section", text: "First Section" },
      { id: "sec-second-part", text: "Second: Part" },
    ]);
    expect(doc.html).toContain('<h2 id="sec-first-section">');
    expect(doc.html).toContain('<a href="https://example.com">ok</a>');
    expect(doc.html).toContain('<a href="mailto:a@b.c">');
    expect(doc.html).toContain('<a href="../x.md">rel</a>');
    expect(doc.html).toContain('<img data-src="../images/a.png" alt="alt">');
  });

  it("sanitizes to a whitelist and wraps ### blocks in cards", () => {
    const frag = sanitize(
      '<h2 id="a" onclick="x()">A</h2><h3>One</h3><p>p1</p><ul><li>x</li></ul><h3>Two</h3><p>p2</p><h2>B</h2><iframe src="x"></iframe><p style="color:red">after</p>',
    );
    wrapCards(frag);
    const host = document.createElement("div");
    host.append(frag);
    expect(host.querySelector("iframe")).toBeNull();
    expect(host.querySelector("h2")!.getAttribute("onclick")).toBeNull();
    expect(host.querySelector("h2")!.id).toBe("a");
    expect(host.querySelector("p[style]")).toBeNull();
    const cards = host.querySelectorAll("section.doc-card");
    expect(cards).toHaveLength(2);
    expect(cards[0].textContent).toBe("Onep1x");
    expect(cards[1].textContent).toBe("Twop2");
    expect(host.lastElementChild!.textContent).toBe("after");
  });

  it("resolves relative links against the document's folder", () => {
    expect(
      resolveLink("/home/guest/Documents/Projects", "../images/a.png"),
    ).toBe("/home/guest/Documents/images/a.png");
    expect(
      resolveLink("/home/guest/Documents", "Work/2024-dropin.md#top"),
    ).toBe("/home/guest/Documents/Work/2024-dropin.md");
    expect(resolveLink("/a/b", "/abs/x.md")).toBe("/abs/x.md");
  });
});
