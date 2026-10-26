// Shared visibility rule for the sheet's demos (spec 005 R3, R4; 006 R5).
//
// eligible: the window's current rectangle overlaps the view expanded by half
//   a view width on the left and on the right, and half a view height above
//   and below (002 R11). Demos load then.
// visible: the rectangle overlaps the view itself and the tab is visible.
//   Demos animate only then.
//
// "The view" is the scroller's visible client area (#vp), card included: the
// card overlays part of it, but a window under the card still counts. The
// window rectangle is its unrotated, unlifted box (top-left from wins.pos and
// the layout's size). Overlap needs a positive area: touching edges do not
// count. Nothing here runs an animation frame; it only answers events.
import { LAYOUT } from "../layout";
import type { View } from "../view";
import type { Windows } from "../windows";

/** A rectangle in sheet px. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface Seen {
  eligible: boolean;
  visible: boolean;
}

/** True when a and b share a positive area. */
const overlaps = (a: Rect, b: Rect) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** The rule. `win` and `view` in sheet px; `hidden` is the tab's state. */
export function seen(win: Rect, view: Rect, hidden: boolean): Seen {
  const near: Rect = {
    x: view.x - view.w / 2,
    y: view.y - view.h / 2,
    w: view.w * 2,
    h: view.h * 2,
  };
  return {
    eligible: overlaps(win, near),
    visible: !hidden && overlaps(win, view),
  };
}

/** The scroller's client box (client px) as a sheet rect, through the
 * view's own conversion, so zoom and insets are applied as view.ts does. */
export function viewRect(
  box: { left: number; top: number; width: number; height: number },
  toSheet: View["toSheet"],
): Rect {
  const [x0, y0] = toSheet(box.left, box.top);
  const [x1, y1] = toSheet(box.left + box.width, box.top + box.height);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** 013 R6: how a window is shown besides its place: "expanded" (it covers
 * the page: eligible, and visible while the tab is), false (its watched
 * panel is not selected, or another window covers the page: not visible), or
 * true (the place decides). */
export type Shown = (id: string) => boolean | "expanded";

/** Watches windows' visibility. Each `watch` calls back once at once, then
 * only when eligible or visible changes; it returns a stop function.
 * `check()` runs the rule again after a `shown` change. */
export function createVisibility(
  view: Pick<View, "toSheet" | "onChange">,
  wins: Pick<Windows, "pos" | "onMove">,
  vp: HTMLElement,
  shown: Shown = () => true,
) {
  const watches = new Set<{
    id: string;
    last: Seen | null;
    cb: (s: Seen) => void;
  }>();
  const check = (only?: string) => {
    if (!watches.size) return;
    const b = vp.getBoundingClientRect();
    const v = viewRect(
      {
        left: b.left + vp.clientLeft,
        top: b.top + vp.clientTop,
        width: vp.clientWidth,
        height: vp.clientHeight,
      },
      view.toSheet,
    );
    for (const w of watches) {
      if (only && w.id !== only) continue;
      const s = LAYOUT.find((s) => s.id === w.id)!;
      const [x, y] = wins.pos(w.id);
      const how = shown(w.id);
      const now =
        how === "expanded"
          ? { eligible: true, visible: !document.hidden }
          : seen({ x, y, w: s.w, h: s.h }, v, document.hidden);
      if (how === false) now.visible = false;
      if (w.last?.eligible === now.eligible && w.last.visible === now.visible)
        continue;
      w.last = now;
      w.cb(now);
    }
  };
  view.onChange(() => check());
  wins.onMove((id) => check(id));
  document.addEventListener("visibilitychange", () => check());
  // a resize can change the view's size without a scroll
  addEventListener("resize", () => check());
  return {
    check: () => check(),
    watch(id: string, cb: (s: Seen) => void): () => void {
      const w = { id, last: null, cb };
      watches.add(w);
      check(id);
      return () => void watches.delete(w);
    },
  };
}
