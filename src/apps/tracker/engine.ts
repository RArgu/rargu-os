// Tracker engine: song model, the .trk format, the row scheduler, the chip
// synth and WAV export. Shared by Tracker, Player and the desktop program.
// Nothing here touches the DOM or creates an AudioContext at import time.
import type { OS } from "../../sdk/os";

export const CHANNELS = 4;
export const CHANNEL_NAMES = ["Pulse A", "Pulse B", "Triangle", "Noise"];
export const ROWS_PER_BEAT = 4;
export const TICKS_PER_ROW = 6;
export const MAX_PATTERNS = 32;
export const MAX_ORDER = 128;
export const INSTRUMENTS = 8;
export const BPM_MIN = 40;
export const BPM_MAX = 300;
export const SAMPLE_RATE = 44100;

/** Note numbers: 1 = C-1 … 84 = B-7 (A-4 = 46). 0 is an empty cell, NOTE_OFF is `===`. */
export const NOTE_NONE = 0;
export const NOTE_MIN = 1;
export const NOTE_MAX = 84;
export const NOTE_OFF = 255;

/** The five effects, by the first hex digit of the effect column. */
export const EFFECTS = [
  { code: 0x0, mask: "0xy", name: "Arpeggio" },
  { code: 0x1, mask: "1xx", name: "Slide up" },
  { code: 0x2, mask: "2xx", name: "Slide down" },
  { code: 0x4, mask: "4xy", name: "Vibrato" },
  { code: 0xa, mask: "Axy", name: "Volume slide" },
];
const EFFECT_CODES = new Set(EFFECTS.map((e) => e.code));

export interface Cell {
  /** NOTE_NONE, NOTE_OFF or NOTE_MIN…NOTE_MAX */
  note: number;
  /** 0–7, or -1 for none */
  inst: number;
  /** 0–15, or -1 for unchanged */
  vol: number;
  /** three hex digits: effect code then parameter; 0x000 is no effect */
  fx: number;
}

export interface Instrument {
  name: string;
  /** pulse channels: 0 = 12.5 %, 1 = 25 %, 2 = 50 % */
  duty: number;
  /** noise channel: 0 = white, 1 = periodic */
  noise: number;
  attack: number;
  decay: number;
  sustain: number;
  release: number;
  /** pitch sweep, -15…15 in half octaves per second; 0 is off */
  sweep: number;
}

export interface Pattern {
  /** 16 or 32 rows of CHANNELS cells */
  rows: Cell[][];
}

export interface Song {
  bpm: number;
  instruments: Instrument[];
  patterns: Pattern[];
  /** pattern indices, in playing order */
  order: number[];
  /** order index playback returns to when looping */
  loop: number;
}

// ----- notes -----

const NAMES = [
  "C-",
  "C#",
  "D-",
  "D#",
  "E-",
  "F-",
  "F#",
  "G-",
  "G#",
  "A-",
  "A#",
  "B-",
];

export function noteName(note: number): string {
  if (note === NOTE_OFF) return "===";
  if (note < NOTE_MIN || note > NOTE_MAX) return "---";
  return NAMES[(note - 1) % 12] + String(Math.floor((note - 1) / 12) + 1);
}

/** Parses "C-4", "F#2", "---" or "===". Returns null when the text is not a note. */
export function parseNote(text: string): number | null {
  if (text === "---") return NOTE_NONE;
  if (text === "===") return NOTE_OFF;
  const i = NAMES.indexOf(text.slice(0, 2).toUpperCase());
  const octave = Number(text.slice(2));
  if (i < 0 || text.length !== 3 || !(octave >= 1 && octave <= 7)) return null;
  return (octave - 1) * 12 + i + 1;
}

/** Frequency in Hz of a note name ("C-1"…"B-7") or note number (1…84). A-4 is 440 Hz. */
export function noteFrequency(note: string | number): number {
  const n = typeof note === "string" ? parseNote(note) : note;
  if (n === null || !Number.isInteger(n) || n < NOTE_MIN || n > NOTE_MAX) {
    throw new RangeError(`Not a note: ${String(note)}`);
  }
  return 440 * 2 ** ((n - 46) / 12);
}

// ----- song model -----

export function emptyCell(): Cell {
  return { note: NOTE_NONE, inst: -1, vol: -1, fx: 0 };
}

