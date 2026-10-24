// 007 T3 (A5): the contrast checks on the themes the app host loads
// (src/sheet/host/styles.ts); the old kernel's theme code is gone.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { contrast } from "../../src/apps/lib/palette";

const dir = join(import.meta.dirname, "../../system/etc/themes");
const files = readdirSync(dir).filter((f) => f.endsWith(".json"));

describe("themes", () => {
  it("ships default and night", () => {
    expect(files.sort()).toEqual(["default.json", "night.json"]);
  });

  it.each(files)("%s has 16 colors and passes 4.5:1 for body text", (file) => {
    const theme = JSON.parse(readFileSync(join(dir, file), "utf8")) as {
      palette: string[];
      roles: Record<string, number>;
    };
    const color = (role: string): string => {
      const c = theme.palette[theme.roles[role]];
      expect(c, `${file}: role ${role}`).toMatch(/^#[0-9a-f]{6}$/i);
      return c;
    };
    expect(theme.palette).toHaveLength(16);
    expect(contrast(color("text"), color("chrome"))).toBeGreaterThanOrEqual(
      4.5,
    );
    expect(contrast(color("text"), color("document"))).toBeGreaterThanOrEqual(
      4.5,
    );
    expect(
      contrast(color("document-text"), color("document")),
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      contrast(color("text-inverse"), color("title-active")),
    ).toBeGreaterThanOrEqual(4.5);
  });

  it("computes contrast ratios", () => {
    expect(contrast("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrast("#777777", "#777777")).toBe(1);
  });
});
