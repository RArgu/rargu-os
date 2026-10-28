// 015 R9.a: one checked reader of the email file for the sheet, the resume and
// the leak check. A bad file fails with the file name only, never its text.
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readEmail } from "../../scripts/email-parts.ts";

const file = (text: string): string => {
  const p = join(mkdtempSync(join(tmpdir(), "email-parts-")), "e.json");
  writeFileSync(p, text);
  return p;
};

describe("015 R9.a scripts/email-parts.ts readEmail", () => {
  it("returns the two parts", () => {
    expect(readEmail(file('{"emailParts":["a.b","c.test"]}'))).toEqual([
      "a.b",
      "c.test",
    ]);
  });
  it("returns null when the file is missing", () => {
    expect(readEmail(join(tmpdir(), "no-such-015", "e.json"))).toBeNull();
  });
  it.each([
    "{}",
    "null",
    "[]",
    '{"emailParts":"a@b.c"}',
    '{"emailParts":["a"]}',
    '{"emailParts":["a","b","c"]}',
    '{"emailParts":["a",""]}',
    '{"emailParts":["  ","b"]}',
    '{"emailParts":["a",7]}',
  ])("fails on bad parts %s", (json) => {
    expect(() => readEmail(file(json))).toThrow(/e\.json: bad or missing/);
  });
  it("a malformed file fails without its text in the message", () => {
    let msg = "";
    try {
      readEmail(file('{"emailParts":["secret.local","leak.test"'));
    } catch (e) {
      msg = (e as Error).message;
    }
    expect(msg).toMatch(/e\.json: bad or missing/);
    expect(msg).not.toMatch(/secret|leak/);
  });
});
