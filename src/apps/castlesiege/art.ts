// CastleSiege sprites: Rodrigo's own 16x16 piece drawings (see VENDOR.md),
// re-encoded as masks and painted in the theme's palette with a one-pixel
// contrasting outline, so cream pieces read on peach squares (SPEC §7.14).
import { bitmapUrl } from "../lib/palette";

/** The six piece shapes; White and Black share them. "#" is ink. */
export const MASKS: Record<string, string[]> = {
  bow: [
    "................",
    "................",
    "................",
    "....####...###..",
    "..########..##..",
    ".###....####.#..",
    "..#.......###...",
    "...#.....#.##...",
    "....#...#..###..",
    ".....#.#....##..",
    "......#.....##..",
    ".....#.#....##..",
    "....#...#..##...",
    "...#.....#.##...",
    "..........##....",
    "................",
  ],
  hammer: [
    "................",
    ".......#........",
    "......###.......",
    ".....#####.##...",
    "....#########...",
    ".....#######....",
    "......#######...",
    ".......#######..",
    "......#########.",
    ".....###.#####..",
    "....###...###...",
    "...###.....#....",
    "..###...........",
    ".###............",
    "..#.............",
    "................",
  ],
  king: [
    "................",
    "................",
    "................",
    "................",
    ".#.....##.....#.",
    "###...####...###",
    "####.######.####",
    "################",
    "################",
    "################",
    "################",
    "################",
    "################",
    ".##############.",
    "................",
    "................",
  ],
  spear: [
    ".............###",
    "..............##",
    ".............#.#",
    "............#...",
    "...........#....",
    "..........#.....",
    ".........#......",
    "........#.......",
    ".......#........",
    "......#.........",
    ".....#..........",
    "....#...........",
    "...#............",
    "..#.............",
    ".#..............",
    "#...............",
  ],
  sword: [
    "................",
    "............###.",
    "...........####.",
    "..........#####.",
    ".........#####..",
    "........#####...",
    ".......#####....",
    "...##.#####.....",
    "...#######......",
    "....#####.......",
    "....####........",
    "...######.......",
    "..###..##.......",
    ".###............",
    ".##.............",
    "................",
  ],
  wall: [
    ".##############.",
    "################",
    "##.......#..#.##",
    "####.##..#..#.##",
    "##............##",
    "##..#..#......##",
    "##..#..#......##",
    "##.......#..#.##",
    "####.##..#..#.##",
    "##............##",
    "##..#..##.##..##",
    "##..#..#......##",
    "####.##..#..#.##",
    "##.......#..#.##",
    "################",
    ".##############.",
  ],
};

/** Palette slots per side (SPEC §7.14): cream with a black edge, black with a cream edge. */
export const SIDE = {
  white: { ink: "7", edge: "0" },
  black: { ink: "0", edge: "7" },
} as const;

/**
 * An 18x18 sprite: the mask in the side's ink, dilated by one pixel in the
 * edge colour. Both sides share the Wall's shape, so a Wall is stone (slot 6)
 * with black mortar inside a frame in the owner's colour, and the owner's
 * colour on its top row of stones.
 */
export function spriteRows(type: string, side: "white" | "black"): string[] {
  const mask = MASKS[type] ?? MASKS.king;
  const n = 18;
  const grid = Array.from({ length: n }, () => Array<string>(n).fill("."));
  const ink = (x: number, y: number): boolean =>
    x >= 0 && y >= 0 && x < 16 && y < 16 && mask[y][x] === "#";
  const paint = (x: number, y: number): string | null => {
    if (!ink(x, y)) return null;
    if (type !== "wall") return SIDE[side].ink;
    // a Wall's outer frame is the owner's colour, its mortar black
    const frame = x <= 1 || x >= 14 || y <= 1 || y >= 14;
    return frame ? SIDE[side].ink : "0";
  };
  if (type === "wall") {
    for (let y = 2; y < 14; y++) {
      for (let x = 2; x < 14; x++) {
        if (!ink(x, y)) grid[y + 1][x + 1] = y <= 3 ? SIDE[side].ink : "6";
      }
    }
  }
  for (let y = -1; y <= 16; y++) {
    for (let x = -1; x <= 16; x++) {
      const c = paint(x, y);
      if (c) {
        grid[y + 1][x + 1] = c;
        continue;
      }
      if (grid[y + 1][x + 1] !== ".") continue;
      let near = false;
      for (let dy = -1; dy <= 1 && !near; dy++) {
        for (let dx = -1; dx <= 1 && !near; dx++) near = ink(x + dx, y + dy);
      }
      if (near) grid[y + 1][x + 1] = SIDE[side].edge;
    }
  }
  return grid.map((r) => r.join(""));
}

/** CSS url() values for every piece, by "<side>-<type>", in the given palette. */
export function buildSprites(palette: string[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const type of Object.keys(MASKS)) {
    for (const side of ["white", "black"] as const) {
      out.set(`${side}-${type}`, bitmapUrl(spriteRows(type, side), palette));
    }
  }
  return out;
}

/** A piece's name for people. */
export const PIECE_NAMES: Record<string, string> = {
  king: "King",
  wall: "Wall",
  sword: "Sword",
  hammer: "Hammer",
  spear: "Spear",
  bow: "Bow",
};
