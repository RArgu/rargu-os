// Popup menus (desktop) and action sheets (compact). Pure DOM, no kernel access.
import type { MenuItem } from "../sdk/os";
import { h, isCompact, overlayRoot } from "./dom";

interface Open {
  el: HTMLElement;
  close(): void;
}

const stack: Open[] = [];
let outsideBound = false;

function bindOutside(): void {
  if (outsideBound) return;
  outsideBound = true;
  document.addEventListener(
    "pointerdown",
    (ev) => {
      if (stack.length === 0) return;
      const t = ev.target as Node;
      if (stack.some((m) => m.el.contains(t))) return;
      if ((t as Element).closest?.("[data-menu-owner]")) return;
      closeMenus();
    },
    true,
  );
}

/** Closes every open menu and sheet. Returns true if anything was open. */
export function closeMenus(): boolean {
  if (stack.length === 0) return false;
  for (const m of [...stack].reverse()) m.close();
  return true;
}

export interface PopupOptions {
  onClose?: () => void;
  /** Left/Right pressed at the top level (the menu bar moves to a sibling). */
  onNavigate?: (dir: -1 | 1) => void;
  parent?: Open;
  /** open above the anchor point instead of below */
  above?: boolean;
  /** open beside the anchor element (a submenu), not under it */
  beside?: boolean;
}

export function popupMenu(
  items: MenuItem[],
  at: { x: number; y: number } | HTMLElement,
  opts: PopupOptions = {},
): { close(): void } {
  bindOutside();
  const root = overlayRoot();
  const prevFocus = document.activeElement as HTMLElement | null;
  const el = h("div", { class: "menu", attrs: { tabindex: -1, role: "menu" } });
  const rows: { item: MenuItem; row: HTMLElement }[] = [];
  let active = -1;
  let child: { close(): void } | null = null;
  let closed = false;

  const self: Open = {
    el,
    close() {
      if (closed) return;
      closed = true;
      child?.close();
      el.remove();
      const i = stack.indexOf(self);
      if (i >= 0) stack.splice(i, 1);
      opts.onClose?.();
      if (!opts.parent && prevFocus?.isConnected) prevFocus.focus();
    },
  };

  const setActive = (i: number): void => {
    if (active === i) return;
    rows[active]?.row.classList.remove("active");
    active = i;
    const row = rows[i]?.row;
    row?.classList.add("active");
    // a menu taller than its room scrolls: keep the choice in view (only the
    // menu's own scroll, no ancestor's)
    if (row) {
      if (row.offsetTop < el.scrollTop) el.scrollTop = row.offsetTop;
      else if (
        row.offsetTop + row.offsetHeight >
        el.scrollTop + el.clientHeight
      )
        el.scrollTop = row.offsetTop + row.offsetHeight - el.clientHeight;
    }
    child?.close();
    child = null;
  };

  const openChild = (i: number): void => {
    const { item, row } = rows[i];
    if (!item.children || item.disabled) return;
    child?.close();
    child = popupMenu(item.children, row, {
      beside: true,
      parent: self,
      onClose: () => {
        child = null;
        if (!closed) el.focus({ preventScroll: true });
      },
    });
  };

  const activate = (i: number): void => {
    const { item } = rows[i];
    if (item.disabled) return;
    if (item.children) return openChild(i);
    closeMenus();
    item.action?.();
  };

  const move = (dir: 1 | -1): void => {
    if (rows.length === 0) return;
    let i = active;
    for (let n = 0; n < rows.length; n++) {
      i = (i + dir + rows.length) % rows.length;
      if (!rows[i].item.disabled) break;
    }
    setActive(i);
  };

  for (const item of items) {
    if (item.separator) {
      el.append(h("div", { class: "menu-sep" }));
      continue;
    }
    const idx = rows.length;
    const row = h(
      "div",
      {
        class: "menu-item" + (item.disabled ? " disabled" : ""),
        attrs: { role: "menuitem" },
        on: {
          pointerenter: () => {
            setActive(idx);
            if (item.children) openChild(idx);
          },
          click: (ev) => {
            ev.stopPropagation();
            activate(idx);
          },
        },
      },
      h(
        "span",
        { class: "menu-mark" },
        item.checked ? h("span", { class: "glyph check" }) : null,
      ),
      h("span", { class: "menu-label", text: item.label }),
      item.shortcut
        ? h("span", { class: "menu-shortcut", text: item.shortcut })
        : null,
      item.children ? h("span", { class: "glyph right" }) : null,
    );
    rows.push({ item, row });
    el.append(row);
  }

  el.addEventListener("keydown", (ev) => {
    ev.stopPropagation();
    switch (ev.key) {
      case "ArrowDown":
        move(1);
        break;
      case "ArrowUp":
        move(-1);
        break;
      case "ArrowRight":
        if (active >= 0 && rows[active].item.children) {
          openChild(active);
        } else {
          (opts.parent ? undefined : opts.onNavigate)?.(1);
        }
        break;
      case "ArrowLeft":
        if (opts.parent) self.close();
        else opts.onNavigate?.(-1);
        break;
      case "Enter":
      case " ":
        if (active >= 0) activate(active);
        break;
      case "Escape":
        self.close();
        break;
      case "Tab":
        break;
      default:
        return;
    }
    ev.preventDefault();
  });
  el.addEventListener("contextmenu", (ev) => ev.preventDefault());

  root.append(el);
  stack.push(self);

  // Position, clamped to the display, in the root's own px. On the sheet
  // (002 R18) the root is moved, scaled by the zoom and rotated by a
  // window's wobble: screen points map back through that transform. On the
  // old OS the map is the identity.
  const local = toLocal(root);
  const w = el.offsetWidth;
  const hgt = el.offsetHeight;
  let x: number;
  let y: number;
  if (at instanceof HTMLElement) {
    // the centre of a box maps exactly; its size is in the same px
    const r = at.getBoundingClientRect();
    const [cx, cy] = local((r.left + r.right) / 2, (r.top + r.bottom) / 2);
    const [aw, ah] = [at.offsetWidth / 2, at.offsetHeight / 2];
    x = opts.beside ? cx + aw - 2 : cx - aw;
    y = opts.beside ? cy - ah : opts.above ? cy - ah - hgt : cy + ah;
  } else {
    [x, y] = local(at.x, at.y);
    if (opts.above) y -= hgt;
  }
  // menus stay above the taskbar unless they open from it (C7)
  const bar = opts.above ? null : document.querySelector(".taskbar");
  const top = bar?.getBoundingClientRect();
  const bottom = top ? local(top.left, top.top)[1] : root.clientHeight;
  x = Math.max(0, Math.min(x, root.clientWidth - w));
  y = Math.max(0, Math.min(y, bottom - hgt));
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  el.focus({ preventScroll: true });
  return self;
}

