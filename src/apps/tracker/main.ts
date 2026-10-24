// Tracker: a 4-channel chip-music editor. The song model, synth and WAV
// export live in engine.ts; this file is the editor around them.
import "./styles.css";
import type { MenuItem, OS } from "../../sdk/os";
import { h } from "../../ui/dom";
import { contextMenu } from "../../ui/menu";
import { bottomBar, button, stepper } from "../../ui/widgets";
import {
  appName,
  baseOf,
  dirOf,
  errorMessage,
  helpMenu,
  loadConfig,
  saveConfig,
  askToSave,
} from "../lib/open";
import {
  BPM_MAX,
  BPM_MIN,
  EFFECTS,
  MAX_ORDER,
  MAX_PATTERNS,
  NOTE_MAX,
  NOTE_MIN,
  NOTE_NONE,
  NOTE_OFF,
  SAMPLE_RATE,
  SongPlayer,
  audioContext,
  emptyCell,
  encodeWav,
  newPattern,
  newSong,
  parseSong,
  renderSong,
  serializeSong,
  songSeconds,
  type Cell,
  type Pattern,
  type RowEvent,
  type Song,
} from "./engine";
import {
  COLS,
  Grid,
  hex2,
  instrumentPanel,
  piano,
  sheet,
  type Cursor,
} from "./parts";

interface Config {
  loop: boolean;
  octave: number;
}

interface UndoStep {
  text: string;
  pat: number;
  ord: number;
}

const UNDO_DEPTH = 100;
const HEX = "0123456789ABCDEF";
/** Starting parameters for the five effects, in EFFECTS order. */
const FX_DEFAULTS = [0x47, 0x08, 0x08, 0x44, 0x02];

/** QWERTY piano: the bottom letter row is the current octave, the top row the next. */
const PIANO_KEYS = new Map<string, number>();
[..."zsxdcvgbhnjm,l.;/"].forEach((k, i) => PIANO_KEYS.set(k, i));
[..."q2w3er5t6y7ui9o0p"].forEach((k, i) => PIANO_KEYS.set(k, i + 12));

/** Copied cells; shared by every Tracker window. */
let clipboard: Cell[] = [];

const MUSIC_DIR = "/home/guest/Music";

/**
 * Spec 004 R7 (owner: 90 s): the longest song Export WAV… renders on the
 * sheet. With the 0.5 s ring-out its WAV (7.98 MB) fits the host's 8 MiB
 * file limit (memfs MAX_FILE).
 */
export const WAV_MAX_SECONDS = 90;

/** The message that refuses a song over WAV_MAX_SECONDS, else null. */
export function wavRefusal(song: Song): string | null {
  const seconds = songSeconds(song);
  // a hair of float error is not "over"
  if (seconds <= WAV_MAX_SECONDS + 1e-6) return null;
  // rounded up, so a song just over the limit never reads "1:30"
  const s = Math.ceil(seconds - 1e-6);
  const length = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  return `This song is ${length} long. Export WAV… takes songs up to 90 seconds.`;
}

