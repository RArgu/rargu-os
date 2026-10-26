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

export interface Expand {
  /** The expanded window, or null. */
  current(): HTMLElement | null;
  expand(win: HTMLElement): void;
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
    expand(win) {
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
        lift.hidden = false;
        win.classList.add("expanded");
      });
      open = { win, ph };
      label(win, true);
      anim = play(win, from, false);
      anim.finished.finally(() => (anim = null));
      for (const cb of changed) cb(win, true);
    },
    restore() {
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
        });
        wins.drop(win.dataset.win!);
        for (const cb of changed) cb(win, false);
      };
      anim.finished.then(done, done);
    },
  };
}
