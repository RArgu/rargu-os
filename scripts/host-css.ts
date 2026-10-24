// 002 R13: scoped styles for the app host. `/next` loads the hosted apps'
// CSS, and the old OS's widget styles and tokens, only as `?host` modules:
// every rule is put under the host root class, and the old display rules
// (`html`, `body`, `.dpos` itself, the compact policy) and window-chrome rules
// (`.win*`, `.wm-*`) are dropped. `:root` becomes the host root.
//
// The old OS at `/` imports the same app modules (src/boot/main.ts globs
// them) and keeps their CSS unscoped. So the registry's lazy app imports
// resolve to `main.ts?host` (a module of its own for /next), and a `?host`
// module's CSS imports resolve to `?host` CSS. Only CSS changes: the apps'
// other modules stay shared.
import { relative, resolve } from "node:path";
import type { Plugin } from "vite";
import { REGISTRY } from "./sheet-guard.ts";

export const HOST_ROOT = ".host-root";
const NESTED = new Set(["media", "supports", "layer", "container"]);

/** Index of the first `stop` character at depth 0 (outside strings,
 * parentheses and brackets), from `i`; the length if none. */
function scan(src: string, i: number, stop: string): number {
  let quote = "";
  let depth = 0;
  for (; i < src.length; i++) {
    const c = src[i];
    if (quote) {
      if (c === "\\") i++;
      else if (c === quote) quote = "";
    } else if (c === '"' || c === "'") quote = c;
    else if (c === "(" || c === "[") depth++;
    else if (c === ")" || c === "]") depth--;
    else if (depth === 0 && stop.includes(c)) return i;
  }
  return i;
}

/** The end of the block whose `{` is at `open` (index after its `}`). */
function blockEnd(src: string, open: number): number {
  let depth = 0;
  for (let i = open; i < src.length; i = scan(src, i + 1, "{}")) {
    if (src[i] === "{") depth++;
    else if (--depth === 0) return i + 1;
  }
  return src.length;
}

/** `src` without comments; quoted text stays as it is. */
function stripComments(src: string): string {
  let out = "";
  for (let i = 0; i < src.length;) {
    const c = src[i];
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < src.length && src[j] !== c) j += src[j] === "\\" ? 2 : 1;
      out += src.slice(i, j + 1);
      i = j + 1;
    } else if (c === "/" && src[i + 1] === "*") {
      const e = src.indexOf("*/", i + 2);
      i = e < 0 ? src.length : e + 2;
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

/** A selector's syntax only: quoted text and attribute selectors blanked. */
const syntax = (sel: string): string =>
  sel.replace(/(["'])(?:\\.|(?!\1).)*\1/g, '""').replace(/\[[^\]]*\]/g, "[]");

/** :root, html, body or .dpos anywhere in a selector's syntax. */
const ROOTISH =
  /:root(?![\w-])|(^|[\s>+~(,])(html|body)(?![\w-])|\.dpos(?![\w-])/i;

/** One selector under the scope, or null to drop it. A root compound the
 * transform cannot place (e.g. `:is(:root, .x)`) fails the build. */
function scopeSelector(sel: string, scope: string): string | null {
  const s = syntax(sel);
  if (/^(html|body)(?![\w-])/i.test(s)) return null;
  if (/^\.dpos$/.test(s)) return null;
  if (/\.win(?![\w])|\.wm-/.test(s)) return null;
  if (/^\[data-policy/.test(sel)) return null;
  // what goes before the scope, and what goes under it
  let lead = "";
  let rest = ` ${sel}`;
  if (/^(:root|\.dpos)(?![\w-])/.test(s)) rest = sel.slice(5);
  else {
    // attributes the host sets on <html> (dataset.motion, R16)
    const m = /^\[data-motion[^\]]*\]\s*/.exec(sel);
    if (m) [lead, rest] = [`${m[0].trim()} `, ` ${sel.slice(m[0].length)}`];
  }
  if (ROOTISH.test(syntax(rest)))
    throw new Error(`host-css: cannot scope the selector "${sel}"`);
  return `${lead}${scope}${rest}`;
}

/** Puts every rule of `css` under `scope` (see the file comment). */
export function scopeCss(css: string, scope = HOST_ROOT): string {
  const src = stripComments(css);
  let out = "";
  for (let i = 0; i < src.length;) {
    const at = scan(src, i, "{;}");
    const prelude = src.slice(i, at).trim();
    if (at >= src.length || src[at] === "}") {
      i = at + 1;
      continue;
    }
    if (src[at] === ";") {
      // @import, @charset, a @layer statement
      out += `${prelude};`;
      i = at + 1;
      continue;
    }
    const end = blockEnd(src, at);
    const body = src.slice(at + 1, end - 1);
    i = end;
    if (prelude.startsWith("@")) {
      const name = /^@([\w-]+)/.exec(prelude)?.[1].toLowerCase() ?? "";
      // @keyframes, @font-face, @property... stay as they are
      out += NESTED.has(name)
        ? `${prelude}{${scopeCss(body, scope)}}`
        : `${prelude}{${body}}`;
      continue;
    }
    const sels: string[] = [];
    for (let j = 0; j < prelude.length;) {
      const k = scan(prelude, j, ",");
      const s = scopeSelector(prelude.slice(j, k).trim(), scope);
      if (s) sels.push(s);
      j = k + 1;
    }
    if (sels.length) out += `${sels.join(",")}{${body}}`;
  }
  return out;
}

const HOST = "?host";

export function hostCss(root = resolve(import.meta.dirname, "..")): Plugin {
  const registry = resolve(root, REGISTRY.module);
  const appMain = new RegExp(
    `^src/apps/(${REGISTRY.apps.join("|")})/main\\.ts$`,
  );
  return {
    name: "host-css",
    enforce: "pre",
    async resolveId(source, importer, options) {
      if (!importer || source.endsWith(HOST)) return;
      const from = importer.split("?")[0];
      const isHost = importer.endsWith(HOST);
      if (from !== registry && !(isHost && /\.css$/.test(source))) return;
      const r = await this.resolve(source, importer, {
        ...options,
        skipSelf: true,
      });
      if (!r || r.external) return r;
      const id = r.id.split("?")[0];
      if (isHost || appMain.test(relative(root, id))) return `${id}${HOST}`;
      return r;
    },
    transform(code, id) {
      const [file, query = ""] = id.split("?");
      if (file.endsWith(".css") && new URLSearchParams(query).has("host"))
        return { code: scopeCss(code), map: null };
    },
  };
}