export default async function main(os: OS): Promise<void> {
  const config = await loadConfig<Config>(os, { loop: true, octave: 4 });
  const compact = (): boolean => os.env.DISPLAY_POLICY === "compact";

  let song: Song = newSong();
  let path: string | null = null;
  let dirty = false;
  let forceClose = false;
  /** pattern being edited, and the selected order entry */
  let pat = 0;
  let ord = 0;
  const cur: Cursor = { row: 0, ch: 0, col: 0 };
  /** other end of the selected row range, in the cursor's channel */
  let anchor: number | null = null;
  let inst = 0;
  let octave = Math.min(7, Math.max(1, Math.round(config.octave) || 4));
  let loop = config.loop !== false;
  const undo: UndoStep[] = [];
  let undoKey = "";
  let undoAt = 0;
  let player: SongPlayer | null = null;
  let playing: "song" | "pattern" | null = null;
  let raf = 0;
  let shownAt: RowEvent | null = null;
  let instSheet: { close(): void } | null = null;

  /**
   * 004 R6: Play waits for a song: the demo (or argv file) parsed, or after
   * a failed load, a successful Open… or New
   */
  let ready = false;
  /**
   * 004 R6: the visitor's document choices so far. New and Open…
   * add one, so a start-up load that was still pending is stale and its
   * late result is dropped (no replace, no alert).
   */
  let choices = 0;
  /** 004 R7: an export is running */
  let exporting = false;

  const win = os.ui.createWindow({ title: "Tracker" });
  const root = h("div", { class: "app trk" });
  // 004 D2: sheet layout rules (styles.css, .trk.on-sheet)
  root.classList.add("on-sheet");
  win.root.append(root);

  const pattern = (): Pattern => song.patterns[pat];
  const cellAt = (): Cell => pattern().rows[cur.row][cur.ch];
  const selection = (): { from: number; to: number } | null =>
    anchor === null
      ? null
      : { from: Math.min(anchor, cur.row), to: Math.max(anchor, cur.row) };

  // ----- audio -----

  /** The live player. Only call from a user gesture: it creates or resumes the AudioContext. */
  function audio(): SongPlayer {
    const ctx = audioContext();
    if (!player) {
      player = new SongPlayer(() => song, ctx);
      player.onEnd = stopped;
    }
    return player;
  }

  function play(mode: "song" | "pattern"): void {
    if (!ready) return;
    const p = audio();
    if (mode === "song") {
      p.play({ mode, order: ord, loop });
    } else {
      p.play({ mode, pattern: pat, loop });
    }
    playing = mode;
    shownAt = null;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(follow);
    renderTransport();
  }

  function stop(): void {
    player?.stop();
    stopped();
  }

  function stopped(): void {
    playing = null;
    cancelAnimationFrame(raf);
    grid.setPlayRow(-1, false);
    renderTransport();
  }

  /** Runs once per frame while playing and moves the playing-row bar. */
  function follow(): void {
    if (!playing) return;
    raf = requestAnimationFrame(follow);
    const at = player?.position() ?? null;
    if (!at || at === shownAt) return;
    shownAt = at;
    if (at.order >= 0 && (at.order !== ord || at.pattern !== pat)) {
      ord = at.order;
      pat = at.pattern;
      anchor = null;
      render();
    }
    grid.setPlayRow(at.pattern === pat ? at.row : -1, true);
  }

  function toggleLoop(): void {
    loop = !loop;
    player?.setLoop(loop);
    config.loop = loop;
    void saveConfig(os, config);
    render();
  }

  function setOctave(next: number): void {
    octave = Math.min(7, Math.max(1, next));
    config.octave = octave;
    void saveConfig(os, config);
    render();
  }

  // ----- editing -----

  /** Records an undo step, then applies a change. Steps with the same key within a second merge. */
  function edit(key: string, fn: () => void): void {
    const now = Date.now();
    if (!key || key !== undoKey || now - undoAt > 1000) {
      undo.push({ text: serializeSong(song), pat, ord });
      if (undo.length > UNDO_DEPTH) undo.shift();
    }
    undoKey = key;
    undoAt = now;
    fn();
    dirty = true;
    render();
  }

  function undoLast(): void {
    const step = undo.pop();
    if (!step) return;
    song = parseSong(step.text);
    undoKey = "";
    pat = Math.min(step.pat, song.patterns.length - 1);
    ord = Math.min(step.ord, song.order.length - 1);
    anchor = null;
    dirty = true;
    render();
  }

  function clampCursor(): void {
    pat = Math.min(Math.max(0, pat), song.patterns.length - 1);
    ord = Math.min(Math.max(0, ord), song.order.length - 1);
    cur.row = Math.min(cur.row, pattern().rows.length - 1);
    if (anchor !== null) anchor = Math.min(anchor, pattern().rows.length - 1);
  }

  function moveRow(delta: number, extend = false): void {
    const length = pattern().rows.length;
    if (extend) anchor ??= cur.row;
    else anchor = null;
    cur.row = extend
      ? Math.min(length - 1, Math.max(0, cur.row + delta))
      : (cur.row + delta + length) % length;
  }

  function moveCol(delta: number): void {
    anchor = null;
    const at = cur.ch * COLS + cur.col + delta;
    const wrapped = (at + 4 * COLS) % (4 * COLS);
    cur.ch = Math.floor(wrapped / COLS);
    cur.col = wrapped % COLS;
  }

  /** Writes a note, `===` or a rest into the cursor cell and steps down a row. */
  function enterNote(note: number): void {
    const real = note >= NOTE_MIN && note <= NOTE_MAX;
    if (!real && note !== NOTE_OFF && note !== NOTE_NONE) return;
    edit("", () => {
      const cell = cellAt();
      cell.note = note;
      if (real) cell.inst = inst;
      else cell.inst = -1;
      moveRow(1);
    });
    if (real) audio().synth.preview(cur.ch, note, inst);
  }

  /** A key of the piano strip or the QWERTY piano, as semitones above C of the current octave. */
  function pianoKey(semitone: number): void {
    enterNote((octave - 1) * 12 + semitone + 1);
  }

  function enterHex(digit: number): void {
    const cell = cellAt();
    if (cur.col === 1) {
      if (digit > 7) return;
      edit("", () => {
        cell.inst = digit;
        moveRow(1);
      });
    } else if (cur.col === 2) {
      edit("", () => {
        cell.vol = digit;
        moveRow(1);
      });
    } else if (cur.col === 3) {
      // only the five effects exist
      if (!EFFECTS.some((e) => e.code === digit)) return;
      edit("", () => {
        cell.fx = (cell.fx & 0x0ff) | (digit << 8);
        cur.col = 4;
      });
    } else if (cur.col === 4) {
      edit("", () => {
        cell.fx = (cell.fx & 0xf0f) | (digit << 4);
        cur.col = 5;
      });
    } else if (cur.col === 5) {
      edit("", () => {
        cell.fx = (cell.fx & 0xff0) | digit;
        cur.col = 3;
        moveRow(1);
      });
    }
  }

  /** Backspace: clears only the field under the cursor. */
  function clearField(): void {
    edit("", () => {
      const cell = cellAt();
      if (cur.col === 0) cell.note = NOTE_NONE;
      else if (cur.col === 1) cell.inst = -1;
      else if (cur.col === 2) cell.vol = -1;
      else cell.fx = 0;
    });
  }

  function selectedRows(): { from: number; to: number } {
    return selection() ?? { from: cur.row, to: cur.row };
  }

  function copy(): void {
    const { from, to } = selectedRows();
    clipboard = pattern()
      .rows.slice(from, to + 1)
      .map((row) => ({ ...row[cur.ch] }));
  }

  function clearCells(): void {
    const { from, to } = selectedRows();
    edit("", () => {
      for (let r = from; r <= to; r++) pattern().rows[r][cur.ch] = emptyCell();
    });
  }

  function cut(): void {
    copy();
    clearCells();
  }

  function paste(): void {
    if (clipboard.length === 0) return;
    const rows = pattern().rows;
    const top = selection()?.from ?? cur.row;
    edit("", () => {
      clipboard.forEach((cell, i) => {
        if (top + i < rows.length) rows[top + i][cur.ch] = { ...cell };
      });
      anchor = null;
      cur.row = top;
    });
  }

  // ----- patterns and the order list -----

  function selectOrder(index: number): void {
    ord = index;
    pat = song.order[index];
    anchor = null;
    clampCursor();
    render();
  }

  /** Shows a pattern for editing; the order selection follows when the pattern is in the list. */
  function viewPattern(index: number): void {
    pat = Math.min(Math.max(0, index), song.patterns.length - 1);
    if (song.order[ord] !== pat) {
      const at = song.order.indexOf(pat);
      if (at >= 0) ord = at;
    }
    anchor = null;
    clampCursor();
    render();
  }

  function orderFull(): boolean {
    if (song.order.length < MAX_ORDER) return false;
    os.ui.notify(`The order list holds up to ${MAX_ORDER} entries.`);
    return true;
  }

  /** Inserts the pattern being edited after an order entry. */
  function insertOrder(after: number): void {
    if (orderFull()) return;
    edit("", () => {
      song.order.splice(after + 1, 0, pat);
      if (song.loop > after) song.loop++;
      ord = after + 1;
    });
  }

  function removeOrder(index: number): void {
    if (song.order.length <= 1) {
      os.ui.notify("The order list needs at least one entry.");
      return;
    }
    edit("", () => {
      song.order.splice(index, 1);
      if (song.loop > index) song.loop--;
      song.loop = Math.min(song.loop, song.order.length - 1);
      ord = Math.min(index, song.order.length - 1);
      pat = song.order[ord];
      clampCursor();
    });
  }

  function moveOrder(index: number, delta: number): void {
    const to = index + delta;
    if (to < 0 || to >= song.order.length) return;
    edit("", () => {
      const [entry] = song.order.splice(index, 1);
      song.order.splice(to, 0, entry);
      ord = to;
    });
  }

  /** Adds an empty pattern, or a copy of `from`, and puts it in the order list after `after`. */
  function addPattern(from: number | null, after = ord): void {
    if (song.patterns.length >= MAX_PATTERNS) {
      os.ui.notify(`A song holds up to ${MAX_PATTERNS} patterns.`);
      return;
    }
    edit("", () => {
      const source = from === null ? null : song.patterns[from];
      song.patterns.push(
        source
          ? { rows: source.rows.map((row) => row.map((c) => ({ ...c }))) }
          : newPattern(pattern().rows.length === 32 ? 32 : 16),
      );
      pat = song.patterns.length - 1;
      if (song.order.length < MAX_ORDER) {
        song.order.splice(after + 1, 0, pat);
        if (song.loop > after) song.loop++;
        ord = after + 1;
      }
      clampCursor();
    });
  }

  function removePattern(): void {
    if (song.patterns.length <= 1) {
      os.ui.notify("A song needs at least one pattern.");
      return;
    }
    edit("", () => {
      const gone = pat;
      song.patterns.splice(gone, 1);
      song.order = song.order
        .filter((p) => p !== gone)
        .map((p) => (p > gone ? p - 1 : p));
      if (song.order.length === 0) song.order = [0];
      song.loop = Math.min(song.loop, song.order.length - 1);
      ord = Math.min(ord, song.order.length - 1);
      pat = song.order[ord];
      anchor = null;
      clampCursor();
    });
  }

  function setLength(length: 16 | 32): void {
    const rows = pattern().rows;
    if (rows.length === length) return;
    edit("", () => {
      if (length < rows.length) rows.length = length;
      else rows.push(...newPattern(16).rows);
      anchor = null;
      clampCursor();
    });
  }

  function orderMenu(index: number): MenuItem[] {
    return [
      { label: "Insert after", action: () => insertOrder(index) },
      {
        label: "Duplicate",
        action: () => addPattern(song.order[index], index),
      },
      { label: "Delete", action: () => removeOrder(index) },
      {
        label: "Set loop point",
        checked: song.loop === index,
        action: () => edit("", () => (song.loop = index)),
      },
    ];
  }

  // ----- files -----

  function reset(next: Song, file: string | null): void {
    stop();
    song = next;
    path = file;
    dirty = false;
    undo.length = 0;
    undoKey = "";
    ord = 0;
    pat = song.order[0];
    cur.row = 0;
    cur.ch = 0;
    cur.col = 0;
    anchor = null;
    // a song is loaded (or new): Play can play it
    ready = true;
    render();
  }

  async function confirmDiscard(): Promise<boolean> {
    if (!dirty) return true;
    return askToSave(os, "Save this song first?", "Tracker", save);
  }

  /** Started with no file and no songs of the visitor's own: open the demo, not silence (P11). */
  async function openDemo(): Promise<void> {
    const at = choices;
    try {
      const songs = (await os.fs.readdir(MUSIC_DIR)).filter(
        (e) => e.type === "file" && e.name.endsWith(".trk"),
      );
      if (songs.length === 1 && songs[0].name === "demo.trk") {
        await load(`${MUSIC_DIR}/demo.trk`, at);
      }
    } catch {
      // no Music folder: start empty
    }
  }

  /**
   * `startAt`: a start-up load, with `choices` when it began; it gives way to
   * a later New or Open….
   */
  async function load(file: string, startAt?: number): Promise<void> {
    const stale = (): boolean => startAt !== undefined && startAt !== choices;
    try {
      const next = parseSong(await os.fs.readText(file));
      if (stale()) return;
      reset(next, os.fs.resolve(file));
    } catch (err) {
      if (stale()) return;
      await os.ui.alert(
        `Could not open ${file}:\n${errorMessage(err)}`,
        "Tracker",
      );
    }
  }

  async function write(file: string): Promise<boolean> {
    try {
      await os.fs.writeFile(file, serializeSong(song));
      path = os.fs.resolve(file);
      dirty = false;
      render();
      return true;
    } catch (err) {
      await os.ui.alert(
        `Could not save ${file}:\n${errorMessage(err)}`,
        "Tracker",
      );
      return false;
    }
  }

  async function saveAs(): Promise<boolean> {
    const target = await os.ui.saveFile({
      filters: [".trk"],
      startDir: path ? dirOf(path) : "~/Music",
      defaultName: path ? baseOf(path) : "untitled.trk",
    });
    return target ? write(target) : false;
  }

  async function save(): Promise<boolean> {
    return path ? write(path) : saveAs();
  }

  async function open(): Promise<void> {
    if (!(await confirmDiscard())) return;
    const file = await os.ui.openFile({
      filters: [".trk"],
      startDir: path ? dirOf(path) : "~/Music",
    });
    if (!file) return;
    choices++;
    await load(file);
  }

  async function newFile(): Promise<void> {
    if (!(await confirmDiscard())) return;
    choices++;
    reset(newSong(), null);
  }

  /** Renders the song once and writes the WAV into the filesystem (on the
   * sheet that write is the download). */
  async function exportWav(): Promise<void> {
    if (exporting) {
      os.ui.notify("An export is already running.");
      return;
    }
    // R7: refused before the name prompt and before rendering
    const refusal = wavRefusal(song);
    if (refusal) {
      await os.ui.alert(refusal, "Export WAV");
      return;
    }
    exporting = true;
    render();
    try {
      await exportOnce();
    } finally {
      exporting = false;
      render();
    }
  }

  async function exportOnce(): Promise<void> {
    const stem = path ? baseOf(path).replace(/\.trk$/i, "") : "untitled";
    const target = await os.ui.saveFile({
      filters: [".wav"],
      startDir: "~/Music",
      defaultName: `${stem}.wav`,
    });
    if (!target) return;
    let wav: Uint8Array;
    try {
      wav = encodeWav(await renderSong(song), SAMPLE_RATE);
    } catch (err) {
      await os.ui.alert(
        `Could not render the song:\n${errorMessage(err)}`,
        "Export WAV",
      );
      return;
    }
    try {
      await os.fs.writeFile(target, wav);
    } catch (err) {
      // the sheet's write is the download (002 R6): only a failure is told
      await os.ui.alert(
        `Could not save ${target}:\n${errorMessage(err)}`,
        "Export WAV",
      );
    }
  }

  // ----- widgets -----

  const grid = new Grid((at, ev, context) => {
    grid.el.focus({ preventScroll: true });
    if (context && !compact()) {
      // right-click keeps a selection it lands in
      const sel = selection();
      if (!sel || at.ch !== cur.ch || at.row < sel.from || at.row > sel.to) {
        Object.assign(cur, at);
        anchor = null;
        render();
      }
      contextMenu(ev, [
        { label: "Cut", action: cut },
        { label: "Copy", action: copy },
        {
          label: "Paste",
          disabled: clipboard.length === 0,
          action: paste,
        },
        { label: "Clear", action: clearCells },
      ]);
      return;
    }
    // long-press (touch) or Shift+click ends a row range in the same channel
    if ((context || ev.shiftKey) && at.ch === cur.ch) {
      anchor ??= cur.row;
      cur.row = at.row;
    } else {
      Object.assign(cur, at);
      anchor = null;
    }
    render();
  });

  const playBtn = button("Play", () => play("song"), {
    icon: "play-16",
    class: "stack",
    tip: "Play the song from the selected order entry",
  });
  const patBtn = button("Play Pattern", () => play("pattern"), {
    icon: "play-pattern-16",
    class: "stack",
  });
  const stopBtn = button("Stop", stop, { icon: "stop-16", class: "stack" });
  playBtn.dataset.guide = "play";
  const loopBtn = button("Loop", toggleLoop, {
    icon: "loop-16",
    class: "stack",
  });
  const bpm = stepper(song.bpm, (v) => edit("bpm", () => (song.bpm = v)), {
    min: BPM_MIN,
    max: BPM_MAX,
    onTapValue: () => {
      void os.ui
        .prompt(
          `Tempo in beats per minute (${BPM_MIN}–${BPM_MAX})`,
          String(song.bpm),
          "BPM",
        )
        .then((text) => {
          const v = Math.round(Number(text));
          if (text === null || !(v >= BPM_MIN && v <= BPM_MAX)) return;
          edit("", () => (song.bpm = v));
        });
    },
  });
  const octaveStep = stepper(octave, setOctave, { min: 1, max: 7 });
  const patStep = stepper(pat, viewPattern, {
    min: 0,
    max: MAX_PATTERNS - 1,
    format: hex2,
  });

  // desktop order column
  const orderList = h("div", {
    class: "trk-orderlist",
    attrs: { role: "listbox", "aria-label": "Order list" },
  });
  // compact order chips
  const chips = h("div", { class: "trk-chips" });
  const patLabel = h("span", { class: "trk-patlabel" });
  for (const el of [orderList, chips]) {
    el.addEventListener("click", (ev) => {
      const item = (ev.target as HTMLElement).closest<HTMLElement>("[data-o]");
      if (item) selectOrder(Number(item.dataset.o));
    });
    el.addEventListener("contextmenu", (ev) => {
      const item = (ev.target as HTMLElement).closest<HTMLElement>("[data-o]");
      if (!item) return;
      ev.preventDefault();
      const index = Number(item.dataset.o);
      contextMenu(ev, orderMenu(index), `Order entry ${hex2(index)}`);
    });
  }

  const panel = instrumentPanel({
    instruments: () => song.instruments,
    current: () => inst,
    select: (index) => {
      inst = index;
      render();
    },
    change: (field, fn) =>
      edit(`inst-${inst}-${field}`, () => fn(song.instruments[inst])),
  });

  const deskPiano = piano(2, pianoKey);
  const lowLabel = h("span", { class: "mono" });
  const highLabel = h("span", { class: "mono" });
  const phonePiano = piano(1, pianoKey);
  const octLabel = h("span", { class: "trk-oct field" });

  // compact cell card
  const cellInst = stepper(
    -1,
    (v) => {
      if (v >= 0) inst = v;
      edit("cell-inst", () => (cellAt().inst = v));
    },
    { min: -1, max: 7, format: (v) => (v < 0 ? "-" : String(v)) },
  );
  const cellVol = stepper(
    -1,
    (v) => edit("cell-vol", () => (cellAt().vol = v)),
    { min: -1, max: 15, format: (v) => (v < 0 ? "-" : HEX[v]) },
  );
  const fxText = (param: number): string =>
    (cellAt().fx >> 8).toString(16).toUpperCase() + hex2(param);
  const cellFx = stepper(
    0,
    (v) =>
      edit("cell-fx", () => {
        const cell = cellAt();
        cell.fx = (cell.fx & 0xf00) | v;
      }),
    { min: 0, max: 255, format: fxText, onTapValue: openFxSheet },
  );

  /** The five effects and a hex parameter picker for the selected cell. */
  function openFxSheet(): void {
    const rows = h("div", { class: "trk-fxlist" });
    const setFx = (fx: number): void => {
      edit("cell-fx", () => (cellAt().fx = fx));
      draw();
    };
    const nibble = (shift: number): ReturnType<typeof stepper> =>
      stepper(0, (v) => setFx((cellAt().fx & ~(15 << shift)) | (v << shift)), {
        min: 0,
        max: 15,
        format: (v) => HEX[v],
      });
    const x = nibble(4);
    const y = nibble(0);
    const draw = (): void => {
      const fx = cellAt().fx;
      x.set((fx >> 4) & 15);
      y.set(fx & 15);
      const row = (label: string, on: boolean, pick: () => void): HTMLElement =>
        h(
          "button",
          {
            class: "trk-fxrow" + (on ? " on" : ""),
            attrs: { type: "button" },
            on: { click: pick },
          },
          h("span", { class: on ? "glyph check" : "trk-nocheck" }),
          h("span", { text: label }),
        );
      rows.replaceChildren(
        row("000  None", fx === 0, () => setFx(0)),
        ...EFFECTS.map((e, i) =>
          row(`${e.mask}  ${e.name}`, fx !== 0 && fx >> 8 === e.code, () =>
            // keep the parameter, or start from one that can be heard
            setFx((e.code << 8) | (fx & 0xff || FX_DEFAULTS[i])),
          ),
        ),
      );
    };
    draw();
    sheet(
      root,
      "Effect",
      h(
        "div",
        { class: "col gap" },
        rows,
        h(
          "div",
          { class: "trk-fxparam" },
          h("span", { text: "Parameter" }),
          h("label", null, h("span", { text: "x" }), x.el),
          h("label", null, h("span", { text: "y" }), y.el),
        ),
      ),
    );
  }

  function openInstruments(): void {
    if (instSheet) return;
    panel.render();
    instSheet = sheet(root, "Instruments", panel.el, () => {
      instSheet = null;
      if (!compact()) side.replaceChildren(panel.el);
    });
  }

  // ----- layout -----

  const side = h("div", { class: "trk-side" });
  const group = (label: string, control: HTMLElement): HTMLElement =>
    h("label", { class: "trk-field" }, h("span", { text: label }), control);
  const small = (
    label: string,
    fn: () => void,
    tip?: string,
    glyph?: string,
  ): HTMLElement => {
    const b = button(glyph ? "" : label, fn, { class: "small", tip });
    if (glyph) {
      b.append(h("span", { class: `glyph ${glyph}` }));
      b.setAttribute("aria-label", label);
    }
    return b;
  };

  /** Arranges the shared widgets for the current display policy. */
  function layout(): void {
    instSheet?.close();
    const isCompact = compact();
    root.classList.toggle("compact", isCompact);
    if (isCompact) {
      root.replaceChildren(
        h(
          "div",
          { class: "trk-scroll" },
          h(
            "div",
            { class: "trk-transport" },
            playBtn,
            patBtn,
            stopBtn,
            loopBtn,
            h("div", { class: "trk-bpm" }, h("span", { text: "BPM" }), bpm.el),
          ),
          h(
            "div",
            { class: "trk-patrow" },
            small("Previous pattern", () => viewPattern(pat - 1), "", "left"),
            patLabel,
            small("Next pattern", () => viewPattern(pat + 1), "", "right"),
            chips,
          ),
          grid.el,
          h(
            "div",
            { class: "trk-card" },
            h("div", { class: "trk-card-title" }, h("b", { text: "Cell" })),
            h(
              "div",
              { class: "trk-card-row" },
              group("Inst", cellInst.el),
              group("Vol", cellVol.el),
              group("Fx", cellFx.el),
              button("Clear", clearCells),
            ),
          ),
          h(
            "div",
            { class: "trk-keys" },
            h(
              "div",
              { class: "trk-keys-row" },
              button("Oct -", () => setOctave(octave - 1)),
              octLabel,
              button("Oct +", () => setOctave(octave + 1)),
              h("span", { class: "grow" }),
              button("Rest", () => enterNote(NOTE_NONE)),
              button("Off", () => enterNote(NOTE_OFF)),
            ),
            phonePiano.el,
          ),
        ),
        bottomBar([
          { label: "Open", icon: "open-16", onClick: () => void open() },
          { label: "Save", icon: "save-16", onClick: () => void save() },
          {
            label: "Export",
            icon: "export-16",
            onClick: () => void exportWav(),
          },
          {
            label: "Instruments",
            icon: "instruments-16",
            onClick: openInstruments,
          },
        ]),
      );
    } else {
      side.replaceChildren(panel.el);
      root.replaceChildren(
        h(
          "div",
          { class: "toolbar trk-transport" },
          playBtn,
          patBtn,
          stopBtn,
          loopBtn,
          h("span", { class: "trk-sep" }),
          group("BPM", bpm.el),
          group("Octave", octaveStep.el),
        ),
        h(
          "div",
          { class: "trk-main" },
          h(
            "div",
            { class: "trk-order" },
            h("b", { text: "Order" }),
            orderList,
            h(
              "div",
              { class: "trk-order-btns" },
              small("Move up", () => moveOrder(ord, -1), "Move entry up", "up"),
              small(
                "Move down",
                () => moveOrder(ord, 1),
                "Move entry down",
                "down",
              ),
              small("Add", () => insertOrder(ord), "Insert this pattern after"),
              small("Del", () => removeOrder(ord), "Remove entry"),
            ),
            group("Pattern", patStep.el),
          ),
          h(
            "div",
            { class: "trk-center" },
            grid.el,
            h(
              "div",
              { class: "trk-pianorow" },
              lowLabel,
              deskPiano.el,
              highLabel,
              small("Off", () => enterNote(NOTE_OFF), "Note off (1)"),
            ),
          ),
          side,
        ),
      );
    }
    render();
  }

  // ----- rendering -----

  let orderKey = "";
  let menuKey = "";
  let title = "";

  function renderOrder(): void {
    const isCompact = compact();
    const key = `${isCompact}|${ord}|${song.loop}|${song.order.join(",")}`;
    if (key === orderKey) return;
    orderKey = key;
    const items = song.order.map((p, i) =>
      h("button", {
        class:
          (isCompact ? "trk-chip" : "trk-entry") +
          (i === ord ? " on" : "") +
          (i === song.loop ? " loop" : ""),
        text: hex2(p),
        tip: i === song.loop ? "Loop point" : undefined,
        data: { o: i },
        attrs: { type: "button", tabindex: -1, role: "option" },
      }),
    );
    const host = isCompact ? chips : orderList;
    host.replaceChildren(...items);
    const on = items[ord];
    if (!on) return;
    // keep the selected entry in view without scrolling any ancestor
    if (isCompact) {
      host.scrollLeft = on.offsetLeft - (host.clientWidth - on.offsetWidth) / 2;
    } else if (on.offsetTop < host.scrollTop) {
      host.scrollTop = on.offsetTop;
    } else if (
      on.offsetTop + on.offsetHeight >
      host.scrollTop + host.clientHeight
    ) {
      host.scrollTop = on.offsetTop + on.offsetHeight - host.clientHeight;
    }
  }

  function renderTransport(): void {
    playBtn.disabled = !ready;
    patBtn.disabled = !ready;
    playBtn.classList.toggle("on", playing === "song");
    patBtn.classList.toggle("on", playing === "pattern");
    loopBtn.classList.toggle("on", loop);
    loopBtn.setAttribute("aria-pressed", String(loop));
  }

  function render(): void {
    clampCursor();
    grid.render(pattern(), cur, selection());
    grid.reveal(cur.row);
    renderOrder();
    renderTransport();
    bpm.set(song.bpm);
    octaveStep.set(octave);
    patStep.set(pat);
    patLabel.textContent = `Pattern ${hex2(pat)}`;
    octLabel.textContent = `Oct ${octave}`;
    lowLabel.textContent = `C-${octave}`;
    highLabel.textContent = `B-${Math.min(7, octave + 1)}`;
    const cell = cellAt();
    cellInst.set(cell.inst);
    cellVol.set(cell.vol);
    cellFx.set(cell.fx & 0xff);
    const real = cell.note >= NOTE_MIN && cell.note <= NOTE_MAX;
    const semi = real ? cell.note - 1 - (octave - 1) * 12 : null;
    deskPiano.mark(semi);
    phonePiano.mark(semi);
    panel.render();
    const next = `${appName(os, "Tracker")} - ${path ? baseOf(path) : "untitled"}${dirty ? " *" : ""}`;
    if (next !== title) {
      title = next;
      win.setTitle(title);
    }
    const key = `${loop}|${pattern().rows.length}|${undo.length > 0}|${clipboard.length > 0}|${ready}|${exporting}`;
    if (key !== menuKey) {
      menuKey = key;
      buildMenu();
    }
  }

  function buildMenu(): void {
    const length = pattern().rows.length;
    win.setMenu({
      items: [
        {
          label: "File",
          children: [
            { label: "New", action: () => void newFile() },
            { label: "Open…", shortcut: "Ctrl+O", action: () => void open() },
            { label: "Save", shortcut: "Ctrl+S", action: () => void save() },
            { label: "Save As…", action: () => void saveAs() },
            { label: "", separator: true },
            {
              label: "Export WAV…",
              disabled: exporting,
              action: () => void exportWav(),
            },
            { label: "", separator: true },
            { label: "Close", action: () => win.close() },
          ],
        },
        {
          label: "Edit",
          children: [
            {
              label: "Undo",
              shortcut: "Ctrl+Z",
              disabled: undo.length === 0,
              action: undoLast,
            },
            { label: "", separator: true },
            { label: "Cut", shortcut: "Ctrl+X", action: cut },
            { label: "Copy", shortcut: "Ctrl+C", action: copy },
            {
              label: "Paste",
              shortcut: "Ctrl+V",
              disabled: clipboard.length === 0,
              action: paste,
            },
            { label: "Clear", shortcut: "Del", action: clearCells },
          ],
        },
        {
          label: "Song",
          children: [
            {
              label: "Play / Stop",
              shortcut: "Space",
              disabled: !ready,
              action: () => (playing ? stop() : play("song")),
            },
            {
              label: "Play Pattern",
              disabled: !ready,
              action: () => play("pattern"),
            },
            { label: "Loop", checked: loop, action: toggleLoop },
            { label: "", separator: true },
            {
              label: "Pattern length",
              children: ([16, 32] as const).map((n) => ({
                label: `${n} rows`,
                checked: length === n,
                action: () => setLength(n),
              })),
            },
            { label: "Add pattern", action: () => addPattern(null) },
            { label: "Duplicate pattern", action: () => addPattern(pat) },
            { label: "Remove pattern", action: removePattern },
            { label: "", separator: true },
            {
              label: "Set loop point here",
              action: () => edit("", () => (song.loop = ord)),
            },
            { label: "Instruments…", action: openInstruments },
          ],
        },
        helpMenu(os),
      ],
    });
  }

  // ----- events -----

  /** Pattern keys: navigation, the QWERTY piano, hex entry. Returns true when the key was used. */
  function gridKey(ev: KeyboardEvent): boolean {
    const key = ev.key.length === 1 ? ev.key.toLowerCase() : ev.key;
    const last = pattern().rows.length - 1;
    switch (key) {
      case "ArrowUp":
        moveRow(-1, ev.shiftKey);
        break;
      case "ArrowDown":
        moveRow(1, ev.shiftKey);
        break;
      case "ArrowLeft":
        moveCol(-1);
        break;
      case "ArrowRight":
        moveCol(1);
        break;
      case "PageUp":
        moveRow(-Math.min(4, cur.row), ev.shiftKey);
        break;
      case "PageDown":
        moveRow(Math.min(4, last - cur.row), ev.shiftKey);
        break;
      case "Home":
        moveRow(-cur.row, ev.shiftKey);
        break;
      case "End":
        moveRow(last - cur.row, ev.shiftKey);
        break;
      case "[":
        setOctave(octave - 1);
        return true;
      case "]":
        setOctave(octave + 1);
        return true;
      case "Backspace":
        clearField();
        return true;
      default: {
        if (cur.col === 0) {
          const semi = PIANO_KEYS.get(key);
          if (key === "1") enterNote(NOTE_OFF);
          else if (semi === undefined) return false;
          else if (!ev.repeat) pianoKey(semi);
          return true;
        }
        const digit = key.length === 1 ? "0123456789abcdef".indexOf(key) : -1;
        if (digit < 0) return false;
        enterHex(digit);
        return true;
      }
    }
    render();
    return true;
  }

  grid.el.addEventListener("keydown", (ev) => {
    // Ctrl and Alt combinations belong to the menu
    if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
    if (gridKey(ev)) ev.preventDefault();
  });
  // Space presses a focused button and types in a field; only elsewhere does it toggle play
  root.addEventListener("keydown", (ev) => {
    const tag = (ev.target as HTMLElement).tagName;
    if (ev.key === " " && (tag === "BUTTON" || tag === "INPUT")) {
      ev.stopPropagation();
    }
  });
  // clicking a control must not take the keyboard away from the grid
  root.addEventListener("click", (ev) => {
    const target = ev.target as HTMLElement;
    if (compact() || target.closest("input, .trk-sheet, .trk-vs-track")) return;
    grid.el.focus({ preventScroll: true });
  });
  win.onResize((w) => {
    // too narrow for the side panel: Song > Instruments opens it as a sheet
    const narrow = w < 470;
    if (narrow === root.classList.contains("narrow")) return;
    root.classList.toggle("narrow", narrow);
  });
  win.onFocus((focused) => {
    if (focused && !compact() && !win.root.contains(document.activeElement)) {
      grid.el.focus({ preventScroll: true });
    }
  });
  win.onClose(() => {
    if (!forceClose && dirty) {
      void askToSave(
        os,
        "Save this song before closing?",
        "Tracker",
        save,
      ).then((go) => {
        if (go) {
          forceClose = true;
          win.close();
        }
      });
      return false;
    }
    stop();
    return true;
  });
  os.proc.onSignal(() => {
    forceClose = true;
    stop();
  });

  await document.fonts?.load('16px "Pixel Operator Mono"').catch(() => {});
  layout();
  if (os.argv[0]) void load(os.argv[0], choices);
  else void openDemo();
  if (!compact()) grid.el.focus({ preventScroll: true });
}
