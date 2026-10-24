// 002 R11, R12: the app host's lazy chunks. In a build it emits the host
// (src/sheet/host/load.ts, chunk "load") and each registered app's main
// module (chunk "app-<id>", so its CSS is app-<id>-[hash].css too: Vite names
// a chunk's CSS after the chunk) as named chunks, plus fixture apps in test
// builds (mode e2e). Two virtual modules give their URLs, so Try again can
// import a chunk afresh after a failed load (a browser may keep a failed
// module fetch for its URL): `virtual:host-url` (the host, for the sheet)
// and `virtual:app-urls` (app id → URL, for the host). In dev they are empty
// and Try again imports the same URL again.
import { existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import type { Plugin } from "vite";
import { REGISTRY } from "./sheet-guard.ts";

const HOST = "virtual:host-url";
const APPS = "virtual:app-urls";
const FIXTURES = "tests/fixtures/host/apps";

export function hostChunks(root = resolve(import.meta.dirname, "..")): Plugin {
  let build = false;
  let e2e = false;
  let host = "";
  const apps = new Map<string, string>();
  return {
    name: "host-chunks",
    configResolved(c) {
      build = c.command === "build";
      e2e = c.mode === "e2e";
    },
    buildStart() {
      apps.clear();
      host = "";
      if (!build) return;
      host = this.emitFile({
        type: "chunk",
        id: resolve(root, REGISTRY.module),
        name: "load",
      });
      // `?host`: /next's own module of the app (scripts/host-css.ts)
      const files: [string, string][] = REGISTRY.apps.map((id) => [
        id,
        `src/apps/${id}/main.ts?host`,
      ]);
      const fixtures = resolve(root, FIXTURES);
      if (e2e && existsSync(fixtures))
        for (const f of readdirSync(fixtures))
          files.push([f, `${FIXTURES}/${f}/main.ts`]);
      for (const [id, f] of files)
        apps.set(
          id,
          this.emitFile({
            type: "chunk",
            id: resolve(root, f),
            name: `app-${id}`,
          }),
        );
    },
    resolveId: (id) => (id === HOST || id === APPS ? `\0${id}` : undefined),
    load(id) {
      if (id === `\0${HOST}`)
        return `export default ${host ? `import.meta.ROLLUP_FILE_URL_${host}` : "null"};`;
      if (id === `\0${APPS}`)
        return `export default {${[...apps]
          .map(
            ([a, ref]) =>
              `${JSON.stringify(a)}: import.meta.ROLLUP_FILE_URL_${ref}`,
          )
          .join(", ")}};`;
    },
  };
}
