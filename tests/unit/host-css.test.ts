// 002 R13: the build-time CSS scoping of scripts/host-css.ts.
import { describe, expect, it } from "vitest";
import { scopeCss } from "../../scripts/host-css";

const S = ".host-root";

describe("scopeCss", () => {
  it("puts every selector under the host root", () => {
    expect(scopeCss(".a, .b > c:is(.x, .y) { color: red }")).toBe(
      `${S} .a,${S} .b > c:is(.x, .y){ color: red }`,
    );
  });

  it("maps :root and .dpos descendants to the host root", () => {
    expect(scopeCss(":root { --u: 2px }")).toBe(`${S}{ --u: 2px }`);
    expect(scopeCss(".dpos ::selection { color: red }")).toBe(
      `${S} ::selection{ color: red }`,
    );
  });

  it("drops html, body, .dpos itself, compact policy and window chrome", () => {
    const css = `html, body { margin: 0 }
      .dpos, .dpos * { box-sizing: border-box }
      .dpos { position: fixed }
      [data-policy="compact"] .tab { flex: 1 }
      .win > .menubar { margin: 0 } .dpos .win-client:focus-visible, .x { outline: none }
      .wm-float { z-index: 1 }`;
    expect(scopeCss(css)).toBe(
      `${S} *{ box-sizing: border-box }${S} .x{ outline: none }`,
    );
  });

  it("keeps the root's motion attribute before the host root", () => {
    expect(
      scopeCss('[data-motion="reduced"] .cs-piece { transition: none }'),
    ).toBe(`[data-motion="reduced"] ${S} .cs-piece{ transition: none }`);
  });

  it("scopes inside @media and @supports, keeps @keyframes and @font-face", () => {
    const css = `/* c { } */ @supports not selector(::-webkit-scrollbar) {
      @media (pointer: fine) { .a * { scrollbar-color: red blue } } }
      @keyframes k { from { opacity: 0 } to { opacity: 1 } }
      @font-face { font-family: X; src: url("a{b}.ttf") }
      @import "x.css";`;
    expect(scopeCss(css)).toBe(
      "@supports not selector(::-webkit-scrollbar){" +
        `@media (pointer: fine){${S} .a *{ scrollbar-color: red blue }}}` +
        "@keyframes k{ from { opacity: 0 } to { opacity: 1 } }" +
        '@font-face{ font-family: X; src: url("a{b}.ttf") }' +
        '@import "x.css";',
    );
  });

  it("does not split selectors on commas in strings or brackets", () => {
    expect(scopeCss('a[title="x, y"], b { color: red }')).toBe(
      `${S} a[title="x, y"],${S} b{ color: red }`,
    );
  });

  it("reads quoted text as text, not as selectors or comments", () => {
    expect(scopeCss('[data-name=".win"]::before { content: "/*" }')).toBe(
      `${S} [data-name=".win"]::before{ content: "/*" }`,
    );
    expect(scopeCss('[data-name="a/*x*/b"] { color: red }')).toBe(
      `${S} [data-name="a/*x*/b"]{ color: red }`,
    );
    expect(scopeCss("/* it's */ .a { color: red } /* \"x */")).toBe(
      `${S} .a{ color: red }`,
    );
  });

  it("rejects root, html, body or .dpos inside a selector at build time", () => {
    for (const css of [
      ":is(:root, .x) { color: red }",
      ".a:not(body) { color: red }",
      ".x html .a { color: red }",
      ".x .dpos .a { color: red }",
    ])
      expect(() => scopeCss(css), css).toThrow(/host-css/);
  });
});
