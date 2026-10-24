// @vitest-environment node
// spec 005 R2 / R2.a / R10: frame data generated at build time from the six
// Aseprite JSON files; the build fails when one of the twelve files is missing.
import { describe, expect, it } from "vitest";
import { cpSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { runInNewContext } from "node:vm";
import { join, resolve } from "node:path";
import { build, type Rollup } from "vite";
import {
  UNITS,
  castlewarsFrames,
  parseFrames,
} from "../../scripts/castlewars-frames.ts";
import { sheetGuard } from "../../scripts/sheet-guard.ts";

const root = resolve(import.meta.dirname, "../..");
const art = join(root, "src/apps/castlewars/art");
const fixtures = join(root, "tests/fixtures/castlewars");
const json = (file: string): unknown => JSON.parse(readFileSync(file, "utf8"));

function buildEntry(dir = art, entry = "entry.js") {
  return build({
    configFile: false,
    logLevel: "silent",
    root,
    plugins: [castlewarsFrames(dir), sheetGuard()],
    build: {
      write: false,
      rollupOptions: { input: { index: join(fixtures, entry) } },
    },
  }) as Promise<Rollup.RollupOutput>;
}

describe("R2.a frame data generator", () => {
  it("returns the fixture's changed sizes, tags and durations", () => {
    expect(parseFrames(json(join(fixtures, "changed.json")), "test")).toEqual({
      w: 12,
      h: 7,
      tags: {
        idle: [0, 0],
        walk: [1, 2],
        attack: [3, 3],
        death: [4, 4],
        victory: [5, 5],
      },
      durations: [90, 110, 130, 150, 170, 190],
    });
  });
  it("reads the real wizard.json: 80 × 50, walk = frames 2–9", () => {
    const d = parseFrames(json(join(art, "wizard.json")), "wizard");
    expect([d.w, d.h]).toEqual([80, 50]);
    expect(d.tags.walk).toEqual([2, 9]);
    expect(d.durations).toHaveLength(21);
  });
  it("fails and names the unit and tag when a needed tag is missing", () => {
    const d = json(join(fixtures, "changed.json")) as {
      meta: { frameTags: { name: string }[] };
    };
    d.meta.frameTags = d.meta.frameTags.filter((t) => t.name !== "victory");
    expect(() => parseFrames(d, "test")).toThrow(/test.*victory/);
  });
  it("fails when frames differ in size", () => {
    const d = json(join(fixtures, "changed.json")) as {
      frames: Record<string, { frame: { w: number } }>;
    };
    d.frames["test 3.aseprite"].frame.w = 13;
    expect(() => parseFrames(d, "test")).toThrow(/test.*size/);
  });
  it("lists the six units", () => {
    expect([...UNITS].sort()).toEqual([
      "archer",
      "hammerman",
      "knight",
      "spearman",
      "swordsman",
      "wizard",
    ]);
  });
});

/** A temp copy of the art folder, changed by `edit`; removed after `run`. */
async function withArt(
  edit: (dir: string) => void,
  run: (dir: string) => Promise<void>,
) {
  const dir = mkdtempSync(join(tmpdir(), "castlewars-art-"));
  try {
    cpSync(art, dir, { recursive: true });
    edit(dir);
    await run(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Builds entry.js and evaluates its chunk: the module's object and the PNG assets. */
async function built(dir: string) {
  const out = await buildEntry(dir);
  const chunk = out.output.find((f) => f.type === "chunk")!;
  const sandbox: { castlewarsUnits?: Record<string, Record<string, unknown>> } =
    {};
  runInNewContext(chunk.type === "chunk" ? chunk.code : "", sandbox);
  const pngs = out.output
    .filter((f) => f.type === "asset" && f.fileName.endsWith(".png"))
    .map((f) => f.fileName);
  return { units: sandbox.castlewarsUnits!, pngs };
}

const FILES = UNITS.flatMap((u) => [`${u}.png`, `${u}.json`]);

describe("R2 / R10 Vite plugin", () => {
  it("builds virtual:castlewars-frames through the sheet guard, PNGs as asset URLs", async () => {
    const { units, pngs } = await built(art);
    expect(Object.keys(units)).toEqual([...UNITS]);
    expect(pngs).toHaveLength(6);
    const w = units.wizard;
    expect(Object.keys(w).sort()).toEqual(
      ["durations", "h", "src", "tags", "w"].sort(),
    );
    expect([w.w, w.h]).toEqual([80, 50]);
    expect((w.tags as Record<string, number[]>).walk).toEqual([2, 9]);
    const real = json(join(art, "wizard.json")) as {
      frames: Record<string, { duration: number }>;
    };
    expect(w.durations).toEqual(
      Object.values(real.frames).map((f) => f.duration),
    );
    expect(w.src).toMatch(/^\/assets\/wizard-[\w-]+\.png$/);
    expect(pngs).toContain(String(w.src).slice(1));
    // every unit's src is its own emitted PNG
    for (const u of UNITS)
      expect(pngs).toContain(String(units[u].src).slice(1));
    expect(new Set(UNITS.map((u) => units[u].src)).size).toBe(6);
  });
  it("R2.a carries the changed fixture JSON through the plugin", () =>
    withArt(
      (dir) => cpSync(join(fixtures, "changed.json"), join(dir, "wizard.json")),
      async (dir) => {
        const { units, pngs } = await built(dir);
        const { src, ...data } = units.wizard;
        expect(data).toEqual(
          parseFrames(json(join(fixtures, "changed.json")), "test"),
        );
        expect(data).toMatchObject({
          w: 12,
          h: 7,
          tags: { walk: [1, 2], victory: [5, 5] },
          durations: [90, 110, 130, 150, 170, 190],
        });
        expect(pngs).toContain(String(src).slice(1));
      },
    ));
  it.each(["wizard.png", "knight.json"])(
    "fails the build and names the file when %s is missing (virtual import)",
    (file) =>
      withArt(
        (dir) => rmSync(join(dir, file)),
        (dir) =>
          expect(buildEntry(dir)).rejects.toThrow(
            new RegExp(`missing.*${file.replace(".", "\\.")}`, "s"),
          ),
      ),
  );
  it.each(FILES)(
    "R10 fails the build when %s is missing, with no virtual import",
    (file) =>
      withArt(
        (dir) => rmSync(join(dir, file)),
        (dir) =>
          expect(buildEntry(dir, "clean.js")).rejects.toThrow(
            new RegExp(`missing.*${file.replace(".", "\\.")}`, "s"),
          ),
      ),
  );
  it("passes the clean entry with all twelve files", async () => {
    await expect(buildEntry(art, "clean.js")).resolves.toBeDefined();
  });
});
