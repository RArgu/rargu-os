// Spec 013 R2, R5, R6, R7: Expand moves a project window's own node into a
// fixed layer over the page (#lift), and Restore moves it back. A node in
// #world cannot be position: fixed (#world and the window have transforms),
// and moving the node keeps its canvas, timers and listeners. A placeholder
// of the same size keeps its place on the sheet. FLIP: the window animates
// from its on-screen rectangle to the viewport, and back.
import { REDUCE, reduced, type View } from "./view";
import type { Windows } from "./windows";

const MS = 240;
const FADE = 120;
/** R4: the page behind the dialog */
const BEHIND = ["#vp", "#card", ".mapbox"];
const TABBABLE = "a[href], button, input, select, textarea, [tabindex]";
/** a live tool's or a hosted app's own area: it owns Tab and Esc */
const APP = ".try-area, .demo-area[data-host]";

/** The window's Tab stops in order (the window frame first). */
const stops = (win: HTMLElement): HTMLElement[] =>
  [win, ...win.querySelectorAll<HTMLElement>(TABBABLE)].filter(
    (el) =>
      el.tabIndex >= 0 &&
      !(el as HTMLButtonElement).disabled &&
      !el.closest("[inert]") &&
      el.getClientRects().length > 0,
  );

export interface Expand {
  /** The expanded window, or null. */
  current(): HTMLElement | null;
  /** `instant`: no animation (a page that opens expanded, R12). */
  expand(win: HTMLElement, instant?: boolean): void;
  restore(): void;
  /** Calls `cb(win, expanded)` after each change. */
  onChange(cb: (win: HTMLElement, expanded: boolean) => void): void;
}

export function createExpand(view: View, wins: Windows): Expand {
  const lift = document.querySelector<HTMLElement>("#lift")!;
  let open: { win: HTMLElement; ph: HTMLElement } | null = null;
  let anim: Animation | null = null;
  const changed: ((win: HTMLElement, on: boolean) => void)[] = [];

  // R5: reduced motion turned on mid-animation: the end state at once
  matchMedia(REDUCE).addEventListener("change", (e) => {
    if (e.matches) anim?.finish();
  });

  // R4: Tab and Shift+Tab stay in the window. Capture: before an app's own
  // keys. In a tool or hosted app the app keeps Tab (Writer types with it)
  // and only the edges wrap; elsewhere the dialog moves the focus itself, so
  // the order is the same in every browser (WebKit's plain Tab skips buttons)
  lift.addEventListener(
    "keydown",
    (e) => {
      if (e.key !== "Tab" || !open || e.altKey || e.ctrlKey || e.metaKey)
        return;
      const all = stops(open.win);
      const a = document.activeElement as HTMLElement | null;
      const i = a && open.win.contains(a) ? all.indexOf(a) : -1;
      const app = a?.closest(APP);
      const n = all.length;
      const next = e.shiftKey ? (i <= 0 ? n - 1 : i - 1) : (i + 1) % n;
      if (app && open.win.contains(app)) {
        const edge = e.shiftKey ? all[0] : all[n - 1];
        if (a !== edge) return;
      }
      e.preventDefault();
      all[next]?.focus({ preventScroll: true });
    },
    true,
  );
  // R4: Esc restores, unless a tool or hosted app owns it (002's Esc then
  // Tab rule; those apps never let the key out) or a control took it
  lift.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || !open || e.defaultPrevented) return;
    if ((e.target as Element).closest(APP)) return;
    e.preventDefault();
    restoreIt();
  });

  const label = (win: HTMLElement, on: boolean) => {
    const b = win.querySelector<HTMLButtonElement>(".bar .expand")!;
    const name = win.getAttribute("aria-label");
    b.textContent = on ? "⤡" : "⤢";
    b.setAttribute("aria-label", `${on ? "Restore" : "Expand"} ${name}`);
  };
  /** Moves `win` (keeping the focus in it, with no scroll or reveal). */
  const move = (win: HTMLElement, put: () => void) => {
    const f = document.activeElement;
    put();
    if (
      f instanceof HTMLElement &&
      win.contains(f) &&
      f !== document.activeElement
    )
      view.navFocus(f);
  };
  /** FLIP from screen rect `a` to the window's own rect; `back` reverses. */
  const play = (win: HTMLElement, a: DOMRect, back: boolean): Animation => {
    if (reduced())
      return win.animate(
        [{ opacity: back ? 1 : 0 }, { opacity: back ? 0 : 1 }],
        { duration: FADE },
      );
    const b = win.getBoundingClientRect();
    const t = `translate(${a.left - b.left}px, ${a.top - b.top}px) scale(${a.width / b.width}, ${a.height / b.height})`;
    const k = [
      { transformOrigin: "0 0", transform: t },
      { transformOrigin: "0 0", transform: "none" },
    ];
    return win.animate(back ? k.reverse() : k, {
      duration: MS,
      easing: "ease-out",
    });
  };

  return {
    current: () => open?.win ?? null,
    onChange: (cb) => void changed.push(cb),
    expand(win, instant = false) {
      if (open || anim) return;
      const id = win.dataset.win!;
      const from = win.getBoundingClientRect(); // zoom and tilt included
      wins.lift(id);
      const [x, y] = wins.pos(id);
      const ph = document.createElement("div");
      ph.className = "sheet-win-ph";
      ph.style.cssText = `width:${win.style.width};height:${win.style.height};transform:translate(${x}px, ${y}px)`;
      move(win, () => {
        win.before(ph);
        lift.append(win);
        lift.setAttribute("aria-label", win.getAttribute("aria-label")!);
        lift.hidden = false;
        win.classList.add("expanded");
        for (const s of BEHIND)
          document.querySelector<HTMLElement>(s)!.inert = true;
      });
      open = { win, ph };
      label(win, true);
      if (!instant) {
        anim = play(win, from, false);
        anim.finished.finally(() => (anim = null));
      }
      for (const cb of changed) cb(win, true);
    },
    restore: () => restoreIt(),
  };

  function restoreIt(): void {
    if (!open || anim) return;
    const { win, ph } = open;
    open = null;
    label(win, false);
    // play back to the placeholder's rect, then move the node home
    anim = play(win, ph.getBoundingClientRect(), true);
    const done = () => {
      anim = null;
      move(win, () => {
        ph.replaceWith(win);
        win.classList.remove("expanded");
        lift.hidden = true;
        for (const s of BEHIND)
          document.querySelector<HTMLElement>(s)!.inert = false;
      });
      wins.drop(win.dataset.win!);
      // R4: the focus goes to the Expand control, with no scroll or reveal
      view.navFocus(win.querySelector<HTMLElement>(".bar .expand")!);
      for (const cb of changed) cb(win, false);
    };
    anim.finished.then(done, done);
  }
}
