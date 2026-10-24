import { describe, expect, it } from "vitest";
import {
  NOTE_OFF,
  Scheduler,
  SongPlayer,
  SAMPLE_RATE,
  encodeWav,
  newPattern,
  newSong,
  noteFrequency,
  noteName,
  orderSeconds,
  parseNote,
  parseSong,
  rowSeconds,
  serializeSong,
  songRows,
  songSeconds,
  type RowEvent,
  type SchedulerHost,
  type Song,
} from "../../src/apps/tracker/engine";
import { WAV_MAX_SECONDS, wavRefusal } from "../../src/apps/tracker/main";
import { MAX_FILE } from "../../src/sheet/host/memfs";

/** A clock that only moves when the test says so, firing interval callbacks on the way. */
class FakeClock implements SchedulerHost {
  time = 0;
  intervals = 0;
  private timers = new Map<
    number,
    { fn: () => void; ms: number; next: number }
  >();
  private ids = 0;

  now(): number {
    return this.time;
  }
  setInterval(fn: () => void, ms: number): unknown {
    this.intervals++;
    this.timers.set(++this.ids, { fn, ms, next: this.time * 1000 + ms });
    return this.ids;
  }
  clearInterval(handle: unknown): void {
    this.timers.delete(handle as number);
  }
  get active(): number {
    return this.timers.size;
  }
  /** Advances in 1 ms steps so callbacks fire at exact multiples of their period. */
  advance(seconds: number): void {
    const end = Math.round(this.time * 1000 + seconds * 1000);
    for (let ms = Math.round(this.time * 1000) + 1; ms <= end; ms++) {
      this.time = ms / 1000;
      for (const t of [...this.timers.values()]) {
        if (ms >= t.next) {
          t.next += t.ms;
          t.fn();
        }
      }
    }
  }
}

function threePatternSong(): Song {
  const song = newSong();
  song.bpm = 120;
  song.patterns = [newPattern(16), newPattern(32), newPattern(16)];
  song.order = [0, 1, 2, 1];
  song.loop = 2;
  return song;
}

describe("note frequencies", () => {
  it("tunes A-4 to 440 Hz and follows equal temperament", () => {
    expect(noteFrequency("A-4")).toBe(440);
    expect(noteFrequency("A-3")).toBeCloseTo(220, 6);
    expect(noteFrequency("A-5")).toBeCloseTo(880, 6);
    expect(noteFrequency("C-4")).toBeCloseTo(261.6256, 3);
    expect(noteFrequency("C#4")).toBeCloseTo(277.1826, 3);
    expect(noteFrequency("C-1")).toBeCloseTo(32.7032, 3);
    expect(noteFrequency("B-7")).toBeCloseTo(3951.0664, 3);
  });

  it("accepts note numbers 1 (C-1) to 84 (B-7)", () => {
    expect(noteFrequency(46)).toBe(440);
    expect(noteFrequency(1)).toBeCloseTo(noteFrequency("C-1"), 9);
    expect(noteFrequency(84)).toBeCloseTo(noteFrequency("B-7"), 9);
    for (let n = 2; n <= 84; n++) {
      expect(noteFrequency(n) / noteFrequency(n - 1)).toBeCloseTo(
        2 ** (1 / 12),
        9,
      );
    }
  });

  it("names every note and parses the name back", () => {
    for (let n = 1; n <= 84; n++) {
      expect(parseNote(noteName(n))).toBe(n);
      expect(noteFrequency(noteName(n))).toBe(noteFrequency(n));
    }
    expect(noteName(37)).toBe("C-4");
    expect(noteName(0)).toBe("---");
    expect(noteName(NOTE_OFF)).toBe("===");
  });

  it("rejects things that are not notes", () => {
    for (const bad of ["H-4", "C-0", "C-8", "---", "===", "", 0, 85, 1.5]) {
      expect(() => noteFrequency(bad)).toThrow(RangeError);
    }
  });
});

