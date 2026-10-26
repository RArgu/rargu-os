// Spec 013 R20: the URL follows the Read view. Read on the sheet pushes
// /p/<id>/; leaving Read by a control goes back; Back and Forward give the
// state the R20 table names. A page loaded at /p/<id>/ (direct entry) pushed
// nothing: its Restore replaces the URL with "/" and Back leaves the site.
import type { Expand } from "./expand";
import { modeOf, onMode, select, type Mode } from "./tabs";
import type { View } from "./view";

interface Entry {
  p: string;
  before: Mode;
}

export function initHistory(
  view: View,
  expand: Expand,
  /** the window's current top-left, sheet px */
  pos: (id: string) => [number, number],
): void {
  const win = (id: string) =>
    document.querySelector<HTMLElement>(`[data-win="${id}"]`)!;
  const tab = (w: HTMLElement, m: Mode) =>
    w.querySelector<HTMLElement>(`.tabs [data-mode="${m}"]`)!;
  /** the id whose /p/ entry this page pushed, if it is the current one */
  let pushed: string | null = null;
  /** a direct entry's id until its URL becomes "/" */
  let direct: string | null =
    /^\/p\/[^/]+\/?$/.test(location.pathname) && document.body.dataset.open
      ? document.body.dataset.open.split(":")[0]
      : null;
  /** set while Back or Forward changes the mode: no new entry */
  let quiet = false;
  let focusAfter: HTMLElement | null = null;
  expand.onChange((w, on) => {
    if (on || focusAfter !== w) return;
    focusAfter = null;
    view.navFocus(w);
  });

  onMode((w, mode, was) => {
    if (quiet) return;
    const id = w.dataset.win!;
    if (mode === "read") {
      const e: Entry = { p: id, before: was };
      if (pushed || direct) history.replaceState(e, "", `/p/${id}/`);
      else history.pushState(e, "", `/p/${id}/`);
      pushed = id;
      direct = null;
    } else if (was === "read") {
      if (pushed === id) {
        // row 4 (and a phone's Restore, row 3): back to "/"
        pushed = null;
        quiet = true; // the popstate this makes changes nothing
        history.back();
      } else if (direct === id) {
        direct = null;
        history.replaceState(null, "", "/");
      }
    }
  });

  // row 9: a direct entry's Restore: the window centred, the URL "/"
  expand.onRestore((w) => {
    const id = w.dataset.win!;
    if (direct !== id) return;
    direct = null;
    history.replaceState(null, "", "/");
    const [x, y] = pos(id);
    view.panTo(x, y, w.offsetWidth, w.offsetHeight, true);
  });

  addEventListener("popstate", (e) => {
    if (quiet) {
      quiet = false;
      return;
    }
    const st = e.state as Entry | null;
    quiet = true;
    try {
      if (st?.p) {
        // row 7: Forward to a Read entry
        const w = win(st.p);
        select(w, "read");
        view.navFocus(tab(w, "read"));
        pushed = st.p;
      } else if (pushed) {
        // row 5: Back from Read to the mode before it, not expanded
        const w = win(pushed);
        pushed = null;
        if (modeOf(w) === "read") select(w, prev.get(w) ?? "demo");
        delete w.dataset.before;
        if (expand.current() === w) {
          // the focus goes to the window once the Restore ends (row 5)
          focusAfter = w;
          expand.restore();
        } else view.navFocus(w);
      }
    } finally {
      quiet = false;
    }
  });

  // the mode before Read, for Back (the entry Back lands on is "/")
  const prev = new Map<HTMLElement, Mode>();
  onMode((w, mode, was) => {
    if (mode === "read") prev.set(w, was);
  });
}
