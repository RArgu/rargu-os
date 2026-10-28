// 015 R3.a: the leak scanner finds the address in any file, and fails on bad parts.
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { addressFrom, scan } from "../../scripts/check-no-email.ts";

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