describe("scheduler", () => {
  function run(
    song: Song,
    opts: Parameters<Scheduler["start"]>[0],
    seconds: number,
  ): {
    clock: FakeClock;
    rows: (RowEvent & { scheduledAt: number })[];
    last: number[];
    done: number[];
    scheduler: Scheduler;
  } {
    const clock = new FakeClock();
    const rows: (RowEvent & { scheduledAt: number })[] = [];
    const last: number[] = [];
    const done: number[] = [];
    const scheduler = new Scheduler(() => song, clock, {
      onRow: (ev) => rows.push({ ...ev, scheduledAt: clock.time }),
      onLastRow: (time) => last.push(time),
      onDone: () => done.push(clock.time),
    });
    scheduler.start(opts);
    clock.advance(seconds);
    return { clock, rows, last, done, scheduler };
  }

  it("spaces rows a quarter beat apart", () => {
    // 120 BPM, 4 rows per beat: 0.125 s per row
    const { rows } = run(threePatternSong(), { at: 0.05, loop: true }, 2);
    expect(rows.length).toBeGreaterThan(16);
    rows.forEach((ev, i) => {
      expect(ev.time).toBeCloseTo(0.05 + i * 0.125, 9);
      expect(ev.duration).toBeCloseTo(0.125, 12);
    });
    const fast = threePatternSong();
    fast.bpm = 150;
    const quick = run(fast, { at: 0, loop: true }, 1).rows;
    expect(quick[1].time - quick[0].time).toBeCloseTo(0.1, 12);
  });

  it("polls every 25 ms and schedules at most 100 ms ahead, never late", () => {
    expect(Scheduler.INTERVAL_MS).toBe(25);
    expect(Scheduler.LOOKAHEAD).toBe(0.1);
    const { rows } = run(threePatternSong(), { at: 0.05, loop: true }, 3);
    rows.forEach((ev, i) => {
      expect(ev.time).toBeGreaterThanOrEqual(ev.scheduledAt);
      expect(ev.time - ev.scheduledAt).toBeLessThan(0.1 + 1e-9);
      // after the first row, a 25 ms poll sees each row within one interval
      // of it entering the lookahead window
      if (i > 0) expect(ev.time - ev.scheduledAt).toBeGreaterThan(0.075 - 1e-9);
    });
  });

  it("is deterministic for the same clock", () => {
    const a = run(threePatternSong(), { at: 0.05, loop: true }, 5).rows;
    const b = run(threePatternSong(), { at: 0.05, loop: true }, 5).rows;
    expect(a).toEqual(b);
  });

  it("walks the order list and stops at the end without loop", () => {
    const song = threePatternSong();
    const { rows, last, done, clock } = run(song, { at: 0, loop: false }, 20);
    expect(rows.length).toBe(16 + 32 + 16 + 32);
    expect(rows.map((r) => [r.order, r.pattern, r.row])).toEqual(
      songRows(song).map((r) => [r.order, r.pattern, r.row]),
    );
    expect(rows[16]).toMatchObject({ order: 1, pattern: 1, row: 0 });
    expect(rows[48]).toMatchObject({ order: 2, pattern: 2, row: 0 });
    expect(rows[64]).toMatchObject({ order: 3, pattern: 1, row: 0 });
    // 96 rows of 0.125 s
    expect(last).toHaveLength(1);
    expect(last[0]).toBeCloseTo(12, 9);
    expect(done).toHaveLength(1);
    expect(done[0]).toBeGreaterThanOrEqual(12);
    expect(done[0]).toBeLessThan(12.026);
    expect(clock.active).toBe(0);
  });

  it("returns to the loop point when looping", () => {
    const song = threePatternSong();
    const { rows, done } = run(song, { at: 0, loop: true }, 20);
    expect(done).toHaveLength(0);
    // after order 3 comes order 2 (the loop point), not order 0
    expect(rows[96]).toMatchObject({ order: 2, pattern: 2, row: 0 });
    expect(rows[96].time).toBeCloseTo(12, 9);
    expect(rows[112]).toMatchObject({ order: 3, pattern: 1, row: 0 });
    expect(rows[144]).toMatchObject({ order: 2, pattern: 2, row: 0 });
  });

  it("starts from a given order entry", () => {
    const { rows } = run(threePatternSong(), { at: 0, order: 2 }, 1);
    expect(rows[0]).toMatchObject({ order: 2, pattern: 2, row: 0, time: 0 });
  });

  it("plays one pattern once, or loops it", () => {
    const song = threePatternSong();
    const once = run(song, { mode: "pattern", pattern: 1, at: 0 }, 10);
    expect(once.rows.length).toBe(32);
    expect(once.rows.every((r) => r.pattern === 1 && r.order === -1)).toBe(
      true,
    );
    expect(once.done).toHaveLength(1);
    const looped = run(
      song,
      { mode: "pattern", pattern: 0, at: 0, loop: true },
      5,
    );
    expect(looped.rows[16]).toMatchObject({ pattern: 0, row: 0 });
    expect(looped.rows[16].time).toBeCloseTo(2, 9);
    expect(looped.done).toHaveLength(0);
  });

  it("keeps a timer only while playing", () => {
    const clock = new FakeClock();
    const scheduler = new Scheduler(threePatternSong, clock, {
      onRow: () => {},
    });
    expect(clock.active).toBe(0);
    scheduler.start({ loop: true });
    expect(scheduler.running).toBe(true);
    expect(clock.active).toBe(1);
    scheduler.stop();
    expect(scheduler.running).toBe(false);
    expect(clock.active).toBe(0);
  });

  it("reports song length from the order list", () => {
    const song = threePatternSong();
    expect(songSeconds(song)).toBeCloseTo(12, 9);
    expect(orderSeconds(song, 1)).toBeCloseTo(2, 9);
    expect(orderSeconds(song, 3)).toBeCloseTo(8, 9);
  });
});

