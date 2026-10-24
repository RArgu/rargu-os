// Tiny DOM builder used by the window server and bundled apps.

export type Child = Node | string | number | null | undefined | false;

export interface Props {
  class?: string;
  text?: string;
  /** tooltip text, shown by the window server after 500 ms */
  tip?: string;
  data?: Record<string, string | number | undefined>;
  style?: Record<string, string>;
  on?: {
    [K in keyof HTMLElementEventMap]?: (ev: HTMLElementEventMap[K]) => void;
  };
  attrs?: Record<string, string | number | boolean | undefined>;
}

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props?: Props | null,
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props) {
    if (props.class) el.className = props.class;
    if (props.text !== undefined) el.textContent = props.text;
    if (props.tip) el.dataset.tip = props.tip;
    for (const [k, v] of Object.entries(props.data ?? {})) {
      if (v !== undefined) el.dataset[k] = String(v);
    }
    for (const [k, v] of Object.entries(props.style ?? {})) {
      if (k.startsWith("--")) el.style.setProperty(k, v);
      else (el.style as unknown as Record<string, string>)[k] = v;
    }
    for (const [k, fn] of Object.entries(props.on ?? {})) {
      el.addEventListener(k, fn as EventListener);
    }
    for (const [k, v] of Object.entries(props.attrs ?? {})) {
      if (v === false || v === undefined) continue;
      el.setAttribute(k, v === true ? "" : String(v));
    }
  }
  append(el, ...children);
  return el;
}

export function append(el: Element, ...children: Child[]): void {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export function clear(el: Element): void {
  el.replaceChildren();
}

/** Logical px to a CSS length. */
export function u(n: number): string {
  return `calc(var(--u) * ${n})`;
}

export function isCompact(): boolean {
  return document.getElementById("display")?.dataset.policy === "compact";
}

/** Current scale: device px per logical px. Without #display (the sheet host) it is 1. */
export function scale(): number {
  return Number(document.getElementById("display")?.dataset.scale ?? 1) || 1;
}

let hostOverlay: HTMLElement | null = null;

/** Sheet app host (002 R15): the active app's host root, used only without #display. */
export function setHostOverlayRoot(el: HTMLElement | null): void {
  hostOverlay = el;
}

/** The layer menus, sheets and tooltips are drawn in. */
export function overlayRoot(): HTMLElement {
  if (hostOverlay && !document.getElementById("display")) return hostOverlay;
  return (
    (document.querySelector("#display > .wm-overlay") as HTMLElement | null) ??
    document.body
  );
}

export function reducedMotion(): boolean {
  return document.documentElement.dataset.motion === "reduced";
}
