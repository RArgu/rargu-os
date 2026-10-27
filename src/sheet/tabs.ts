// Spec 013 R1: the Demo · Try · Read tabs of a project window (the ARIA tabs
// pattern). The page has the strip and the panels, all hidden but Demo
// (scripts/sheet-content.ts); here a strip shows once its window has two or
// more modes. Try shows when a tool registers (011, 012); Read when the
// project has a write-up.
export type Mode = "demo" | "try" | "read";

const changed: ((win: HTMLElement, mode: Mode, was: Mode) => void)[] = [];

/** Calls `cb(win, mode, was)` after each tab change. */
export function onMode(
  cb: (win: HTMLElement, mode: Mode, was: Mode) => void,
): void {
  changed.push(cb);
}

/** The window's current mode. */
export const modeOf = (win: HTMLElement): Mode =>
  (win.dataset.mode as Mode) ?? "demo";

const tabsOf = (win: HTMLElement) =>
  [...win.querySelectorAll<HTMLButtonElement>(".tabs [role=tab]")].filter(
    (t) => !t.hidden,
  );
const panelOf = (win: HTMLElement, mode: Mode) =>
  win.querySelector<HTMLElement>(
    mode === "demo" ? ".demo-area" : `.${mode}-area`,
  );

/** Shows `mode` in `win` and selects its tab; `focus` moves the focus to it. */
export function select(win: HTMLElement, mode: Mode, focus = false): void {
  const was = modeOf(win);
  for (const t of win.querySelectorAll<HTMLButtonElement>(".tabs [role=tab]")) {
    const on = t.dataset.mode === mode;
    t.setAttribute("aria-selected", `${on}`);
    t.tabIndex = on ? 0 : -1;
    if (on && focus) t.focus({ preventScroll: true });
  }
  for (const m of ["demo", "try", "read"] as const) {
    const p = panelOf(win, m);
    if (p) p.hidden = m !== mode;
  }
  win.dataset.mode = mode;
  if (mode !== was) for (const cb of changed) cb(win, mode, was);
}

/** Shows the strip when the window has two or more modes; sets the panels'
 * tab roles then (a one-mode window keeps its panel as it is). */
function refresh(win: HTMLElement): void {
  const tabs = tabsOf(win);
  const strip = win.querySelector<HTMLElement>(".tabs");
  if (!strip || tabs.length < 2) return;
  strip.hidden = false;
  for (const t of tabs) {
    const p = panelOf(win, t.dataset.mode as Mode)!;
    p.id = t.getAttribute("aria-controls")!;
    p.setAttribute("role", "tabpanel");
    p.setAttribute("aria-labelledby", t.id);
  }
}

/** 011, 012: a live tool for window `id`. Shows its Try tab and returns the
 * panel the tool mounts in. */
export function registerTool(id: string): HTMLElement {
  const win = document.querySelector<HTMLElement>(`[data-win="${id}"]`)!;
  win.querySelector<HTMLElement>(".tabs [data-mode=try]")!.hidden = false;
  refresh(win);
  return panelOf(win, "try")!;
}

export function initTabs(): void {
  for (const win of document.querySelectorAll<HTMLElement>("[data-win]")) {
    const strip = win.querySelector<HTMLElement>(".tabs");
    if (!strip) continue;
    win.dataset.mode = "demo";
    refresh(win);
    strip.addEventListener("click", (e) => {
      const t = (e.target as Element).closest<HTMLElement>("[role=tab]");
      // R20: the pressed tab has the focus (WebKit does not focus a button
      // on a click)
      if (t) select(win, t.dataset.mode as Mode, true);
    });
    // arrows move and select (wrapping), Home and End go to the ends; the
    // sheet does not pan (view.ts skips a key whose default is prevented)
    strip.addEventListener("keydown", (e) => {
      const tabs = tabsOf(win);
      const i = tabs.indexOf(e.target as HTMLButtonElement);
      if (i < 0 || e.altKey || e.ctrlKey || e.metaKey) return;
      const n = tabs.length;
      const to = {
        ArrowLeft: (i + n - 1) % n,
        ArrowRight: (i + 1) % n,
        Home: 0,
        End: n - 1,
      }[e.key];
      if (to === undefined) return;
      e.preventDefault();
      e.stopPropagation(); // Home on a window sends it home (windows.ts)
      select(win, tabs[to].dataset.mode as Mode, true);
    });
  }
}
