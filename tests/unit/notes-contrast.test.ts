// 015 R7.a: the Notes window's colors, read from sheet.css, meet WCAG 2 AA.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(
  join(import.meta.dirname, "../../src/sheet/sheet.css"),
  "utf8",
);

/** custom properties of the first rule whose selector is `sel` */
function props(sel: string): Record<string, string> {
  const at = css.indexOf(`${sel} {`);
  expect(at, sel).toBeGreaterThanOrEqual(0);
  const body = css.slice(css.indexOf("{", at) + 1, css.indexOf("}", at));
  return Object.fromEntries(
    [...body.matchAll(/(--[a-z-]+):\s*(#[0-9a-f]{6})/g)].map((m) => [
      m[1],
      m[2],
    ]),
  );
}

function lum(hex: string): number {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = c.map((x) =>
    x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const ratio = (a: string, b: string): number => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

const win = props('.sheet-win[data-win="notes"]');
const root = props('.sheet-win[data-win="notes"] .host-root');

describe("015 R7.a Notes colors", () => {
  it("uses the approved hex values", () => {
    expect(win["--win-bg"]).toBe("#fff3a8");
    expect(win["--accent"]).toBe("#f4dc6b");
    expect(win["--chrome"]).toBe("#e8cf55");
    expect(win["--ink"]).toBe("#3b2a14");
    expect(win["--ink-dim"]).toBe("#5c4423");
  });
  const text: [string, string, string][] = [
    ["body text", win["--ink"], win["--win-bg"]],
    ["title text", win["--title-ink"], win["--accent"]],
    ["bar button", win["--ink"], win["--chrome"]],
    ["dim on body", win["--ink-dim"], win["--win-bg"]],
    ["textarea", root["--t-document-text"], root["--t-document"]],
    ["menu text", root["--t-text"], root["--t-chrome"]],
    ["dim on chrome", root["--t-text-dim"], root["--t-chrome"]],
    ["open menu item", root["--t-text-inverse"], root["--t-title-active"]],
    ["selection", root["--t-selection-fg"], root["--t-selection-bg"]],
  ];
  it.each(text)("%s is at least 4.5:1", (_n, fg, bg) => {
    expect(fg && bg).toBeTruthy();
    expect(ratio(fg, bg)).toBeGreaterThanOrEqual(4.5);
  });
  it("borders and rings are at least 3:1", () => {
    expect(
      ratio(root["--t-chrome-dark"], root["--t-chrome"]),
    ).toBeGreaterThanOrEqual(3);
    expect(ratio(win["--focus"], win["--win-bg"])).toBeGreaterThanOrEqual(3);
  });
});