/** An AudioContext whose clock is a FakeClock and whose nodes accept any call. */
function fakeAudio(clock: FakeClock): AudioContext {
  const node = (): unknown =>
    new Proxy({} as Record<string | symbol, unknown>, {
      get(target, key) {
        if (!(key in target)) {
          target[key] =
            key === "gain" || key === "frequency"
              ? { value: 0, ...methods() }
              : () => undefined;
        }
        return target[key];
      },
    });
  const methods = () => ({
    setValueAtTime: () => undefined,
    linearRampToValueAtTime: () => undefined,
    setTargetAtTime: () => undefined,
    cancelScheduledValues: () => undefined,
  });
  return {
    get currentTime() {
      return clock.time;
    },
    sampleRate: 44100,
    destination: node(),
    createGain: node,
    createOscillator: node,
    createBufferSource: node,
    createBuffer: () => ({ getChannelData: () => new Float32Array(16) }),
    createPeriodicWave: node,
  } as unknown as AudioContext;
}

describe("SongPlayer seeking", () => {
  function setup(): { clock: FakeClock; player: SongPlayer; song: Song } {
    const clock = new FakeClock();
    const song = threePatternSong();
    const player = new SongPlayer(
      () => song,
      fakeAudio(clock),
      undefined,
      clock,
    );
    return { clock, player, song };
  }
  const at = (song: Song, order: number, row: number): number =>
    orderSeconds(song, order) + row * rowSeconds(song.bpm);

  it("reports the target, not 0, right after a seek while playing", () => {
    const { clock, player, song } = setup();
    player.play({ mode: "song" });
    clock.advance(2);
    player.seek(2, 10);
    expect(player.elapsed()).toBeCloseTo(at(song, 2, 10));
    clock.advance(0.01);
    expect(player.elapsed()).toBeCloseTo(at(song, 2, 10));
  });

  it("resumes at the sought row once the clock moves", () => {
    const { clock, player, song } = setup();
    player.play({ mode: "song" });
    clock.advance(1);
    player.seek(2, 10);
    clock.advance(0.06);
    expect(player.position()).toMatchObject({ order: 2, row: 10 });
    clock.advance(rowSeconds(song.bpm));
    expect(player.position()).toMatchObject({ order: 2, row: 11 });
  });

  it("keeps the row across pause and resume, also straight after a seek", () => {
    const { clock, player, song } = setup();
    player.play({ mode: "song" });
    clock.advance(1);
    player.seek(1, 5);
    player.pause();
    expect(player.playing).toBe(false);
    expect(player.elapsed()).toBeCloseTo(at(song, 1, 5));
    player.play();
    clock.advance(0.06);
    expect(player.position()).toMatchObject({ order: 1, row: 5 });
    clock.advance(rowSeconds(song.bpm) * 3);
    player.pause();
    expect(player.elapsed()).toBeCloseTo(at(song, 1, 8));
    player.play();
    clock.advance(0.06);
    expect(player.position()).toMatchObject({ order: 1, row: 8 });
  });

  it("seeks while paused without starting", () => {
    const { clock, player, song } = setup();
    player.play({ mode: "song" });
    clock.advance(1);
    player.pause();
    player.seek(3, 4);
    expect(player.playing).toBe(false);
    expect(player.elapsed()).toBeCloseTo(at(song, 3, 4));
  });
});

