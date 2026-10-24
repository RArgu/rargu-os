// Spec 005 R6, R8: the Pentimento sketch, ported from the mock (reused.js
// "Pentimento sketch"). Fixes: a new run cancels the last one (the mock let
// two chains run, assumption 3); unmount cancels every timer; nothing runs
// while idle; the canvas draws at its CSS size × devicePixelRatio.
import "./pentimento.css";
import { REDUCE, reduced } from "../view";
import { ownPresses } from "./press";

const STEP = 550; // ms between lines, as in the mock
const FONT = "bold 38px 'Instrument Sans', sans-serif";
const SKETCH = "Sketch of the planned agent CLI · nothing built yet";
const PROMPT = "agent> pull the text in this image onto its own layer";
const LINES = [
  "$ pentimento detect-text in.png  → 1 region (22,36 248×48)",
  '$ pentimento layer extract --region 0 --name "SUMMER SALE"',
  "$ pentimento inpaint --layer 0 --region 0",
  "done: 2 layers",
];

let root: HTMLElement | null = null;
let timer = 0;
let off: AbortController | null = null;
let sized: ResizeObserver | null = null;

const layer = (name: string, fresh = false) => {
  const d = document.createElement("div");
  if (fresh) d.className = "new";
  d.innerHTML = `<span class="eye" aria-hidden="true">◉</span> `;
  d.append(name);
  return d;
};

/** The sample image in mock coordinates (400 × 200); `split` marks the text. */
function draw(c: HTMLCanvasElement, split: boolean) {
  const w = Math.round(c.clientWidth * devicePixelRatio) || 400;
  if (c.width !== w) [c.width, c.height] = [w, Math.round(w / 2)];
  const x = c.getContext("2d")!;
  x.setTransform(w / 400, 0, 0, w / 400, 0, 0);
  const g = x.createLinearGradient(0, 0, 400, 200);
  g.addColorStop(0, "#29adff");
  g.addColorStop(1, "#ff77a8");
  x.fillStyle = g;
  x.fillRect(0, 0, 400, 200);
  x.fillStyle = "#ffec27";
  x.beginPath();
  x.arc(320, 60, 34, 0, 7);
  x.fill();
  x.fillStyle = "#1d2b53";
  x.beginPath();
  x.moveTo(0, 200);
  x.lineTo(120, 110);
  x.lineTo(210, 170);
  x.lineTo(290, 120);
  x.lineTo(400, 200);
  x.fill();
  x.font = FONT;
  x.fillStyle = "#fff1e8";
  x.fillText("SUMMER SALE", 28, 72);
  if (split) {
    x.setLineDash([6, 4]);
    x.strokeStyle = "#ffec27";
    x.lineWidth = 2;
    x.strokeRect(22, 36, 248, 48);
    x.setLineDash([]);
  }
}

/** `stop` ends the view's motion when Run is pressed (001 R21). */
export function mount(el: HTMLElement, stop?: () => void): void {
  if (root) return;
  root = el;
  el.inert = false;
  el.classList.add("pent-demo");
  el.innerHTML = `<div class="pent">
      <canvas role="img" aria-label="Sample image: the words SUMMER SALE over a sunset with hills"></canvas>
      <div class="layers"></div>
    </div>
    <div class="cmd" role="group" aria-label="Agent commands" tabindex="0"></div>
    <div class="tb"><button type="button"><span aria-hidden="true">▶</span> Run the agent</button><span class="sketch">${SKETCH}</span></div>
    <div class="sr" role="status"></div>`;
  const c = el.querySelector("canvas")!;
  const list = el.querySelector<HTMLElement>(".layers")!;
  const cmd = el.querySelector<HTMLElement>(".cmd")!;
  const status = el.querySelector<HTMLElement>("[role=status]")!;
  const reset = () => {
    clearTimeout(timer);
    timer = 0;
    list.replaceChildren(layer("Background"));
    cmd.textContent = PROMPT;
    status.textContent = "";
    draw(c, false);
  };
  reset();
  const again = () => draw(c, !!list.querySelector(".new"));
  // the canvas text needs the self-hosted font: draw again once it is in
  document.fonts?.load(FONT).then(() => {
    if (root === el) again();
  });
  // the backing store follows the CSS size, also when the stylesheet
  // applies after mount (WebKit); draw() resizes only on a change
  sized = new ResizeObserver(again);
  sized.observe(c);
  off = new AbortController();
  ownPresses(el, off.signal, stop);

  // a run: one line per step, STEP ms apart; with reduced motion all at once
  let i = LINES.length;
  const step = () => {
    timer = 0;
    cmd.textContent += `\n${LINES[i]}`;
    cmd.scrollTop = cmd.scrollHeight;
    if (i === 1) {
      draw(c, true);
      list.prepend(layer("Text: SUMMER SALE", true));
    }
    if (++i === LINES.length) status.textContent = "Sketch done: 2 layers";
    else if (reduced()) step();
    else timer = window.setTimeout(step, STEP);
  };
  el.querySelector("button")!.addEventListener("click", () => {
    reset();
    i = 0;
    if (reduced()) step();
    else timer = window.setTimeout(step, STEP);
  });
  // reduced motion turned on mid-run: the final state at once (R7)
  matchMedia(REDUCE).addEventListener(
    "change",
    (e) => {
      if (e.matches && timer) {
        clearTimeout(timer);
        step();
      }
    },
    { signal: off.signal },
  );
}

export function unmount(): void {
  clearTimeout(timer);
  timer = 0;
  off?.abort();
  sized?.disconnect();
  off = sized = null;
  root?.replaceChildren();
  root?.classList.remove("pent-demo");
  root = null;
}
