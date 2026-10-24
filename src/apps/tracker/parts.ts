// Tracker building blocks: the pattern grid, the piano strip, the instrument
// panel and the in-window sheets. They hold no song state of their own.
import { h, type Child } from "../../ui/dom";
import { button, segmented, slider, syncSlider } from "../../ui/widgets";
import {
  CHANNELS,
  CHANNEL_NAMES,
  INSTRUMENTS,
  NOTE_MAX,
  NOTE_MIN,
  NOTE_NONE,
  noteName,
  type Cell,
  type Instrument,
  type Pattern,
} from "./engine";

/** Grid position. `col`: 0 note, 1 instrument, 2 volume, 3–5 the effect digits. */
export interface Cursor {
  row: number;
  ch: number;
  col: number;
}

export const COLS = 6;
const SHORT_NAMES = ["PU-A", "PU-B", "TRI", "NOI"];
const HEX = "0123456789ABCDEF";

export function hex2(n: number): string {
  return n.toString(16).toUpperCase().padStart(2, "0");
}

interface RowEls {
  el: HTMLElement;
  cells: HTMLElement[];
  /** per cell: the dot, then the six field spans */
  parts: HTMLElement[][];
  shown: string[];
}

/**
 * The pattern grid as DOM text. Rows are built once per pattern length and
 * only cells whose content changed are touched, so it stays cheap while
 * playing: moving the playing row toggles one class.
 */
export class Grid {
  readonly el: HTMLElement;
  private body = h("div", { class: "trk-rows" });
  private rows: RowEls[] = [];
  private marked: HTMLElement[] = [];
  private playRow = -1;

  constructor(onPick: (at: Cursor, ev: MouseEvent, context: boolean) => void) {
    const head = h(
      "div",
      { class: "trk-head" },
      h("span", { class: "trk-num", text: "#" }),
      ...CHANNEL_NAMES.map((name, i) =>
        h(
          "div",
          { class: "trk-cell" },
          h("span", { class: `trk-chdot c${i}` }),
          h("span", { class: "trk-full", text: name }),
          h("span", { class: "trk-short", text: SHORT_NAMES[i] }),
        ),
      ),
    );
    this.el = h(
      "div",
      {
        class: "trk-grid",
        attrs: { tabindex: 0, role: "grid", "aria-label": "Pattern" },
      },
      head,
      this.body,
    );
    const pick = (ev: MouseEvent, context: boolean): void => {
      const target = ev.target as HTMLElement;
      const cell = target.closest<HTMLElement>(".trk-rows .trk-cell");
      const row = target.closest<HTMLElement>(".trk-row");
      if (!cell || !row) return;
      onPick(
        {
          row: Number(row.dataset.r),
          ch: Number(cell.dataset.c),
          col: Number(target.dataset.k ?? 0),
        },
        ev,
        context,
      );
    };
    this.el.addEventListener("click", (ev) => pick(ev, false));
    this.el.addEventListener("contextmenu", (ev) => {
      ev.preventDefault();
      pick(ev, true);
    });
  }

  private build(length: number): void {
    this.rows = [];
    for (let r = 0; r < length; r++) {
      const cells: HTMLElement[] = [];
      const parts: HTMLElement[][] = [];
      for (let c = 0; c < CHANNELS; c++) {
        const spans = [
          h("span", { class: "trk-dot" }),
          h("span", { class: "n", data: { k: 0 } }),
          h("span", { class: "i", data: { k: 1 } }),
          h("span", { class: "v", data: { k: 2 } }),
          h("span", { class: "f f0", data: { k: 3 } }),
          h("span", { class: "f", data: { k: 4 } }),
          h("span", { class: "f", data: { k: 5 } }),
        ];
        parts.push(spans);
        cells.push(h("div", { class: "trk-cell", data: { c } }, ...spans));
      }
      const el = h(
        "div",
        { class: "trk-row" + (r % 4 === 0 ? " beat" : ""), data: { r } },
        h("span", { class: "trk-num", text: hex2(r) }),
        ...cells,
      );
      this.rows.push({ el, cells, parts, shown: [] });
    }
    this.body.replaceChildren(...this.rows.map((r) => r.el));
    this.playRow = -1;
  }

