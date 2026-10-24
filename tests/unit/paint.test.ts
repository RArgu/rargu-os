import { describe, expect, it } from "vitest";
import {
  blit,
  copyRegion,
  ellipse,
  fillRect,
  fitZoom,
  floodFill,
  getPixel,
  hexToRgb,
  line,
  rect,
  rgbToHex,
  stamp,
  type Pixels,
} from "../../src/apps/paint/raster";

const WHITE = 0xfff1e8;
const INK = 0x7e2553;
const BLUE = 0x29adff;

function blank(w: number, h: number, color = WHITE): Pixels {
  const buf = new Uint8ClampedArray(w * h * 4);
  fillRect(buf, w, h, 0, 0, w, h, color);
  return buf;
}

/** Renders the buffer as rows of "#" (ink) and "." (anything else). */
function art(buf: Pixels, w: number, h: number, ink = INK): string[] {
  const rows: string[] = [];
  for (let y = 0; y < h; y++) {
    let row = "";
    for (let x = 0; x < w; x++)
      row += getPixel(buf, w, h, x, y) === ink ? "#" : ".";
    rows.push(row);
  }
  return rows;
}

function count(buf: Pixels, w: number, h: number, color: number): number {
  let n = 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) if (getPixel(buf, w, h, x, y) === color) n++;
  return n;
}

function colors(buf: Pixels): Set<number> {
  const out = new Set<number>();
  for (let i = 0; i < buf.length; i += 4) {
    expect(buf[i + 3]).toBe(255);
    out.add((buf[i] << 16) | (buf[i + 1] << 8) | buf[i + 2]);
  }
  return out;
}

describe("paint raster: colors and pixels", () => {
  it("converts between hex strings and packed colors", () => {
    expect(hexToRgb("#7e2553")).toBe(0x7e2553);
    expect(hexToRgb("FFF1E8")).toBe(0xfff1e8);
    expect(hexToRgb("nope")).toBe(0);
    expect(rgbToHex(0x00e436)).toBe("#00e436");
  });

  it("reads pixels and returns null outside the picture", () => {
    const buf = blank(4, 3);
    expect(getPixel(buf, 4, 3, 3, 2)).toBe(WHITE);
    expect(getPixel(buf, 4, 3, 4, 0)).toBeNull();
    expect(getPixel(buf, 4, 3, 0, -1)).toBeNull();
  });

  it("clips filled boxes and brush stamps to the picture", () => {
    const buf = blank(4, 4);
    fillRect(buf, 4, 4, -2, -2, 4, 4, INK);
    expect(art(buf, 4, 4)).toEqual(["##..", "##..", "....", "...."]);
    stamp(buf, 4, 4, 3, 3, 4, INK);
    // a 4 px stamp at (3, 3) covers 1..4 on both axes; column and row 4 are clipped
    expect(art(buf, 4, 4)).toEqual(["##..", "####", ".###", ".###"]);
  });

  it("stamps a square brush of 1, 2 and 4 px", () => {
    for (const size of [1, 2, 4]) {
      const buf = blank(8, 8);
      stamp(buf, 8, 8, 4, 4, size, INK);
      expect(count(buf, 8, 8, INK)).toBe(size * size);
    }
  });
});

describe("paint raster: line", () => {
  it("draws horizontal, vertical and single-point lines", () => {
    const buf = blank(5, 5);
    line(buf, 5, 5, 0, 0, 4, 0, INK);
    line(buf, 5, 5, 0, 4, 0, 2, INK);
    line(buf, 5, 5, 4, 4, 4, 4, INK);
    expect(art(buf, 5, 5)).toEqual([
      "#####",
      ".....",
      "#....",
      "#....",
      "#...#",
    ]);
  });

  it("draws a Bresenham diagonal with one pixel per major step", () => {
    const buf = blank(8, 4);
    line(buf, 8, 4, 0, 0, 7, 3, INK);
    const rows = art(buf, 8, 4);
    expect(rows).toEqual(["##......", "..##....", "....##..", "......##"]);
    expect(count(buf, 8, 4, INK)).toBe(8);
  });

  it("is the same in both directions and clips off-picture ends", () => {
    const a = blank(9, 9);
    const b = blank(9, 9);
    line(a, 9, 9, 1, 1, 7, 7, INK);
    line(b, 9, 9, 7, 7, 1, 1, INK);
    expect(art(a, 9, 9)).toEqual(art(b, 9, 9));
    const c = blank(4, 4);
    line(c, 4, 4, -3, -3, 8, 8, INK);
    expect(art(c, 4, 4)).toEqual(["#...", ".#..", "..#.", "...#"]);
  });

  it("only writes the given color", () => {
    const buf = blank(16, 16);
    line(buf, 16, 16, 0, 3, 15, 11, INK, 2);
    expect(colors(buf)).toEqual(new Set([WHITE, INK]));
  });
});

