// 007 R5: the redirect rules rargu.dev must keep, as fixed values. They are
// not read from public/_redirects: tests/e2e/routing.spec.ts checks that the
// file has exactly these rules, and both it and scripts/deploy-live.ts check
// the HTTP answers against them. A changed or deleted rule fails both.

export interface Rule {
  from: string;
  to: string;
  status: number;
}

/** R5: the three /next forms (new in 007). */
export const NEXT_RULES: Rule[] = [
  { from: "/next", to: "/", status: 301 },
  { from: "/next.html", to: "/", status: 301 },
  { from: "/next/", to: "/", status: 301 },
];

/** R5: the twelve rules of the Astro site's pages, unchanged since before 007. */
export const OLD_RULES: Rule[] = [
  { from: "/about", to: "/", status: 301 },
  { from: "/about/*", to: "/", status: 301 },
  { from: "/work", to: "/", status: 301 },
  { from: "/work/*", to: "/", status: 301 },
  { from: "/projects", to: "/", status: 301 },
  { from: "/projects/*", to: "/", status: 301 },
  { from: "/contact", to: "/", status: 301 },
  { from: "/contact/*", to: "/", status: 301 },
  { from: "/writing", to: "/", status: 301 },
  { from: "/writing/*", to: "/", status: 301 },
  { from: "/terminal", to: "/", status: 301 },
  { from: "/terminal/*", to: "/", status: 301 },
];

/** Every rule, in the order of public/_redirects. */
export const RULES: Rule[] = [...NEXT_RULES, ...OLD_RULES];

/** The rules of a `_redirects` file (a missing status is Cloudflare's 302). */
export function parseRedirects(text: string): Rule[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => {
      const [from, to, status = "302"] = l.split(/\s+/);
      return { from, to, status: Number(status) };
    });
}

/** The path a check requests for a rule: one path per wildcard rule. */
export const probe = (from: string): string =>
  from.endsWith("/*") ? from.slice(0, -1) + "x" : from;
