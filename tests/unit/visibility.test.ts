// Spec 005 R3, R4 (and 006 R5): the shared visibility helper. The pure rule
// first, then the wiring on a fake view, fake windows and the real document.
import { afterEach, describe, expect, it } from "vitest";
import { LAYOUT } from "../../src/sheet/layout.ts";
import {
  createVisibility,
  seen,
  viewRect,
  type Rect,
} from "../../src/sheet/demos/visibility.ts";

/** The view as view.ts sees it: a W × H scroller at client (L, T), insets
 * (iL, iT), scrolled to (sx, sy) at zoom z. Same formula as view.ts toSheet. */
function fakeView(o: {
  W: number;
  H: number;
  z: number;
  sx: number;
  sy: number;
  L?: number;
  T?: number;
  iL?: number;
  iT?: number;
}) {
  const { L = 0, T = 0, iL = 0, iT = 0 } = o;
  const toSheet = (cx: number, cy: number): [number, number] => [
    (cx - L - iL + o.sx) / o.z,
    (cy - T - iT + o.sy) / o.z,
  ];
  const box = { left: L, top: T, width: o.W, height: o.H };
  return { toSheet, box };
}

describe("seen: the pure rule", () => {
  const view: Rect = { x: 1000, y: 500, w: 800, h: 400 };
  const win = (x: number, y: number): Rect => ({ x, y, w: 100, h: 100 });

  it("is visible and eligible when the window overlaps the view", () => {
    expect(seen(win(1100, 600), view, false)).toEqual({
      eligible: true,
      visible: true,
    });
  });
  it("is eligible but not visible in the half-view margin", () => {
    // right of the view: the margin is 400 px (half the width) wide
    expect(seen(win(1850, 600), view, false)).toEqual({
      eligible: true,
      visible: false,
    });
    // above: the margin is 200 px (half the height) tall
    expect(seen(win(1100, 250), view, false)).toEqual({
      eligible: true,
      visible: false,
    });
  });
  it("is neither past the margin", () => {
    expect(seen(win(2250, 600), view, false)).toEqual({
      eligible: false,
      visible: false,
    });
    expect(seen(win(1100, 1150), view, false)).toEqual({
      eligible: false,
      visible: false,
    });
  });
  it("counts touching edges as no overlap", () => {
    // window's right edge on the view's left edge
    expect(seen(win(900, 600), view, false).visible).toBe(false);
    // one px in
    expect(seen(win(901, 600), view, false).visible).toBe(true);
    // window's left edge on the expanded view's right edge (1800 + 400)
    expect(seen(win(2200, 600), view, false).eligible).toBe(false);
    expect(seen(win(2199, 600), view, false).eligible).toBe(true);
  });
  it("a hidden tab is never visible, but eligibility is kept", () => {
    expect(seen(win(1100, 600), view, true)).toEqual({
      eligible: true,
      visible: false,
    });
  });
});

describe("viewRect: the scroller in sheet px, at several zooms", () => {
  it("at 100 % with insets scrolled off", () => {
    const v = fakeView({
      W: 1200,
      H: 800,
      z: 1,
      sx: 400,
      sy: 24,
      iL: 400,
      iT: 24,
    });
    expect(viewRect(v.box, v.toSheet)).toEqual({ x: 0, y: 0, w: 1200, h: 800 });
  });
  it("at 50 % the same scroller shows twice the sheet", () => {
    const v = fakeView({ W: 1200, H: 800, z: 0.5, sx: 0, sy: 0 });
    expect(viewRect(v.box, v.toSheet)).toEqual({
      x: 0,
      y: 0,
      w: 2400,
      h: 1600,
    });
  });
  it("at 160 % with an offset scroller and scroll", () => {
    const v = fakeView({
      W: 800,
      H: 640,
      z: 1.6,
      sx: 1600,
      sy: 800,
      L: 10,
      T: 20,
    });
    expect(viewRect(v.box, v.toSheet)).toEqual({
      x: 1000,
      y: 500,
      w: 500,
      h: 400,
    });
  });
  it("one window: visible at 50 %, only eligible at 100 %, neither at 160 %", () => {
    // a window at sheet x 1500, the scroller at sheet origin
    const win: Rect = { x: 1500, y: 100, w: 300, h: 300 };
    const at = (z: number) => {
      const v = fakeView({ W: 1200, H: 800, z, sx: 0, sy: 0 });
      return seen(win, viewRect(v.box, v.toSheet), false);
    };
    expect(at(0.5)).toEqual({ eligible: true, visible: true }); // view to 2400
    expect(at(1)).toEqual({ eligible: true, visible: false }); // 1200, margin to 1800
    expect(at(1.6)).toEqual({ eligible: false, visible: false }); // 750, margin to 1125
  });
});