  private paint(spans: HTMLElement[], cell: Cell): void {
    const real = cell.note >= NOTE_MIN && cell.note <= NOTE_MAX;
    const fx = cell.fx.toString(16).toUpperCase().padStart(3, "0");
    const fields = [
      noteName(cell.note),
      cell.inst < 0 ? "-" : String(cell.inst),
      cell.vol < 0 ? "-" : HEX[cell.vol],
      fx[0],
      fx[1],
      fx[2],
    ];
    const empty = [
      cell.note === NOTE_NONE,
      cell.inst < 0,
      cell.vol < 0,
      cell.fx === 0,
      cell.fx === 0,
      cell.fx === 0,
    ];
    spans[0].className =
      "trk-dot" + (real && cell.inst >= 0 ? ` i${cell.inst}` : "");
    fields.forEach((text, k) => {
      const span = spans[k + 1];
      span.textContent = text;
      span.classList.toggle("z", empty[k]);
    });
  }

  /** Shows a pattern with the cursor and an optional selected row range in the cursor's channel. */
  render(
    pattern: Pattern,
    cursor: Cursor,
    sel: { from: number; to: number } | null,
  ): void {
    if (this.rows.length !== pattern.rows.length)
      this.build(pattern.rows.length);
    pattern.rows.forEach((cells, r) => {
      const row = this.rows[r];
      cells.forEach((cell, c) => {
        const key = `${cell.note},${cell.inst},${cell.vol},${cell.fx}`;
        if (row.shown[c] === key) return;
        row.shown[c] = key;
        this.paint(row.parts[c], cell);
      });
    });
    for (const el of this.marked) el.classList.remove("cur", "at", "sel");
    this.marked = [];
    const mark = (el: HTMLElement | undefined, cls: string): void => {
      if (!el) return;
      el.classList.add(cls);
      this.marked.push(el);
    };
    if (sel) {
      for (let r = sel.from; r <= sel.to; r++)
        mark(this.rows[r]?.cells[cursor.ch], "sel");
    }
    const row = this.rows[cursor.row];
    mark(row?.cells[cursor.ch], "cur");
    mark(row?.parts[cursor.ch][cursor.col + 1], "at");
  }

  /** Moves the playing-row bar; -1 hides it. */
  setPlayRow(row: number, follow: boolean): void {
    if (row === this.playRow) return;
    this.rows[this.playRow]?.el.classList.remove("play");
    this.playRow = row;
    const el = this.rows[row]?.el;
    if (!el) return;
    el.classList.add("play");
    if (follow) {
      this.el.scrollTop =
        el.offsetTop - Math.floor((this.el.clientHeight - el.offsetHeight) / 2);
    }
  }

  /** Scrolls just enough to show a row below the sticky header. */
  reveal(row: number): void {
    const el = this.rows[row]?.el;
    if (!el) return;
    const head = el.offsetHeight;
    const top = el.offsetTop - head;
    const bottom = el.offsetTop + el.offsetHeight;
    if (top < this.el.scrollTop) this.el.scrollTop = top;
    else if (bottom > this.el.scrollTop + this.el.clientHeight) {
      this.el.scrollTop = bottom - this.el.clientHeight;
    }
  }
}

const WHITE = [0, 2, 4, 5, 7, 9, 11];
/** black keys, by the white key they follow */
const BLACK: [number, number][] = [
  [0, 1],
  [1, 3],
  [3, 6],
  [4, 8],
  [5, 10],
];

