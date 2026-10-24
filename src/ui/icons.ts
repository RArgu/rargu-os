// Icons are PNG files in the VFS. The window server installs a loader that
// turns a path into an object URL and caches it.
import { h } from "./dom";

export type IconLoader = (path: string) => Promise<string | null>;

let loader: IconLoader = async () => null;

export function setIconLoader(fn: IconLoader): void {
  loader = fn;
}

export const SYS_ICONS = "/usr/share/icons";

/** An icon element. `path` is absolute, or a bare name under /usr/share/icons. */
export function icon(
  path: string,
  size: 16 | 32 | 48 = 16,
  fallback?: string,
): HTMLElement {
  const el = h("span", { class: size === 16 ? "icon" : `icon i${size}` });
  setIcon(el, path, fallback);
  return el;
}

export function setIcon(
  el: HTMLElement,
  path: string,
  fallback?: string,
): void {
  const full = path.startsWith("/") ? path : `${SYS_ICONS}/${path}.png`;
  el.dataset.icon = full;
  void loader(full).then(async (url) => {
    if (!url && fallback) {
      url = await loader(
        fallback.startsWith("/") ? fallback : `${SYS_ICONS}/${fallback}.png`,
      );
    }
    if (url) url = await tinted(url);
    if (el.dataset.icon === full)
      el.style.backgroundImage = url ? `url("${url}")` : "";
  });
}

/** Re-applies every icon under `root` (the theme changed, so glyphs change colour). */
export function refreshIcons(root: ParentNode = document): void {
  for (const el of root.querySelectorAll<HTMLElement>("[data-icon]")) {
    const path = el.dataset.icon;
    if (path) setIcon(el, path);
  }
}

// ----- glyph icons -----
// A black-only icon (arrows, sound, print, ...) is drawn in the theme's --text
// colour, so it reads on night's dark chrome. The pixels are recoloured once
// per icon and colour, so the result is as crisp as the original and stays on
// the palette.

const mono = new Map<string, Promise<boolean>>();
const tints = new Map<string, Promise<string>>();

function textColor(): string {
  if (typeof getComputedStyle !== "function") return "";
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue("--text")
    .trim()
    .toLowerCase();
  const m = /^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/.exec(raw);
  if (m) {
    return (
      "#" +
      [m[1], m[2], m[3]]
        .map((n) => Number(n).toString(16).padStart(2, "0"))
        .join("")
    );
  }
  return /^#[0-9a-f]{6}$/.test(raw) ? raw : "";
}

async function pixels(
  url: string,
): Promise<{ data: ImageData; canvas: OffscreenCanvas } | null> {
  try {
    const blob = await (await fetch(url)).blob();
    const bmp = await createImageBitmap(blob);
    const canvas = new OffscreenCanvas(bmp.width, bmp.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(bmp, 0, 0);
    return { data: ctx.getImageData(0, 0, bmp.width, bmp.height), canvas };
  } catch {
    return null;
  }
}

function isMono(url: string): Promise<boolean> {
  let p = mono.get(url);
  if (!p) {
    p = (async () => {
      const img = await pixels(url);
      if (!img) return false;
      const d = img.data.data;
      let opaque = 0;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] === 0) continue;
        if (d[i] !== 0 || d[i + 1] !== 0 || d[i + 2] !== 0) return false;
        opaque++;
      }
      return opaque > 0;
    })();
    mono.set(url, p);
  }
  return p;
}

/** The icon's URL, recoloured when it is a black glyph and the text colour is not black. */
async function tinted(url: string): Promise<string> {
  if (
    typeof createImageBitmap !== "function" ||
    typeof OffscreenCanvas === "undefined"
  )
    return url;
  const color = textColor();
  if (!color || color === "#000000") return url;
  if (!(await isMono(url))) return url;
  const key = `${url}|${color}`;
  let p = tints.get(key);
  if (!p) {
    p = (async () => {
      const img = await pixels(url);
      if (!img) return url;
      const r = parseInt(color.slice(1, 3), 16);
      const g = parseInt(color.slice(3, 5), 16);
      const b = parseInt(color.slice(5, 7), 16);
      const d = img.data.data;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] === 0) continue;
        d[i] = r;
        d[i + 1] = g;
        d[i + 2] = b;
      }
      const ctx = img.canvas.getContext("2d");
      if (!ctx) return url;
      ctx.putImageData(img.data, 0, 0);
      const out = await img.canvas.convertToBlob({ type: "image/png" });
      return URL.createObjectURL(out);
    })();
    tints.set(key, p);
  }
  return p;
}