export function newPattern(length: 16 | 32 = 16): Pattern {
  return {
    rows: Array.from({ length }, () =>
      Array.from({ length: CHANNELS }, emptyCell),
    ),
  };
}

export function defaultInstruments(): Instrument[] {
  const make = (
    name: string,
    duty: number,
    noise: number,
    adsr: [number, number, number, number],
    sweep = 0,
  ): Instrument => ({
    name,
    duty,
    noise,
    attack: adsr[0],
    decay: adsr[1],
    sustain: adsr[2],
    release: adsr[3],
    sweep,
  });
  return [
    make("Lead", 2, 0, [0, 5, 9, 3]),
    make("Pluck", 1, 0, [0, 4, 0, 2]),
    make("Reed", 0, 0, [1, 6, 7, 3]),
    make("Bass", 2, 0, [0, 0, 15, 1]),
    make("Kick", 2, 0, [0, 3, 0, 1], -12),
    make("Hat", 2, 0, [0, 1, 0, 1]),
    make("Snare", 2, 0, [0, 3, 0, 2]),
    make("Buzz", 2, 1, [0, 5, 5, 3]),
  ];
}

export function newSong(): Song {
  return {
    bpm: 125,
    instruments: defaultInstruments(),
    patterns: [newPattern()],
    order: [0],
    loop: 0,
  };
}

export function isEmptyCell(c: Cell): boolean {
  return c.note === NOTE_NONE && c.inst < 0 && c.vol < 0 && c.fx === 0;
}

/** True when the three-digit effect value uses one of the five effect codes. */
export function validEffect(fx: number): boolean {
  return (
    Number.isInteger(fx) && fx >= 0 && fx <= 0xfff && EFFECT_CODES.has(fx >> 8)
  );
}

export function rowSeconds(bpm: number): number {
  return 60 / bpm / ROWS_PER_BEAT;
}

/** Seconds from the start of the song to the start of an order entry. */
export function orderSeconds(song: Song, order: number): number {
  let rows = 0;
  for (let i = 0; i < order && i < song.order.length; i++) {
    rows += song.patterns[song.order[i]]?.rows.length ?? 0;
  }
  return rows * rowSeconds(song.bpm);
}

/** Length of one pass through the order list, in seconds. */
export function songSeconds(song: Song): number {
  return orderSeconds(song, song.order.length);
}

// ----- .trk format -----

const HEX = "0123456789ABCDEF";
const DUTIES = [12.5, 25, 50];
const NOISES = ["white", "periodic"];

function cellText(c: Cell): string {
  const inst = c.inst < 0 ? "-" : String(c.inst);
  const vol = c.vol < 0 ? "-" : HEX[c.vol];
  return `${noteName(c.note)} ${inst}${vol} ${c.fx.toString(16).toUpperCase().padStart(3, "0")}`;
}

function parseCell(text: string, where: string): Cell {
  const m = /^(\S{3}) ([0-7-])([0-9A-Fa-f-]) ([0-9A-Fa-f]{3})$/.exec(text);
  const note = m ? parseNote(m[1]) : null;
  if (!m || note === null) throw new Error(`${where}: bad cell "${text}"`);
  const fx = parseInt(m[4], 16);
  if (!validEffect(fx)) throw new Error(`${where}: unknown effect "${m[4]}"`);
  return {
    note,
    inst: m[2] === "-" ? -1 : Number(m[2]),
    vol: m[3] === "-" ? -1 : parseInt(m[3], 16),
    fx,
  };
}

/** A song as .trk text: JSON with one readable line per pattern row. */
export function serializeSong(song: Song): string {
  const file = {
    format: "trk1",
    bpm: song.bpm,
    instruments: song.instruments.map((i) => ({
      name: i.name,
      duty: DUTIES[i.duty],
      noise: NOISES[i.noise],
      attack: i.attack,
      decay: i.decay,
      sustain: i.sustain,
      release: i.release,
      sweep: i.sweep,
    })),
    patterns: song.patterns.map((p) => ({
      rows: p.rows.map((row) => row.map(cellText).join(" | ")),
    })),
    order: song.order,
    loop: song.loop,
  };
  return JSON.stringify(file, null, 1) + "\n";
}

