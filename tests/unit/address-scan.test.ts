// @vitest-environment node
// Spec 013 R18.d: wallet addresses are in no committed file but the
// case-study JSON. Also, when the 012 track's private report-case file is on
// this machine, none of its addresses or usernames are in a committed file.
// R19.a: a case removed from the source is gone from the built data.
import { describe, expect, it } from "vitest";
import { execSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { loadProjects } from "../../scripts/sheet-content.ts";

const root = resolve(import.meta.dirname, "../..");
const ALLOWED = "content/projects/insider-case-studies.json";
// shortcut: 012's spec (R22) names the report's market-maker contract in full;
// it is public (report section 4.4), not from the private files. Remove when
// 012 shortens it (013 cross-spec request, 2026-10-26).
const KNOWN: Record<string, string[]> = {
  "docs/specs/012-insider-live/spec.md": [
    "0x4bfb41d5b3570defd03c39a9a4d8de6bd8b8982e",
  ],
};
// shortcut: 012's own docs name report wallets (public, from the report) that
// are also in its private files. Remove each when 012 uses report section
// numbers instead (013 cross-spec request, 2026-10-26).
const KNOWN_PRIVATE = new Set([
  "docs/review/spec-012-critique-codex.md",
  "docs/specs/012-insider-live/research.md",
  "docs/specs/012-insider-live/spec.md",
]);
/** 012's private report-case files (its R22): never read into a log */
const PRIVATE = join(homedir(), ".rargu/insider-eval");

/** Committed text files: path → content. */
function committed(): Map<string, string> {
  const out = new Map<string, string>();
  for (const f of execSync("git ls-files", { cwd: root, encoding: "utf8" })
    .split("\n")
    .filter(Boolean)) {
    const p = join(root, f);
    // .claude/skills links point to folders
    if (!existsSync(p) || !statSync(p).isFile() || statSync(p).size > 2e6)
      continue;
    const s = readFileSync(p, "utf8");
    if (!s.includes("\u0000")) out.set(f, s);
  }
  return out;
}

/** Every string under an address, username, prefix or suffix key. */
function identities(v: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(v)) v.forEach((x) => identities(x, out));
  else if (v && typeof v === "object")
    for (const [k, x] of Object.entries(v))
      if (
        /^(address|username|prefix|suffix|wallet)$/i.test(k) &&
        typeof x === "string"
      ) {
        if (x.length >= 6) out.add(x);
      } else identities(x, out);
  return out;
}

describe("R18.d no wallet address outside the case-study JSON", () => {
  const files = committed();
  it("no full address in a committed file", () => {
    const found: string[] = [];
    for (const [f, s] of files) {
      if (f === ALLOWED) continue;
      for (const m of s.matchAll(/0x[0-9a-fA-F]{40}/g))
        if (!KNOWN[f]?.includes(m[0])) found.push(`${f}: ${m[0]}`);
    }
    expect(found).toEqual([]);
  });
  it.runIf(existsSync(PRIVATE))(
    "nothing from the private report-case files in a committed file",
    () => {
      const ids = new Set<string>();
      for (const f of readdirSync(PRIVATE).filter((f) => f.endsWith(".json")))
        identities(JSON.parse(readFileSync(join(PRIVATE, f), "utf8")), ids);
      // the message names the committed file only, never the private value
      const found = [...files]
        .filter(
          ([f, s]) =>
            f !== ALLOWED &&
            !KNOWN_PRIVATE.has(f) &&
            [...ids].some((id) => s.includes(id)),
        )
        .map(([f]) => f);
      expect(found).toEqual([]);
    },
  );
});

describe("R18 the case-study file", () => {
  const projects = join(root, "content/projects");
  const fixtures = join(root, "tests/fixtures/writeups");
  const withCases = (text: string) => {
    const dir = mkdtempSync(join(tmpdir(), "writeups-"));
    cpSync(fixtures, dir, { recursive: true });
    writeFileSync(join(dir, "insider-case-studies.json"), text);
    return dir;
  };
  it("loads with the insider write-up only", () => {
    const list = loadProjects(projects, fixtures);
    expect(list.find((p) => p.id === "insider")!.cases!.cases).toHaveLength(2);
    expect(list.find((p) => p.id === "crawler")!.cases).toBeUndefined();
  });
  it("fails on bad JSON and on a case with no text, naming the file", () => {
    expect(() => loadProjects(projects, withCases("{"))).toThrow(
      /insider-case-studies\.json: bad JSON/,
    );
    expect(() =>
      loadProjects(
        projects,
        withCases(
          JSON.stringify({ cases: [{ heading: "x", paragraphs: [] }] }),
        ),
      ),
    ).toThrow(/case 1 needs paragraphs/);
  });
  it("R19.a: a case removed from the source is not in the built data", () => {
    const d = JSON.parse(
      readFileSync(join(fixtures, "insider-case-studies.json"), "utf8"),
    );
    d.cases.shift();
    const out = loadProjects(projects, withCases(JSON.stringify(d))).find(
      (p) => p.id === "insider",
    )!.cases!;
    expect(JSON.stringify(out)).not.toContain("Fixture case 1");
  });
});