/**
 * Screen px → `root`'s own px. Three zero-size probes in the root show
 * where its points (0, 0), (100, 0) and (0, 100) land on screen; the map
 * they give (move, scale, rotation) is inverted.
 */
function toLocal(
  root: HTMLElement,
): (x: number, y: number) => [number, number] {
  const probes = [
    [0, 0],
    [100, 0],
    [0, 100],
  ].map(([x, y]) => {
    const p = h("div");
    p.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:0;height:0`;
    root.append(p);
    return p;
  });
  const [o, a, b] = probes.map((p) => p.getBoundingClientRect());
  for (const p of probes) p.remove();
  const [ax, ay] = [(a.left - o.left) / 100, (a.top - o.top) / 100];
  const [bx, by] = [(b.left - o.left) / 100, (b.top - o.top) / 100];
  const det = ax * by - bx * ay;
  // no layout (a hidden root): the identity from its corner
  if (!det) return (x, y) => [x - o.left, y - o.top];
  return (x, y) => {
    const [dx, dy] = [x - o.left, y - o.top];
    return [(dx * by - bx * dy) / det, (ax * dy - ay * dx) / det];
  };
}

/** Bottom action sheet. Submenus push a new level with a "‹ Back" row. */
export function actionSheet(
  items: MenuItem[],
  opts: { title?: string; onClose?: () => void } = {},
): { close(): void } {
  const root = overlayRoot();
  const sheet = h("div", { class: "pxr-in", attrs: { role: "menu" } });
  const scrim = h(
    "div",
    { class: "sheet-scrim" },
    h("div", { class: "sheet pxr" }, sheet),
  );
  let closed = false;
  const self: Open = {
    el: scrim,
    close() {
      if (closed) return;
      closed = true;
      scrim.remove();
      const i = stack.indexOf(self);
      if (i >= 0) stack.splice(i, 1);
      opts.onClose?.();
    },
  };

  const render = (
    level: MenuItem[],
    title: string | undefined,
    back: (() => void) | null,
  ): void => {
    sheet.replaceChildren();
    if (title) sheet.append(h("div", { class: "sheet-title", text: title }));
    if (back) {
      sheet.append(
        h("button", {
          class: "sheet-row back",
          text: "‹ Back",
          on: { click: () => back() },
        }),
      );
    }
    for (const item of level) {
      if (item.separator) continue;
      sheet.append(
        h(
          "button",
          {
            class: "sheet-row" + (item.disabled ? " disabled" : ""),
            attrs: { role: "menuitem", disabled: item.disabled },
            on: {
              click: () => {
                if (item.children) {
                  render(item.children, item.label, () =>
                    render(level, title, back),
                  );
                } else {
                  self.close();
                  item.action?.();
                }
              },
            },
          },
          item.checked ? h("span", { class: "glyph check" }) : null,
          h("span", { text: item.label }),
          item.children ? h("span", { class: "glyph right" }) : null,
        ),
      );
    }
  };

  render(items, opts.title, null);
  scrim.addEventListener("click", (ev) => {
    if (ev.target === scrim) self.close();
  });
  scrim.addEventListener("contextmenu", (ev) => ev.preventDefault());
  root.append(scrim);
  stack.push(self);
  return self;
}

/** A context menu at a pointer position: a popup on desktop, an action sheet in compact. */
export function contextMenu(
  at: { clientX: number; clientY: number },
  items: MenuItem[],
  title?: string,
): void {
  closeMenus();
  if (isCompact()) actionSheet(items, { title });
  else popupMenu(items, { x: at.clientX, y: at.clientY });
}
