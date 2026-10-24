// Paint: a small pixel editor. The picture lives in one ImageData that the
// integer algorithms in raster.ts draw into; the visible canvas is always an
// exact copy of it, so saving is just encoding that canvas.
import "./styles.css";
import type { OS } from "../../sdk/os";
import { h, scale, u } from "../../ui/dom";
import { icon } from "../../ui/icons";
import {
  bottomBar,
  button,
  checkbox,
  radioGroup,
  segmented,
} from "../../ui/widgets";
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
  type Pixels,
  type Rgb,
} from "./raster";

type Tool =
  | "pencil"
  | "eraser"
  | "fill"
  | "line"
  | "rect"
  | "ellipse"
  | "select"
  | "picker";
type Zoom = 1 | 2 | 4;
type Brush = 1 | 2 | 4;

interface Config {
  zoom: Zoom;
  grid: boolean;
  brush: Brush;
  tool: Tool;
  rectFilled: boolean;
  ellipseFilled: boolean;
  /** palette slots; -1 picks the darkest (fg) or lightest (bg) color of the theme */
  fg: number;
  bg: number;
  newSize: string;
}

interface Point {
  x: number;
  y: number;
}

interface Selection {
  x: number;
  y: number;
  w: number;
  h: number;
  /** set once the region has been cut out and floats above the picture */
  pixels: Pixels | null;
  /** the picture with the hole left by the cut */
  under: Pixels | null;
}

interface Stroke {
  id: number;
  tool: Tool;
  color: Rgb;
  start: Point;
  last: Point;
  /** the picture before this stroke, for shape previews */
  base: Pixels | null;
  /** an undo snapshot was taken for this stroke */
  pushed: boolean;
  mode: "draw" | "marquee" | "move";
  grab: Point;
}