function int(
  value: unknown,
  min: number,
  max: number,
  what: string,
  fallback?: number,
): number {
  if (value === undefined && fallback !== undefined) return fallback;
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < min ||
    value > max
  ) {
    throw new Error(`${what} must be a whole number from ${min} to ${max}`);
  }
  return value;
}

/** Parses and validates .trk text. Throws an Error that says what is wrong. */
export function parseSong(text: string): Song {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("Not a .trk file: the text is not valid JSON");
  }
  const file = raw as Record<string, unknown> | null;
  if (!file || typeof file !== "object" || file.format !== "trk1") {
    throw new Error('Not a .trk file: "format" must be "trk1"');
  }
  const bpm = int(file.bpm, BPM_MIN, BPM_MAX, "bpm");

  if (
    !Array.isArray(file.instruments) ||
    file.instruments.length > INSTRUMENTS
  ) {
    throw new Error(`instruments must be a list of up to ${INSTRUMENTS}`);
  }
  const instruments = defaultInstruments();
  file.instruments.forEach((entry: unknown, i: number) => {
    const src = entry as Record<string, unknown> | null;
    const what = `instrument ${i}`;
    if (!src || typeof src !== "object")
      throw new Error(`${what} is not an object`);
    const duty = DUTIES.indexOf(src.duty === undefined ? 50 : Number(src.duty));
    const noise = NOISES.indexOf(
      src.noise === undefined ? "white" : String(src.noise),
    );
    if (duty < 0) throw new Error(`${what}: duty must be 12.5, 25 or 50`);
    if (noise < 0)
      throw new Error(`${what}: noise must be "white" or "periodic"`);
    instruments[i] = {
      name: typeof src.name === "string" ? src.name.slice(0, 24) : "",
      duty,
      noise,
      attack: int(src.attack, 0, 15, `${what} attack`, 0),
      decay: int(src.decay, 0, 15, `${what} decay`, 0),
      sustain: int(src.sustain, 0, 15, `${what} sustain`, 15),
      release: int(src.release, 0, 15, `${what} release`, 0),
      sweep: int(src.sweep, -15, 15, `${what} sweep`, 0),
    };
  });

  if (
    !Array.isArray(file.patterns) ||
    file.patterns.length < 1 ||
    file.patterns.length > MAX_PATTERNS
  ) {
    throw new Error(`patterns must be a list of 1 to ${MAX_PATTERNS}`);
  }
  const patterns = file.patterns.map((entry: unknown, p: number): Pattern => {
    const rows = (entry as { rows?: unknown } | null)?.rows;
    if (!Array.isArray(rows) || (rows.length !== 16 && rows.length !== 32)) {
      throw new Error(`pattern ${p} must have 16 or 32 rows`);
    }
    return {
      rows: rows.map((line: unknown, r: number) => {
        const where = `pattern ${p} row ${r}`;
        const cells = typeof line === "string" ? line.split(" | ") : [];
        if (cells.length !== CHANNELS) {
          throw new Error(`${where} must have ${CHANNELS} cells`);
        }
        return cells.map((c) => parseCell(c, where));
      }),
    };
  });

  if (
    !Array.isArray(file.order) ||
    file.order.length < 1 ||
    file.order.length > MAX_ORDER
  ) {
    throw new Error(`order must be a list of 1 to ${MAX_ORDER} entries`);
  }
  const order = file.order.map((v: unknown, i: number) =>
    int(v, 0, patterns.length - 1, `order entry ${i}`),
  );
  const loop = int(file.loop, 0, order.length - 1, "loop", 0);
  return { bpm, instruments, patterns, order, loop };
}

// ----- scheduler -----

export interface RowEvent {
  /** audio-clock time the row starts at, in seconds */
  time: number;
  /** seconds until the next row */
  duration: number;
  /** order index, or -1 when a single pattern is playing */
  order: number;
  pattern: number;
  row: number;
}