describe("paint raster: rectangle", () => {
  it("draws an outline between two corners in any order", () => {
    const a = blank(6, 5);
    const b = blank(6, 5);
    rect(a, 6, 5, 1, 1, 4, 3, INK);
    rect(b, 6, 5, 4, 3, 1, 1, INK);
    expect(art(a, 6, 5)).toEqual([
      "......",
      ".####.",
      ".#..#.",
      ".####.",
      "......",
    ]);
    expect(art(b, 6, 5)).toEqual(art(a, 6, 5));
  });

  it("fills when asked", () => {
    const buf = blank(6, 5);
    rect(buf, 6, 5, 1, 1, 4, 3, INK, true);
    expect(count(buf, 6, 5, INK)).toBe(12);
  });

  it("grows a thick outline inward", () => {
    const buf = blank(8, 8);
    rect(buf, 8, 8, 0, 0, 7, 7, INK, false, 2);
    expect(art(buf, 8, 8)).toEqual([
      "########",
      "########",
      "##....##",
      "##....##",
      "##....##",
      "##....##",
      "########",
      "########",
    ]);
  });
});

describe("paint raster: ellipse", () => {
  it("draws a small circle outline", () => {
    const buf = blank(7, 7);
    ellipse(buf, 7, 7, 0, 0, 6, 6, INK);
    expect(art(buf, 7, 7)).toEqual([
      "..###..",
      ".#...#.",
      "#.....#",
      "#.....#",
      "#.....#",
      ".#...#.",
      "..###..",
    ]);
  });

  it("stays inside its box, touches all four sides and is symmetric", () => {
    for (const [bw, bh] of [
      [20, 11],
      [21, 12],
      [9, 30],
      [2, 2],
      [1, 7],
      [14, 1],
    ]) {
      const w = bw + 4;
      const h = bh + 4;
      const buf = blank(w, h);
      ellipse(buf, w, h, 2, 2, 2 + bw - 1, 2 + bh - 1, INK);
      const rows = art(buf, w, h);
      // nothing outside the box
      rows.forEach((row, y) => {
        [...row].forEach((ch, x) => {
          if (ch === "#") {
            expect(x >= 2 && x < 2 + bw && y >= 2 && y < 2 + bh).toBe(true);
          }
        });
      });
      expect(rows[2]).toContain("#");
      expect(rows[2 + bh - 1]).toContain("#");
      expect(rows.some((r) => r[2] === "#")).toBe(true);
      expect(rows.some((r) => r[2 + bw - 1] === "#")).toBe(true);
      // mirror symmetry in both axes
      expect([...rows].reverse()).toEqual(rows);
      expect(rows.map((r) => [...r].reverse().join(""))).toEqual(rows);
    }
  });

  it("gives the same shape for any corner order", () => {
    const a = blank(16, 12);
    const b = blank(16, 12);
    ellipse(a, 16, 12, 2, 1, 13, 9, INK);
    ellipse(b, 16, 12, 13, 9, 2, 1, INK);
    expect(art(b, 16, 12)).toEqual(art(a, 16, 12));
  });

  it("fills solid rows that cover the outline", () => {
    const outline = blank(24, 16);
    const solid = blank(24, 16);
    ellipse(outline, 24, 16, 1, 1, 22, 14, INK);
    ellipse(solid, 24, 16, 1, 1, 22, 14, INK, true);
    const o = art(outline, 24, 16);
    const s = art(solid, 24, 16);
    s.forEach((row, y) => {
      const first = row.indexOf("#");
      const last = row.lastIndexOf("#");
      if (first < 0) {
        expect(o[y]).not.toContain("#");
        return;
      }
      // one unbroken run per row, spanning the outline's extremes
      expect(row.slice(first, last + 1)).not.toContain(".");
      expect(o[y].indexOf("#")).toBe(first);
      expect(o[y].lastIndexOf("#")).toBe(last);
    });
    expect(colors(solid)).toEqual(new Set([WHITE, INK]));
  });
});

