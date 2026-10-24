// @vitest-environment node
// R2.b / R2.c / R22: real Vite builds of fixture entries through the sheet guard.
import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { build } from "vite";
import { hostChunks } from "../../scripts/host-chunks.ts";
import { hostResources } from "../../scripts/host-resources.ts";
import {
  BUDGET_KIB,
  hasSheetPage,
  REGISTRY,
  SHELL_KIB,
  sheetGuard,
} from "../../scripts/sheet-guard.ts";

const fixtures = resolve(import.meta.dirname, "../fixtures/sheet-guard");

function buildEntry(
  file: string,
  budgetKiB?: number,
  root = resolve(import.meta.dirname, "../.."),
  registry = REGISTRY,
  shellKiB?: number,
) {
  return build({
    configFile: false,
    logLevel: "silent",
    root,
    plugins: [
      sheetGuard(undefined, budgetKiB, registry, shellKiB),
      hostResources(),
      hostChunks(),
    ],
    build: {
      write: false,
      rollupOptions: { input: { index: resolve(fixtures, file) } },
    },
  });
}

describe("sheet guard", () => {
  it("passes tokens.css, plain code and the Castle Wars art", async () => {
    await expect(buildEntry("clean.ts")).resolves.toBeDefined();
  });
  it("002 T2 passes the app host's memory fs and resource table", async () => {
    await expect(buildEntry("host.ts")).resolves.toBeDefined();
  });
  it("002 T3 passes the registry's lazy app imports", async () => {
    await expect(buildEntry("registered.ts")).resolves.toBeDefined();
  });
  it("002 T3 fails on a lazy app import outside the registry and names it", async () => {
    await expect(buildEntry("unregistered.ts")).rejects.toThrow(
      /src\/apps\/writer\/main\.ts/,
    );
  });
  it("002 T3 fails on a lazy app import from a helper bundled beside the registry", async () => {
    await expect(
      buildEntry("bypass.ts", undefined, undefined, {
        module: "tests/fixtures/sheet-guard/registry/load.ts",
        apps: ["paint", "writer"],
      }),
    ).rejects.toThrow(
      /src\/apps\/writer\/main\.ts \(lazy import from tests\/fixtures\/sheet-guard\/registry\/helper\.ts\)/,
    );
  });
  it("002 T3 R22.a the budget counts the registered apps too", async () => {
    // the host alone is under 30 KiB; with the four apps it is over
    await expect(buildEntry("registered.ts", 30)).rejects.toThrow(
      /over the 30 KiB budget/,
    );
  });
  it("R2 fails on a third-party URL in CSS and names it", async () => {
    await expect(buildEntry("external-css.ts")).rejects.toThrow(
      /https:\/\/example\.com\/a\.png/,
    );
  });
  it("R2 fails on a third-party module and names it", async () => {
    await expect(buildEntry("external-js.ts")).rejects.toThrow(
      /https:\/\/example\.com\/m\.js/,
    );
  });
  it("R2 fails on a third-party script in the entry page and names it", async () => {
    await expect(buildEntry("external.html")).rejects.toThrow(
      /https:\/\/example\.com\/s\.js/,
    );
  });
  it("R2 passes links to other sites and same-origin resources in the entry page", async () => {
    await expect(buildEntry("link.html")).resolves.toBeDefined();
  });
  // a fixture root stands in for the repo, so no file is added to src/apps/,
  // and it holds stand-ins of the deleted old-OS folders (007 T3)
  const own = resolve(fixtures, "root");
  it("fails on a kernel import and names the module (fixture root)", async () => {
    await expect(
      buildEntry("root/forbidden.ts", undefined, own),
    ).rejects.toThrow(/src\/kernel\/bus\.ts/);
  });
  it("fails on a lazy wm import (fixture root)", async () => {
    await expect(buildEntry("root/lazy.ts", undefined, own)).rejects.toThrow(
      /src\/wm\/policy\.ts/,
    );
  });
  it("fails on old-OS CSS (fixture root)", async () => {
    await expect(buildEntry("root/css.ts", undefined, own)).rejects.toThrow(
      /src\/wm\/wm\.css/,
    );
  });
  it("fails on old-OS CSS reached by CSS @import, two levels down (fixture root)", async () => {
    await expect(
      buildEntry("root/css-import.ts", undefined, own),
    ).rejects.toThrow(/src\/wm\/wm\.css/);
  });
  it("R2.c passes one of the six sprites' JSON (fixture root)", async () => {
    await expect(
      buildEntry("root/knight.ts", undefined, own),
    ).resolves.toBeDefined();
  });
  it("R2.c fails on another file beside the six sprites (fixture root)", async () => {
    await expect(buildEntry("root/extra.ts", undefined, own)).rejects.toThrow(
      /src\/apps\/castlewars\/art\/extra\.json/,
    );
  });
  it("fails on any src/apps/ module outside the Castle Wars art", async () => {
    await expect(buildEntry("app.ts")).rejects.toThrow(
      /src\/apps\/lib\/download\.ts/,
    );
  });
  it("R22.a fails when JS + CSS gzip is over the budget and names the size", async () => {
    // clean.ts is a few hundred bytes gzip: a 0.1 KiB budget is exceeded
    await expect(buildEntry("clean.ts", 0.1)).rejects.toThrow(
      /over the 0\.1 KiB budget/,
    );
  });
  it("R22.a the default budget is 150 KiB (owner 2026-10-24)", async () => {
    expect(BUDGET_KIB).toBe(150);
  });
  it("007 R3 the shell budget counts the first load only, not the lazy host", async () => {
    // registered.ts loads the host lazily: its shell is tiny, so a 1 KiB
    // shell budget passes; clean.ts has tokens.css in its first load
    await expect(
      buildEntry("registered.ts", undefined, undefined, undefined, 1),
    ).resolves.toBeDefined();
    await expect(
      buildEntry("clean.ts", undefined, undefined, undefined, 0.1),
    ).rejects.toThrow(/shell \(first load\) .* over the 0\.1 KiB shell budget/);
  });
  it("007 R3 the default shell budget is 100 KiB", () => {
    expect(SHELL_KIB).toBe(100);
  });
  it("007 R3 fails when the build has no index entry and says so", async () => {
    await expect(
      build({
        configFile: false,
        logLevel: "silent",
        plugins: [sheetGuard()],
        build: {
          write: false,
          rollupOptions: {
            input: { other: resolve(fixtures, "clean-plain.ts") },
          },
        },
      }),
    ).rejects.toThrow(/no "index" entry chunk/);
  });
  it("007 R3 finds the sheet page in each build input form", () => {
    expect(
      hasSheetPage({ index: "/a/index.html", resume: "/a/resume.html" }),
    ).toBe(true);
    expect(hasSheetPage(["/a/index.html"])).toBe(true);
    expect(hasSheetPage("index.html")).toBe(true);
    expect(hasSheetPage({ next: "/a/next.html" })).toBe(false);
    expect(hasSheetPage({ x: "/a/notindex.html" })).toBe(false);
    expect(hasSheetPage(undefined)).toBe(false);
  });
});