describe("WAV encoder", () => {
  it("writes a 44-byte PCM 16-bit mono header and the samples", () => {
    const wav = encodeWav(new Float32Array([0, 1, -1, 0.5, 2, -2]), 44100);
    expect(wav.length).toBe(44 + 6 * 2);
    // prettier-ignore
    expect([...wav.slice(0, 44)]).toEqual([
      0x52, 0x49, 0x46, 0x46, // "RIFF"
      48, 0, 0, 0, // file length - 8
      0x57, 0x41, 0x56, 0x45, // "WAVE"
      0x66, 0x6d, 0x74, 0x20, // "fmt "
      16, 0, 0, 0, // fmt chunk length
      1, 0, // PCM
      1, 0, // mono
      0x44, 0xac, 0, 0, // 44100 Hz
      0x88, 0x58, 0x01, 0, // 88200 bytes per second
      2, 0, // block align
      16, 0, // bits per sample
      0x64, 0x61, 0x74, 0x61, // "data"
      12, 0, 0, 0, // data length
    ]);
    const view = new DataView(wav.buffer);
    const samples = [0, 1, 2, 3, 4, 5].map((i) =>
      view.getInt16(44 + i * 2, true),
    );
    // out-of-range input clips instead of wrapping
    expect(samples).toEqual([0, 32767, -32767, 16384, 32767, -32767]);
  });

  it("sizes the file from the sample count and rate", () => {
    const wav = encodeWav(new Float32Array(22050), 22050);
    const view = new DataView(wav.buffer);
    expect(wav.length).toBe(44 + 44100);
    expect(view.getUint32(4, true)).toBe(wav.length - 8);
    expect(view.getUint32(24, true)).toBe(22050);
    expect(view.getUint32(28, true)).toBe(44100);
    expect(view.getUint32(40, true)).toBe(44100);
    expect(encodeWav(new Float32Array(0), 44100).length).toBe(44);
  });
});

