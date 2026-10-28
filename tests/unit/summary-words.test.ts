// 015 R6.a: every window description is 20 words or fewer.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const dir = join(import.meta.dirname, "../../content/projects");

describe("015 R6.a window descriptions", () => {
  for (const f of readdirSync(dir).filter((n) => n.endsWith(".md"))) {
    const m = /^summary: (.*)$/m.exec(readFileSync(join(dir, f), "utf8"));
    if (!m) continue; // a project without a window (Whole-Plant Ice Cream)
    it(`${f} has at most 20 words`, () => {
      expect(m[1].trim().split(/\s+/).length).toBeLessThanOrEqual(20);
    });
  }
});