/** The clock and timer the scheduler runs on; tests pass a fake one. */
export interface SchedulerHost {
  /** seconds */
  now(): number;
  setInterval(fn: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
}

export interface PlayOptions {
  mode?: "song" | "pattern";
  /** song mode: order index to start from */
  order?: number;
  /** pattern mode: the pattern to play */
  pattern?: number;
  row?: number;
  loop?: boolean;
  /** clock time of the first row; defaults to slightly after now */
  at?: number;
}

export interface SchedulerEvents {
  /** a row was scheduled (up to LOOKAHEAD seconds before it sounds) */
  onRow(ev: RowEvent): void;
  /** the final row was scheduled; `time` is when the song ends */
  onLastRow?(time: number): void;
  /** the clock reached the end of the song */
  onDone?(): void;
}

/**
 * Lookahead scheduler: every INTERVAL_MS it emits the rows that start within
 * the next LOOKAHEAD seconds. The interval only exists while playing.
 */
export class Scheduler {
  static readonly INTERVAL_MS = 25;
  static readonly LOOKAHEAD = 0.1;
  static readonly LEAD = 0.05;

  private handle: unknown = null;
  private mode: "song" | "pattern" = "song";
  private loop = false;
  private order = 0;
  private pattern = 0;
  private row = 0;
  private nextTime = 0;
  /** end time once the last row has been scheduled */
  private endTime: number | null = null;

  constructor(
    private song: () => Song,
    private host: SchedulerHost,
    private events: SchedulerEvents,
  ) {}

  get running(): boolean {
    return this.handle !== null;
  }

  start(opts: PlayOptions = {}): void {
    this.stop();
    const song = this.song();
    this.mode = opts.mode ?? "song";
    this.loop = opts.loop ?? false;
    if (this.mode === "song") {
      this.order = Math.min(
        Math.max(0, opts.order ?? 0),
        song.order.length - 1,
      );
      this.pattern = song.order[this.order];
    } else {
      this.order = -1;
      this.pattern = Math.min(
        Math.max(0, opts.pattern ?? 0),
        song.patterns.length - 1,
      );
    }
    const length = song.patterns[this.pattern].rows.length;
    this.row = Math.min(Math.max(0, opts.row ?? 0), length - 1);
    this.nextTime = opts.at ?? this.host.now() + Scheduler.LEAD;
    this.endTime = null;
    this.handle = this.host.setInterval(
      () => this.tick(),
      Scheduler.INTERVAL_MS,
    );
    this.tick();
  }

  stop(): void {
    if (this.handle === null) return;
    this.host.clearInterval(this.handle);
    this.handle = null;
  }

  setLoop(loop: boolean): void {
    this.loop = loop;
  }

  /** Emits every row that starts before now + LOOKAHEAD. */
  tick(): void {
    if (this.handle === null) return;
    const now = this.host.now();
    while (this.endTime === null && this.nextTime < now + Scheduler.LOOKAHEAD) {
      const song = this.song();
      const pattern = song.patterns[this.pattern];
      // the song can be edited while it plays
      if (!pattern || this.row >= pattern.rows.length) {
        this.finish(this.nextTime);
        break;
      }
      const duration = rowSeconds(song.bpm);
      this.events.onRow({
        time: this.nextTime,
        duration,
        order: this.order,
        pattern: this.pattern,
        row: this.row,
      });
      this.nextTime += duration;
      this.advance(song, pattern);
    }
    if (this.endTime !== null && now >= this.endTime) {
      this.stop();
      this.events.onDone?.();
    }
  }

  private finish(time: number): void {
    this.endTime = time;
    this.events.onLastRow?.(time);
  }

