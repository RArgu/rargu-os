// 015 R3.a: the leak scanner finds the address in any file, and fails on bad parts.
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  addressFrom,
  noEmailLeak,
  scan,
} from "../../scripts/check-no-email.ts";

function dir(): string {
  const d = mkdtempSync(join(tmpdir(), "no-email-"));
  mkdirSync(join(d, "assets"));
  return d;
}

describe("015 R3.a scripts/check-no-email.ts", () => {
  it("joins the two parts", () => {
    const d = dir();
    writeFileSync(join(d, "id.json"), '{"emailParts":["a.b","c.test"]}');
    expect(addressFrom(join(d, "id.json"))).toBe("a.b@c.test");
  });
  it.each(["{}", '{"emailParts":["a"]}', '{"emailParts":["a",""]}'])(
    "fails on bad parts %s",
    (json) => {
      const d = dir();
      writeFileSync(join(d, "id.json"), json);
      expect(() => addressFrom(join(d, "id.json"))).toThrow(/emailParts/);
    },
  );
  it("reports files with the address, in any asset type and case", () => {
    const d = dir();
    writeFileSync(join(d, "index.html"), "<p>no address; a.b and c.test</p>");
    writeFileSync(join(d, "assets", "x.js"), 'x="A.B@C.test"');
    writeFileSync(join(d, "assets", "x.map"), "a.b@c.test");
    expect(scan([d], "a.b@c.test").map((f) => f.slice(d.length))).toEqual([
      "/assets/x.js",
      "/assets/x.map",
    ]);
  });
  it("fails when a path is missing (not `clean`)", () => {
    expect(() => scan([join(tmpdir(), "no-such-015")], "a@b.c")).toThrow();
  });
});

// the command line: clean, LEAK, ERROR; never the address in its output
describe("015 R3.a check-no-email command", () => {
  const cli = join(import.meta.dirname, "../../scripts/check-no-email.ts");
  const run = (args: string[], cwd?: string) =>
    spawnSync(process.execPath, [cli, ...args], { cwd, encoding: "utf8" });
  const setup = (built: string) => {
    const d = dir();
    writeFileSync(join(d, "id.json"), '{"emailParts":["a.b","c.test"]}');
    writeFileSync(join(d, "assets", "x.js"), built);
    return d;
  };
  it("prints clean when no file has the address", () => {
    const d = setup('x="a.b and c.test"');
    const r = run([join(d, "assets"), "--email", join(d, "id.json")]);
    expect(r.status).toBe(0);
    expect(r.stdout.trim()).toBe("clean");
  });
  it("prints LEAK and the file name, not the address", () => {
    const d = setup('x="a.b@c.test"');
    const r = run([join(d, "assets"), "--email", join(d, "id.json")]);
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(/^LEAK in 1 file/);
    expect(r.stdout).toContain("x.js");
    expect(r.stdout + r.stderr).not.toContain("a.b@c.test");
  });
  it("prints ERROR on a missing path or a malformed email file", () => {
    const d = setup("");
    const missing = run([join(d, "nope"), "--email", join(d, "id.json")]);
    expect(missing.status).toBe(1);
    expect(missing.stdout).toMatch(/^ERROR/);
    writeFileSync(join(d, "id.json"), '{"emailParts":["a.b","c.test"');
    const bad = run([join(d, "assets"), "--email", join(d, "id.json")]);
    expect(bad.status).toBe(1);
    expect(bad.stdout).toMatch(/^ERROR id\.json: bad or missing/);
    expect(bad.stdout + bad.stderr).not.toMatch(/a\.b|c\.test/);
  });
  it("--tracked finds the local part in a tracked file", () => {
    const d = setup("");
    execFileSync("git", ["init", "-q"], { cwd: d });
    writeFileSync(join(d, "notes.md"), "ask a.b about it");
    execFileSync("git", ["add", "notes.md"], { cwd: d });
    const r = run(["--tracked", "--email", join(d, "id.json")], d);
    expect(r.status).toBe(1);
    expect(r.stdout).toContain("notes.md");
  });
});

// every build runs the scan (vite.config.ts): the plugin throws on a leak
describe("015 R3.a, R9.a noEmailLeak build plugin", () => {
  const close = (outDir: string, emailFile: string, fixture = false) => {
    const p = noEmailLeak({ fixture, emailFile });
    (p.configResolved as (c: unknown) => void)({
      root: "/",
      build: { outDir },
    });
    (p.closeBundle as () => void)();
  };
  it("passes a clean build, fails one with the address", () => {
    const d = dir();
    writeFileSync(join(d, "id.json"), '{"emailParts":["a.b","c.test"]}');
    writeFileSync(join(d, "assets", "x.js"), 'u="a.b";d="c.test"');
    expect(() => close(join(d, "assets"), join(d, "id.json"))).not.toThrow();
    writeFileSync(join(d, "assets", "y.html"), "a.b@c.test");
    expect(() => close(join(d, "assets"), join(d, "id.json"))).toThrow(
      /email LEAK in 1 built file/,
    );
  });
  it("a test build fails on the real local part (its links use the fixture)", () => {
    const d = dir();
    writeFileSync(join(d, "id.json"), '{"emailParts":["a.b","c.test"]}');
    writeFileSync(join(d, "assets", "x.html"), 'data-u="a.b"');
    expect(() => close(join(d, "assets"), join(d, "id.json"), true)).toThrow(
      /LEAK/,
    );
  });
  it("does nothing without the local email file", () => {
    const d = dir();
    writeFileSync(join(d, "assets", "x.html"), "a.b@c.test");
    expect(() => close(join(d, "assets"), join(d, "none.json"))).not.toThrow();
  });
});
