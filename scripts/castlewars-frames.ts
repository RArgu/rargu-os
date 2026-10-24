// spec 005 R2 / R10: Castle Wars frame data, generated at build time from the
// six Aseprite JSON exports, as `virtual:castlewars-frames`. Each unit gets
// { w, h, tags, durations, src }; src is the PNG imported as an asset URL
// (001 R2.c). The build fails when any of the six PNG or JSON files is missing.
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Plugin } from "vite";

/** in the mock's order */
export const UNITS = [
  "swordsman",
  "spearman",
  "hammerman",
  "archer",
  "knight",
  "wizard",
] as const;
export type Unit = (typeof UNITS)[number];

/** the tags the Castle Wars window plays (R1) */
const NEEDED = ["idle", "walk", "attack", "victory", "death"];

export interface UnitFrames {
  /** one frame's size in px */
  w: number;
  h: number;
  /** tag name → [first, last] frame, inclusive (Aseprite frameTags) */
  tags: Record<string, [number, number]>;
  /** each frame's duration in ms, by frame index */
  durations: number[];
}

interface AsepriteFrame {
  frame: { w: number; h: number };
  duration: number;
}
interface Aseprite {
  frames: Record<string, AsepriteFrame> | AsepriteFrame[];
  meta: { frameTags: { name: string; from: number; to: number }[] };
}

/** One Aseprite JSON export → frame data. Throws with the unit's name. */
export function parseFrames(json: unknown, name: string): UnitFrames {
  const fail = (why: string): never => {
    throw new Error(`castlewars-frames: ${name}.json: ${why}`);
  };
  const d = json as Aseprite;
  const frames = Object.values(d?.frames ?? {});
  if (!frames.length) fail("no frames");
  const { w, h } = frames[0].frame;
  const durations = frames.map((f, i) => {
    if (f.frame.w !== w || f.frame.h !== h)
      fail(`frame ${i} size ${f.frame.w} × ${f.frame.h}, not ${w} × ${h}`);
    if (!(f.duration > 0)) fail(`frame ${i} has no duration`);
    return f.duration;
  });
  const tags: Record<string, [number, number]> = {};
  for (const t of d.meta?.frameTags ?? []) {
    if (!(t.from >= 0 && t.from <= t.to && t.to < frames.length))
      fail(`tag "${t.name}" frames ${t.from}–${t.to} out of range`);
    tags[t.name] = [t.from, t.to];
  }
  const missing = NEEDED.filter((t) => !(t in tags));
  if (missing.length) fail(`missing tags: ${missing.join(", ")}`);
  return { w, h, tags, durations };
}

const VIRTUAL = "virtual:castlewars-frames";

export function castlewarsFrames(
  dir = resolve(import.meta.dirname, "../src/apps/castlewars/art"),
): Plugin {
  // R10: a deleted sprite file fails every build, imported or not
  const check = () => {
    const missing = UNITS.flatMap((u) => [`${u}.png`, `${u}.json`]).filter(
      (f) => !existsSync(join(dir, f)),
    );
    if (missing.length)
      throw new Error(
        `castlewars-frames: missing in ${dir}:\n  ${missing.join("\n  ")}\n` +
          `  (spec 005 R10: the six Castle Wars PNG and JSON files must stay)`,
      );
  };
  return {
    name: "castlewars-frames",
    buildStart: check,
    resolveId: (id) => (id === VIRTUAL ? `\0${VIRTUAL}` : undefined),
    load(id) {
      if (id !== `\0${VIRTUAL}`) return;
      check();
      const units = UNITS.map((u) => {
        const file = join(dir, `${u}.json`);
        this.addWatchFile(file);
        const data = parseFrames(JSON.parse(readFileSync(file, "utf8")), u);
        return { u, data };
      });
      return [
        ...UNITS.map(
          (u) => `import ${u} from ${JSON.stringify(join(dir, `${u}.png`))};`,
        ),
        `export default {`,
        ...units.map(
          ({ u, data }) => `  ${u}: { ...${JSON.stringify(data)}, src: ${u} },`,
        ),
        `};`,
      ].join("\n");
    },
  };
}