describe(".trk format", () => {
  function busySong(): Song {
    const song = threePatternSong();
    song.bpm = 137;
    song.instruments[2] = {
      name: "Wobble",
      duty: 0,
      noise: 1,
      attack: 3,
      decay: 7,
      sustain: 11,
      release: 15,
      sweep: -9,
    };
    song.patterns[0].rows[0][0] = { note: 37, inst: 0, vol: 15, fx: 0x037 };
    song.patterns[0].rows[3][1] = { note: 84, inst: 7, vol: 0, fx: 0x1ff };
    song.patterns[1].rows[31][2] = { note: 1, inst: 3, vol: -1, fx: 0x210 };
    song.patterns[1].rows[8][3] = { note: 50, inst: -1, vol: 9, fx: 0x4a2 };
    song.patterns[2].rows[4][0] = { note: NOTE_OFF, inst: -1, vol: -1, fx: 0 };
    song.patterns[2].rows[5][0] = { note: 0, inst: -1, vol: -1, fx: 0xa0f };
    return song;
  }

  it("round-trips a song without loss", () => {
    const song = busySong();
    const text = serializeSong(song);
    const back = parseSong(text);
    expect(back).toEqual(song);
    expect(serializeSong(back)).toBe(text);
  });

  it("is JSON with the trk1 fields", () => {
    const file = JSON.parse(serializeSong(busySong())) as Record<
      string,
      unknown
    >;
    expect(Object.keys(file)).toEqual([
      "format",
      "bpm",
      "instruments",
      "patterns",
      "order",
      "loop",
    ]);
    expect(file.format).toBe("trk1");
    expect(file.bpm).toBe(137);
    expect(file.order).toEqual([0, 1, 2, 1]);
    expect(file.loop).toBe(2);
    expect(file.instruments).toHaveLength(8);
    const patterns = file.patterns as { rows: string[] }[];
    expect(patterns.map((p) => p.rows.length)).toEqual([16, 32, 16]);
    expect(patterns[0].rows[0]).toBe(
      "C-4 0F 037 | --- -- 000 | --- -- 000 | --- -- 000",
    );
    expect(patterns[2].rows[4].startsWith("=== -- 000")).toBe(true);
  });

  it("round-trips an empty new song", () => {
    const song = newSong();
    expect(parseSong(serializeSong(song))).toEqual(song);
  });

  it("explains what is wrong with a bad file", () => {
    const edit = (fn: (file: Record<string, unknown>) => void): string => {
      const file = JSON.parse(serializeSong(busySong())) as Record<
        string,
        unknown
      >;
      fn(file);
      return JSON.stringify(file);
    };
    expect(() => parseSong("not json")).toThrow(/not valid JSON/);
    expect(() => parseSong("{}")).toThrow(/trk1/);
    expect(() => parseSong(edit((f) => (f.bpm = 500)))).toThrow(/bpm/);
    expect(() => parseSong(edit((f) => (f.order = [9])))).toThrow(/order/);
    expect(() => parseSong(edit((f) => (f.order = [])))).toThrow(/order/);
    expect(() => parseSong(edit((f) => (f.loop = 7)))).toThrow(/loop/);
    expect(() => parseSong(edit((f) => (f.patterns = [])))).toThrow(/patterns/);
    expect(() =>
      parseSong(
        edit((f) => {
          (f.patterns as { rows: string[] }[])[0].rows.pop();
        }),
      ),
    ).toThrow(/16 or 32 rows/);
    expect(() =>
      parseSong(
        edit((f) => {
          (f.patterns as { rows: string[] }[])[0].rows[2] =
            "C-4 0F 300 | --- -- 000 | --- -- 000 | --- -- 000";
        }),
      ),
    ).toThrow(/unknown effect/);
    expect(() =>
      parseSong(
        edit((f) => {
          (f.patterns as { rows: string[] }[])[0].rows[2] = "C-9 0F 000";
        }),
      ),
    ).toThrow(/pattern 0 row 2/);
  });
});

describe("WAV export limit (spec 004 R7, owner: 90 s)", () => {
  /** `entries` order entries of one 16-row pattern at `bpm`. */
  function song(entries: number, bpm: number): Song {
    const s = newSong();
    s.bpm = bpm;
    s.patterns = [newPattern(16)];
    s.order = Array<number>(entries).fill(0);
    s.loop = 0;
    return s;
  }

  it("allows a song of exactly 90 s; its WAV, with the 0.5 s ring-out, is under the host's 8 MiB file limit", () => {
    expect(WAV_MAX_SECONDS).toBe(90);
    // 15 entries × 16 rows at 40 BPM (6 s each)
    const s = song(15, 40);
    expect(songSeconds(s)).toBeCloseTo(90, 9);
    expect(wavRefusal(s)).toBeNull();
    // renderSong renders the song plus 0.5 s for the last notes to ring out
    const samples = Math.ceil((songSeconds(s) + 0.5) * SAMPLE_RATE);
    const wav = encodeWav(new Float32Array(samples), SAMPLE_RATE);
    expect(wav.length).toBe(44 + samples * 2);
    expect(wav.length).toBeLessThan(MAX_FILE);
  });

  it("refuses 91 s and longer with a message that names its length and the limit", () => {
    // 91 entries × 16 rows at 240 BPM (1 s each)
    const s = song(91, 240);
    expect(songSeconds(s)).toBeCloseTo(91, 9);
    expect(wavRefusal(s)).toMatch(/1:31.*up to 90 seconds/s);
    // just over the limit is refused too, not rounded down
    const over = song(90, 239);
    expect(songSeconds(over)).toBeCloseTo(90.38, 2);
    expect(wavRefusal(over)).toMatch(/1:31.*up to 90 seconds/s);
    expect(wavRefusal(song(128, 40))).toMatch(/12:48.*up to 90 seconds/s);
  });
});
