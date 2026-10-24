// Shared widgets for bundled apps and the window server.
import { h } from "./dom";
import { icon } from "./icons";

export interface ButtonOptions {
  icon?: string;
  /** icon size; 32 stacks the icon over the label */
  iconSize?: 16 | 32;
  tip?: string;
  class?: string;
  primary?: boolean;
  disabled?: boolean;
}

export function button(
  label: string,
  onClick: (ev: MouseEvent) => void,
  opts: ButtonOptions = {},
): HTMLButtonElement {
  const el = h(
    "button",
    {
      class: "btn" + (opts.class ? " " + opts.class : ""),
      tip: opts.tip,
      attrs: {
        type: "button",
        disabled: opts.disabled,
        "data-primary": opts.primary,
      },
      on: { click: onClick },
    },
    opts.icon ? icon(opts.icon, opts.iconSize ?? 16) : null,
    label ? h("span", { text: label }) : null,
  );
  return el;
}

/** Row of equal icon-over-label buttons along the bottom (compact layouts). */
export function bottomBar(
  items: { label: string; icon: string; onClick: () => void; id?: string }[],
): HTMLElement {
  return h(
    "div",
    { class: "bottombar" },
    ...items.map((it) =>
      h(
        "button",
        {
          attrs: { type: "button" },
          data: { id: it.id },
          on: { click: it.onClick },
        },
        icon(it.icon, 16),
        h("span", { text: it.label }),
      ),
    ),
  );
}

export function checkbox(
  label: string,
  checked: boolean,
  onChange: (v: boolean) => void,
): { el: HTMLLabelElement; input: HTMLInputElement } {
  const input = h("input", { attrs: { type: "checkbox" } });
  input.checked = checked;
  input.addEventListener("change", () => onChange(input.checked));
  return {
    el: h("label", { class: "check" }, input, h("span", { text: label })),
    input,
  };
}

export function radioGroup<T extends string>(
  name: string,
  options: { value: T; label: string }[],
  value: T,
  onChange: (v: T) => void,
): { el: HTMLElement; set(v: T): void } {
  const inputs = new Map<T, HTMLInputElement>();
  const el = h("div", { class: "col gap" });
  for (const o of options) {
    const input = h("input", { attrs: { type: "radio", name } });
    input.checked = o.value === value;
    input.addEventListener("change", () => input.checked && onChange(o.value));
    inputs.set(o.value, input);
    el.append(
      h("label", { class: "check" }, input, h("span", { text: o.label })),
    );
  }
  return {
    el,
    set(v) {
      for (const [k, i] of inputs) i.checked = k === v;
    },
  };
}

export interface TabSpec {
  id: string;
  label: string;
  icon?: string;
  content: HTMLElement;
}

export function tabs(
  specs: TabSpec[],
  initial?: string,
): { el: HTMLElement; show(id: string): void } {
  const strip = h("div", { class: "tabs-strip", attrs: { role: "tablist" } });
  const panel = h("div", { class: "tab-panel" });
  const buttons = new Map<string, HTMLElement>();
  const show = (id: string): void => {
    const spec = specs.find((s) => s.id === id) ?? specs[0];
    for (const [k, b] of buttons) b.classList.toggle("active", k === spec.id);
    panel.replaceChildren(spec.content);
  };
  specs.forEach((s) => {
    const b = h(
      "button",
      {
        class: "tab",
        attrs: { type: "button", role: "tab" },
        on: { click: () => show(s.id) },
      },
      s.icon ? icon(s.icon) : null,
      h("span", { text: s.label }),
    );
    buttons.set(s.id, b);
    strip.append(b);
  });
  strip.addEventListener("keydown", (ev) => {
    if (ev.key !== "ArrowLeft" && ev.key !== "ArrowRight") return;
    const ids = specs.map((s) => s.id);
    const cur = ids.findIndex((id) =>
      buttons.get(id)?.classList.contains("active"),
    );
    const next =
      ids[(cur + (ev.key === "ArrowRight" ? 1 : -1) + ids.length) % ids.length];
    show(next);
    buttons.get(next)?.focus();
  });
  show(initial ?? specs[0].id);
  return { el: h("div", { class: "tabs" }, strip, panel), show };
}

export function segmented<T extends string | number>(
  options: { value: T; label: string }[],
  value: T,
  onChange: (v: T) => void,
): { el: HTMLElement; set(v: T): void } {
  const el = h("div", { class: "segmented" });
  const buttons = new Map<T, HTMLElement>();
  const set = (v: T): void => {
    for (const [k, b] of buttons) b.classList.toggle("on", k === v);
  };
  for (const o of options) {
    const b = h("button", {
      text: o.label,
      attrs: { type: "button" },
      on: {
        click: () => {
          set(o.value);
          onChange(o.value);
        },
      },
    });
    buttons.set(o.value, b);
    el.append(b);
  }
  set(value);
  return { el, set };
}

export interface StepperOptions {
  min: number;
  max: number;
  step?: number;
  format?: (v: number) => string;
  /** called when the value itself is tapped */
  onTapValue?: () => void;
}

export function stepper(
  value: number,
  onChange: (v: number) => void,
  opts: StepperOptions,
): { el: HTMLElement; set(v: number): void; get(): number } {
  let v = value;
  const fmt = opts.format ?? String;
  const out = h("button", {
    class: "stepper-value",
    text: fmt(v),
    attrs: { type: "button" },
    on: { click: () => opts.onTapValue?.() },
  });
  const bump = (d: number): void => {
    const next = Math.min(
      opts.max,
      Math.max(opts.min, v + d * (opts.step ?? 1)),
    );
    if (next === v) return;
    v = next;
    out.textContent = fmt(v);
    onChange(v);
  };
  const arrow = (dir: 1 | -1): HTMLElement =>
    h(
      "button",
      {
        attrs: { type: "button", "aria-label": dir > 0 ? "up" : "down" },
        on: { click: () => bump(dir) },
      },
      h("span", { class: `glyph ${dir > 0 ? "up" : "down"}` }),
    );
  const el = h(
    "div",
    { class: "stepper" },
    out,
    h("div", { class: "stepper-arrows" }, arrow(1), arrow(-1)),
  );
  el.addEventListener("keydown", (ev) => {
    if (ev.key === "ArrowUp") bump(1);
    else if (ev.key === "ArrowDown") bump(-1);
  });
  return {
    el,
    set(n) {
      v = n;
      out.textContent = fmt(v);
    },
    get: () => v,
  };
}

export function slider(
  value: number,
  min: number,
  max: number,
  onInput: (v: number) => void,
  step = 1,
): HTMLInputElement {
  const el = h("input", { attrs: { type: "range", min, max, step } });
  const paint = (): void => {
    const pct =
      max === min ? 0 : ((Number(el.value) - min) / (max - min)) * 100;
    el.style.setProperty("--fill", pct + "%");
  };
  el.value = String(value);
  paint();
  el.addEventListener("input", () => {
    paint();
    onInput(Number(el.value));
  });
  // lets callers update the value programmatically and keep the fill in sync
  (el as HTMLInputElement & { sync?: () => void }).sync = paint;
  return el;
}

export function syncSlider(el: HTMLInputElement, value: number): void {
  el.value = String(value);
  (el as HTMLInputElement & { sync?: () => void }).sync?.();
}
