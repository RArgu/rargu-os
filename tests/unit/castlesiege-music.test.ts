// CastleSiege's Tracker songs (Stage E item 3): each parses, and the real synth
// renders it, through a small offline Web Audio for Node, to sound of the
// length its rows and tempo give. Nobody can listen in a test; these only
// prove the songs are well formed, make sound, do not clip and end.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  SAMPLE_RATE,
  parseSong,
  playFile,
  renderSong,
  songSeconds,
} from "../../src/apps/tracker/engine";
import type { OS } from "../../src/sdk/os";
import { OfflineContext } from "./offline-audio";

const MUSIC = join(__dirname, "../../system/usr/share/music");
// 007 T3: the old desktop's jingle is a test fixture now
const FIXTURES = join(__dirname, "../fixtures/music");
const read = (name: string): string =>
  readFileSync(join(name === "jingle.trk" ? FIXTURES : MUSIC, name), "utf8");

const g = globalThis as Record<string, unknown>;
let saved: unknown;
beforeAll(() => {
  saved = g.OfflineAudioContext;
  g.OfflineAudioContext = OfflineContext;
});
afterAll(() => {
  g.OfflineAudioContext = saved;
});

function stats(samples: Float32Array, from = 0, to = samples.length) {
  let sum = 0;
  let peak = 0;
  for (let i = from; i < to; i++) {
    sum += samples[i] * samples[i];
    peak = Math.max(peak, Math.abs(samples[i]));
  }
  return { rms: Math.sqrt(sum / Math.max(1, to - from)), peak };
}

describe("CastleSiege songs", () => {
  const songs = [
    // file, bpm, rows in one pass, loops back to
    { file: "castlesiege-victory.trk", bpm: 132, rows: 48, min: 3, max: 8 },
    { file: "castlesiege-theme.trk", bpm: 100, rows: 128, min: 10, max: 30 },
    // the old desktop's jingle, a known-good song, checks the renderer itself
    { file: "jingle.trk", bpm: 150, rows: 16, min: 1, max: 3 },
  ];

  for (const s of songs) {
    it(`${s.file} parses and renders to sound of the expected length`, async () => {
      const song = parseSong(read(s.file));
      expect(song.bpm).toBe(s.bpm);
      const rows = song.order.reduce(
        (n, p) => n + song.patterns[p].rows.length,
        0,
      );
      expect(rows).toBe(s.rows);
      const seconds = (rows * 60) / s.bpm / 4;
      expect(songSeconds(song)).toBeCloseTo(seconds, 9);
      expect(seconds).toBeGreaterThanOrEqual(s.min);
      expect(seconds).toBeLessThanOrEqual(s.max);

      const samples = await renderSong(song);
      // one pass plus the half second renderSong leaves for the last notes
      expect(samples.length).toBe(Math.ceil((seconds + 0.5) * SAMPLE_RATE));
      const all = stats(samples);
      expect(all.rms).toBeGreaterThan(0.02);
      expect(all.peak).toBeLessThanOrEqual(1);
      // every second of the song makes sound...
      for (let sec = 0; sec + 1 <= seconds; sec++) {
        const part = stats(samples, sec * SAMPLE_RATE, (sec + 1) * SAMPLE_RATE);
        expect(part.rms, `${s.file} second ${sec}`).toBeGreaterThan(0.005);
      }
      // ...and the tail after the last release is silent
      const tail = stats(samples, samples.length - SAMPLE_RATE / 10);
      expect(tail.peak).toBeLessThan(0.01);
    });
  }

  it("the theme loops to its start and the victory tune does not need to", () => {
    const theme = parseSong(read("castlesiege-theme.trk"));
    expect(theme.loop).toBe(0);
    expect(theme.order).toEqual([0, 1, 2, 3]);
    const victory = parseSong(read("castlesiege-victory.trk"));
    expect(victory.order).toEqual([0, 1]);
  });
});

describe("playFile", () => {
  it("stops a looping song when its signal aborts", async () => {
    // a live context whose clock never moves: the song would never end alone
    class FrozenContext extends OfflineContext {
      state = "running";
      constructor() {
        super(1, 1, SAMPLE_RATE);
      }
    }
    const savedCtx = g.AudioContext;
    g.AudioContext = FrozenContext;
    try {
      const os = {
        fs: { readText: async () => read("castlesiege-theme.trk") },
      } as unknown as OS;
      const ctl = new AbortController();
      const done = playFile(os, "/x.trk", { loop: true, signal: ctl.signal });
      await new Promise((r) => setTimeout(r, 60));
      ctl.abort();
      await expect(done).resolves.toBeUndefined();
      // an already aborted signal plays nothing
      await expect(
        playFile(os, "/x.trk", { signal: ctl.signal }),
      ).resolves.toBeUndefined();
    } finally {
      g.AudioContext = savedCtx;
    }
  });
});

describe("Music (CastleSiege's player)", () => {
  /** Music with a stand-in engine: each playFile call, held until the song is stopped. */
  async function setup() {
    const calls: { path: string; signal: AbortSignal }[] = [];
    vi.resetModules();
    vi.doMock("../../src/apps/tracker/engine", () => ({
      playFile: (_os: OS, path: string, o: { signal: AbortSignal }) => {
        calls.push({ path, signal: o.signal });
        return new Promise<void>((r) =>
          o.signal.addEventListener("abort", () => r()),
        );
      },
      audioContext: () => ({}),
    }));
    const m = await import("../../src/apps/castlesiege/music");
    const music = new m.Music({ log: () => {} } as unknown as OS);
    return { m, music, calls };
  }
  const settle = () => new Promise((r) => setTimeout(r, 0));

  it("stop() while the engine still loads cancels that song: it starts aborted", async () => {
    const { m, music, calls } = await setup();
    music.play(m.VICTORY, false);
    expect(music.current).toBe(m.VICTORY);
    music.stop();
    expect(music.current).toBeNull();
    await settle();
    expect(calls).toHaveLength(1);
    expect(calls[0].signal.aborted).toBe(true);
    vi.doUnmock("../../src/apps/tracker/engine");
  });

  it("stop() ends a playing song at once; a new song is not undone by the old one's end", async () => {
    const { m, music, calls } = await setup();
    music.play(m.THEME, true);
    await settle();
    expect(calls).toHaveLength(1);
    expect(calls[0].signal.aborted).toBe(false);
    music.play(m.VICTORY, false);
    expect(calls[0].signal.aborted).toBe(true);
    await settle();
    expect(music.current).toBe(m.VICTORY);
    music.stop();
    expect(calls[1].signal.aborted).toBe(true);
    expect(music.current).toBeNull();
    vi.doUnmock("../../src/apps/tracker/engine");
  });
});
