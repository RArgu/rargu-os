// Renders resume.html, a plain static page for search engines, ATS parsers and
// no-JS visitors, from content/resume.md. Run with: node scripts/build-resume-html.ts
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseFrontmatter, renderMarkdown } from "../src/apps/resume/doc.ts";

const root = resolve(import.meta.dirname, "..");
const contentDir = process.env.DPOS_CONTENT ?? join(root, "content");
const src = join(contentDir, "resume.md");
const md = existsSync(src)
  ? readFileSync(src, "utf8")
  : "<!-- TODO(content): replace -->\n# Resume\n\nPlaceholder. The owner has not supplied a resume yet.\n";
let identity: {
  name?: string;
  title?: string;
  tagline?: string;
} = {};
try {
  identity = JSON.parse(
    readFileSync(join(contentDir, "identity.json"), "utf8"),
  );
} catch {
  // placeholders only
}

const esc = (s: string): string =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
const { body } = parseFrontmatter(md);
const doc = renderMarkdown(body);
// 015 R3: the address is not in resume.md or in the page. {{email}} becomes an
// Email link that src/sheet/email-init.ts fills in (the text shows the address)
const emailFile =
  process.env.DPOS_EMAIL ?? join(contentDir, "private/email.local.json");
const parts = existsSync(emailFile)
  ? (JSON.parse(readFileSync(emailFile, "utf8")) as { emailParts?: string[] })
      .emailParts
  : undefined;
// the token carries its " · " separator; no local file: no link, no separator
const mail =
  parts?.length === 2
    ? `<a data-mail="show" data-u="${esc(parts[0])}" data-d="${esc(parts[1])}" hidden>Email</a><noscript>Email needs JavaScript</noscript> · `
    : "";
doc.html = doc.html.replace(/\{\{email\}\}/g, () => mail);
const title = `${doc.title ?? identity.name ?? "Resume"} - Resume`;
const description = identity.tagline ?? identity.title ?? "Resume";

const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${esc(title)}</title>
    <meta name="description" content="${esc(description)}" />
    <style>
      body { max-width: 46rem; margin: 2rem auto; padding: 0 1rem; font: 16px/1.5 Georgia, "Times New Roman", serif; color: #111; background: #fff; }
      h1 { margin-bottom: 0.2rem; }
      h2 { margin-top: 2rem; border-bottom: 1px solid #999; }
      h3 { margin-bottom: 0.2rem; }
      a { color: #1d2b53; }
      nav { font-size: 0.9rem; margin-bottom: 1rem; }
      @media print { nav { display: none; } body { margin: 0; } }
    </style>
  </head>
  <body>
    <nav><a href="./">Back to RArgu OS</a></nav>
    <main>
${doc.html.replace(/<img data-src=/g, "<img src=")}
    </main>
    <script type="module" src="/src/sheet/email-init.ts"></script>
  </body>
</html>
`;
writeFileSync(join(root, "resume.html"), html);
console.log(`resume.html: ${html.length} bytes`);
