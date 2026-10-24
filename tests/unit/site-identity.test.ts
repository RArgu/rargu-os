// @vitest-environment node
// 007 R6 (Codex 007 review #2): the head tags hold exactly the escaped text,
// also when it has HTML characters or String.replace tokens ($&, $$, $1, $`, $').
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { siteHead } from "../../scripts/site-identity.ts";

const page = readFileSync(
  resolve(import.meta.dirname, "../../index.html"),
  "utf8",
);

describe("siteHead", () => {
  it("writes HTML characters and replacement tokens as escaped text", () => {
    const html = siteHead(page, {
      name: `Ro <b> & "R" $& $$ $1 $\` $'`,
      tagline: `Build <tools> & "apps" $& $$ $1 $\` $' $<x>`,
      links: { website: "https://rargu.dev" },
    });
    const name = `Ro &lt;b> &amp; &quot;R&quot; $&amp; $$ $1 $\` $'`;
    const tagline = `Build &lt;tools> &amp; &quot;apps&quot; $&amp; $$ $1 $\` $' $&lt;x>`;
    expect(html).toContain(`<title>${name} · RArgu OS</title>`);
    expect(html).toContain(`<meta name="description" content="${tagline}"`);
    expect(html).toContain(
      `<meta property="og:title" content="${name} · RArgu OS" />`,
    );
    expect(html).toContain(
      `<meta property="og:description" content="${tagline}" />`,
    );
    expect(html).toContain(
      '<link rel="canonical" href="https://rargu.dev/" />',
    );
    expect(html).toContain(
      '<meta property="og:url" content="https://rargu.dev/" />',
    );
    // each tag once, nothing else changed in the head
    expect(html.match(/<title>/g)).toHaveLength(1);
    expect(html.match(/name="description"/g)).toHaveLength(1);
    expect(html.match(/og:description/g)).toHaveLength(1);
  });
});
