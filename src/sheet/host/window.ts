// 002 R2: an app's main window is its sheet window's demo area. The sheet
// owns the frame, position and z-order (spec 001); the app gets a host root
// inside the demo area, the title bar text, and the demo area's size in app
// px (1 app px = 1 sheet px, any zoom).
//
// 002 R5, R18: setMenu draws a menu row under the title bar, above the
// app's root, as the old OS's menu bar (wm/window.ts renderMenubar): Tab
// reaches its headers (an app's focus callback does not take the focus from
// them), ArrowDown opens one, the arrows move, Esc closes. Esc, then Tab,
// moves the focus out of the app to its window frame (001 R19), also from
// an app that keeps Tab (Writer). It
// takes its height from the demo area (the window keeps its layout size).
// Keys pressed in the app reach the app first; then a menu shortcut runs
// once (the old matcher, shortcuts.ts), and no key goes on to the sheet (no
// arrow pan, no Esc for the card). A wheel turn in a running app scrolls
// what in it can scroll, never the sheet; ⌘/Ctrl + wheel (pinch) still
// zooms the sheet.
//
// 002 R3, R4: child windows (any later createWindow) and the ui dialogs open
// as modal panels in the demo area, beside the app's root: they scale and
// clip with the sheet window at any zoom, and the title bar still drags. While
// one is open the app's root is inert (no pointer or keyboard input), Tab
// stays in the top panel and Esc cancels; closing a panel gives the focus back
// to where it was in the window and never closes the app. A panel takes the
// focus only when the visitor is in its window (the focus is there, or the
// last press was), so a panel of a background app never takes focus or moves
// the view (R11).
import type { MenuSpec, Window as OSWindow, WindowOptions } from "../../sdk/os";
import { h } from "../../ui/dom";
import { closeMenus, popupMenu } from "../../ui/menu";
import { button } from "../../ui/widgets";
import { matchShortcut } from "./shortcuts";
import "./panels.css";

export interface MainWindowDeps {
  /** the sheet window (`[data-win]`) */
  el: HTMLElement;
  /** its demo area */
  area: HTMLElement;
  /** the layout's limits for the demo area, app px */
  max: { w: number; h: number };
  /** brings the sheet window to the front (001 R7.a) */
  front(): void;
  /** the app becomes the active app */
  onActive(): void;
  /** true while the app starts in the background: focus() does nothing (R11) */
  background(): boolean;
  /** R10: the app's main window closed (no onClose said false): end the app */
  close(): void;
}

export interface MainWindow {
  win: OSWindow;
  root: HTMLElement;
  /** The host reports a focus change of the app; onFocus hears real changes. */
  focused(f: boolean): void;
  /** Blocks or frees the app's root: during a background start (R11) or
   * while a modal panel is open (R3). It is inert while either holds. */
  block(reason: "bg" | "modal", on: boolean): void;
  /** Empties the demo area and puts back the title and reserved size. */
  dispose(): void;
}

let nextId = 1;

// R11: in HTML, focus() on an inert element does nothing. WebKit, while a
// stylesheet loads (the host loads apps' CSS in the background), can judge
// an element in a just-blocked root focusable from its old style: focus()
// then blurs the focused element and focuses nothing. So a background start
// would take the focus. Here focus() keeps to the HTML rule in every browser.
// 004 R11: while a Quick tools icon's start is pending (`data-nav` on the
// window, main.ts), the app's own focus() in its demo area waits: the
// activation gives it (takeFocus), if that navigation is still current
// (withoutScroll: the card's pan brings it into view).
const nativeFocus = HTMLElement.prototype.focus;
let calm = 0;
const waiting = new WeakMap<Element, HTMLElement>();
HTMLElement.prototype.focus = function (this: HTMLElement, opts) {
  if (this.closest("[inert]")) return;
  if (!calm && this.closest("[data-nav] .demo-area")) {
    waiting.set(this.closest("[data-nav]")!, this);
    return;
  }
  nativeFocus.call(this, calm ? { ...opts, preventScroll: true } : opts);
};
/** 004 R11: the element the app last focused in window `w` while its
 * start was pending, once; null when none. */
