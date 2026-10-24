// @vitest-environment node
// 007 R6.a: the site's names in the production build and the package files.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { build, type Rollup } from "vite";

const root = resolve(import.meta.dirname, "../..");
const read = (f: string): string => readFileSync(resolve(root, f), "utf8");
const identity = JSON.parse(read("content/identity.json")) as {
  tagline: string;
};
const esc = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");

/** index.html as the production build writes it (the repo's vite config). */
async function productionIndex(): Promise<string> {
  const out = (await build({
    configFile: resolve(root, "vite.config.ts"),
    logLevel: "silent",
    build: { write: false },
  })) as Rollup.RollupOutput[] | Rollup.RollupOutput;
  const files = (Array.isArray(out) ? out : [out]).flatMap((o) => o.output);
  const html = files.find((f) => f.fileName === "index.html");
  return html?.type === "asset" ? String(html.source) : "";
}

describe("R6.a names", () => {
  it("/ has the R6 title, description, canonical and og tags", async () => {
    const html = await productionIndex();
    const tagline = esc(identity.tagline);
    expect(html).toContain("<title>Rodrigo Arguello · RArgu OS</title>");
    expect(html).toContain(`<meta name="description" content="${tagline}"`);
    expect(html).toContain('<link rel="canonical" href="https://rargu.dev/"');
    expect(html).toContain('<meta property="og:type" content="website"');
    expect(html).toContain(
      '<meta property="og:url" content="https://rargu.dev/"',
    );
    expect(html).toContain(
      '<meta property="og:title" content="Rodrigo Arguello · RArgu OS"',
    );
    expect(html).toContain(
      `<meta property="og:description" content="${tagline}"`,
    );
    expect(html).not.toMatch(/devpageos/i);
  }, 60_000);

  it("both package files say rargu-os", () => {
    expect(JSON.parse(read("package.json")).name).toBe("rargu-os");
    const lock = JSON.parse(read("package-lock.json"));
    expect(lock.name).toBe("rargu-os");
    expect(lock.packages[""].name).toBe("rargu-os");
  });

  it("the resume's return link reads Back to RArgu OS", () => {
    // npm test runs `npm run image` first, which writes resume.html
    const html = read("resume.html");
    expect(html).toContain('<a href="./">Back to RArgu OS</a>');
    expect(html).not.toMatch(/devpageos/i);
  });

  it("the About text names RArgu OS", () => {
    const src = read("src/apps/lib/open.ts");
    expect(src).toContain("A RArgu OS program");
    expect(src).not.toMatch(/devpageos/i);
  });
});
