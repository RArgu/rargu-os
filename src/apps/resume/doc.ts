// Shared document module: frontmatter, Markdown rendering, anchors, cards and
// images. Used by Resume and Reader (and by scripts/build-resume-html.ts, so the
// top of this file must not touch the DOM at import time).
import { Marked, type Tokens } from "marked";
import type { OS } from "../../sdk/os.d.ts";

export type Frontmatter = Record<string, string | string[]>;

/** Hand-rolled frontmatter parser: scalars, inline lists [a, b], block lists (- item). */
export function parseFrontmatter(src: string): {
  meta: Frontmatter;
  body: string;
} {
  const meta: Frontmatter = {};
  const m = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(\r?\n|$)/.exec(src);
  if (!m) return { meta, body: src };
  const unquote = (v: string): string =>
    v.trim().replace(/^(["'])(.*)\1$/, "$2");
  let listKey: string | null = null;
  for (const line of m[1].split(/\r?\n/)) {
    const item = /^\s+-\s+(.*)$/.exec(line) ?? /^-\s+(.*)$/.exec(line);
    if (item && listKey) {
      (meta[listKey] as string[]).push(unquote(item[1]));
      continue;
    }
    const kv = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line);
    if (!kv) continue;
    const [, key, raw] = kv;
    const value = raw.trim();
    listKey = null;
    if (value === "") {
      meta[key] = [];
      listKey = key;
    } else if (value.startsWith("[") && value.endsWith("]")) {
      const inner = value.slice(1, -1).trim();
      meta[key] = inner === "" ? [] : inner.split(",").map(unquote);
    } else {
      meta[key] = unquote(value);
    }
  }
  return { meta, body: src.slice(m[0].length) };
}

export interface Anchor {
  id: string;
  text: string;
}

export interface Rendered {
  html: string;
  anchors: Anchor[];
  /** text of the first # heading, if any */
  title: string | null;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function safeHref(href: string): string | null {
  const h = href.trim();
  if (/^(https?:|mailto:)/i.test(h)) return h;
  if (/^[a-z][a-z0-9+.-]*:/i.test(h)) return null; // javascript:, data:, ...
  return h;
}

/**
 * Markdown to sanitized HTML. Raw HTML in the source is dropped, which also
 * strips <!-- --> comments, so TODO(content) notes never show.
 */
export function renderMarkdown(src: string): Rendered {
  const anchors: Anchor[] = [];
  let title: string | null = null;
  const used = new Set<string>();
  const marked = new Marked({
    gfm: true,
    renderer: {
      html(): string {
        return "";
      },
      heading(
        this: { parser: { parseInline(t: Tokens.Generic[]): string } },
        token: Tokens.Heading,
      ): string {
        const inner = this.parser.parseInline(token.tokens);
        const plain = token.text.replace(/[*_`[\]]/g, "");
        if (token.depth === 1 && title === null) title = plain;
        if (token.depth === 2) {
          let id = "sec-" + (slug(plain) || "section");
          while (used.has(id)) id += "-x";
          used.add(id);
          anchors.push({ id, text: plain });
          return `<h2 id="${id}">${inner}</h2>\n`;
        }
        return `<h${token.depth}>${inner}</h${token.depth}>\n`;
      },
      link(
        this: { parser: { parseInline(t: Tokens.Generic[]): string } },
        token: Tokens.Link,
      ): string {
        const inner = this.parser.parseInline(token.tokens);
        const href = safeHref(token.href);
        if (href === null) return inner;
        return `<a href="${escapeHtml(href)}">${inner}</a>`;
      },
      image(token: Tokens.Image): string {
        const src = safeHref(token.href);
        if (src === null) return escapeHtml(token.text);
        // Images are loaded from the VFS after rendering; see loadImages().
        return `<img data-src="${escapeHtml(src)}" alt="${escapeHtml(token.text)}">`;
      },
    },
  });
  const html = marked.parse(src, { async: false }) as string;
  return { html, anchors, title };
}

// ---------- DOM side (only runs inside the OS) ----------

const ALLOWED = new Set(
  "h1 h2 h3 h4 h5 h6 p ul ol li a strong em b i code pre blockquote hr br img table thead tbody tr th td del span section div".split(
    " ",
  ),
);
const ATTRS: Record<string, string[]> = {
  a: ["href"],
  img: ["data-src", "alt"],
  h2: ["id"],
  th: ["align"],
  td: ["align"],
};

/** Parses rendered HTML into a fragment, dropping every tag and attribute not on the whitelist. */
export function sanitize(html: string): DocumentFragment {
  const tpl = document.createElement("template");
  tpl.innerHTML = html;
  const walk = (node: Element): void => {
    for (const child of [...node.children]) {
      const tag = child.tagName.toLowerCase();
      if (!ALLOWED.has(tag)) {
        child.replaceWith(document.createTextNode(child.textContent ?? ""));
        continue;
      }
      for (const attr of [...child.attributes]) {
        if (!(ATTRS[tag] ?? []).includes(attr.name))
          child.removeAttribute(attr.name);
      }
      walk(child);
    }
  };
  walk(tpl.content as unknown as Element);
  return tpl.content;
}

/** Wraps each ### block (the heading and what follows it) in a card section. */
export function wrapCards(root: ParentNode): void {
  const stop = new Set(["H1", "H2", "H3"]);
  for (const h3 of [...root.querySelectorAll("h3")]) {
    const card = document.createElement("section");
    card.className = "doc-card";
    h3.before(card);
    let node: Element | null = h3;
    while (node) {
      const next: Element | null = node.nextElementSibling;
      card.append(node);
      if (!next || stop.has(next.tagName)) break;
      node = next;
    }
  }
}

function resolveRelative(baseDir: string, href: string): string {
  const out: string[] = [];
  for (const part of (href.startsWith("/") ? href : `${baseDir}/${href}`).split(
    "/",
  )) {
    if (part === "" || part === ".") continue;
    if (part === "..") out.pop();
    else out.push(part);
  }
  return "/" + out.join("/");
}

export function resolveLink(baseDir: string, href: string): string {
  return resolveRelative(baseDir, decodeURI(href.split("#")[0]));
}

const IMAGE_TYPES: Record<string, string> = {
  png: "image/png",
  gif: "image/gif",
};

/**
 * Loads <img data-src> from the VFS through object URLs. Returns a function
 * that revokes them; call it when the window closes or the document changes.
 */
export function loadImages(
  os: OS,
  root: ParentNode,
  baseDir: string,
): () => void {
  const urls: string[] = [];
  let live = true;
  for (const img of [
    ...root.querySelectorAll<HTMLImageElement>("img[data-src]"),
  ]) {
    const src = img.dataset.src ?? "";
    const note = (text: string): void => {
      const el = document.createElement("span");
      el.className = "doc-missing";
      el.textContent = text;
      img.replaceWith(el);
    };
    if (/^[a-z][a-z0-9+.-]*:/i.test(src)) {
      // the OS has no network access; remote images are not fetched
      note(`[image: ${img.alt || src}]`);
      continue;
    }
    const path = resolveLink(baseDir, src);
    const type =
      IMAGE_TYPES[path.slice(path.lastIndexOf(".") + 1).toLowerCase()];
    void os.fs.readFile(path).then(
      (data) => {
        if (!live || !type) return note(`[image not shown: ${img.alt || src}]`);
        const url = URL.createObjectURL(new Blob([data as BlobPart], { type }));
        urls.push(url);
        img.src = url;
      },
      () => note(`[image not found: ${src}]`),
    );
  }
  return () => {
    live = false;
    for (const url of urls) URL.revokeObjectURL(url);
  };
}
