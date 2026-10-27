// Spec 013 R8, R17: a project's write-up, from the markdown body of its
// content/projects file, rendered at build time. A project shows a write-up
// only with `writeup: true`; then every check below must pass, or the build
// fails and names the file.
import { renderMarkdown, type Anchor } from "../src/apps/resume/doc.ts";
import { checkDiagram, diagramHtml } from "./diagram.ts";

/** R8: the H2 sections, in this order. */
export const SECTIONS = [
  "Overview",
  "Uses",
  "How it works",
  "Challenges",
  "Results",
  "Origin",
] as const;

export interface Writeup {
  role: string;
  lede: string;
  /** the rendered body: H2 ids start with `<window id>-sec-` */
  html: string;
  anchors: Anchor[];
}

/** Renders and checks a write-up body and its diagram (the parsed JSON, or
 * undefined when there is no file); `fail` throws with the file name. */
export function writeup(
  id: string,
  meta: Record<string, string | string[]>,
  body: string,
  diagram: unknown,
  fail: (why: string) => never,
): Writeup {
  const text = (field: string): string => {
    const v = meta[field];
    return typeof v === "string" && v.trim() ? v : fail(`missing "${field}"`);
  };
  const role = text("role");
  const lede = text("lede");
  const { html, anchors } = renderMarkdown(body, `${id}-`);
  const names = anchors.map((a) => a.text);
  if (names.join("|") !== SECTIONS.join("|"))
    fail(
      `the write-up's H2 sections must be ${SECTIONS.join(", ")} in this order (found: ${names.join(", ") || "none"})`,
    );
  // each section's text, split at the H2 lines of the source
  const parts = body.split(/^## .*$/m).slice(1);
  SECTIONS.forEach((name, i) => {
    const first = parts[i].trim().split(/\n\s*\n/)[0];
    if (!/^\*\*[^*]+\*\*/.test(first))
      fail(`section "${name}" must start with a bold claim sentence`);
  });
  const results = parts[SECTIONS.indexOf("Results")];
  if (
    !/\b\d{4}-\d{2}-\d{2}\b/.test(results) ||
    !/\b\d+\s+runs?\b/i.test(results)
  )
    fail(`section "Results" needs a run date (YYYY-MM-DD) and a run count`);
  if (!/\bcredit/i.test(parts[SECTIONS.indexOf("Origin")]))
    fail(`section "Origin" needs a credit line`);
  // the renderer drops raw HTML, so a TODO in a comment never shows
  if (/TODO/.test(html.replace(/<[^>]*>/g, "")))
    fail(`the shown write-up text has "TODO"`);
  if (diagram === undefined) fail("no diagram file (diagrams/<file>.json)");
  const figure = diagramHtml(checkDiagram(id, diagram, fail));
  // R9: the diagram goes after the claim paragraph of "How it works"
  const at = html.indexOf("</p>", html.indexOf(`id="${id}-sec-how-it-works"`));
  return {
    role,
    lede,
    // links leave the sheet in a new tab, as the window's other links do
    html: (html.slice(0, at + 4) + figure + html.slice(at + 4)).replace(
      /<a href="(https?:[^"]*)">/g,
      '<a href="$1" target="_blank" rel="noopener">',
    ),
    anchors,
  };
}
