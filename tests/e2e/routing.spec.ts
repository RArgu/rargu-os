// 007 R5.a: routing on a local `wrangler dev` of dist/ (Workers static assets,
// public/_redirects, public/404.html). Each request reads status and Location
// before any redirect is followed. Run: `npx playwright test -c playwright.routing.config.ts`.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { RULES, parseRedirects, probe } from "../../scripts/routes.ts";

interface Case {
  path: string;
  status: number;
  location?: string;
  body?: RegExp;
}

// The fixed rules (scripts/routes.ts), not the file: a changed or deleted rule
// in public/_redirects fails here.
test("public/_redirects has exactly the R5 rules", () => {
  const file = resolve(import.meta.dirname, "../../public/_redirects");
  expect(parseRedirects(readFileSync(file, "utf8"))).toEqual(RULES);
});

const cases: Case[] = [
  // R5: the /next forms and the twelve old rules: one path per wildcard
  ...RULES.map((r) => ({
    path: probe(r.from),
    status: r.status,
    location: r.to,
  })),
  { path: "/resume", status: 200, body: /Rodrigo Arguello - Resume/ },
  // html_handling "auto-trailing-slash" (wrangler.jsonc): 307 to /resume
  { path: "/resume.html", status: 307, location: "/resume" },
  { path: "/nope", status: 404, body: /href="\/"[^>]*>Open RArgu OS/ },
];

for (const c of cases) {
  test(`${c.path} → ${c.status}${c.location ? ` ${c.location}` : ""}`, async ({
    request,
    baseURL,
  }) => {
    const res = await request.get(c.path, { maxRedirects: 0 });
    expect(res.status()).toBe(c.status);
    const location = res.headers()["location"];
    if (c.location === undefined) expect(location).toBeUndefined();
    else {
      // R5.a: the header itself, not the base URL an absent one resolves to
      expect(location, "Location header").toBeDefined();
      expect(new URL(location!, baseURL).href).toBe(
        new URL(c.location, baseURL).href,
      );
    }
    if (c.body) expect(await res.text()).toMatch(c.body);
  });
}

test("the 404 page names RArgu OS, not DevPageOS, and links the resume", async ({
  request,
}) => {
  const html = await (await request.get("/nope")).text();
  expect(html).not.toMatch(/DevPageOS/i);
  expect(html).toMatch(/href="\/resume"/);
});
