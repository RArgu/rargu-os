// 001 R21: a pointer press on a demo's button is a gesture of its own. It
// claims its pointer in the one-gesture owner until the pointer lifts, is
// cancelled or loses its capture, or the demo unmounts (`signal`), so no
// paper pan, pinch or window drag starts meanwhile; like a window press, it
// stops the view's motion (`stop`). A press while another gesture owns the
// input does nothing (its click is dropped). Keyboard clicks stay native.
import { claim, free } from "../gestures";

const ENDS = ["pointerup", "pointercancel", "lostpointercapture"];

export function ownPresses(
  root: HTMLElement,
  signal: AbortSignal,
  stop?: () => void,
): void {
  let dropped: Element | null = null;
  // the press under way: ends it once, whichever way it ends
  let release: (() => void) | null = null;
  signal.addEventListener("abort", () => release?.());
  root.addEventListener(
    "pointerdown",
    (e) => {
      const b = (e.target as Element).closest("button");
      dropped = null;
      if (!b || e.button !== 0) return;
      const id = e.pointerId;
      const up = (u: Event) => {
        if ((u as PointerEvent).pointerId === id) release?.();
      };
      const done = () => {
        for (const t of ENDS) removeEventListener(t, up, true);
        if (release === done) release = null;
        free(id);
      };
      if (!claim("control", id, 1, done)) {
        dropped = b;
        e.preventDefault();
        return;
      }
      release = done;
      for (const t of ENDS) addEventListener(t, up, true);
      stop?.();
    },
    { capture: true, signal },
  );
  root.addEventListener(
    "click",
    (e) => {
      // a pointer's click (detail > 0) after a dropped press
      if (dropped && e.detail && dropped.contains(e.target as Node)) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
      dropped = null;
    },
    { capture: true, signal },
  );
}