export function takeFocus(w: Element): HTMLElement | null {
  const el = waiting.get(w) ?? null;
  waiting.delete(w);
  return el;
}
/** Runs `fn`; its focus() calls do not scroll, also in a `data-nav`
 * window (004 R11). */
export function withoutScroll(fn: () => void): void {
  calm++;
  try {
    fn();
  } finally {
    calm--;
  }
}

/** The browser's own scroll keys, as a direction (Shift + Space: "S"). */
const SCROLL_KEYS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
  PageUp: [0, -1],
  PageDown: [0, 1],
  Home: [0, -1],
  End: [0, 1],
  " ": [0, 1],
  S: [0, -1],
};

/** A text field's caret is collapsed at the end that arrow `d` moves it to
 * (as src/sheet/view.ts; fields with no caret never are). */
function caretAtEnd(t: HTMLElement, d: [number, number]): boolean {
  if (!(t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement))
    return false;
  const [s, e] = [t.selectionStart, t.selectionEnd];
  if (s === null || s !== e) return false;
  return d[0] + d[1] < 0 ? s === 0 : s === t.value.length;
}

/** R6: the "Download <name>" link of the app's latest document write, at
 * the bottom of the demo area over the app (the window keeps its size). A
 * new one replaces it; × dismisses it; it goes with the app's window. */
export function showDownload(area: HTMLElement, link: HTMLElement): void {
  area.querySelector(":scope > .host-dl")?.remove();
  const bar = h(
    "div",
    { class: "host-dl" },
    link,
    h("button", {
      class: "host-panel-x",
      text: "×",
      attrs: { type: "button", "aria-label": "Dismiss download" },
      on: {
        click: () => {
          // the focus stays in the window
          if (bar.contains(document.activeElement))
            area.closest<HTMLElement>("[data-win]")?.focus({
              preventScroll: true,
            });
          bar.remove();
        },
      },
    }),
  );
  area.append(bar);
}

/** R18: an element from `t` up to `stop` can scroll by (dx, dy). */
function scrolls(
  t: Element | null,
  stop: Element,
  dx: number,
  dy: number,
): boolean {
  const can = (o: string, at: number, room: number, d: number) =>
    d !== 0 &&
    room > 0.5 &&
    /auto|scroll/.test(o) &&
    (d < 0 ? at > 0.5 : at < room - 0.5);
  for (; t && t !== stop; t = t.parentElement) {
    const cs = getComputedStyle(t);
    if (
      can(cs.overflowY, t.scrollTop, t.scrollHeight - t.clientHeight, dy) ||
      can(
        cs.overflowX,
        Math.abs(t.scrollLeft),
        t.scrollWidth - t.clientWidth,
        dx,
      )
    )
      return true;
  }
  return false;
}

