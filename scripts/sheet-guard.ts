// R2 / R2.b / R2.c / R22: lists every module bundled into the sheet entry's
// chunks (static and lazy imports, shared chunks, CSS and the stylesheets it
// pulls in by @import) and fails the build on old-OS code, and on any
// third-party module or resource URL in the entry's JS, CSS and HTML. Also
// prints the entry's JS + CSS gzip size and fails above the budget.
import { readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { gzipSync } from "node:zlib";
import type { Plugin, Rollup } from "vite";

// 007 T3: the old OS's folders (src/kernel, fs, wm, boot) are deleted. The
// rule stays, so they cannot come back into the site unnoticed (for example
// from the devpageos-final tag); its fixtures use a stand-in root
// (tests/fixtures/sheet-guard/root/).
const FORBIDDEN = /^src\/(kernel|fs|wm|boot|apps)\//;
// 002 T3: in chunks reached only through the app host's registered lazy app
// imports, src/apps/ modules are allowed; old-OS system code still is not
const FORBIDDEN_IN_APPS = /^src\/(kernel|fs|wm|boot)\//;

/** 007 R3: the sheet's page (served at /) and its build input name. */
export const SHEET_PAGE = "index.html";
export const SHEET_ENTRY = "index";

/** 007 R3: true when the build input has the sheet's page. */
export const hasSheetPage = (input: Rollup.InputOption | undefined): boolean =>
  (typeof input === "string" ? [input] : Object.values(input ?? {})).some(
    (f) => f === SHEET_PAGE || f.endsWith(`/${SHEET_PAGE}`),
  );

/** 007 R3: a build hook for the plugins that write into the sheet's page:
 * the build fails when its input has no such page. */
export function requireSheetPage(plugin: string) {
  return function (
    this: { error(msg: string): never },
    options: { input?: Rollup.InputOption },
  ): void {
    if (!hasSheetPage(options.input))
      this.error(
        `${plugin}: the build input has no ${SHEET_PAGE} (the sheet's page)`,
      );
  };
}

/** 002 R11: the app host's registry module and the apps it may import. */
export const REGISTRY = {
  module: "src/sheet/host/load.ts",
  apps: ["castlesiege", "paint", "tracker", "writer"],
};
// R2.c: the six Castle Wars sprites and their Aseprite JSON (spec 005)
const ALLOWED =
  /^src\/apps\/castlewars\/art\/(archer|hammerman|knight|spearman|swordsman|wizard)\.(png|json)$/;
/** A URL with a scheme, or protocol-relative, leaves the site (R2); data:
 * and blob: stay in the page. */
const external = (url: string) =>
  /^([a-z][a-z\d+.-]*:|\/\/)/i.test(url) && !/^(data|blob):/i.test(url);
const IMPORT = /@import\s+(?:url\(\s*)?(['"]?)([^'")\s;]+)\1/g;
/** CSS: @import and url() targets. */
const cssUrls = (css: string) =>
  [
    ...css.matchAll(IMPORT),
    ...css.matchAll(/url\(\s*(['"]?)([^'")]+?)\1\s*\)/g),
  ].map((m) => m[2].trim());
/** HTML: resource attributes of every element but links to pages. */
const htmlUrls = (html: string) =>
  [...html.matchAll(/<([a-z][\w-]*)\b([^>]*)>/gi)].flatMap(([, tag, attrs]) =>
    /^a$/i.test(tag) ||
    (/^link$/i.test(tag) && /\brel=["']?(canonical|alternate)\b/i.test(attrs))
      ? []
      : [
          ...attrs.matchAll(
            /\s(?:src|href|srcset|poster|data|action)\s*=\s*(["'])(.*?)\1/gi,
          ),
        ].flatMap((m) => m[2].split(",").map((u) => u.trim().split(/\s+/)[0])),
  );

/** R22: JS + CSS gzip budget of everything the sheet can load (fonts are
 * not JS or CSS). Owner 2026-10-24: 150 KiB (was 100); performance comes
 * before size. */
export const BUDGET_KIB = 150;
/** 007 R3: the shell's budget: the sheet page's first load (its entry
 * chunk, the chunks it imports statically, and their CSS). */
export const SHELL_KIB = 100;

export function sheetGuard(
  entry = SHEET_ENTRY,
  budgetKiB = BUDGET_KIB,
  registry = REGISTRY,
  shellKiB = SHELL_KIB,
): Plugin {
  let root = process.cwd();
  let e2e = false;
  return {
    name: "sheet-guard",
    apply: "build",
    configResolved(config) {
      root = config.root;
      e2e = config.mode === "e2e";
    },
    // after Vite has written the entry's HTML into the bundle
    generateBundle: {
      order: "post",
      async handler(_options, bundle) {
        const chunks = new Map(
          Object.values(bundle).flatMap((c) =>
            c.type === "chunk" ? [[c.fileName, c] as const] : [],
          ),
        );
        const start = [...chunks.values()].find(
          (c) => c.isEntry && c.name === entry,
        );
        if (!start)
          this.error(
            `sheet-guard: no "${entry}" entry chunk (is the sheet's page missing from the build input?)`,
          );
        const rel = (id: string) => relative(root, id.split("?")[0]);
        const appMain = new RegExp(
          `^src/apps/(${registry.apps.join("|")})/main\\.ts$`,
        );
        /** The registered app main modules the registry module itself
         * imports lazily (the source module graph, not chunk contents). */
        const regInfo = [...chunks.values()]
          .flatMap((c) => c.moduleIds)
          .find((m) => rel(m) === registry.module);
        const regTargets = new Set(
          (regInfo ? this.getModuleInfo(regInfo)?.dynamicallyImportedIds : [])
            ?.map(rel)
            .filter((m) => appMain.test(m)),
        );
        /** A chunk holding a registered app's main module, imported lazily
         * from the registry's chunk. */
        const registered = (from: string, to: string) =>
          chunks.get(from)!.moduleIds.some((m) => rel(m) === registry.module) &&
          !!chunks.get(to)?.moduleIds.some((m) => regTargets.has(rel(m)));
        // the sheet's chunks: everything reached from the entry except
        // through a registered app import; then the apps' own chunks
        const reached = new Set<string>();
        const appRoots: string[] = [];
        const todo = [start.fileName];
        for (let file; (file = todo.pop());) {
          const chunk = chunks.get(file);
          if (!chunk || reached.has(file)) continue;
          reached.add(file);
          todo.push(...chunk.imports);
          for (const d of chunk.dynamicImports)
            (registered(file, d) ? appRoots : todo).push(d);
        }
        const apps = new Set<string>();
        for (let file; (file = appRoots.pop());) {
          const chunk = chunks.get(file);
          if (!chunk || reached.has(file) || apps.has(file)) continue;
          apps.add(file);
          appRoots.push(...chunk.imports, ...chunk.dynamicImports);
        }
        const bad: string[] = [];
        // 001 R2.b: in the sheet's chunks only the registry module itself may
        // import an app lazily, and only a registered app's main module
        for (const file of reached)
          for (const m of chunks.get(file)!.moduleIds)
            for (const d of this.getModuleInfo(m)?.dynamicallyImportedIds ?? [])
              if (
                /^src\/apps\//.test(rel(d)) &&
                !(rel(m) === registry.module && regTargets.has(rel(d)))
              )
                bad.push(`${rel(d)} (lazy import from ${rel(m)})`);
        let forbidden = FORBIDDEN;
        const check = (id: string) => {
          const path = rel(id);
          if (forbidden.test(path) && !ALLOWED.test(path)) bad.push(path);
        };
        // Vite folds a stylesheet's @import into it: they are no modules of
        // their own, so follow them from the source files
        const seen = new Set<string>();
        const follow = async (file: string): Promise<void> => {
          if (seen.has(file)) return;
          seen.add(file);
          check(file);
          let src: string;
          try {
            src = readFileSync(file, "utf8");
          } catch {
            return;
          }
          for (const [, , spec] of src.matchAll(IMPORT)) {
            if (external(spec)) continue; // in the emitted CSS: checked below
            const rel = /^[./]/.test(spec) ? spec : `./${spec}`;
            const r =
              (await this.resolve(rel, file)) ??
              (await this.resolve(spec, file));
            if (r && !r.external) await follow(r.id.split("?")[0]);
          }
        };
        const off: string[] = [];
        /** Checks chunks' modules and CSS; returns their JS + CSS gzip size. */
        const scan = async (files: Set<string>): Promise<number> => {
          const css = new Set<string>();
          let gzip = 0;
          seen.clear();
          for (const file of files) {
            const chunk = chunks.get(file)!;
            // test builds: the host's fixture apps are no part of the site
            // (003 T1: they pushed the e2e build over the budget)
            const fixture =
              e2e &&
              chunk.moduleIds.every((m) =>
                rel(m).startsWith("tests/fixtures/host/"),
              );
            if (!fixture) gzip += gzipSync(chunk.code).length;
            chunk.viteMetadata?.importedCss.forEach((f) => css.add(f));
            // an import that is no chunk of this bundle is a third-party module
            for (const f of [...chunk.imports, ...chunk.dynamicImports])
              if (!(f in bundle)) off.push(f);
            for (const id of chunk.moduleIds)
              if (/\.css$/.test(id.split("?")[0]))
                await follow(id.split("?")[0]);
              else check(id);
          }
          for (const file of css) {
            const asset = bundle[file];
            if (asset?.type !== "asset") continue;
            gzip += gzipSync(asset.source).length;
            off.push(...cssUrls(String(asset.source)).filter(external));
          }
          cssCount += css.size;
          return gzip;
        };
        let cssCount = 0;
        // 007 R3: the shell is the page's first load: the entry chunk and
        // the chunks it imports statically. The rest of the sheet's chunks
        // load lazily: the demos' own chunks, and the rest (the app host).
        const shell = new Set<string>();
        const first = [start.fileName];
        for (let file; (file = first.pop());) {
          const chunk = chunks.get(file);
          if (!chunk || shell.has(file)) continue;
          shell.add(file);
          first.push(...chunk.imports);
        }
        const later = [...reached].filter((f) => !shell.has(f));
        const isDemo = (f: string) =>
          /^src\/sheet\/demos\//.test(rel(chunks.get(f)!.facadeModuleId ?? ""));
        const shellGzip = await scan(shell);
        const demoGzip = await scan(new Set(later.filter(isDemo)));
        const hostGzip = await scan(new Set(later.filter((f) => !isDemo(f))));
        forbidden = FORBIDDEN_IN_APPS;
        const appGzip = await scan(apps);
        if (bad.length) {
          this.error(
            `sheet-guard: "${entry}" bundles old-OS modules:\n  ${[...new Set(bad)].join("\n  ")}`,
          );
        }
        // the entry's page, when the entry is an HTML file (Vite names it
        // by an absolute or a root-relative path)
        const page =
          start.facadeModuleId && resolve(root, start.facadeModuleId);
        for (const f of Object.values(bundle))
          if (
            f.type === "asset" &&
            f.fileName.endsWith(".html") &&
            f.originalFileNames.some((o) => resolve(root, o) === page)
          )
            off.push(...htmlUrls(String(f.source)).filter(external));
        if (off.length) {
          this.error(
            `sheet-guard: "${entry}" loads third-party resources:\n  ${[...new Set(off)].join("\n  ")}`,
          );
        }
        // R22: everything the sheet can load counts, apps included (eligible
        // apps start on the first view)
        const kib = (n: number) => (n / 1024).toFixed(1);
        const total = shellGzip + demoGzip + hostGzip + appGzip;
        const size = `"${entry}" JS + CSS ${kib(total)} KiB gzip`;
        if (total > budgetKiB * 1024)
          this.error(`sheet-guard: ${size}, over the ${budgetKiB} KiB budget`);
        // 007 R3: the shell has its own budget
        if (shellGzip > shellKiB * 1024)
          this.error(
            `sheet-guard: "${entry}" shell (first load) JS + CSS ${kib(shellGzip)} KiB gzip, over the ${shellKiB} KiB shell budget`,
          );
        console.log(
          `sheet-guard: ${size} (shell ${kib(shellGzip)} of ${shellKiB} KiB; lazy: app host ${kib(hostGzip)}, demos ${kib(demoGzip)}, registered apps ${kib(appGzip)}; ${reached.size + apps.size} chunks, ${cssCount} css; budget ${budgetKiB} KiB)`,
        );
        // test builds: which app owns which asset (002 R11.a, 001 R2.a)
        if (e2e) {
          const owners: Record<string, string[]> = {};
          for (const id of registry.apps) {
            const todo = [...apps].filter((f) =>
              chunks
                .get(f)!
                .moduleIds.some((m) => rel(m) === `src/apps/${id}/main.ts`),
            );
            const mine = new Set<string>();
            for (let f; (f = todo.pop());) {
              const c = chunks.get(f);
              if (!c || mine.has(f) || !apps.has(f)) continue;
              mine.add(f);
              c.viteMetadata?.importedCss.forEach((css) => mine.add(css));
              todo.push(...c.imports, ...c.dynamicImports);
            }
            for (const f of mine) (owners[`/${f}`] ??= []).push(id);
          }
          this.emitFile({
            type: "asset",
            fileName: "host-assets.json",
            source: JSON.stringify(owners, null, 1),
          });
        }
      },
    },
  };
}
