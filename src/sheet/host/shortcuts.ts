// 002 R5: the menu shortcut matcher, moved from the old window server
// (src/wm/wm.ts:1239, matchShortcut). Ctrl means Ctrl or ⌘; a disabled
// item, an item of a disabled submenu, or one without an action never
// matches; in a text field the native editing keys (⌘/Ctrl + C, X, V, Z, Y,
// A, with or without Shift), plain typing keys, Delete, Backspace and Enter
// stay the field's. (The disabled-submenu and shifted-key rules are new.)
import type { MenuItem } from "../../sdk/os";

const EDIT_KEYS = new Set(["c", "x", "v", "z", "y", "a"]);
const NAMES: Record<string, string[]> = {
  del: ["delete"],
  plus: ["+", "="],
  minus: ["-", "_"],
  space: [" "],
  esc: ["escape"],
};

/** The menu item whose shortcut `ev` is, or null. */
export function matchShortcut(
  items: MenuItem[],
  ev: KeyboardEvent,
): MenuItem | null {
  for (const item of items) {
    // a disabled submenu's items are disabled too
    if (item.disabled) continue;
    if (item.children) {
      const hit = matchShortcut(item.children, ev);
      if (hit) return hit;
    }
    if (!item.shortcut || !item.action) continue;
    const parts = item.shortcut.split("+").map((p) => p.trim().toLowerCase());
    let key = parts.pop() ?? "";
    if (key === "" && item.shortcut.endsWith("+")) key = "+";
    const keys = NAMES[key] ?? [key];
    const ctrl = parts.includes("ctrl");
    if (ctrl !== (ev.ctrlKey || ev.metaKey)) continue;
    if (parts.includes("shift") !== ev.shiftKey && !NAMES[key]) continue;
    if (parts.includes("alt") !== ev.altKey) continue;
    if (!keys.includes(ev.key.toLowerCase())) continue;
    const t = ev.target as HTMLElement;
    const editable =
      t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable;
    // shifted too: ⌘/Ctrl + Shift + Z (redo), + V (paste as text)
    if (editable && ctrl && EDIT_KEYS.has(key)) continue;
    // plain keys (letters, Space) belong to the text field being typed in
    if (
      editable &&
      !ctrl &&
      !parts.includes("alt") &&
      (key.length === 1 || key === "space")
    )
      continue;
    if (editable && ["delete", "backspace", "enter"].includes(keys[0]))
      continue;
    return item;
  }
  return null;
}