export function createMainWindow(
  opts: WindowOptions,
  deps: MainWindowDeps,
): MainWindow {
  const { el, area, max } = deps;
  const title = el.querySelector<HTMLElement>(".bar .t")!;
  const homeTitle = title.textContent;
  const homeSize = [area.style.width, area.style.height];
  const root = document.createElement("div");
  root.className = "host-root";
  // the menu row: a host root of its own (the app may empty win.root)
  const bar = h("div", { class: "host-root host-bar" });
  const blocks = new Set<string>();
  const block = (reason: string, on: boolean): void => {
    if (on) blocks.add(reason);
    else blocks.delete(reason);
    root.inert = bar.inert = blocks.size > 0;
  };
  // R11: during a background start the app cannot take the focus
  block("bg", deps.background());
  area.append(root);
  let menu: MenuSpec | null = null;
  const live = new AbortController();
  const signal = live.signal;

  // the row's open menu and its headers
  let popup: { close(): void } | null = null;
  let heads: HTMLElement[] = [];

  /** R5: the old OS's menu bar, from `menu`. A new menu closes the open
   * one; a focused header stays focused at its place. */
  function drawMenu(): void {
    popup?.close();
    const at = heads.indexOf(document.activeElement as HTMLElement);
    heads = [];
    area.classList.toggle("host-menu", !!menu);
    if (!menu) return bar.remove();
    const items = menu.items.filter((i) => !i.separator);
    const n = items.length;
    /** The next header from `i` in direction `d` that is not disabled. */
    const step = (i: number, d: number): number => {
      for (let k = 1; k < n; k++) {
        const j = (((i + d * k) % n) + n) % n;
        if (!items[j].disabled) return j;
      }
      return i;
    };
    let openAt = -1;
    const open = (i: number): void => {
      const item = items[i];
      if (item.disabled) return;
      closeMenus();
      if (!item.children) return item.action?.();
      // the popup opens in this app's root (the overlay root, R15)
      deps.onActive();
      openAt = i;
      heads[i].classList.add("open");
      const p = popupMenu(item.children, heads[i], {
        onClose: () => {
          heads[i].classList.remove("open");
          if (openAt === i) openAt = -1;
          if (popup === p) popup = null;
        },
        onNavigate: (dir) => open(step(i, dir)),
      });
      popup = p;
    };
    const row = h(
      "div",
      { class: "menubar", attrs: { role: "menubar" } },
      ...items.map(
        (item, i) =>
          (heads[i] = h("button", {
            class: "menubar-item",
            text: item.label,
            attrs: {
              type: "button",
              "data-menu-owner": true,
              disabled: item.disabled,
            },
            on: {
              // a press leaves the focus where it was (in every browser),
              // so a menu and its dialogs give it back there
              mousedown: (e) => e.preventDefault(),
              click: () => (openAt === i ? closeMenus() : open(i)),
              pointerenter: () => {
                if (openAt >= 0 && openAt !== i) open(i);
              },
              keydown: (ev) => {
                const e = ev as KeyboardEvent;
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  open(i);
                } else if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
                  e.preventDefault();
                  heads[step(i, e.key === "ArrowRight" ? 1 : -1)].focus();
                }
              },
            },
          })),
      ),
    );
    bar.replaceChildren(row);
    if (!bar.isConnected) area.prepend(bar);
    if (at >= 0) heads[Math.min(at, n - 1)]?.focus({ preventScroll: true });
  }

  // 001 R19: Esc, then Tab (or Shift + Tab), moves the focus from anywhere
  // in the app to its window frame, also out of an app that keeps Tab
  // (Writer types spaces with it). An Esc the app took (preventDefault), or
  // one in a modal panel, does not count.
  let leave = false;
  area.addEventListener(
    "keydown",
    (e) => {
      if (["Shift", "Control", "Alt", "Meta"].includes(e.key)) return;
      const go = leave && e.key === "Tab" && !root.inert;
      leave = false;
      if (!go) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      el.focus({ preventScroll: true });
    },
    { capture: true, signal },
  );

  area.addEventListener(
    "keydown",
    (e) => {
      // the placeholder is the start control (main.ts)
      if (e.target === area) return;
      // R18: no key in the app acts on the sheet
      e.stopPropagation();
      if (e.defaultPrevented) return;
      if (e.key === "Escape" && !root.inert) leave = true;
      // R5: after the app's own handlers, and not under a modal panel
      const item = menu && !root.inert && matchShortcut(menu.items, e);
      if (item) {
        e.preventDefault(); // not the browser's own (⌘/Ctrl + S: Save page)
        return item.action?.();
      }
      // R18: a key the app left does not scroll the sheet by the browser's
      // own key scroll; text fields, and app content that can scroll, keep it
      const t = e.target as HTMLElement;
      const d = SCROLL_KEYS[e.key === " " && e.shiftKey ? "S" : e.key];
      if (!d || e.ctrlKey || e.metaKey) return;
      if (t.isContentEditable || t.matches("input, textarea, select")) {
        // WebKit scrolls the sheet by an arrow the field leaves: its caret
        // is already at that end (as the sheet's own fields, view.ts)
        if (e.key.startsWith("Arrow") && caretAtEnd(t, d)) e.preventDefault();
      } else if (
        !(e.key === " " && t.matches("button, a, summary, [role=button]")) &&
        !scrolls(t, area, d[0], d[1])
      )
        e.preventDefault();
    },
    { signal },
  );
  area.addEventListener(
    "wheel",
    (e) => {
      if (e.ctrlKey || e.metaKey || area.dataset.host !== "running") return;
      if (!scrolls(e.target as Element, area, e.deltaX, e.deltaY))
        e.preventDefault();
    },
    { passive: false, signal },
  );
  // a press in the app makes it the active app, also where the browser
  // gives no focus (Safari): its popups open in its root (R15, R18)
  area.addEventListener(
    "pointerdown",
    () => {
      if (!blocks.has("bg")) deps.onActive();
    },
    { capture: true, signal },
  );

  const resizeCbs: ((w: number, h: number) => void)[] = [];
  const focusCbs: ((f: boolean) => void)[] = [];
  const closeCbs: (() => boolean | void)[] = [];
  let size = "";
  let isFocused = false;
  let closed = false;
  const clamp = (v: number, hi: number) =>
    Math.max(0, Math.min(hi, Math.round(v) || 0));

  const win: OSWindow = {
    id: nextId++,
    root,
    setTitle(t) {
      title.textContent = t;
    },
    setMenu(m) {
      menu = m;
      drawMenu();
    },
    setSize(w, h) {
      const [cw, ch] = [clamp(w, max.w), clamp(h, max.h)];
      area.style.width = `${cw}px`;
      area.style.height = `${ch}px`;
      const key = `${cw}x${ch}`;
      if (key === size) return;
      size = key;
      for (const cb of [...resizeCbs]) cb(cw, ch);
    },
    // the sheet owns position (R2)
    setPosition() {},
    focus() {
      if (deps.background()) return;
      deps.front();
      deps.onActive();
    },
    // R10: an onClose that returns false keeps the app (it may close again
    // itself, e.g. after its save prompt)
    close() {
      if (closed) return;
      for (const cb of [...closeCbs]) if (cb() === false) return;
      // a callback may have closed it already
      if (closed) return;
      closed = true;
      deps.close();
    },
    onClose: (cb) => void closeCbs.push(cb),
    onResize: (cb) => void resizeCbs.push(cb),
    onFocus: (cb) => void focusCbs.push(cb),
  };
  // opts.title is not drawn: the bar keeps the sheet's title until the app
  // calls setTitle (the window's region name stays the sheet's, 001 R19)
  if (opts.width && opts.height) win.setSize(opts.width, opts.height);

  return {
    win,
    root,
    focused(f) {
      if (f === isFocused) return;
      isFocused = f;
      // an app that focuses its content when it becomes active (Writer,
      // Tracker) does not take the focus from the menu row (R5, 001 R19)
      const a = document.activeElement;
      const keep = a instanceof HTMLElement && bar.contains(a) ? a : null;
      for (const cb of [...focusCbs]) cb(f);
      if (keep?.isConnected && document.activeElement !== keep)
        keep.focus({ preventScroll: true });
    },
    block,
    dispose() {
      // the row's menu and the app's own popups close with the window
      popup?.close();
      if (area.querySelector(".menu")) closeMenus();
      live.abort();
      area.classList.remove("host-menu");
      title.textContent = homeTitle;
      [area.style.width, area.style.height] = homeSize;
      area.replaceChildren();
    },
  };
}

