import { defineConfig } from "vitest/config";
import { readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import type { Plugin } from "vite";
import { castlewarsFrames } from "./scripts/castlewars-frames.ts";
import { hostResources } from "./scripts/host-resources.ts";
import { sheetContent } from "./scripts/sheet-content.ts";
import { hostChunks } from "./scripts/host-chunks.ts";
import { hostCss } from "./scripts/host-css.ts";
import { siteHead, type Identity } from "./scripts/site-identity.ts";
import {
  requireSheetPage,
  SHEET_PAGE,
  sheetGuard,
} from "./scripts/sheet-guard.ts";

const root = import.meta.dirname;

function identity(): Identity {
  try {
    return JSON.parse(
      readFileSync(resolve(root, "content/identity.json"), "utf8"),
    );
  } catch {
    return {};
  }
}

// 002 T3: fixture apps exist only in test builds (`vite build --mode e2e`,
// see playwright.config.ts); a production build that bundles any tests/
// module fails.
function noTestModules(): Plugin {
  let mode = "";
  return {
    name: "no-test-modules",
    apply: "build",
    configResolved(c) {
      mode = c.mode;
    },
    generateBundle(_options, bundle) {
      if (mode === "e2e") return;
      const bad = Object.values(bundle)
        .flatMap((c) => (c.type === "chunk" ? c.moduleIds : []))
        .map((id) => relative(root, id.split("?")[0]))
        .filter((id) => id.startsWith("tests/"));
      if (bad.length)
        this.error(
          `no-test-modules: a ${mode} build bundles test modules:\n  ${[...new Set(bad)].join("\n  ")}`,
        );
    },
  };
}

export default defineConfig(({ mode }) => ({
  base: "./",
  plugins: [
    sheetGuard(),
    noTestModules(),
    hostChunks(),
    // 002 R13: the hosted apps' and widgets' CSS under the host root
    hostCss(),
    // 013: the e2e build shows fixture write-ups (no real one ships yet)
    sheetContent(
      mode === "e2e"
        ? { overlay: resolve(root, "tests/fixtures/writeups") }
        : undefined,
    ),
    castlewarsFrames(),
    hostResources(),
    {
      // Title and description come from content/identity.json (007 R6).
      name: "site-identity",
      // 007 R3: no sheet page, no build
      buildStart: requireSheetPage("site-identity"),
      transformIndexHtml(html, ctx) {
        if (!ctx.filename.endsWith(`/${SHEET_PAGE}`)) return html;
        return siteHead(html, identity());
      },
    },
  ],
  build: {
    target: "es2022",
    rollupOptions: {
      output: {
        // 002 T3: the shared widget modules the hosted apps import get their
        // own chunk, shared by the host and the apps.
        manualChunks: (id) =>
          /\/src\/ui\/(dom|icons|menu|widgets)\.ts$/.test(id)
            ? "ui"
            : undefined,
        // name each app's lazy chunk after the app, so sizes are easy to audit
        chunkFileNames: (chunk) => {
          const m = /apps\/([^/]+)\/main\.ts$/.exec(chunk.facadeModuleId ?? "");
          return m ? `assets/app-${m[1]}-[hash].js` : "assets/[name]-[hash].js";
        },
      },
      input: {
        index: resolve(root, "index.html"),
        resume: resolve(root, "resume.html"),
      },
    },
  },
  test: {
    include: ["tests/unit/**/*.test.ts"],
    environment: "jsdom",
    setupFiles: ["tests/unit/setup.ts"],
  },
}));
