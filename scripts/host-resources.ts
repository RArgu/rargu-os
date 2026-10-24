// spec 002 R7 / assumption 3: the read-only files hosted apps need, generated
// at build time as `virtual:host-resources` (path → text, or base64 for
// binary files; the icons are 12 KB in all). A virtual module, so no
// src/apps/ module enters a /next chunk (001 R2.b). App content: 003 adds
// CastleSiege's songs; 004 adds its own.
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Plugin } from "vite";

const HOSTED = ["castlesiege", "paint", "tracker", "writer"];

/** fs path → source file. */
export function resourceFiles(root: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of [
    "themes/default.json",
    "themes/night.json",
    "associations.json",
  ])
    out[`/etc/${f}`] = join(root, "system/etc", f);
  for (const id of HOSTED)
    out[`/apps/${id}/manifest.json`] = join(
      root,
      "src/apps",
      id,
      "manifest.json",
    );
  const icons = join(root, "system/usr/share/icons");
  for (const n of readdirSync(icons).sort())
    if (n.endsWith(".png")) out[`/usr/share/icons/${n}`] = join(icons, n);
  // 003: CastleSiege's songs (music.ts). No rules: owner 2026-10-24
  for (const f of [
    "music/castlesiege-theme.trk",
    "music/castlesiege-victory.trk",
  ])
    out[`/usr/share/${f}`] = join(root, "system/usr/share", f);
  // 004: Music's bundled demo song (Tracker openDemo); the icons Paint and
  // Tracker use are in the icons folder above
  out["/home/guest/Music/demo.trk"] = join(
    root,
    "system/home/guest/Music/demo.trk",
  );
  return out;
}

const VIRTUAL = "virtual:host-resources";

export function hostResources(
  root = resolve(import.meta.dirname, ".."),
): Plugin {
  return {
    name: "host-resources",
    resolveId: (id) => (id === VIRTUAL ? `\0${VIRTUAL}` : undefined),
    load(id) {
      if (id !== `\0${VIRTUAL}`) return;
      const table: Record<string, { t: "text" | "bin"; d: string }> = {};
      for (const [path, src] of Object.entries(resourceFiles(root))) {
        this.addWatchFile(src);
        const data = readFileSync(src);
        table[path] = /\.(json|trk)$/.test(src)
          ? { t: "text", d: data.toString("utf8") }
          : { t: "bin", d: data.toString("base64") };
      }
      return `export default ${JSON.stringify(table)};`;
    },
  };
}