export interface PanelDeps {
  /** the sheet window (`[data-win]`) */
  el: HTMLElement;
  /** its demo area: the panels go in it, beside the app's root */
  area: HTMLElement;
  /** the default dialog title */
  appName: string;
  /** true while at least one panel is open: block the app's root */
  blocked(on: boolean): void;
  /** the panel stack changed (the overlay root may change) */
  changed?(): void;
  /** true during a background start (R11): new panels wait inert until
   * release() */
  background?(): boolean;
}

export interface Panels {
  /** R3: a child window as a modal panel. */
  child(opts: WindowOptions): OSWindow;
  alert(message: string, title?: string): Promise<void>;
  confirm(message: string, title?: string): Promise<boolean>;
  choose(message: string, buttons: string[], title?: string): Promise<number>;
  prompt(
    message: string,
    defaultValue?: string,
    title?: string,
  ): Promise<string | null>;
  /** The top panel's content (menus open in it), or null. */
  top(): HTMLElement | null;
  /** R10 seam: closes every panel; dialogs settle with their cancel values,
   * child windows hear onClose (no veto). */
  closeAll(): void;
  /** R11: the background start ended or the visitor activated the app. */
  release(): void;
}

interface Panel {
  scrim: HTMLElement;
  /** the panel itself: the focus while the content has none */
  box: HTMLElement;
  content: HTMLElement;
  /** Esc or the close button */
  cancel(): void;
  /** closes without asking (closeAll) */
  kill(): void;
  /** where the focus goes back to */
  back: HTMLElement | null;
}

