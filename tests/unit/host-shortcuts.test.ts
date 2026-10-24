// 002 R5: the menu shortcut matcher (src/sheet/host/shortcuts.ts): disabled
// branches never match, and native editing keys, shifted ones included, stay
// the text field's.
import { describe, expect, it, vi } from "vitest";
import type { MenuItem } from "../../src/sdk/os";
import { matchShortcut } from "../../src/sheet/host/shortcuts";

/** matchShortcut for a keydown on `el` (the event's target is `el`). */
function press(el: HTMLElement, init: KeyboardEventInit, items: MenuItem[]) {
  let hit: MenuItem | null | undefined;
  el.addEventListener("keydown", (e) => (hit = matchShortcut(items, e)), {
    once: true,
  });
  el.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, ...init }));
  return hit;
}

const field = () =>
  document.body.appendChild(document.createElement("textarea"));
const editable = () => {
  const d = document.body.appendChild(document.createElement("div"));
  d.contentEditable = "true";
  // jsdom has no isContentEditable
  Object.defineProperty(d, "isContentEditable", { value: true });
  return d;
};
const plain = () => document.body.appendChild(document.createElement("button"));

describe("matchShortcut", () => {
  it("skips a disabled submenu with its children", () => {
    const inner: MenuItem = {
      label: "Inner",
      shortcut: "Ctrl+J",
      action: vi.fn(),
    };
    const items = [{ label: "Locked", disabled: true, children: [inner] }];
    expect(press(plain(), { key: "j", ctrlKey: true }, items)).toBeNull();
    items[0].disabled = false;
    expect(press(plain(), { key: "j", ctrlKey: true }, items)).toBe(inner);
  });

  it("leaves native editing keys, shifted ones too, to text fields and editable elements", () => {
    for (const [key, shortcut] of [
      ["z", "Ctrl+Shift+Z"],
      ["v", "Ctrl+Shift+V"],
      ["z", "Ctrl+Z"],
      ["c", "Ctrl+C"],
    ]) {
      const item: MenuItem = { label: key, shortcut, action: vi.fn() };
      const init = { key, ctrlKey: true, shiftKey: shortcut.includes("Shift") };
      expect(press(field(), init, [item])).toBeNull();
      expect(press(editable(), init, [item])).toBeNull();
      expect(press(plain(), init, [item])).toBe(item);
    }
  });

  it("runs other shortcuts from a text field, with ⌘ for Ctrl", () => {
    const save: MenuItem = {
      label: "Save",
      shortcut: "Ctrl+S",
      action: vi.fn(),
    };
    expect(press(field(), { key: "s", metaKey: true }, [save])).toBe(save);
    expect(press(field(), { key: "s" }, [save])).toBeNull();
  });
});
