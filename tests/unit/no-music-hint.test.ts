// @vitest-environment node
// 009 R5.a: no visitor-facing text names a control the sheet does not have.
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import * as open from "../../src/apps/lib/open";

const src = resolve(import.meta.dirname, "../../src");

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? files(join(dir, e.name)) : [join(dir, e.name)],
  );
}

describe("009 R5 music hint removed", () => {
  it("open.ts does not export musicHint", () => {
    expect(Object.keys(open)).not.toContain("musicHint");
  });

  it('no file in src/ contains "speaker"', () => {
    const hits = files(src).filter((f) =>
      readFileSync(f, "latin1").includes("speaker"),
    );
    expect(hits).toEqual([]);
  });
});