// the last element the visitor pressed (a press is "being in the window"
// even where the browser gives no focus, e.g. a button in Safari)
let lastPress: EventTarget | null = null;
let pressWatch = false;

const FOCUSABLE =
  "button, input, select, textarea, a[href], [tabindex]:not([tabindex='-1'])";
/** Tab stops in `el`, in order; a radio group is one stop (its checked
 * radio, else its first), as the browser's own Tab does. */
const focusables = (el: HTMLElement): HTMLElement[] => {
  const groups = new Set<string>();
  return [...el.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((f) => {
    if ((f as HTMLButtonElement).disabled || f.closest("[hidden], .hidden"))
      return false;
    if (!(f instanceof HTMLInputElement) || f.type !== "radio" || !f.name)
      return true;
    if (groups.has(f.name)) return false;
    const checked = el.querySelector<HTMLInputElement>(
      `input[type="radio"][name="${CSS.escape(f.name)}"]:checked`,
    );
    if (checked && checked !== f) return false;
    groups.add(f.name);
    return true;
  });
};

export function createPanels(deps: PanelDeps): Panels {
  const { el, area } = deps;
  if (!pressWatch) {
    pressWatch = true;
    document.addEventListener("pointerdown", (e) => (lastPress = e.target), {
      capture: true,
    });
  }
  const stack: Panel[] = [];
  // R11: panels opened in a background start stay inert until release()
  let held = false;
  /** Only the top panel takes input, and none while held. */
  const sync = (): void =>
    stack.forEach((p, i) => (p.scrim.inert = held || i < stack.length - 1));
  const here = (): boolean => {
    const a = document.activeElement;
    return (
      el.contains(a) ||
      ((!a || a === document.body) &&
        lastPress instanceof Node &&
        el.contains(lastPress))
    );
  };

  function open(
    title: string,
    content: HTMLElement,
    cancel: () => void,
  ): { panel: Panel; titleEl: HTMLElement; takeFocus: boolean } {
    const active = document.activeElement;
    if (deps.background?.()) held = true;
    const takeFocus = !held && here();
    const back =
      active instanceof HTMLElement && el.contains(active) ? active : null;
    const titleEl = h("span", { class: "host-panel-title", text: title });
    titleEl.id = `host-panel-${nextId++}`;
    const close = h("button", {
      class: "host-panel-x",
      text: "×",
      attrs: { type: "button", "aria-label": "Close" },
      on: { click: () => panel.cancel() },
    });
    const box = h(
      "div",
      {
        class: "host-panel",
        attrs: {
          role: "dialog",
          "aria-modal": "true",
          "aria-labelledby": titleEl.id,
        },
      },
      h("div", { class: "host-panel-bar" }, titleEl, close),
      h("div", { class: "host-panel-body" }, content),
    );
    const scrim = h("div", { class: "host-scrim" }, box);
    // a press on the scrim is the app's (001 R21) but reaches nothing and
    // leaves the focus in the panel
    for (const t of ["pointerdown", "mousedown"])
      scrim.addEventListener(t, (e) => {
        if (e.target === scrim) e.preventDefault();
      });
    scrim.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !e.defaultPrevented) {
        e.preventDefault();
        panel.cancel();
      } else if (e.key === "Tab") {
        // every Tab moves here: WebKit's own Tab skips buttons and would
        // leave the panel
        const f = focusables(box);
        if (!f.length) return;
        e.preventDefault();
        const at = f.indexOf(document.activeElement as HTMLElement);
        const n = f.length;
        const to = e.shiftKey ? (at <= 0 ? n - 1 : at - 1) : (at + 1) % n;
        f[to].focus({ preventScroll: true });
      }
    });
    const panel: Panel = { scrim, box, content, cancel, kill: cancel, back };
    // the panel below waits under this one
    stack.push(panel);
    sync();
    area.append(scrim);
    if (stack.length === 1) deps.blocked(true);
    deps.changed?.();
    return { panel, titleEl, takeFocus };
  }

  function remove(panel: Panel): void {
    const i = stack.indexOf(panel);
    if (i < 0) return;
    // the visitor is in the window (the focus may be on its frame after a
    // title-bar drag, or nowhere after a press in Safari)
    const had = here() && i === stack.length - 1;
    stack.splice(i, 1);
    panel.scrim.remove();
    const top = stack.at(-1);
    sync();
    if (!stack.length) deps.blocked(false);
    deps.changed?.();
    if (!had) return;
    const to =
      panel.back?.isConnected && !panel.back.closest("[inert]")
        ? panel.back
        : top
          ? focusables(top.scrim)[0]
          : el;
    (to ?? el).focus({ preventScroll: true });
  }

  function dialog<T>(spec: {
    title?: string;
    message: string;
    input?: string;
    buttons: { label: string; value: (input: string) => T }[];
    cancel: T;
  }): Promise<T> {
    return new Promise<T>((resolve) => {
      let done = false;
      const finish = (v: T): void => {
        if (done) return;
        done = true;
        remove(panel);
        resolve(v);
      };
      const input =
        spec.input !== undefined
          ? h("input", { attrs: { type: "text", spellcheck: "false" } })
          : null;
      if (input) input.value = spec.input ?? "";
      const body = h(
        "div",
        { class: "dialog" },
        h("div", { class: "dialog-message", text: spec.message }),
        input,
        h(
          "div",
          { class: "dialog-buttons" },
          ...spec.buttons.map((b, i) =>
            button(b.label, () => finish(b.value(input?.value ?? "")), {
              primary: i === 0,
            }),
          ),
        ),
      );
      body.addEventListener("keydown", (e) => {
        if (
          e.key === "Enter" &&
          (e.target as HTMLElement).tagName !== "BUTTON"
        ) {
          e.preventDefault();
          body.querySelector<HTMLElement>("[data-primary]")?.click();
        }
      });
      // in a host root of its own, so the scoped app and dialog styles apply
      const content = h("div", { class: "host-root host-msg" }, body);
      const { panel, takeFocus } = open(
        spec.title ?? deps.appName,
        content,
        () => finish(spec.cancel),
      );
      if (!takeFocus) return;
      if (input) {
        input.focus({ preventScroll: true });
        input.select();
      } else
        body
          .querySelector<HTMLElement>("[data-primary]")
          ?.focus({ preventScroll: true });
    });
  }

  return {
    child(opts) {
      const root = document.createElement("div");
      root.className = "host-root host-child";
      const px = (v: number | undefined) =>
        v ? `${Math.max(0, Math.round(v))}px` : "";
      Object.assign(root.style, {
        width: px(opts.width),
        height: px(opts.height),
        minWidth: px(opts.minWidth),
        minHeight: px(opts.minHeight),
      });
      const closeCbs: (() => boolean | void)[] = [];
      const resizeCbs: ((w: number, h: number) => void)[] = [];
      const focusCbs: ((f: boolean) => void)[] = [];
      let closed = false;
      const end = (ask: boolean): void => {
        if (closed) return;
        for (const cb of [...closeCbs])
          if (ask) {
            if (cb() === false) return;
          } else
            try {
              // R10: a forced close hears every callback; one that throws
              // does not stop it
              cb();
            } catch (err) {
              console.warn("child window onClose:", err);
            }
        // a callback may have closed it already
        if (closed) return;
        closed = true;
        remove(panel);
      };
      const { panel, titleEl, takeFocus } = open(opts.title, root, () =>
        end(true),
      );
      panel.kill = () => end(false);
      if (takeFocus) {
        // the focus goes in at once (the panel), then to the first control
        // the app put in, unless the app focused one itself
        panel.box.tabIndex = -1;
        panel.box.focus({ preventScroll: true });
        queueMicrotask(() => {
          if (document.activeElement === panel.box)
            focusables(root)[0]?.focus({ preventScroll: true });
        });
      }
      let isFocused = false;
      const focused = (f: boolean): void => {
        if (f === isFocused) return;
        isFocused = f;
        for (const cb of [...focusCbs]) cb(f);
      };
      panel.scrim.addEventListener("focusin", () => focused(true));
      panel.scrim.addEventListener("focusout", (e) => {
        if (!panel.scrim.contains(e.relatedTarget as Node | null))
          focused(false);
      });
      return {
        id: nextId++,
        root,
        setTitle: (t) => void (titleEl.textContent = t),
        setMenu() {},
        setSize(w, h) {
          // R3: never below the minimum size; report what applies
          const cw = Math.max(
            Math.round(w) || 0,
            Math.round(opts.minWidth ?? 0),
          );
          const ch = Math.max(
            Math.round(h) || 0,
            Math.round(opts.minHeight ?? 0),
          );
          root.style.width = px(cw);
          root.style.height = px(ch);
          for (const cb of [...resizeCbs]) cb(cw, ch);
        },
        // the panel is centred in its window
        setPosition() {},
        focus() {
          if (here())
            focusables(panel.scrim)
              .find((f) => root.contains(f))
              ?.focus({ preventScroll: true });
        },
        close: () => end(true),
        onClose: (cb) => void closeCbs.push(cb),
        onResize: (cb) => void resizeCbs.push(cb),
        onFocus: (cb) => void focusCbs.push(cb),
      };
    },
    alert: (message, title) =>
      dialog<void>({
        title,
        message,
        buttons: [{ label: "OK", value: () => undefined }],
        cancel: undefined,
      }),
    confirm: (message, title) =>
      dialog({
        title,
        message,
        buttons: [
          { label: "OK", value: () => true },
          { label: "Cancel", value: () => false },
        ],
        cancel: false,
      }),
    choose(text, labels, title) {
      const names = labels.length ? labels : ["OK"];
      return dialog({
        title,
        message: text,
        buttons: names.map((label, i) => ({ label, value: () => i })),
        cancel: names.length - 1,
      });
    },
    prompt: (text, defaultValue = "", title) =>
      dialog<string | null>({
        title,
        message: text,
        input: defaultValue,
        buttons: [
          { label: "OK", value: (v) => v },
          { label: "Cancel", value: () => null },
        ],
        cancel: null,
      }),
    top: () => stack.at(-1)?.content ?? null,
    closeAll() {
      // R10: every panel goes, whatever its callbacks do
      for (const p of [...stack].reverse())
        try {
          p.kill();
        } catch (err) {
          console.warn("closing a panel:", err);
        } finally {
          remove(p);
        }
    },
    release() {
      held = false;
      sync();
    },
  };
}