describe("createVisibility: the wiring", () => {
  const id = "castlewars";
  const slot = LAYOUT.find((s) => s.id === id)!;
  let hidden = false;
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => (hidden ? "hidden" : "visible"),
  });
  Object.defineProperty(document, "hidden", {
    configurable: true,
    get: () => hidden,
  });
  afterEach(() => {
    hidden = false;
  });

  function rig() {
    const st = {
      z: 1,
      sx: 0,
      sy: 0,
      pos: [slot.x, slot.y] as [number, number],
    };
    const viewCbs: (() => void)[] = [];
    const moveCbs: ((id: string) => void)[] = [];
    const view = {
      toSheet: (cx: number, cy: number): [number, number] => [
        (cx + st.sx) / st.z,
        (cy + st.sy) / st.z,
      ],
      onChange: (cb: () => void) => void viewCbs.push(cb),
    };
    const wins = {
      pos: () => st.pos,
      onMove: (cb: (id: string) => void) => void moveCbs.push(cb),
    };
    const vp = document.createElement("div");
    vp.getBoundingClientRect = () => new DOMRect(0, 0, 1200, 800);
    Object.defineProperty(vp, "clientWidth", { value: 1200 });
    Object.defineProperty(vp, "clientHeight", { value: 800 });
    const vis = createVisibility(view, wins, vp);
    const calls: { eligible: boolean; visible: boolean }[] = [];
    const stop = vis.watch(id, (s) => calls.push(s));
    return {
      st,
      calls,
      stop,
      pan: () => viewCbs.forEach((cb) => cb()),
      move: (to: [number, number]) => {
        st.pos = to;
        moveCbs.forEach((cb) => cb(id));
      },
    };
  }

  it("reports the state at once, then only changes", () => {
    const r = rig(); // castlewars at 1040,140 is in a 1200 × 800 view at 100 %
    expect(r.calls).toEqual([{ eligible: true, visible: true }]);
    r.pan();
    r.pan();
    expect(r.calls).toHaveLength(1);
  });
  it("reacts to pan and zoom", () => {
    const r = rig();
    r.st.sx = 1700; // view 1700..2900: the window (1040..1640) is in the margin
    r.pan();
    expect(r.calls.at(-1)).toEqual({ eligible: true, visible: false });
    r.st.z = 0.5; // view 3400..5800, margin from 2800
    r.pan();
    expect(r.calls.at(-1)).toEqual({ eligible: false, visible: false });
    r.st.sx = 0; // view 0..2400 at 50 %
    r.pan();
    expect(r.calls.at(-1)).toEqual({ eligible: true, visible: true });
    expect(r.calls).toHaveLength(4);
  });
  it("reacts to window moves", () => {
    const r = rig();
    r.move([1100, 140]); // still overlaps 0..1200
    expect(r.calls).toHaveLength(1);
    r.move([2400, 140]); // past the margin (1800)
    expect(r.calls.at(-1)).toEqual({ eligible: false, visible: false });
    r.move([1300, 140]);
    expect(r.calls.at(-1)).toEqual({ eligible: true, visible: false });
  });
  it("reacts to a hidden tab and its return", () => {
    const r = rig();
    hidden = true;
    document.dispatchEvent(new Event("visibilitychange"));
    expect(r.calls.at(-1)).toEqual({ eligible: true, visible: false });
    hidden = false;
    document.dispatchEvent(new Event("visibilitychange"));
    expect(r.calls.at(-1)).toEqual({ eligible: true, visible: true });
    expect(r.calls).toHaveLength(3);
  });
  it("a stopped watch gets no more calls", () => {
    const r = rig();
    r.stop();
    r.move([2400, 140]);
    hidden = true;
    document.dispatchEvent(new Event("visibilitychange"));
    expect(r.calls).toHaveLength(1);
  });
});
