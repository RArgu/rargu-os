// The theme's 16-colour palette for apps that draw pixel art in it
// (Sappers, Solitaire, CastleSiege). Classic 16 is the fallback.
import type { OS } from "../../sdk/os";

export const CLASSIC_16 = [
  "#000000",
  "#1d2b53",
  "#7e2553",
  "#008751",
  "#ab5236",
  "#5f574f",
  "#c2c3c7",
  "#fff1e8",
  "#ff004d",
  "#ffa300",
  "#ffec27",
  "#00e436",
  "#29adff",
  "#83769c",
  "#ff77a8",
  "#ffccaa",
];

/** The active theme's palette, or Classic 16 when the theme file is unreadable. */
export async function loadPalette(os: OS): Promise<string[]> {
  try {
    const theme = JSON.parse(
      await os.fs.readText(`/etc/themes/${os.sys.theme.get()}.json`),
    ) as { palette?: unknown };
    const p = theme.palette;
    if (
      Array.isArray(p) &&
      p.length === 16 &&
      p.every((c) => typeof c === "string")
    ) {
      return p as string[];
    }
  } catch {
    // fall through
  }
  return CLASSIC_16;
}

/** WCAG contrast ratio of two #rrggbb colours. */
export function contrast(a: string, b: string): number {
  const lum = (hex: string): number => {
    const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    const [r, g, bl] = c.map((v) =>
      v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4,
    );
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/** Bitmap rows use one hex digit per pixel (a palette slot) and "." for clear. */
export function bitmapUrl(rows: string[], palette: string[]): string {
  const canvas = document.createElement("canvas");
  canvas.width = rows[0].length;
  canvas.height = rows.length;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      if (row[x] === ".") continue;
      ctx.fillStyle = palette[parseInt(row[x], 16)];
      ctx.fillRect(x, y, 1, 1);
    }
  });
  return `url("${canvas.toDataURL("image/png")}")`;
}