const TOOLS: { id: Tool; label: string; icon: string }[] = [
  { id: "pencil", label: "Pencil", icon: "tool-pencil" },
  { id: "eraser", label: "Eraser", icon: "tool-eraser" },
  { id: "fill", label: "Fill", icon: "tool-fill" },
  { id: "line", label: "Line", icon: "tool-line" },
  { id: "rect", label: "Rect", icon: "tool-rect" },
  { id: "ellipse", label: "Ellipse", icon: "tool-ellipse" },
  { id: "select", label: "Select", icon: "tool-select" },
  { id: "picker", label: "Picker", icon: "tool-picker" },
];
const SIZES = [
  { id: "160x100", w: 160, h: 100 },
  { id: "320x200", w: 320, h: 200 },
  { id: "640x400", w: 640, h: 400 },
];
const ZOOMS: Zoom[] = [1, 2, 4];
const BRUSHES: Brush[] = [1, 2, 4];
const CLASSIC = [
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
const PICTURES = "~/Pictures";
const UNDO_DEPTH = 32;
// keeps 32 undo snapshots within a sane amount of memory
const MAX_SIDE = 800;
// logical px of backdrop kept around a fitted canvas
const VIEW_PAD = 4;

const luminance = (c: Rgb): number =>
  ((c >> 16) & 255) * 299 + ((c >> 8) & 255) * 587 + (c & 255) * 114;

export default async function main(os: OS): Promise<void> {
  const startPath = os.argv.find((a) => !a.startsWith("--")) ?? null;
  const config = await loadConfig<Config>(os, {
    zoom: 1,
    grid: false,
    brush: 1,
    tool: "pencil",
    rectFilled: false,
    ellipseFilled: false,
    fg: -1,
    bg: -1,
    newSize: "320x200",
  });
  if (!ZOOMS.includes(config.zoom)) config.zoom = 1;
  if (!BRUSHES.includes(config.brush)) config.brush = 1;
  if (!TOOLS.some((t) => t.id === config.tool)) config.tool = "pencil";

  let palette = await loadPalette();
  let fg = slotColor(config.fg, false);
  let bg = config.bg < 0 ? 0xffffff : slotColor(config.bg, true);

  let doc = new ImageData(320, 200);
  let path: string | null = null;
  let dirty = false;
  let forceClose = false;
  let undoStack: ImageData[] = [];
  let redoStack: ImageData[] = [];
  let sel: Selection | null = null;
  let stroke: Stroke | null = null;
  let compact = os.env.DISPLAY_POLICY === "compact";
  let zoom: Zoom = config.zoom;
  // compact picks the zoom that fits until the visitor chooses one
  let autoZoom = true;
  let pan: Point | null = null;
  /** spec 004 R5, the sheet only: the pan's unrounded view scroll and the
   * zero-size probes that show the stage's screen transform */
  let sheetPan: { x: number; y: number; probes: HTMLElement[] } | null = null;
  const touches = new Map<number, Point>();
  let lastTitle = "";

  const win = os.ui.createWindow({ title: "Paint" });

  // ----- elements -----

  const canvas = h("canvas", {
    class: "paint-canvas",
    data: { testid: "paint-canvas" },
    attrs: { "aria-label": "Picture" },
  });
  // pixels get read back from this canvas (PNG encoding, tests), so keep it on the CPU
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Paint needs a 2D canvas.");
  const gridEl = h("div", { class: "paint-grid hidden" });
  const marquee = h("div", { class: "paint-marquee hidden" });
  const cross = h("div", { class: "paint-cross hidden" });
  const stage = h(
    "div",
    { class: "paint-stage" },
    canvas,
    gridEl,
    marquee,
    cross,
  );
  const view = h("div", { class: "paint-view" }, stage);

  const toolButtons = new Map<Tool, { el: HTMLElement; filled: HTMLElement }>();
  const toolGrid = h("div", {
    class: "paint-tools",
    attrs: { role: "toolbar", "aria-label": "Tools" },
  });
  for (const t of TOOLS) {
    const filled = h("span", { class: "glyph square hidden" });
    const el = h(
      "button",
      {
        class: "btn stack paint-tool",
        tip: t.label,
        data: { tool: t.id },
        attrs: { type: "button", "aria-label": t.label },
        on: { click: () => pickTool(t.id) },
      },
      icon(t.icon),
      h("span", { class: "paint-tool-label" }, t.label, filled),
    );
    toolButtons.set(t.id, { el, filled });
    toolGrid.append(el);
  }

  // desktop options under the tools: brush size and outline/filled
  const brushButtons = new Map<Brush, HTMLElement>();
  const brushRow = h("div", { class: "paint-option-row" });
  for (const b of BRUSHES) {
    const el = h(
      "button",
      {
        class: "btn paint-option",
        tip: `${b} px`,
        attrs: { type: "button", "aria-label": `Brush ${b} px` },
        on: { click: () => setBrush(b) },
      },
      h("span", { class: "paint-dot", style: { width: u(b), height: u(b) } }),
    );
    brushButtons.set(b, el);
    brushRow.append(el);
  }
  const outlineBtn = h(
    "button",
    {
      class: "btn paint-option",
      tip: "Outline",
      attrs: { type: "button", "aria-label": "Outline shapes" },
      on: { click: () => setFilled(false) },
    },
    h("span", { class: "paint-hollow" }),
  );
  const filledBtn = h(
    "button",
    {
      class: "btn paint-option",
      tip: "Filled",
      attrs: { type: "button", "aria-label": "Filled shapes" },
      on: { click: () => setFilled(true) },
    },
    h("span", { class: "glyph square" }),
  );
  const options = h(
    "div",
    { class: "paint-options" },
    brushRow,
    h("div", { class: "paint-option-row" }, outlineBtn, filledBtn),
  );
  const side = h("div", { class: "paint-side" });
  const mainRow = h("div", { class: "paint-main" });

  // palette strip
  const fgEl = h("span", { class: "paint-fg" });
  const bgEl = h("span", { class: "paint-bg" });
  const pair = h(
    "button",
    {
      class: "paint-pair",
      tip: "Swap colors",
      attrs: { type: "button", "aria-label": "Swap foreground and background" },
      on: {
        click: () => {
          [fg, bg] = [bg, fg];
          colorsChanged();
        },
      },
    },
    bgEl,
    fgEl,
  );
  const swatches = palette.map((_, i) =>
    h("button", {
      class: "paint-swatch",
      attrs: { type: "button", "aria-label": `Color ${i}` },
      on: {
        click: () => {
          fg = palette[i];
          colorsChanged();
        },
        contextmenu: (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          bg = palette[i];
          colorsChanged();
        },
      },
    }),
  );
  const colors = h(
    "div",
    { class: "paint-colors" },
    pair,
    h(
      "div",
      { class: "paint-swatch-col" },
      h("div", { class: "paint-swatches" }, ...swatches),
      h("div", {
        class: "paint-caption",
        text: "Tap: color  Hold: background",
      }),
    ),
  );

  const status = { size: h("span"), zoom: h("span"), pos: h("span") };
  const statusBar = h(
    "div",
    { class: "statusbar" },
    status.size,
    status.zoom,
    status.pos,
  );

  // compact controls
  const undoBtn = button("", () => undo(), {
    icon: "undo-16",
    tip: "Undo",
    class: "icon-only",
  });
  const redoBtn = button("", () => redo(), {
    icon: "redo-16",
    tip: "Redo",
    class: "icon-only",
  });
  undoBtn.setAttribute("aria-label", "Undo");
  redoBtn.setAttribute("aria-label", "Redo");
  const zoomSelect = h(
    "select",
    { attrs: { "aria-label": "Zoom" } },
    ...ZOOMS.map((z) => h("option", { text: `${z}x`, attrs: { value: z } })),
  );
  zoomSelect.addEventListener("change", () =>
    chooseZoom(Number(zoomSelect.value) as Zoom),
  );
  const gridCheck = checkbox("Grid", config.grid, (v) => setGrid(v));
  gridCheck.el.classList.add("btn", "paint-gridtoggle");
  const actionRow = h(
    "div",
    { class: "paint-actions" },
    undoBtn,
    redoBtn,
    h("span", { class: "grow" }),
    zoomSelect,
    gridCheck.el,
  );
  const brushSeg = segmented(
    BRUSHES.map((b) => ({ value: b, label: `${b}px` })),
    config.brush,
    (b) => setBrush(b),
  );
  brushSeg.el.classList.add("paint-brush");
  const lower = h("div", { class: "paint-lower" });
  const bar = bottomBar([
    {
      label: "New",
      icon: "new-16",
      id: "new",
      onClick: () => void newPicture(),
    },
    { label: "Open", icon: "open-16", id: "open", onClick: () => void open() },
    { label: "Save", icon: "save-16", id: "save", onClick: () => void save() },
  ]);

  const root = h("div", { class: "app paint" });
  win.root.append(root);

  // ----- palette -----

  async function loadPalette(): Promise<Rgb[]> {
    let list = CLASSIC;
    try {
      const theme = JSON.parse(
        await os.fs.readText(`/etc/themes/${os.sys.theme.get()}.json`),
      ) as {
        palette?: unknown;
      };
      const p = theme.palette;
      if (
        Array.isArray(p) &&
        p.length === 16 &&
        p.every((c) => typeof c === "string" && /^#[0-9a-f]{6}$/i.test(c))
      ) {
        list = p as string[];
      }
    } catch {
      // unreadable theme: Classic 16
    }
    return list.map(hexToRgb);
  }

  function slotColor(slot: number, lightest: boolean): Rgb {
    if (slot >= 0 && slot < palette.length) return palette[slot];
    return palette.reduce((best, c) =>
      luminance(c) > luminance(best) === lightest ? c : best,
    );
  }

  function colorsChanged(): void {
    fgEl.style.background = rgbToHex(fg);
    bgEl.style.background = rgbToHex(bg);
    swatches.forEach((el, i) => {
      el.style.background = rgbToHex(palette[i]);
    });
    // colors picked from an opened picture may not be palette slots; those are not remembered
    const f = palette.indexOf(fg);
    const b = palette.indexOf(bg);
    if ((f >= 0 && f !== config.fg) || (b >= 0 && b !== config.bg)) {
      if (f >= 0) config.fg = f;
      if (b >= 0) config.bg = b;
      void saveConfig(os, config);
    }
  }

  async function themeChanged(): Promise<void> {
    const old = palette;
    palette = await loadPalette();
    // the selected colors follow their slots into the new theme
    const f = old.indexOf(fg);
    const b = old.indexOf(bg);
    if (f >= 0) fg = palette[f];
    if (b >= 0) bg = palette[b];
    colorsChanged();
  }

  // ----- picture -----

  function render(): void {
    ctx?.putImageData(doc, 0, 0);
  }

  function snapshot(): ImageData {
    return new ImageData(
      new Uint8ClampedArray(doc.data),
      doc.width,
      doc.height,
    );
  }

  function pushUndo(): ImageData {
    const snap = snapshot();
    undoStack.push(snap);
    if (undoStack.length > UNDO_DEPTH) undoStack.shift();
    redoStack = [];
    dirty = true;
    return snap;
  }

  function undo(): void {
    endStroke();
    const prev = undoStack.pop();
    if (!prev) return;
    dropSelection();
    redoStack.push(snapshot());
    doc = prev;
    dirty = true;
    render();
    refresh();
  }

  function redo(): void {
    endStroke();
    const next = redoStack.pop();
    if (!next) return;
    dropSelection();
    undoStack.push(snapshot());
    doc = next;
    dirty = true;
    render();
    refresh();
  }

  /** Replaces the picture and forgets history. */
  function setPicture(next: ImageData, file: string | null): void {
    stroke = null;
    sel = null;
    doc = next;
    canvas.width = doc.width;
    canvas.height = doc.height;
    undoStack = [];
    redoStack = [];
    path = file;
    dirty = false;
    autoZoom = true;
    render();
    applyZoom();
    fit();
    refresh();
  }

  function blank(w: number, h2: number): ImageData {
    const img = new ImageData(w, h2);
    fillRect(img.data, w, h2, 0, 0, w, h2, bg);
    return img;
  }

  // ----- selection -----

  function dropSelection(): void {
    // a floating region is already drawn into the picture, so dropping it keeps it there
    sel = null;
    showMarquee();
  }

  function showMarquee(): void {
    marquee.classList.toggle("hidden", !sel || sel.w < 1 || sel.h < 1);
    if (!sel) return;
    marquee.style.left = u(sel.x * zoom);
    marquee.style.top = u(sel.y * zoom);
    marquee.style.width = u(sel.w * zoom);
    marquee.style.height = u(sel.h * zoom);
  }

  /** Cuts the selected region out so it can be dragged. */
  function lift(s: Selection): void {
    pushUndo();
    s.pixels = copyRegion(doc.data, doc.width, doc.height, s.x, s.y, s.w, s.h);
    fillRect(doc.data, doc.width, doc.height, s.x, s.y, s.w, s.h, bg);
    s.under = new Uint8ClampedArray(doc.data);
    blit(doc.data, doc.width, doc.height, s.pixels, s.w, s.h, s.x, s.y);
  }

  function selectAll(): void {
    endStroke();
    setTool("select");
    sel = {
      x: 0,
      y: 0,
      w: doc.width,
      h: doc.height,
      pixels: null,
      under: null,
    };
    showMarquee();
  }

  function clearSelection(): void {
    endStroke();
    if (!sel) return;
    if (sel.under) {
      // already cut: throw the floating piece away
      doc.data.set(sel.under);
    } else {
      pushUndo();
      fillRect(doc.data, doc.width, doc.height, sel.x, sel.y, sel.w, sel.h, bg);
    }
    dropSelection();
    render();
    refresh();
  }

  // ----- tools and view -----

  function isFilled(tool: Tool): boolean {
    return tool === "rect"
      ? config.rectFilled
      : tool === "ellipse"
        ? config.ellipseFilled
        : false;
  }

  function setTool(tool: Tool): void {
    if (tool !== "select") dropSelection();
    config.tool = tool;
    void saveConfig(os, config);
    refresh();
  }

  function pickTool(tool: Tool): void {
    endStroke();
    // tapping the active Rect or Ellipse again switches outline/filled
    if (tool === config.tool && (tool === "rect" || tool === "ellipse"))
      setFilled(!isFilled(tool));
    else setTool(tool);
  }

  function setFilled(v: boolean): void {
    if (config.tool === "rect") config.rectFilled = v;
    else if (config.tool === "ellipse") config.ellipseFilled = v;
    else return;
    void saveConfig(os, config);
    refresh();
  }

  function setBrush(b: Brush): void {
    config.brush = b;
    void saveConfig(os, config);
    refresh();
  }

  function setGrid(v: boolean): void {
    config.grid = v;
    void saveConfig(os, config);
    applyZoom();
  }

  function applyZoom(): void {
    stage.style.width = u(doc.width * zoom);
    stage.style.height = u(doc.height * zoom);
    gridEl.classList.toggle("hidden", !(config.grid && zoom === 4));
    showMarquee();
    zoomSelect.value = String(zoom);
    gridCheck.input.checked = config.grid;
    gridCheck.input.disabled = zoom !== 4;
    gridCheck.el.classList.toggle("disabled", zoom !== 4);
    buildMenu();
    refresh();
  }

  /** A zoom picked by the visitor: remembered, and it turns the automatic fit off. */
  function chooseZoom(z: Zoom): void {
    autoZoom = false;
    zoom = z;
    config.zoom = z;
    void saveConfig(os, config);
    applyZoom();
  }

  function stepZoom(dir: 1 | -1): void {
    const next = ZOOMS[ZOOMS.indexOf(zoom) + dir];
    if (next) chooseZoom(next);
  }

  /** Compact: the largest whole zoom at which the picture fits the canvas area. */
  function fit(): void {
    if (!compact || !autoZoom || view.clientWidth === 0) return;
    const s = scale();
    const z = fitZoom(
      doc.width,
      doc.height,
      Math.floor(view.clientWidth / s) - VIEW_PAD * 2,
      Math.floor(view.clientHeight / s) - VIEW_PAD * 2,
    );
    if (z !== zoom) {
      zoom = z;
      applyZoom();
    }
  }

  function refresh(): void {
    for (const [id, b] of toolButtons) {
      const active = id === config.tool;
      b.el.classList.toggle("active", active);
      b.el.setAttribute("aria-pressed", String(active));
      b.filled.classList.toggle("hidden", !isFilled(id));
    }
    for (const [b, el] of brushButtons)
      el.classList.toggle("pressed", b === config.brush);
    brushSeg.set(config.brush);
    const shape = config.tool === "rect" || config.tool === "ellipse";
    outlineBtn.disabled = filledBtn.disabled = !shape;
    outlineBtn.classList.toggle("pressed", shape && !isFilled(config.tool));
    filledBtn.classList.toggle("pressed", shape && isFilled(config.tool));
    undoBtn.disabled = undoStack.length === 0;
    redoBtn.disabled = redoStack.length === 0;
    status.size.textContent = `${doc.width}×${doc.height}`;
    status.zoom.textContent = `${zoom}x`;
    const title = `${appName(os, "Paint")} - ${path ? baseOf(path) : "untitled"}${dirty ? " *" : ""}`;
    if (title !== lastTitle) {
      lastTitle = title;
      win.setTitle(title);
    }
  }

  function layout(): void {
    compact = os.env.DISPLAY_POLICY === "compact";
    root.classList.toggle("compact", compact);
    if (compact) {
      lower.replaceChildren(colors, toolGrid, brushSeg.el);
      root.replaceChildren(actionRow, view, lower, bar);
      autoZoom = true;
      requestAnimationFrame(fit);
    } else {
      side.replaceChildren(toolGrid, options);
      mainRow.replaceChildren(side, view);
      root.replaceChildren(mainRow, colors, statusBar);
      if (zoom !== config.zoom) {
        zoom = config.zoom;
        applyZoom();
      }
    }
  }

  // ----- drawing -----

  function point(ev: PointerEvent): Point {
    const r = canvas.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return { x: 0, y: 0 };
    return {
      x: Math.floor(((ev.clientX - r.left) * doc.width) / r.width),
      y: Math.floor(((ev.clientY - r.top) * doc.height) / r.height),
    };
  }

  function showPos(p: Point | null): void {
    const inside =
      p && p.x >= 0 && p.y >= 0 && p.x < doc.width && p.y < doc.height;
    status.pos.textContent = p && inside ? `x:${p.x} y:${p.y}` : "";
  }

  function showCross(p: Point | null): void {
    cross.classList.toggle("hidden", !p);
    if (!p) return;
    cross.style.left = u(Math.floor(p.x * zoom + zoom / 2));
    cross.style.top = u(Math.floor(p.y * zoom + zoom / 2));
  }

  function pick(p: Point, background: boolean): void {
    const c = getPixel(doc.data, doc.width, doc.height, p.x, p.y);
    if (c === null) return;
    if (background) bg = c;
    else fg = c;
    colorsChanged();
  }

  function drawShape(s: Stroke, p: Point): void {
    if (!s.base) return;
    doc.data.set(s.base);
    const { data, width: w, height: ht } = doc;
    if (s.tool === "line")
      line(data, w, ht, s.start.x, s.start.y, p.x, p.y, s.color, config.brush);
    else if (s.tool === "rect")
      rect(
        data,
        w,
        ht,
        s.start.x,
        s.start.y,
        p.x,
        p.y,
        s.color,
        config.rectFilled,
        config.brush,
      );
    else
      ellipse(
        data,
        w,
        ht,
        s.start.x,
        s.start.y,
        p.x,
        p.y,
        s.color,
        config.ellipseFilled,
        config.brush,
      );
  }

  function begin(ev: PointerEvent): void {
    const p = point(ev);
    const right = ev.button === 2;
    const tool = config.tool;
    // the right button draws with the other color
    const color = (tool === "eraser") !== right ? bg : fg;
    const s: Stroke = {
      id: ev.pointerId,
      tool,
      color,
      start: p,
      last: p,
      base: null,
      pushed: false,
      mode: "draw",
      grab: { x: 0, y: 0 },
    };
    stroke = s;
    const { data, width: w, height: ht } = doc;
    switch (tool) {
      case "picker":
        pick(p, right);
        break;
      case "fill": {
        const at = getPixel(data, w, ht, p.x, p.y);
        if (at === null || at === color) break;
        pushUndo();
        s.pushed = true;
        floodFill(data, w, ht, p.x, p.y, color);
        break;
      }
      case "pencil":
      case "eraser":
        pushUndo();
        s.pushed = true;
        line(data, w, ht, p.x, p.y, p.x, p.y, color, config.brush);
        break;
      case "line":
      case "rect":
      case "ellipse":
        s.base = pushUndo().data;
        s.pushed = true;
        drawShape(s, p);
        break;
      case "select":
        if (
          sel &&
          p.x >= sel.x &&
          p.y >= sel.y &&
          p.x < sel.x + sel.w &&
          p.y < sel.y + sel.h
        ) {
          s.mode = "move";
          s.grab = { x: p.x - sel.x, y: p.y - sel.y };
        } else {
          s.mode = "marquee";
          dropSelection();
        }
        break;
    }
    render();
    refresh();
  }

  function clampPoint(p: Point): Point {
    return {
      x: Math.max(0, Math.min(doc.width - 1, p.x)),
      y: Math.max(0, Math.min(doc.height - 1, p.y)),
    };
  }

  function advance(s: Stroke, ev: PointerEvent): void {
    const p = point(ev);
    if (p.x === s.last.x && p.y === s.last.y) return;
    const { data, width: w, height: ht } = doc;
    switch (s.tool) {
      case "picker":
        pick(p, ev.buttons === 2);
        break;
      case "pencil":
      case "eraser":
        line(data, w, ht, s.last.x, s.last.y, p.x, p.y, s.color, config.brush);
        break;
      case "line":
      case "rect":
      case "ellipse":
        drawShape(s, p);
        break;
      case "select":
        if (s.mode === "marquee") {
          const a = clampPoint(s.start);
          const b = clampPoint(p);
          sel = {
            x: Math.min(a.x, b.x),
            y: Math.min(a.y, b.y),
            w: Math.abs(a.x - b.x) + 1,
            h: Math.abs(a.y - b.y) + 1,
            pixels: null,
            under: null,
          };
        } else if (sel) {
          if (!sel.pixels) {
            lift(sel);
            s.pushed = true;
          }
          sel.x = p.x - s.grab.x;
          sel.y = p.y - s.grab.y;
          if (sel.under && sel.pixels) {
            data.set(sel.under);
            blit(data, w, ht, sel.pixels, sel.w, sel.h, sel.x, sel.y);
          }
        }
        showMarquee();
        break;
      case "fill":
        break;
    }
    s.last = p;
    render();
    if (s.pushed) refresh();
  }

  function endStroke(): void {
    if (!stroke) return;
    stroke = null;
    showCross(null);
    refresh();
  }

  /** A second finger arrived: the gesture is a pan, so take back what the first finger drew. */
  function cancelStroke(): void {
    const s = stroke;
    if (!s) return;
    stroke = null;
    showCross(null);
    if (s.pushed) {
      const prev = undoStack.pop();
      if (prev) doc = prev;
    }
    if (s.tool === "select" && (s.mode === "marquee" || s.pushed))
      dropSelection();
    render();
    refresh();
  }

  function centroid(): Point {
    let x = 0;
    let y = 0;
    for (const t of touches.values()) {
      x += t.x;
      y += t.y;
    }
    const n = Math.max(1, touches.size);
    return { x: x / n, y: y / n };
  }

  // ----- two-finger pan on the sheet (spec 004 R5) -----
  // The sheet zooms with a CSS scale and a swinging window turns, so a screen
  // px is not a view px. Each step maps the fingers' motion through the
  // stage's current transform (as menu.ts toLocal): a zoom or turn during
  // the pan applies from the next step.

  function startSheetPan(): void {
    const probes = [
      [0, 0],
      [100, 0],
      [0, 100],
    ].map(([x, y]) =>
      h("div", {
        style: {
          position: "absolute",
          left: `${x}px`,
          top: `${y}px`,
          width: "0",
          height: "0",
        },
      }),
    );
    stage.append(...probes);
    sheetPan = { x: view.scrollLeft, y: view.scrollTop, probes };
  }

  function endSheetPan(): void {
    for (const p of sheetPan?.probes ?? []) p.remove();
    sheetPan = null;
  }

  /** Moves the view so the picture follows the fingers from `from` to `to`. */
  function panSheet(s: NonNullable<typeof sheetPan>, from: Point, to: Point) {
    const [o, a, b] = s.probes.map((p) => p.getBoundingClientRect());
    const [ax, ay] = [(a.left - o.left) / 100, (a.top - o.top) / 100];
    const [bx, by] = [(b.left - o.left) / 100, (b.top - o.top) / 100];
    const det = ax * by - bx * ay;
    if (!det) return;
    const [dx, dy] = [to.x - from.x, to.y - from.y];
    // another input scrolled the view: go on from there
    if (Math.abs(s.x - view.scrollLeft) > 1) s.x = view.scrollLeft;
    if (Math.abs(s.y - view.scrollTop) > 1) s.y = view.scrollTop;
    // kept unrounded, so small steps at a low zoom add up
    const maxX = view.scrollWidth - view.clientWidth;
    const maxY = view.scrollHeight - view.clientHeight;
    s.x = Math.max(0, Math.min(maxX, s.x - (dx * by - bx * dy) / det));
    s.y = Math.max(0, Math.min(maxY, s.y - (ax * dy - ay * dx) / det));
    view.scrollLeft = s.x;
    view.scrollTop = s.y;
  }

  canvas.addEventListener("pointerdown", (ev) => {
    if (ev.pointerType === "mouse" && ev.button !== 0 && ev.button !== 2)
      return;
    ev.preventDefault();
    canvas.setPointerCapture(ev.pointerId);
    if (ev.pointerType === "touch") {
      touches.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      if (touches.size >= 2) {
        cancelStroke();
        pan = centroid();
        if (!sheetPan) startSheetPan();
        return;
      }
    }
    if (stroke || pan) return;
    begin(ev);
    if (ev.pointerType !== "mouse") showCross(point(ev));
    showPos(point(ev));
  });
  canvas.addEventListener("pointermove", (ev) => {
    if (touches.has(ev.pointerId))
      touches.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (pan) {
      const c = centroid();
      if (sheetPan) panSheet(sheetPan, pan, c);
      else {
        view.scrollLeft -= c.x - pan.x;
        view.scrollTop -= c.y - pan.y;
      }
      pan = c;
      return;
    }
    const p = point(ev);
    showPos(p);
    if (!stroke || stroke.id !== ev.pointerId) return;
    advance(stroke, ev);
    if (ev.pointerType !== "mouse") showCross(p);
  });
  const release = (ev: PointerEvent): void => {
    touches.delete(ev.pointerId);
    if (pan) {
      // keep panning with the remaining finger; drawing starts again with a fresh touch
      pan = touches.size > 0 ? centroid() : null;
      if (!pan) endSheetPan();
      return;
    }
    if (stroke && stroke.id === ev.pointerId) endStroke();
    if (ev.pointerType !== "mouse") showPos(null);
  };
  canvas.addEventListener("pointerup", release);
  canvas.addEventListener("pointercancel", release);
  canvas.addEventListener("pointerleave", () => {
    if (!stroke) showPos(null);
  });
  canvas.addEventListener("contextmenu", (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
  });

  // ----- files -----

  /** The canvas's pixels as PNG bytes. */
  function encode(): Promise<Uint8Array> {
    render();
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (!blob)
          return reject(new Error("The picture could not be encoded."));
        blob.arrayBuffer().then((buf) => resolve(new Uint8Array(buf)), reject);
      }, "image/png");
    });
  }

  async function confirmDiscard(): Promise<boolean> {
    if (!dirty) return true;
    return askToSave(os, "Save your picture first?", "Paint", save);
  }

  async function load(file: string): Promise<void> {
    try {
      const st = await os.fs.stat(file);
      if (st.type === "dir") throw new Error(`${file} is a folder`);
      const bytes = await os.fs.readFile(file);
      const bmp = await createImageBitmap(
        new Blob([bytes as BlobPart], { type: "image/png" }),
      );
      try {
        if (bmp.width > MAX_SIDE || bmp.height > MAX_SIDE) {
          throw new Error(
            `Paint opens pictures up to ${MAX_SIDE}x${MAX_SIDE}.`,
          );
        }
        // decode on a scratch canvas so a failure leaves the current picture alone
        const scratch = h("canvas", {
          attrs: { width: bmp.width, height: bmp.height },
        });
        const sctx = scratch.getContext("2d");
        if (!sctx) throw new Error("no 2D canvas");
        sctx.imageSmoothingEnabled = false;
        sctx.fillStyle = rgbToHex(bg);
        sctx.fillRect(0, 0, bmp.width, bmp.height);
        sctx.drawImage(bmp, 0, 0);
        setPicture(
          sctx.getImageData(0, 0, bmp.width, bmp.height),
          os.fs.resolve(file),
        );
      } finally {
        bmp.close();
      }
    } catch (err) {
      await os.ui.alert(
        `Could not open ${file}:\n${errorMessage(err)}`,
        "Paint",
      );
    }
  }

  async function write(file: string): Promise<boolean> {
    try {
      endStroke();
      await os.fs.writeFile(file, await encode());
      path = os.fs.resolve(file);
      dirty = false;
      refresh();
      return true;
    } catch (err) {
      await os.ui.alert(
        `Could not save ${file}:\n${errorMessage(err)}`,
        "Paint",
      );
      return false;
    }
  }

  /** Where the file dialogs start; makes sure ~/Pictures is there to save into. */
  async function startDir(): Promise<string> {
    if (path) return dirOf(path);
    await os.fs.mkdir(PICTURES, { recursive: true }).catch(() => {});
    return PICTURES;
  }

  async function saveAs(): Promise<boolean> {
    const target = await os.ui.saveFile({
      filters: [".png"],
      startDir: await startDir(),
      defaultName: path ? baseOf(path) : "untitled.png",
    });
    return target ? write(target) : false;
  }

  async function save(): Promise<boolean> {
    return path ? write(path) : saveAs();
  }

  async function open(): Promise<void> {
    if (!(await confirmDiscard())) return;
    const file = await os.ui.openFile({
      filters: [".png"],
      startDir: await startDir(),
    });
    if (file) await load(file);
  }

  function newDialog(): Promise<{ w: number; h: number } | null> {
    return new Promise((resolve) => {
      let choice = SIZES.some((s) => s.id === config.newSize)
        ? config.newSize
        : "320x200";
      let done = false;
      const dlg = os.ui.createWindow({
        title: "New Picture",
        modal: true,
        resizable: false,
        width: 190,
        height: 132,
        minWidth: 160,
        minHeight: 100,
      });
      const finish = (ok: boolean): void => {
        if (done) return;
        done = true;
        const size = SIZES.find((s) => s.id === choice);
        resolve(ok && size ? { w: size.w, h: size.h } : null);
        dlg.close();
      };
      const sizes = radioGroup(
        `paint-new-${os.pid}`,
        SIZES.map((s) => ({ value: s.id, label: `${s.w} × ${s.h}` })),
        choice,
        (v) => (choice = v),
      );
      const ok = button("OK", () => finish(true), { primary: true });
      const body = h(
        "div",
        { class: "dialog paint-new" },
        h("div", { class: "paint-new-label", text: "Canvas size" }),
        sizes.el,
        h("span", { class: "grow" }),
        // not .dialog-buttons: the shell hides those in compact, counting on a nav bar
        // action that only exists when the primary button is there at window creation
        h(
          "div",
          { class: "paint-new-buttons" },
          ok,
          button("Cancel", () => finish(false)),
        ),
      );
      body.addEventListener("keydown", (ev) => {
        if (
          ev.key === "Enter" &&
          (ev.target as HTMLElement).tagName !== "BUTTON"
        ) {
          ev.preventDefault();
          finish(true);
        } else if (ev.key === "Escape") {
          ev.preventDefault();
          finish(false);
        }
      });
      dlg.root.append(body);
      dlg.onClose(() => {
        if (!done) {
          done = true;
          resolve(null);
        }
      });
      body.querySelector<HTMLInputElement>("input:checked")?.focus();
    });
  }

  async function newPicture(): Promise<void> {
    endStroke();
    if (!(await confirmDiscard())) return;
    const size = await newDialog();
    if (!size) return;
    config.newSize = `${size.w}x${size.h}`;
    void saveConfig(os, config);
    setPicture(blank(size.w, size.h), null);
  }

  async function exportDownload(): Promise<void> {
    try {
      const bytes = await encode();
      const name = path ? baseOf(path) : "untitled.png";
      // spec 004 R13: on the sheet a write to ~/Downloads downloads the bytes,
      // with the host's Download link when the browser does not start it
      await os.fs.writeFile(`~/Downloads/${name}`, bytes);
    } catch (err) {
      await os.ui.alert(
        `Could not export the picture:\n${errorMessage(err)}`,
        "Paint",
      );
    }
  }

  // ----- menu -----

  function buildMenu(): void {
    win.setMenu({
      items: [
        {
          label: "File",
          children: [
            { label: "New…", action: () => void newPicture() },
            { label: "Open…", shortcut: "Ctrl+O", action: () => void open() },
            { label: "Save", shortcut: "Ctrl+S", action: () => void save() },
            { label: "Save As…", action: () => void saveAs() },
            { label: "", separator: true },
            {
              label: "Export to Downloads",
              action: () => void exportDownload(),
            },
            { label: "", separator: true },
            { label: "Close", action: () => win.close() },
          ],
        },
        {
          label: "Edit",
          children: [
            { label: "Undo", shortcut: "Ctrl+Z", action: undo },
            { label: "Redo", shortcut: "Ctrl+Y", action: redo },
            { label: "", separator: true },
            { label: "Select All", shortcut: "Ctrl+A", action: selectAll },
            {
              label: "Clear Selection",
              shortcut: "Del",
              action: clearSelection,
            },
          ],
        },
        {
          label: "View",
          children: [
            ...ZOOMS.map((z) => ({
              label: `Zoom ${z}x`,
              checked: zoom === z,
              action: () => chooseZoom(z),
            })),
            {
              label: "Zoom In",
              shortcut: "Ctrl+Plus",
              disabled: zoom === 4,
              action: () => stepZoom(1),
            },
            {
              label: "Zoom Out",
              shortcut: "Ctrl+Minus",
              disabled: zoom === 1,
              action: () => stepZoom(-1),
            },
            { label: "", separator: true },
            {
              label: "Pixel Grid",
              checked: config.grid,
              disabled: zoom !== 4,
              action: () => setGrid(!config.grid),
            },
          ],
        },
        helpMenu(os),
      ],
    });
  }

  // ----- wiring -----

  win.onResize(() => fit());
  win.onClose(() => {
    if (forceClose || !dirty) return true;
    void askToSave(os, "Save your picture before closing?", "Paint", save).then(
      (go) => {
        if (go) {
          forceClose = true;
          win.close();
        }
      },
    );
    return false;
  });
  os.proc.onSignal(() => {
    forceClose = true;
  });
  os.bus.subscribe("sys:theme", () => void themeChanged());

  canvas.width = doc.width;
  canvas.height = doc.height;
  doc = blank(320, 200);
  colorsChanged();
  layout();
  render();
  applyZoom();
  if (startPath) await load(startPath);
  refresh();
}