/** A piano strip. `onKey` gets the semitone offset from the strip's first C. */
export function piano(
  octaves: number,
  onKey: (semitone: number) => void,
): { el: HTMLElement; mark(semitone: number | null): void } {
  const total = octaves * 7;
  const keys = new Map<number, HTMLElement>();
  const el = h("div", { class: "trk-piano" });
  const key = (semi: number, black: boolean, left?: number): HTMLElement => {
    const k = h("button", {
      class: "trk-key" + (black ? " black" : ""),
      attrs: { type: "button", tabindex: -1, "aria-label": `key ${semi}` },
      data: { semi },
    });
    if (left !== undefined) {
      k.style.left = `${(left / total) * 100}%`;
      k.style.width = `${60 / total}%`;
      k.style.marginLeft = `${-30 / total}%`;
    }
    keys.set(semi, k);
    return k;
  };
  for (let o = 0; o < octaves; o++) {
    for (const semi of WHITE) el.append(key(o * 12 + semi, false));
  }
  for (let o = 0; o < octaves; o++) {
    for (const [after, semi] of BLACK) {
      el.append(key(o * 12 + semi, true, o * 7 + after + 1));
    }
  }
  // pointerdown, so a tap sounds at once and focus stays in the grid
  el.addEventListener("pointerdown", (ev) => {
    const k = (ev.target as HTMLElement).closest<HTMLElement>(".trk-key");
    if (!k) return;
    ev.preventDefault();
    onKey(Number(k.dataset.semi));
  });
  let marked: HTMLElement | null = null;
  return {
    el,
    mark(semi) {
      const next = semi === null ? null : (keys.get(semi) ?? null);
      if (next === marked) return;
      marked?.classList.remove("on");
      next?.classList.add("on");
      marked = next;
    },
  };
}

/** Vertical 0–15 slider with its letter above and hex value below. */
function vslider(
  label: string,
  color: string,
  onInput: (v: number) => void,
): { el: HTMLElement; set(v: number): void } {
  let value = 0;
  const fill = h("div", { class: "trk-vs-fill", style: { background: color } });
  const thumb = h("div", { class: "trk-vs-thumb" });
  const out = h("span", { class: "trk-vs-value" });
  const track = h(
    "div",
    {
      class: "trk-vs-track",
      attrs: {
        tabindex: 0,
        role: "slider",
        "aria-label": label,
        "aria-valuemin": 0,
        "aria-valuemax": 15,
      },
    },
    fill,
    thumb,
  );
  const show = (): void => {
    track.style.setProperty("--v", String(value / 15));
    track.setAttribute("aria-valuenow", String(value));
    out.textContent = HEX[value];
  };
  const set = (v: number, tell: boolean): void => {
    const next = Math.min(15, Math.max(0, Math.round(v)));
    if (next === value) return;
    value = next;
    show();
    if (tell) onInput(value);
  };
  const fromPointer = (ev: PointerEvent): void => {
    const r = track.getBoundingClientRect();
    set((1 - (ev.clientY - r.top) / r.height) * 15, true);
  };
  track.addEventListener("pointerdown", (ev) => {
    track.setPointerCapture(ev.pointerId);
    fromPointer(ev);
  });
  track.addEventListener("pointermove", (ev) => {
    if (track.hasPointerCapture(ev.pointerId)) fromPointer(ev);
  });
  track.addEventListener("keydown", (ev) => {
    const d =
      ev.key === "ArrowUp" || ev.key === "ArrowRight"
        ? 1
        : ev.key === "ArrowDown" || ev.key === "ArrowLeft"
          ? -1
          : 0;
    if (!d) return;
    ev.preventDefault();
    ev.stopPropagation();
    set(value + d, true);
  });
  show();
  return {
    el: h("div", { class: "trk-vs" }, h("span", { text: label }), track, out),
    set: (v) => set(v, false),
  };
}

export interface InstrumentHost {
  instruments(): Instrument[];
  current(): number;
  select(index: number): void;
  /** applies an undoable change to the current instrument */
  change(field: string, fn: (ins: Instrument) => void): void;
}

