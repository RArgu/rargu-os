// src/ui/menu.ts popupMenu placement (002 R18, advisor condition for the
// shared change): the menu is placed in its root's own px, also when the
// root is moved, scaled (the sheet's zoom) and rotated (window wobble), and
// on the old OS (root at the page's origin, scale 1) as before.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeMenus, popupMenu } from "../../src/ui/menu";
import { setHostOverlayRoot } from "../../src/ui/dom";

/** root px → screen px: screen = o + k · R(θ) · p */
let map = { ox: 0, oy: 0, k: 1, th: 0 };
const toScreen = (x: number, y: number): [number, number] => {
  const c = Math.cos(map.th) * map.k;
  const s = Math.sin(map.th) * map.k;
  return [map.ox + c * x - s * y, map.oy + s * x + c * y];
};
/** The screen box of a root-px rectangle (its corners' bounds). */
const box = (x: number, y: number, w: number, h: number): DOMRect => {
  const pts = [
    toScreen(x, y),
    toScreen(x + w, y),
    toScreen(x, y + h),
    toScreen(x + w, y + h),
  ];
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const [l, t] = [Math.min(...xs), Math.min(...ys)];
  return new DOMRect(l, t, Math.max(...xs) - l, Math.max(...ys) - t);
};

const ROOT = { w: 360, h: 200 };
const MENU = { w: 100, h: 60 };
/** Layout in root px: elements carry it in data-x/-y/-w/-h; the menu and
 * the root have fixed sizes; anything placed by style uses its left/top. */
function layout(el: HTMLElement): [number, number, number, number] {
  if (el.id === "root") return [0, 0, ROOT.w, ROOT.h];
  if (el.classList.contains("menu"))
    return [
      parseFloat(el.style.left) || 0,
      parseFloat(el.style.top) || 0,
      MENU.w,
      MENU.h,
    ];
  if (el.dataset.w)
    return [+el.dataset.x!, +el.dataset.y!, +el.dataset.w, +el.dataset.h!];
  return [
    parseFloat(el.style.left) || 0,
    parseFloat(el.style.top) || 0,
    parseFloat(el.style.width) || 0,
    parseFloat(el.style.height) || 0,
  ];
}

let root: HTMLElement;
let head: HTMLElement;
beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    function (this: HTMLElement) {
      return box(...layout(this));
    },
  );
  for (const [prop, i] of [
    ["offsetWidth", 2],
    ["offsetHeight", 3],
    ["clientWidth", 2],
    ["clientHeight", 3],
  ] as const)
    vi.spyOn(HTMLElement.prototype, prop, "get").mockImplementation(function (
      this: HTMLElement,
    ) {
      return layout(this)[i];
    });
  document.body.innerHTML = `<div id="root"></div><button data-x="10" data-y="-27" data-w="50" data-h="27">File</button>`;
  root = document.getElementById("root")!;
  head = document.querySelector("button")!;
  setHostOverlayRoot(root);
});
afterEach(() => {
  closeMenus();
  setHostOverlayRoot(null);
  vi.restoreAllMocks();
});

const items = [{ label: "New", action: () => {} }];
const at = () => {
  const m = root.querySelector<HTMLElement>(".menu")!;
  return [parseFloat(m.style.left), parseFloat(m.style.top)];
};

describe("popupMenu placement", () => {
  it("old OS: root at the origin, scale 1: under its header, as before", () => {
    map = { ox: 0, oy: 0, k: 1, th: 0 };
    popupMenu(items, head);
    expect(at()).toEqual([10, 0]);
    closeMenus();
    popupMenu(items, { x: 40, y: 50 });
    expect(at()).toEqual([40, 50]);
  });

  it("a moved, zoomed root: under its header, in root px", () => {
    map = { ox: 1200, oy: 700, k: 0.5, th: 0 };
    popupMenu(items, head);
    const [x, y] = at();
    expect(x).toBeCloseTo(10);
    expect(y).toBeCloseTo(0);
    closeMenus();
    // a point (a context menu) maps through the zoom
    const [px, py] = toScreen(80, 90);
    popupMenu(items, { x: px, y: py });
    expect(at()[0]).toBeCloseTo(80);
    expect(at()[1]).toBeCloseTo(90);
  });

  it("a rotated root (wobble): under its header, in root px", () => {
    map = { ox: 1200, oy: 700, k: 0.5, th: (8 * Math.PI) / 180 };
    popupMenu(items, head);
    const [x, y] = at();
    expect(x).toBeCloseTo(10);
    expect(y).toBeCloseTo(0);
  });

  it("clamps the menu inside the root", () => {
    map = { ox: 1200, oy: 700, k: 0.5, th: 0 };
    const [px, py] = toScreen(ROOT.w - 10, ROOT.h - 10);
    popupMenu(items, { x: px, y: py });
    expect(at()[0]).toBeCloseTo(ROOT.w - MENU.w);
    expect(at()[1]).toBeCloseTo(ROOT.h - MENU.h);
  });
});