  private advance(song: Song, pattern: Pattern): void {
    this.row++;
    if (this.row < pattern.rows.length) return;
    this.row = 0;
    if (this.mode === "pattern") {
      if (!this.loop) this.finish(this.nextTime);
      return;
    }
    this.order++;
    if (this.order >= song.order.length) {
      if (!this.loop) return this.finish(this.nextTime);
      this.order = Math.min(song.loop, song.order.length - 1);
    }
    this.pattern = song.order[this.order];
  }
}

/** Every row of one pass through the order list, with its start time from 0. */
export function songRows(song: Song): RowEvent[] {
  const out: RowEvent[] = [];
  const duration = rowSeconds(song.bpm);
  song.order.forEach((pattern, order) => {
    const length = song.patterns[pattern]?.rows.length ?? 0;
    for (let row = 0; row < length; row++) {
      out.push({ time: out.length * duration, duration, order, pattern, row });
    }
  });
  return out;
}

// ----- synth -----

const HARMONICS = 64;
/** each noise bit is held this many samples so slow playback stays square */
const NOISE_HOLD = 8;
/** noise bits per second for a note = its frequency times this */
const NOISE_RATE = 16;
const MIX = [0.2, 0.2, 0.36, 0.22];
const SWEEP_CENTS = 600;
const SWEEP_LIMIT = 3600;

/** ADSR step (0–15) to seconds. */
function envSeconds(step: number): number {
  return step <= 0 ? 0 : 0.008 * step * step + 0.01 * step;
}

interface Waves {
  pulse: PeriodicWave[];
  noise: AudioBuffer[];
}

const waveCache = new WeakMap<BaseAudioContext, Waves>();

/** Linear-feedback shift register noise; `tap` 1 is white, 6 is the short periodic loop. */
function noiseBuffer(ctx: BaseAudioContext, tap: number): AudioBuffer {
  const bits = tap === 1 ? 32767 : 93;
  const buffer = ctx.createBuffer(1, bits * NOISE_HOLD, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let reg = 1;
  for (let i = 0; i < bits; i++) {
    const bit = (reg ^ (reg >> tap)) & 1;
    reg = (reg >> 1) | (bit << 14);
    data.fill(reg & 1 ? 1 : -1, i * NOISE_HOLD, (i + 1) * NOISE_HOLD);
  }
  return buffer;
}

function waves(ctx: BaseAudioContext): Waves {
  let w = waveCache.get(ctx);
  if (!w) {
    const pulse = [0.125, 0.25, 0.5].map((duty) => {
      // Fourier series of a pulse that is high for `duty` of each period
      const real = new Float32Array(HARMONICS + 1);
      const imag = new Float32Array(HARMONICS + 1);
      for (let n = 1; n <= HARMONICS; n++) {
        const a = 2 * Math.PI * n * duty;
        real[n] = (2 * Math.sin(a)) / (Math.PI * n);
        imag[n] = (2 * (1 - Math.cos(a))) / (Math.PI * n);
      }
      return ctx.createPeriodicWave(real, imag);
    });
    w = { pulse, noise: [noiseBuffer(ctx, 1), noiseBuffer(ctx, 6)] };
    waveCache.set(ctx, w);
  }
  return w;
}

interface Voice {
  src: OscillatorNode | AudioBufferSourceNode;
  /** release stage; the attack/decay/sustain gain feeds it */
  rel: GainNode;
  inst: Instrument;
  start: number;
  /** when the voice goes silent, or Infinity while it is held */
  end: number;
  /** pitch offset left by slides, in cents */
  slide: number;
  /** the last row left an arpeggio or vibrato offset behind */
  bent: boolean;
}

interface Chan {
  gain: GainNode;
  volume: number;
  inst: number;
  vibrato: number;
  voice: Voice | null;
}

/**
 * The four-channel chip synth. It only schedules Web Audio nodes at given
 * times, so the same code plays live and renders offline.
 */
export class Synth {
  readonly out: GainNode;
  private chans: Chan[];
  private voices = new Set<Voice>();

  constructor(
    readonly ctx: BaseAudioContext,
    private song: () => Song,
    dest?: AudioNode,
  ) {
    this.out = ctx.createGain();
    this.out.connect(dest ?? ctx.destination);
    this.chans = MIX.map((mix, i) => {
      const gain = ctx.createGain();
      gain.gain.value = mix;
      gain.connect(this.out);
      return {
        gain,
        volume: 15,
        inst: i === 3 ? 5 : 0,
        vibrato: 0,
        voice: null,
      };
    });
  }

  /** Channel volumes back to full; call before starting playback. */
  reset(time: number): void {
    this.chans.forEach((ch, i) => {
      ch.volume = 15;
      ch.vibrato = 0;
      ch.gain.gain.setValueAtTime(MIX[i], time);
    });
  }

  /** Schedules one pattern row (CHANNELS cells) at `time`. */
  scheduleRow(cells: Cell[], time: number, duration: number): void {
    for (let i = 0; i < CHANNELS; i++) {
      const cell = cells[i];
      if (!cell) continue;
      const ch = this.chans[i];
      if (cell.inst >= 0) ch.inst = cell.inst;
      if (cell.vol >= 0) this.setVolume(i, cell.vol, time);
      if (cell.note === NOTE_OFF) this.noteOff(i, time);
      else if (cell.note !== NOTE_NONE)
        this.noteOn(i, cell.note, ch.inst, time);
      this.effect(i, cell.fx, time, duration);
    }
  }

  private setVolume(channel: number, volume: number, time: number): void {
    const ch = this.chans[channel];
    ch.volume = Math.min(15, Math.max(0, volume));
    ch.gain.gain.setValueAtTime((ch.volume / 15) * MIX[channel], time);
  }

  noteOn(channel: number, note: number, inst: number, time: number): void {
    const ch = this.chans[channel];
    const ins = this.song().instruments[inst];
    if (!ins || note < NOTE_MIN || note > NOTE_MAX) return;
    this.cut(ch, time);
    const ctx = this.ctx;
    const w = waves(ctx);
    const freq = noteFrequency(note);
    let src: OscillatorNode | AudioBufferSourceNode;
    if (channel === 3) {
      src = ctx.createBufferSource();
      src.buffer = w.noise[ins.noise] ?? w.noise[0];
      src.loop = true;
      src.playbackRate.value =
        (freq * NOISE_RATE * NOISE_HOLD) / ctx.sampleRate;
    } else {
      src = ctx.createOscillator();
      if (channel === 2) src.type = "triangle";
      else src.setPeriodicWave(w.pulse[ins.duty] ?? w.pulse[2]);
      src.frequency.value = freq;
    }
    const env = ctx.createGain();
    const rel = ctx.createGain();
    const attack = envSeconds(ins.attack) / 4;
    const sustain = ins.sustain / 15;
    if (attack > 0) {
      env.gain.setValueAtTime(0, time);
      env.gain.linearRampToValueAtTime(1, time + attack);
    } else {
      env.gain.setValueAtTime(1, time);
    }
    if (sustain < 1) {
      const decay = envSeconds(ins.decay);
      if (decay > 0)
        env.gain.setTargetAtTime(sustain, time + attack, decay / 4);
      else env.gain.setValueAtTime(sustain, time + attack);
    }
    src.connect(env);
    env.connect(rel);
    rel.connect(ch.gain);
    src.start(time);
    const voice: Voice = {
      src,
      rel,
      inst: ins,
      start: time,
      end: Infinity,
      slide: 0,
      bent: false,
    };
    src.onended = () => {
      rel.disconnect();
      this.voices.delete(voice);
    };
    this.voices.add(voice);
    ch.voice = voice;
  }

  /** Starts the release stage of the channel's voice. */
  noteOff(channel: number, time: number): void {
    const voice = this.chans[channel].voice;
    if (!voice || voice.end !== Infinity) return;
    const release = envSeconds(voice.inst.release);
    voice.rel.gain.setValueAtTime(1, time);
    if (release > 0) voice.rel.gain.setTargetAtTime(0, time, release / 5);
    else voice.rel.gain.linearRampToValueAtTime(0, time + 0.004);
    voice.end = time + release + 0.02;
    voice.src.stop(voice.end);
  }

  /** Ends the channel's voice just before a new note starts. */
  private cut(ch: Chan, time: number): void {
    const voice = ch.voice;
    ch.voice = null;
    if (!voice || voice.end <= time) return;
    if (voice.end === Infinity) {
      voice.rel.gain.setValueAtTime(1, Math.max(0, time - 0.003));
      voice.rel.gain.linearRampToValueAtTime(0, time);
    }
    voice.end = time;
    voice.src.stop(time);
  }

  /** Pitch and volume automation for one row of a channel. */
  private effect(
    channel: number,
    fx: number,
    time: number,
    duration: number,
  ): void {
    const ch = this.chans[channel];
    const code = fx >> 8;
    const param = fx & 0xff;
    const x = param >> 4;
    const y = param & 15;
    const tick = duration / TICKS_PER_ROW;

    if (code === 0xa && param) {
      for (let k = 1; k < TICKS_PER_ROW; k++) {
        this.setVolume(channel, ch.volume + (x ? x : -y), time + k * tick);
      }
    }

    const voice = ch.voice;
    if (!voice || voice.end <= time) return;
    // detune takes cents, so linear ramps are even pitch glides
    const pitch = "detune" in voice.src ? voice.src.detune : null;
    if (!pitch) return;
    const arpeggio = code === 0x0 && param !== 0;
    const vibrato = code === 0x4 && y !== 0;
    const slide = code === 0x1 ? param : code === 0x2 ? -param : 0;
    const sweep = voice.inst.sweep;
    if (!arpeggio && !vibrato && !slide && !sweep && !voice.bent) return;

    const sweepAt = (t: number): number =>
      Math.min(
        SWEEP_LIMIT,
        Math.max(-SWEEP_LIMIT, sweep * SWEEP_CENTS * (t - voice.start)),
      );
    const from = voice.slide;
    pitch.setValueAtTime(sweepAt(time) + from, time);
    for (let k = 1; k <= TICKS_PER_ROW; k++) {
      const t = time + k * tick;
      if (arpeggio) {
        // steps note, +x, +y semitones; the offset applies from the tick before
        const at = t - tick;
        const semis = [0, x, y][(k - 1) % 3];
        pitch.setValueAtTime(sweepAt(at) + from + semis * 100, at);
        continue;
      }
      // a slide moves param/16 of a semitone per tick
      voice.slide = from + (slide * k * 100) / 16;
      let cents = sweepAt(t) + voice.slide;
      if (vibrato) {
        ch.vibrato += (x || 1) / 32;
        cents += Math.sin(ch.vibrato * 2 * Math.PI) * y * 10;
      }
      pitch.linearRampToValueAtTime(cents, t);
    }
    voice.bent = arpeggio || vibrato;
  }

  /** Releases every held voice at `time` (the end of a song). */
  releaseAll(time: number): void {
    for (let i = 0; i < CHANNELS; i++) this.noteOff(i, time);
  }

  /** Stops everything now, including notes scheduled ahead. */
  silence(): void {
    const now = this.ctx.currentTime;
    for (const voice of this.voices) {
      voice.rel.gain.cancelScheduledValues(now);
      voice.rel.gain.setTargetAtTime(0, now, 0.004);
      voice.end = now;
      voice.src.stop(now + 0.03);
    }
    this.chans.forEach((ch, i) => {
      ch.voice = null;
      ch.gain.gain.cancelScheduledValues(now);
      ch.gain.gain.setValueAtTime((ch.volume / 15) * MIX[i], now);
    });
  }

  /** A short note outside the song, for trying a key or an instrument. */
  preview(channel: number, note: number, inst: number): void {
    const now = this.ctx.currentTime + 0.01;
    this.noteOn(channel, note, inst, now);
    this.noteOff(channel, now + 0.25);
  }
}

// ----- live playback -----

let live: AudioContext | null = null;

/** The shared live AudioContext. Call from a user gesture: it is created and resumed here. */
export function audioContext(): AudioContext {
  live ??= new AudioContext();
  if (live.state === "suspended") void live.resume().catch(() => {});
  return live;
}

/** Plays a song on a live AudioContext with play, pause, stop and seek. */
export class SongPlayer {
  readonly synth: Synth;
  /** called when a song that is not looping reaches its end */
  onEnd: (() => void) | null = null;
  private scheduler: Scheduler;
  private queue: RowEvent[] = [];
  private current: RowEvent | null = null;
  private opts: PlayOptions = {};
  /** where play() resumes from after pause() or seek() */
  private resume: { order: number; row: number } | null = null;
  /** where play() started, until its first row sounds */
  private pending: { order: number; row: number } | null = null;

  constructor(
    private song: () => Song,
    private ctx: AudioContext,
    dest?: AudioNode,
    host?: SchedulerHost,
  ) {
    this.synth = new Synth(ctx, song, dest);
    this.scheduler = new Scheduler(
      song,
      host ?? {
        now: () => ctx.currentTime,
        setInterval: (fn, ms) => setInterval(fn, ms),
        clearInterval: (handle) =>
          clearInterval(handle as ReturnType<typeof setInterval>),
      },
      {
        onRow: (ev) => {
          const cells = this.song().patterns[ev.pattern]?.rows[ev.row];
          if (cells) this.synth.scheduleRow(cells, ev.time, ev.duration);
          this.queue.push(ev);
        },
        onLastRow: (time) => this.synth.releaseAll(time),
        onDone: () => {
          this.current = null;
          this.queue = [];
          this.onEnd?.();
        },
      },
    );
  }

  get playing(): boolean {
    return this.scheduler.running;
  }

  /** Starts playback. With no options it continues from a pause or seek, else from the top. */
  play(opts?: PlayOptions): void {
    this.halt();
    this.opts = opts ?? {
      ...this.opts,
      mode: "song",
      order: this.resume?.order ?? 0,
      row: this.resume?.row ?? 0,
    };
    this.resume = null;
    this.pending =
      this.opts.mode === "pattern"
        ? null
        : { order: this.opts.order ?? 0, row: this.opts.row ?? 0 };
    this.synth.reset(this.ctx.currentTime);
    this.scheduler.start(this.opts);
  }

  pause(): void {
    const at = this.position() ?? this.pending;
    this.halt();
    this.resume = at && at.order >= 0 ? { order: at.order, row: at.row } : null;
  }

  stop(): void {
    this.halt();
    this.resume = null;
  }

  /** Jumps to a row of an order entry, keeping the play/pause state. */
  seek(order: number, row = 0): void {
    const was = this.playing;
    this.halt();
    this.resume = { order, row };
    if (was) this.play();
  }

  setLoop(loop: boolean): void {
    this.opts.loop = loop;
    this.scheduler.setLoop(loop);
  }

  /** The row sounding right now, by the audio clock. */
  position(): RowEvent | null {
    const now = this.ctx.currentTime;
    while (this.queue.length > 0 && this.queue[0].time <= now) {
      this.current = this.queue.shift() ?? null;
      this.pending = null;
    }
    return this.current;
  }

  /** Seconds into the song (song mode), also while paused. */
  elapsed(): number {
    const song = this.song();
    // until the first row sounds after play() or seek(), report where it starts
    const at = this.position() ?? this.pending ?? this.resume;
    if (!at || at.order < 0) return 0;
    return orderSeconds(song, at.order) + at.row * rowSeconds(song.bpm);
  }

  total(): number {
    return songSeconds(this.song());
  }

  private halt(): void {
    this.scheduler.stop();
    this.synth.silence();
    this.queue = [];
    this.current = null;
    this.pending = null;
  }
}

export interface PlayFileOptions {
  /** play again from the song's loop point instead of ending */
  loop?: boolean;
  /** aborting stops the song at once */
  signal?: AbortSignal;
}

/**
 * Loads a .trk from the filesystem and plays it once (or until stopped, with
 * `loop`). Resolves when it ends or the signal aborts.
 */
export async function playFile(
  os: OS,
  path: string,
  opts: PlayFileOptions = {},
): Promise<void> {
  const song = parseSong(await os.fs.readText(path));
  const { signal } = opts;
  if (signal?.aborted) return;
  const player = new SongPlayer(() => song, audioContext());
  await new Promise<void>((resolve) => {
    const stop = (): void => {
      player.stop();
      resolve();
    };
    signal?.addEventListener("abort", stop, { once: true });
    player.onEnd = () => {
      signal?.removeEventListener("abort", stop);
      resolve();
    };
    player.play({ mode: "song", loop: opts.loop === true });
  });
}

// ----- WAV export -----

/** Renders one pass through the order list: 44.1 kHz mono samples in -1…1. */
export async function renderSong(song: Song): Promise<Float32Array> {
  // room for the last notes to ring out
  const seconds = songSeconds(song) + 0.5;
  const ctx = new OfflineAudioContext(
    1,
    Math.ceil(seconds * SAMPLE_RATE),
    SAMPLE_RATE,
  );
  const synth = new Synth(ctx, () => song);
  for (const ev of songRows(song)) {
    synth.scheduleRow(
      song.patterns[ev.pattern].rows[ev.row],
      ev.time,
      ev.duration,
    );
  }
  synth.releaseAll(songSeconds(song));
  const buffer = await ctx.startRendering();
  return buffer.getChannelData(0);
}

/** Encodes samples (-1…1) as a RIFF/WAVE file: PCM, 16-bit, mono. */
export function encodeWav(
  samples: Float32Array,
  sampleRate: number,
): Uint8Array {
  const dataBytes = samples.length * 2;
  const out = new Uint8Array(44 + dataBytes);
  const view = new DataView(out.buffer);
  const tag = (offset: number, text: string): void => {
    for (let i = 0; i < text.length; i++) out[offset + i] = text.charCodeAt(i);
  };
  tag(0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  tag(8, "WAVE");
  tag(12, "fmt ");
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // bytes per second
  view.setUint16(32, 2, true); // bytes per frame
  view.setUint16(34, 16, true); // bits per sample
  tag(36, "data");
  view.setUint32(40, dataBytes, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, Math.round(s * 32767), true);
  }
  return out;
}