/** Editor for the 8 instrument slots: waveform/duty, ADSR sliders, pitch sweep. */
export function instrumentPanel(host: InstrumentHost): {
  el: HTMLElement;
  render(): void;
} {
  const title = h("div", { class: "trk-inst-title" });
  const slots = segmented(
    Array.from({ length: INSTRUMENTS }, (_, i) => ({
      value: i,
      label: String(i),
    })),
    host.current(),
    (v) => host.select(v),
  );
  slots.el.classList.add("trk-slots");
  const name = h("input", {
    attrs: { type: "text", maxlength: 24, "aria-label": "Instrument name" },
  });
  name.addEventListener("change", () =>
    host.change("name", (ins) => (ins.name = name.value.trim())),
  );
  const duty = segmented<number>(
    [
      { value: 0, label: "12.5" },
      { value: 1, label: "25" },
      { value: 2, label: "50" },
    ],
    2,
    (v) => host.change("duty", (ins) => (ins.duty = v)),
  );
  const noise = segmented<number>(
    [
      { value: 0, label: "White" },
      { value: 1, label: "Periodic" },
    ],
    0,
    (v) => host.change("noise", (ins) => (ins.noise = v)),
  );
  const colors = ["var(--p8)", "var(--p9)", "var(--p10)", "var(--p12)"];
  const fields = ["attack", "decay", "sustain", "release"] as const;
  const adsr = fields.map((field, i) =>
    vslider(field[0].toUpperCase(), colors[i], (v) =>
      host.change(field, (ins) => (ins[field] = v)),
    ),
  );
  const sweepOut = h("span", { class: "trk-sweep-value mono" });
  const sweep = slider(0, -15, 15, (v) => {
    sweepOut.textContent = v > 0 ? `+${v}` : String(v);
    host.change("sweep", (ins) => (ins.sweep = v));
  });
  sweep.setAttribute("aria-label", "Pitch sweep");
  const line = (label: string, ...children: Child[]): HTMLElement =>
    h(
      "div",
      { class: "trk-inst-row" },
      h("span", { class: "trk-inst-label", text: label }),
      ...children,
    );
  const el = h(
    "div",
    { class: "trk-inst" },
    title,
    slots.el,
    line("Name", name),
    line("Duty %", duty.el),
    line("Noise", noise.el),
    h("div", { class: "trk-inst-label", text: "ADSR envelope" }),
    h("div", { class: "trk-adsr" }, ...adsr.map((s) => s.el)),
    line("Sweep", sweep, sweepOut),
  );
  return {
    el,
    render() {
      const index = host.current();
      const ins = host.instruments()[index];
      title.textContent = `Instrument ${index}`;
      slots.set(index);
      if (document.activeElement !== name) name.value = ins.name;
      duty.set(ins.duty);
      noise.set(ins.noise);
      fields.forEach((field, i) => adsr[i].set(ins[field]));
      syncSlider(sweep, ins.sweep);
      sweepOut.textContent =
        ins.sweep > 0 ? `+${ins.sweep}` : String(ins.sweep);
    },
  };
}

/** A full-window sheet inside the app, with a title and a Done button. */
export function sheet(
  root: HTMLElement,
  title: string,
  body: HTMLElement,
  onClose?: () => void,
): { close(): void } {
  let closed = false;
  const close = (): void => {
    if (closed) return;
    closed = true;
    el.remove();
    onClose?.();
  };
  const el = h(
    "div",
    { class: "trk-sheet" },
    h(
      "div",
      { class: "trk-sheet-head" },
      h("span", { text: title }),
      button("Done", close, { primary: true }),
    ),
    h("div", { class: "trk-sheet-body" }, body),
  );
  el.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape") close();
    // keys typed in a sheet are not pattern input
    ev.stopPropagation();
  });
  root.append(el);
  return { close };
}
