// Spec 013 R12: a page per write-up at /p/<id>/. Each one is the built sheet
// page (the sheet cannot start without its #vp, #world, card and windows) with
// its own head, `data-open="<id>:read"` on <body> (main.ts opens the window
// expanded in Read; readme.css shows the write-up without JavaScript), and
// absolute asset URLs: the build uses base "./", which would resolve under
// /p/<id>/.
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Plugin } from "vite";
import { loadProjects, type Project } from "./sheet-content.ts";

const SITE = "https://rargu.dev";
const root = resolve(import.meta.dirname, "..");

const esc = (s: string): string =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** The sheet page `html` as the write-up page of `p`. */
export function pPage(html: string, p: Project): string {
  const title = esc(`${p.title} · RArgu OS`);
  const desc = esc(p.writeup!.lede);
  const url = `${SITE}/p/${p.id}/`;
  const set = (re: RegExp, to: string) => {
    if (!re.test(html)) throw new Error(`p-pages: no ${re} in the sheet page`);
    html = html.replace(re, () => to);
  };
  set(/<title>[^<]*<\/title>/, `<title>${title}</title>`);
  set(/<link rel="canonical"[^>]*>/, `<link rel="canonical" href="${url}" />`);
  set(
    /<meta property="og:type"[^>]*>/,
    `<meta property="og:type" content="article" />`,
  );
  set(
    /<meta property="og:url"[^>]*>/,
    `<meta property="og:url" content="${url}" />`,
  );
  set(
    /<meta property="og:title"[^>]*>/,
    `<meta property="og:title" content="${title}" />`,
  );
  set(
    /<meta property="og:description"[^>]*>/,
    `<meta property="og:description" content="${desc}" />`,
  );
  set(
    /<meta name="description"[^>]*>/,
    `<meta name="description" content="${desc}" />`,
  );
  set(/<body>/, `<body data-open="${p.id}:read">`);
  // the window that opens: no-JS CSS shows only it
  set(new RegExp(`data-win="${p.id}"`), `data-win="${p.id}" data-open`);
  return html.replace(/(\s(?:src|href)=")\.\//g, "$1/");
}

/** Local URLs in `html` that are no file of the build or of public/. */
export function missing(html: string, files: Set<string>): string[] {
  return [...html.matchAll(/\s(?:src|href)="(\/[^"]*)"/g)]
    .map((m) => m[1].split(/[?#]/)[0])
    .filter((u) => !u.startsWith("//"))
    .filter((u) => {
      const f = u.slice(1);
      // page links (/resume, /p/…) are no resources
      if (!/\.\w+$/.test(f)) return false;
      return !files.has(f) && !existsSync(join(root, "public", f));
    });
}

export function writeupPages({
  projects = join(root, "content/projects"),
  overlay = undefined as string | undefined,
} = {}): Plugin {
  return {
    name: "writeup-pages",
    apply: "build",
    generateBundle: {
      order: "post",
      handler(_options, bundle) {
        const index = bundle["index.html"];
        if (index?.type !== "asset") return;
        const files = new Set(Object.keys(bundle));
        for (const p of loadProjects(projects, overlay)) {
          if (!p.writeup) continue;
          const html = pPage(String(index.source), p);
          const bad = missing(html, files);
          if (bad.length)
            this.error(
              `p-pages: /p/${p.id}/ links missing files:\n  ${bad.join("\n  ")}`,
            );
          if (/\s(?:src|href)="\.\//.test(html))
            this.error(`p-pages: /p/${p.id}/ still has a relative asset URL`);
          // R15: the same JS and CSS as the sheet page, so the same budgets
          const assets = (h: string, dot: string) =>
            [...h.matchAll(new RegExp(`"${dot}(assets/[^"]+)"`, "g"))]
              .map((m) => m[1])
              .join();
          if (assets(html, "/") !== assets(String(index.source), "\\./"))
            this.error(
              `p-pages: /p/${p.id}/ loads other assets than the sheet page`,
            );
          this.emitFile({
            type: "asset",
            fileName: `p/${p.id}/index.html`,
            source: html,
          });
        }
      },
    },
  };
}