describe("paint raster: flood fill", () => {
  it("fills a 4-connected area and stops at diagonal gaps", () => {
    const w = 6;
    const h = 6;
    const buf = blank(w, h);
    // a diagonal wall: 8-connected, so a 4-connected fill must not cross it
    for (let i = 0; i < 6; i++) fillRect(buf, w, h, i, 5 - i, 1, 1, INK);
    const changed = floodFill(buf, w, h, 0, 0, BLUE);
    expect(changed).toBe(15);
    expect(count(buf, w, h, BLUE)).toBe(15);
    expect(count(buf, w, h, WHITE)).toBe(15);
    expect(count(buf, w, h, INK)).toBe(6);
  });

  it("fills inside an outline without leaking", () => {
    const buf = blank(10, 8);
    rect(buf, 10, 8, 2, 1, 7, 6, INK);
    expect(floodFill(buf, 10, 8, 4, 3, BLUE)).toBe(16);
    expect(getPixel(buf, 10, 8, 0, 0)).toBe(WHITE);
    expect(getPixel(buf, 10, 8, 2, 1)).toBe(INK);
  });

  it("winds through a concave shape", () => {
    const w = 7;
    const h = 5;
    const buf = blank(w, h);
    // walls leaving an S-shaped corridor
    fillRect(buf, w, h, 0, 1, 6, 1, INK);
    fillRect(buf, w, h, 1, 3, 6, 1, INK);
    expect(floodFill(buf, w, h, 0, 0, BLUE)).toBe(w * h - 12);
    expect(count(buf, w, h, WHITE)).toBe(0);
  });

  it("does nothing for the same color or a seed outside the picture", () => {
    const buf = blank(4, 4);
    expect(floodFill(buf, 4, 4, 1, 1, WHITE)).toBe(0);
    expect(floodFill(buf, 4, 4, 9, 9, BLUE)).toBe(0);
    expect(count(buf, 4, 4, WHITE)).toBe(16);
  });

  it("fills a whole 640x400 picture", () => {
    const buf = blank(640, 400);
    expect(floodFill(buf, 640, 400, 320, 200, INK)).toBe(640 * 400);
  });
});

describe("paint raster: regions", () => {
  it("cuts a region and pastes it elsewhere, clipped", () => {
    const w = 6;
    const h = 4;
    const buf = blank(w, h);
    fillRect(buf, w, h, 0, 0, 2, 2, INK);
    const piece = copyRegion(buf, w, h, 0, 0, 2, 2);
    fillRect(buf, w, h, 0, 0, 2, 2, WHITE);
    blit(buf, w, h, piece, 2, 2, 5, 3);
    expect(art(buf, w, h)).toEqual(["......", "......", "......", ".....#"]);
    blit(buf, w, h, piece, 2, 2, 2, 1);
    expect(art(buf, w, h)).toEqual(["......", "..##..", "..##..", ".....#"]);
  });

  it("leaves the parts of a copy that were off-picture transparent", () => {
    const buf = blank(3, 3, INK);
    const piece = copyRegion(buf, 3, 3, 2, 2, 2, 2);
    expect(piece[3]).toBe(255);
    expect(piece[7]).toBe(0);
    const dst = blank(3, 3);
    blit(dst, 3, 3, piece, 2, 2, 0, 0);
    expect(art(dst, 3, 3)).toEqual(["#..", "...", "..."]);
  });
});

describe("paint: zoom fit", () => {
  it("picks the largest of 4x/2x/1x that fits, else 1x", () => {
    expect(fitZoom(320, 200, 382, 430)).toBe(1);
    expect(fitZoom(160, 100, 382, 430)).toBe(2);
    expect(fitZoom(160, 100, 700, 430)).toBe(4);
    expect(fitZoom(640, 400, 382, 430)).toBe(1);
    expect(fitZoom(160, 100, 382, 150)).toBe(1);
  });
});
